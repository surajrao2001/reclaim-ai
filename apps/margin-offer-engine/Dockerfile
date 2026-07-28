FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

COPY apps/margin-offer-engine/pyproject.toml ./pyproject.toml
COPY apps/margin-offer-engine/app ./app

RUN pip install --upgrade pip \
 && pip install .

EXPOSE 8002

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
