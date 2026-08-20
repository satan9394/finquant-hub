# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000

WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/backend/data \
    && chown -R appuser:appuser /app/backend
COPY --chown=appuser:appuser backend/app ./app

USER appuser
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]


FROM oven/bun:1.3.12-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build


FROM nginx:1.27-alpine AS frontend-local

COPY docker/nginx.local.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1


FROM nginx:1.27-alpine AS frontend

RUN mkdir -p /etc/nginx/tls
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget --no-check-certificate -qO- https://127.0.0.1/ >/dev/null || exit 1
