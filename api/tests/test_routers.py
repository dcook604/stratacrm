"""Smoke tests for all FastAPI routers.

Every protected endpoint is tested for 401 without authentication, proving
the routes are wired correctly and the auth guard is in place.

No database required — the auth check (get_current_user) fails before
touching the database when no session cookie is present.
"""

import pytest


class TestHealth:
    """Health endpoint is public and returns valid JSON regardless of DB state."""

    def test_health_returns_json(self, client):
        r = client.get("/api/health")
        assert r.status_code in (200, 503)
        assert "status" in r.json()


class TestProtectedEndpoints:
    """Every router's primary GET endpoint rejects unauthenticated requests."""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/dashboard/stats",
            "/api/audit-log",
            "/api/lots",
            "/api/parties",
            "/api/bylaws",
            "/api/infractions",
            "/api/incidents",
            "/api/issues",
            "/api/documents",
            "/api/auth/me",
            "/api/email-ingest/config",
            "/api/search?q=test",
        ],
    )
    def test_unauthenticated_returns_401(self, client, path):
        r = client.get(path)
        assert r.status_code == 401, f"{path} returned {r.status_code}, expected 401"


class TestEmailIngestCsrf:
    """Mutating email-ingest routes must reject requests without a CSRF token."""

    @pytest.mark.parametrize(
        "method,path",
        [
            ("patch", "/api/email-ingest/config"),
            ("delete", "/api/email-ingest/config/imap"),
            ("post", "/api/email-ingest/test"),
            ("post", "/api/email-ingest/poll"),
        ],
    )
    def test_missing_csrf_returns_403(self, client, method, path):
        r = getattr(client, method)(path)
        assert r.status_code == 403, f"{method.upper()} {path} returned {r.status_code}, expected 403"


class TestResetLink:
    """Reset links must come from APP_BASE_URL, never from request headers."""

    def test_link_uses_configured_base_url(self, monkeypatch):
        from app.config import settings
        from app.routers.auth import _build_reset_link

        monkeypatch.setattr(settings, "app_base_url", "https://crm.example.test/")
        assert _build_reset_link("tok123") == "https://crm.example.test/reset-password?token=tok123"
