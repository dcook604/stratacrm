FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# System dependencies for WeasyPrint PDF rendering:
#   libpango*, libharfbuzz*, libcairo2, libgdk-pixbuf-2.0-0, shared-mime-info
# Fonts: fonts-liberation provides Times/Arial/Courier equivalents
# fontconfig: needed by pango to locate fonts at runtime
# Note: psycopg2-binary ships pre-compiled wheels — libpq-dev/gcc not required
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    fontconfig \
    fonts-liberation \
    shared-mime-info \
    ffmpeg \
    gosu \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

# Create non-root user; chown happens at runtime via entrypoint (volume mounts
# shadow the image directory, so build-time chown doesn't reach the volume).
RUN groupadd --system appuser && useradd --system --gid appuser --no-create-home appuser \
    && chown -R appuser:appuser /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

# entrypoint.sh runs as root, fixes /app/uploads ownership, then execs as appuser.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips='*'"]
