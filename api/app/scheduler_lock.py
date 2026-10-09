"""Cross-process singleton guard for the background scheduler.

`uvicorn --workers N` (and any multi-replica deployment) starts one APScheduler
instance *per process*, so without a guard every job runs N times concurrently:
duplicate billing rows, duplicate reminder emails to owners, and the IMAP
mailbox polled several times at once.

Each job body runs inside a Postgres *session-level* advisory lock keyed on the
job name, so only one process executes any given job at a time. The lock is
session-scoped rather than transaction-scoped because the jobs commit several
times internally; a transaction-scoped lock would be released at the first
commit.
"""

import hashlib
import logging
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

# Namespace the hash so these keys can't collide with other advisory-lock users
# in the same database.
_KEY_PREFIX = b"spectrum4-crm:"
# Postgres advisory locks take a signed 64-bit key.
_KEY_MASK = 0x7FFF_FFFF_FFFF_FFFF


def _lock_key(job_name: str) -> int:
    digest = hashlib.sha256(_KEY_PREFIX + job_name.encode()).digest()
    return int.from_bytes(digest[:8], "big") & _KEY_MASK


@contextmanager
def single_runner_lock(db: Session, job_name: str) -> Iterator[bool]:
    """Yield True if this process won the lock for `job_name`, otherwise False.

    Callers should do nothing when they receive False — another worker is
    already running that job.
    """
    key = _lock_key(job_name)
    acquired = bool(
        db.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": key}).scalar()
    )
    if not acquired:
        # End the transaction opened by the SELECT; another worker holds the lock.
        db.rollback()
        yield False
        return

    try:
        yield True
    finally:
        try:
            db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
            db.commit()
        except Exception:
            log.exception("scheduler_advisory_unlock_failed", job=job_name)
            db.rollback()
