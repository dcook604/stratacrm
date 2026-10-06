"""Test configuration and fixtures.

Overrides the app lifespan to skip DB-dependent startup (seeding, scheduler)
so that auth-smoke tests can run without a database.
"""

import os
from contextlib import asynccontextmanager

import pytest

# Settings refuses default secrets when DEBUG is off, so give tests their own.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-not-used-anywhere-else-0123456789")
os.environ.setdefault("DATABASE_URL", "postgresql://spectrum4:test-only-db-password@localhost:5432/spectrum4_test")
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _no_db_lifespan():
    """Replace the DB-dependent lifespan with a no-op for all tests."""
    original = app.router.lifespan_context

    @asynccontextmanager
    async def noop(_app):
        yield

    app.router.lifespan_context = noop
    yield
    app.router.lifespan_context = original


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
