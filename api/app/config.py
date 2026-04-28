from functools import lru_cache

from pydantic import field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict


# Known weak/default values that must never be used in production
_WEAK_SECRETS: set[str] = {
    "changeme",
    "dev-secret-key-change-in-production-min-32-chars",
    "password",
    "secret",
    "admin",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://spectrum4:changeme@db:5432/spectrum4_crm"
    secret_key: str = "dev-secret-key-change-in-production-min-32-chars"
    debug: bool = False

    # Session cookie hardening
    https_only: bool = False  # set True behind TLS in production
    same_site: str = "lax"   # "strict" in production

    # Email (SMTP relay)
    smtp_host: str = "10.0.9.1"
    smtp_port: int = 10025
    smtp_username: str = ""
    smtp_password: str = ""
    mail_from: str = "crm@spectrum4.ca"
    mail_from_name: str = "Spectrum 4 Strata Council"

    # Listmonk (bulk email)
    listmonk_base_url: str = "http://listmonk:9000"
    listmonk_username: str = "listmonk"
    listmonk_password: str = "changeme"

    # File storage
    uploads_dir: str = "/app/uploads"

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("debug", mode="before")
    @classmethod
    def coerce_debug(cls, v):
        """Coerce string env vars like 'false' / 'true' to actual booleans."""
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes")
        return bool(v)

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError(
                f"SECRET_KEY must be at least 32 characters (got {len(v)})"
            )
        if v.lower() in _WEAK_SECRETS:
            import logging
            logging.getLogger(__name__).warning(
                "SECRET_KEY is set to a known weak/default value. "
                "Generate a strong random key (e.g. `python3 -c \"import secrets; "
                "print(secrets.token_urlsafe(48))\"`) and set SECRET_KEY in your .env file."
            )
        return v

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        # Check for default password in connection string
        if "changeme" in v:
            import logging
            logging.getLogger(__name__).warning(
                "DATABASE_URL contains the default password 'changeme'. "
                "Set a strong password via DB_PASSWORD environment variable."
            )
        return v

    @field_validator("listmonk_password")
    @classmethod
    def validate_listmonk_password(cls, v: str) -> str:
        if v.lower() in _WEAK_SECRETS:
            import logging
            logging.getLogger(__name__).warning(
                "LISTMONK_PASSWORD is set to a known weak/default value. "
                "Set a strong password via LISTMONK_PASSWORD environment variable."
            )
        return v

    @field_validator("https_only")
    @classmethod
    def validate_https_only(cls, v: bool, info: ValidationInfo) -> bool:
        """In non-debug mode, warn if https_only is False (non-blocking)."""
        debug = info.data.get("debug", False)
        if not debug and not v:
            import logging
            logging.getLogger(__name__).warning(
                "HTTPS_ONLY is False but DEBUG is also False — "
                "session cookies will be sent over plain HTTP. "
                "Set HTTPS_ONLY=true in production."
            )
        return v

    @field_validator("same_site")
    @classmethod
    def validate_same_site(cls, v: str) -> str:
        if v.lower() not in ("lax", "strict", "none"):
            raise ValueError(
                f"SAME_SITE must be 'lax', 'strict', or 'none' (got '{v}')"
            )
        return v.lower()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
