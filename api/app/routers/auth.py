"""Authentication router: login, logout, me, change-password, forgot/reset password, admin user management."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.config import settings
from app.database import get_db
from app.dependencies import (
    generate_csrf_token,
    get_current_user,
    require_csrf,
    require_admin,
    set_csrf_cookie,
    clear_csrf_cookie,
    get_csrf_from_cookie,
)
from app.email import send_email
from app.models import User
from app.schemas.auth import (
    AdminAssignTempPasswordRequest,
    AdminResetPasswordRequest,
    ChangePasswordRequest,
    CreateUserRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ResetPasswordRequest,
    UpdateUserRequest,
    UserListResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# Brute-force lockout constants
_MAX_FAILED_ATTEMPTS = 10
_LOCKOUT_DURATION = timedelta(minutes=15)


def _check_account_locked(user: User) -> None:
    """Raise 401 if the account is temporarily locked due to too many failed attempts."""
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        remaining = int((user.locked_until - datetime.now(timezone.utc)).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked. Try again in {remaining} seconds.",
        )
    # Lock expired — reset counter
    if user.locked_until and user.locked_until <= datetime.now(timezone.utc):
        user.failed_login_attempts = 0
        user.locked_until = None


def _record_failed_login(user: User, db: Session) -> None:
    """Increment failed attempt counter and lock account if threshold exceeded."""
    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= _MAX_FAILED_ATTEMPTS:
        user.locked_until = datetime.now(timezone.utc) + _LOCKOUT_DURATION
    db.commit()


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
        # Log failed login attempt (no user found — log with email only)
        log_action(db, action="failed_login", entity_type="user",
                   changes={"email": body.email.lower(), "reason": "user_not_found_or_inactive"},
                   request=request)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Check account lockout
    _check_account_locked(user)

    if not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
        # Log failed login attempt
        log_action(db, action="failed_login", entity_type="user", entity_id=user.id,
                   actor_email=user.email,
                   changes={"email": user.email, "reason": "wrong_password",
                            "attempt": user.failed_login_attempts + 1},
                   request=request)
        _record_failed_login(user, db)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Successful login — reset failed attempt counter
    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None

    # Rotate session
    request.session.clear()
    request.session["user_id"] = user.id
    request.session["user_email"] = user.email
    request.session["user_role"] = user.role.value

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)
    log_action(db, action="login", entity_type="user", entity_id=user.id,
               actor_id=user.id, actor_email=user.email, request=request)
    db.commit()

    # Build response with CSRF cookie (Double Submit Cookie pattern)
    csrf_token = generate_csrf_token()
    content = LoginResponse(
        user=UserOut.model_validate(user),
        csrf_token=csrf_token,
    ).model_dump(mode="json")
    response = JSONResponse(content=content)
    set_csrf_cookie(request, response, token=csrf_token)
    return response


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
    response = JSONResponse(content={"detail": "Logged out"})
    clear_csrf_cookie(response)
    return response


@router.get("/me", response_model=MeResponse)
def me(request: Request, current_user: User = Depends(get_current_user)):
    # Read CSRF token from cookie (Double Submit Cookie pattern)
    csrf_token = get_csrf_from_cookie(request) or ""
    return MeResponse(user=UserOut.model_validate(current_user), csrf_token=csrf_token)


@router.post("/change-password", dependencies=[Depends(require_csrf)])
@limiter.limit("5/15minute")
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
@limiter.limit("5/15minute")
def reset_password(
    request: Request,
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


# ---------------------------------------------------------------------------
# Admin user management endpoints
# ---------------------------------------------------------------------------


@router.get("/users", response_model=UserListResponse, dependencies=[Depends(require_csrf)])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """List all users (admin only)."""
    users = db.execute(
        select(User).order_by(User.full_name.asc())
    ).scalars().all()

    return UserListResponse(
        items=[UserOut.model_validate(u) for u in users],
        total=len(users),
    )


@router.post("/users", response_model=UserOut, dependencies=[Depends(require_csrf)])
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
    request: Request = None,
):
    """Create a new user (admin only)."""
    # Check for duplicate email
    existing = db.execute(
        select(User).where(User.email == body.email.lower())
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        email=body.email.lower(),
        full_name=body.full_name,
        role=body.role,
        password_hash=bcrypt.hashpw(
            body.temporary_password.encode(), bcrypt.gensalt(rounds=12)
        ).decode(),
        is_active=True,
        password_reset_required=True,
    )
    db.add(user)
    db.flush()

    log_action(
        db, action="create", entity_type="user", entity_id=user.id,
        actor_id=current_user.id, actor_email=current_user.email,
        changes={"email": user.email, "full_name": user.full_name, "role": user.role.value},
        request=request,
    )
    db.commit()
    db.refresh(user)

    return UserOut.model_validate(user)


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_csrf)])
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Get a single user by ID (admin only)."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)


@router.put("/users/{user_id}", response_model=UserOut, dependencies=[Depends(require_csrf)])
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
    request: Request = None,
):
    """Update user details (admin only). Cannot deactivate yourself."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    changes = {}

    if body.email is not None and body.email.lower() != user.email:
        # Check for duplicate email
        existing = db.execute(
            select(User).where(User.email == body.email.lower(), User.id != user_id)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists",
            )
        changes["email"] = {"from": user.email, "to": body.email.lower()}
        user.email = body.email.lower()

    if body.full_name is not None and body.full_name != user.full_name:
        changes["full_name"] = {"from": user.full_name, "to": body.full_name}
        user.full_name = body.full_name

    if body.role is not None and body.role != user.role:
        changes["role"] = {"from": user.role.value, "to": body.role.value}
        user.role = body.role

    if body.is_active is not None:
        # Prevent deactivating yourself
        if not body.is_active and user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account",
            )
        if body.is_active != user.is_active:
            changes["is_active"] = {"from": user.is_active, "to": body.is_active}
            user.is_active = body.is_active

    if changes:
        log_action(
            db, action="update", entity_type="user", entity_id=user.id,
            actor_id=current_user.id, actor_email=current_user.email,
            changes=changes, request=request,
        )
        db.commit()
        db.refresh(user)

    return UserOut.model_validate(user)


