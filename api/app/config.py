from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://spectrum4:changeme@db:5432/spectrum4_crm"
    secret_key: str = "dev-secret-key-change-in-production-min-32-chars"
    debug: bool = False

    # Session cookie hardening
    https_only: bool = False  # set True behind TLS in production
    same_site: str = "lax"   # "strict" in production

    # Email (OpenSMTPD relay)
    smtp_host: str = "10.0.9.1"
    smtp_port: int = 10025
    mail_from: str = "crm@spectrum4.ca"
    mail_from_name: str = "Spectrum 4 Strata Council"

    # Listmonk (bulk email)
    listmonk_base_url: str = "http://listmonk:9000"
    listmonk_username: str = "listmonk"
    listmonk_password: str = "changeme"

    # File storage
    uploads_dir: str = "/app/uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
