FROM python:3.12-slim

WORKDIR /app

# System dependencies:
# - libpq-dev + gcc: psycopg2 build
# - WeasyPrint PDF rendering stack:
#     libpango*, libharfbuzz*, libcairo2, libgdk-pixbuf2.0-0, shared-mime-info
# - Fonts: fonts-liberation gives Times/Arial/Courier equivalents used in notice template
# - fontconfig: needed by pango to locate fonts at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    fontconfig \
    fonts-liberation \
    shared-mime-info \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 8000

# Alembic runs migrations on every start (idempotent). uvicorn is multi-worker.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
