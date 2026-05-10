#!/bin/sh
set -e
# The uploads volume is mounted at runtime, so its ownership may be root
# (e.g. existing volume created before the non-root user change).
# Fix it here, then drop to appuser for the actual process.
chown -R appuser:appuser /app/uploads
exec gosu appuser "$@"
