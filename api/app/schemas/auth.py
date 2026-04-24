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
    password_reset_required: bool

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
