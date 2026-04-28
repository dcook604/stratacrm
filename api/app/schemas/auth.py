from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator
from app.models import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    password_reset_required: bool
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserOut
    csrf_token: str


class MeResponse(BaseModel):
    user: UserOut
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        return v


# ---------------------------------------------------------------------------
# Admin user management schemas
# ---------------------------------------------------------------------------


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.council_member
    temporary_password: str

    @field_validator("temporary_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        return v


class UpdateUserRequest(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password_reset_required: Optional[bool] = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        return v


class AdminAssignTempPasswordRequest(BaseModel):
    temporary_password: str

    @field_validator("temporary_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        return v


class UserListResponse(BaseModel):
    items: list[UserOut]
    total: int
