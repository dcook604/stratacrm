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
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 8000

# Alembic runs migrations on every start (idempotent). uvicorn is multi-worker.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips='*'"]
