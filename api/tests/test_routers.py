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
