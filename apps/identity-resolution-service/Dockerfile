FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

COPY apps/identity-resolution-service/pyproject.toml ./pyproject.toml
COPY apps/identity-resolution-service/app ./app

RUN pip install --upgrade pip \
 && pip install .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
