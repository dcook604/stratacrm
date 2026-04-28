"""FastAPI dependency injection: DB session, auth, CSRF (Double Submit Cookie)."""

import secrets
from datetime import datetime, timezone, timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole

# Idle session timeout — 30 minutes of inactivity forces re-login
_IDLE_TIMEOUT = timedelta(minutes=30)

# Cookie name for the CSRF token (non-HTTP-only so JS can read it)
_CSRF_COOKIE = "s4_csrf"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # Session idle timeout check
    last_activity = user.last_activity_at
    now = datetime.now(timezone.utc)
    if last_activity and (now - last_activity) > _IDLE_TIMEOUT:
        request.session.clear()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired due to inactivity",
        )

    # Update last activity timestamp (throttled: only write every 60s to reduce DB churn)
    if not last_activity or (now - last_activity).total_seconds() > 60:
        user.last_activity_at = now
        db.commit()

    return user


def get_csrf_from_cookie(request: Request) -> str | None:
    """Read CSRF token from cookie (Double Submit Cookie pattern)."""
    return request.cookies.get(_CSRF_COOKIE)


def generate_csrf_token() -> str:
    """Generate a new CSRF token without setting any cookie."""
    return secrets.token_urlsafe(32)


def set_csrf_cookie(request: Request, response: Response, token: str | None = None) -> str:
    """Set CSRF token cookie on response. Generates a new token if one is not provided."""
    if token is None:
        token = generate_csrf_token()
    response.set_cookie(
        key=_CSRF_COOKIE,
        value=token,
        max_age=30 * 24 * 3600,  # match session lifetime
        httponly=False,           # JS must read it to set the header
        samesite=request.app.state.settings.same_site,
        secure=request.app.state.settings.https_only,
        path="/",
    )
    return token


def clear_csrf_cookie(response: Response) -> None:
    """Delete the CSRF cookie."""
    response.delete_cookie(key=_CSRF_COOKIE, path="/")


def require_csrf(request: Request) -> None:
    """Validate CSRF token using Double Submit Cookie pattern.

    The token must be present in both:
      1. The 's4_csrf' cookie (set by the server, readable by JS)
      2. The 'X-CSRF-Token' request header

    The server compares them — they must match.
    """
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        cookie_token = get_csrf_from_cookie(request)
        header_token = request.headers.get("X-CSRF-Token")
        if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")


def require_role(*roles: UserRole):
    """Return a dependency that checks the current user has one of the given roles."""
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return _check


# Convenience role guards
require_write = require_role(UserRole.admin, UserRole.council_member, UserRole.property_manager)
require_admin = require_role(UserRole.admin)
