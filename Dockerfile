# Single-container deploy (Render and similar): builds the React app, then serves it from the FastAPI API.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/main.py .
COPY --from=web /web/dist ./static
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser
# main.py binds 0.0.0.0 on $PORT (Render sets it)
CMD ["python", "main.py"]
