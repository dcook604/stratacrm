"""Authentication router: login, logout, me, change-password, forgot/reset password."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_csrf
from app.email import send_email
from app.models import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ResetPasswordRequest,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/15minute")
def login(
    request: Request,
    body: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.execute(
        select(User).where(User.email == body.email.lower())
    ).scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Rotate session and generate CSRF token
    request.session.clear()
    csrf_token = secrets.token_urlsafe(32)
    request.session["user_id"] = user.id
    request.session["user_email"] = user.email
    request.session["user_role"] = user.role.value
    request.session["csrf_token"] = csrf_token

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    log_action(db, action="login", entity_type="user", entity_id=user.id,
               actor_id=user.id, actor_email=user.email, request=request)
    db.commit()

    return LoginResponse(user=UserOut.model_validate(user), csrf_token=csrf_token)


@router.post("/logout", dependencies=[Depends(require_csrf)])
def logout(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log_action(db, action="logout", entity_type="user", entity_id=current_user.id,
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()
    request.session.clear()
    return {"detail": "Logged out"}


@router.get("/me", response_model=MeResponse)
def me(request: Request, current_user: User = Depends(get_current_user)):
    csrf_token = request.session.get("csrf_token", "")
    return MeResponse(user=UserOut.model_validate(current_user), csrf_token=csrf_token)


@router.post("/change-password", dependencies=[Depends(require_csrf)])
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not bcrypt.checkpw(body.current_password.encode(), current_user.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    if len(body.new_password) < 10:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Password must be at least 10 characters")

    current_user.password_hash = bcrypt.hashpw(
        body.new_password.encode(), bcrypt.gensalt(rounds=12)
    ).decode()
    current_user.password_reset_required = False

    log_action(db, action="update", entity_type="user", entity_id=current_user.id,
               changes={"password": "changed"},
               actor_id=current_user.id, actor_email=current_user.email, request=request)
    db.commit()

    return {"detail": "Password changed"}


@router.post("/forgot-password")
@limiter.limit("5/15minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Request a password reset email.
    Always returns 200 to prevent email enumeration.
    """
    user = db.execute(
        select(User).where(User.email == body.email.lower())
    ).scalar_one_or_none()

    if user and user.is_active:
        # Generate a cryptographically random token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        # Store hash + expiry (1 hour)
        user.password_reset_token = token_hash
        user.password_reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        # Build reset link
        reset_link = f"{request.base_url}reset-password?token={raw_token}"

        # Send email (best-effort — log failure but don't expose it)
        send_email(
            to_address=user.email,
            subject="Password Reset — Spectrum 4 Strata CRM",
            body_text=(
                f"Hello {user.full_name},\n\n"
                f"A password reset was requested for your Spectrum 4 Strata CRM account.\n\n"
                f"Click the link below to reset your password. This link expires in 1 hour.\n\n"
                f"{reset_link}\n\n"
                f"If you did not request this reset, please ignore this email.\n\n"
                f"— Spectrum 4 Strata Council"
            ),
            body_html=(
                f"<p>Hello {user.full_name},</p>"
                f"<p>A password reset was requested for your Spectrum 4 Strata CRM account.</p>"
                f"<p><a href=\"{reset_link}\">Click here to reset your password</a></p>"
                f"<p>This link expires in 1 hour.</p>"
                f"<p>If you did not request this reset, please ignore this email.</p>"
                f"<p>— Spectrum 4 Strata Council</p>"
            ),
        )

    return {"message": "If an account exists with that email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Reset password using a token received via email.
    """
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    user = db.execute(
        select(User).where(
            User.password_reset_token == token_hash,
            User.password_reset_token_expires_at > now,
        )
    ).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Hash new password
    user.password_hash = bcrypt.hashpw(
        body.new_password.encode(), bcrypt.gensalt(rounds=12)
    ).decode()

    # Clear reset token fields
    user.password_reset_token = None
    user.password_reset_token_expires_at = None
    user.password_reset_required = False

    log_action(
        db, action="password_reset", entity_type="user", entity_id=user.id,
        actor_id=user.id, actor_email=user.email,
        changes={"password": "reset via forgot-password flow"},
    )
    db.commit()

    return {"message": "Password has been reset successfully."}
