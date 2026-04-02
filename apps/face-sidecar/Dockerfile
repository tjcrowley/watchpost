FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/face-sidecar/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/face-sidecar/ .

EXPOSE 5500

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5500"]
