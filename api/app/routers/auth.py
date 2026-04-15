"""Authentication router: login, logout, me, change-password."""

import secrets
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user, require_csrf
from app.models import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, LoginResponse, UserOut

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


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


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