@router.post("/users/{user_id}/reset-password", dependencies=[Depends(require_csrf)])
def admin_reset_password(
    user_id: int,
    body: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
    request: Request = None,
):
    """Admin-initiated password reset for a user. Sets a new password directly."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password_hash = bcrypt.hashpw(
        body.new_password.encode(), bcrypt.gensalt(rounds=12)
    ).decode()
    user.password_reset_required = False
    user.password_reset_token = None
    user.password_reset_token_expires_at = None

    log_action(
        db, action="update", entity_type="user", entity_id=user.id,
        actor_id=current_user.id, actor_email=current_user.email,
        changes={"password": "reset by admin"},
        request=request,
    )
    db.commit()

    return {"detail": f"Password for {user.email} has been reset."}


@router.post("/users/{user_id}/assign-temp-password", dependencies=[Depends(require_csrf)])
def admin_assign_temp_password(
    user_id: int,
    body: AdminAssignTempPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
    request: Request = None,
):
    """Assign a temporary password to a user, forcing them to change on next login."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password_hash = bcrypt.hashpw(
        body.temporary_password.encode(), bcrypt.gensalt(rounds=12)
    ).decode()
    user.password_reset_required = True
    user.password_reset_token = None
    user.password_reset_token_expires_at = None

    log_action(
        db, action="update", entity_type="user", entity_id=user.id,
        actor_id=current_user.id, actor_email=current_user.email,
        changes={"password": "temporary password assigned by admin", "password_reset_required": True},
        request=request,
    )
    db.commit()

    return {"detail": f"Temporary password assigned to {user.email}. User must change on next login."}
