"""FastAPI dependency injection: DB session, auth, CSRF."""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def require_csrf(request: Request) -> None:
    """Validate CSRF token for mutating requests."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        header_token = request.headers.get("X-CSRF-Token")
        session_token = request.session.get("csrf_token")
        if not header_token or not session_token or header_token != session_token:
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
