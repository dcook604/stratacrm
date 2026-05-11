"""Test configuration and fixtures.

Overrides the app lifespan to skip DB-dependent startup (seeding, scheduler)
so that auth-smoke tests can run without a database.
"""

from contextlib import asynccontextmanager

import pytest
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
