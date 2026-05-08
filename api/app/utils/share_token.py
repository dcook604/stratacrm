"""HMAC-signed share tokens for public incident media links.

Tokens are URL-safe, signed with the app secret key, and expire after
SHARE_MAX_AGE seconds.  They encode the incident_id so the share endpoint
can verify which incident the caller is allowed to access.
"""

from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.config import settings

_SALT = "incident-share-v1"
SHARE_MAX_AGE = 14 * 24 * 3600  # 14 days


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.secret_key, salt=_SALT)


def create_share_token(incident_id: int) -> str:
    return _serializer().dumps({"iid": incident_id})


def verify_share_token(token: str) -> int:
    """Return the incident_id encoded in the token, or raise ValueError."""
    try:
        data = _serializer().loads(token, max_age=SHARE_MAX_AGE)
        return int(data["iid"])
    except SignatureExpired:
        raise ValueError("Share link has expired.")
    except (BadSignature, KeyError, TypeError):
        raise ValueError("Invalid share link.")
