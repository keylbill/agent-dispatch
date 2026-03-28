#!/usr/bin/env bash
set -euo pipefail

# Deploy agent-dispatch bridge to GCP Cloud Run
# Prerequisites: gcloud auth, Artifact Registry repo, secrets in Secret Manager

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="agent-dispatch"
REPO="us-docker.pkg.dev/${PROJECT_ID}/agent-dispatch"
TAG="${1:-latest}"

echo "==> Building image..."
docker build --platform linux/amd64 -t "${REPO}/${SERVICE_NAME}:${TAG}" .

echo "==> Pushing to Artifact Registry..."
docker push "${REPO}/${SERVICE_NAME}:${TAG}"

echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${REPO}/${SERVICE_NAME}:${TAG}" \
  --platform managed \
  --port 3001 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets "LINEAR_CLIENT_ID=agent-dispatch-linear-client-id:latest,LINEAR_CLIENT_SECRET=agent-dispatch-linear-client-secret:latest,LINEAR_WEBHOOK_SECRET=agent-dispatch-linear-webhook-secret:latest,OPENCODE_PASSWORD=agent-dispatch-opencode-password:latest" \
  --set-env-vars "OPENCODE_URL=${OPENCODE_URL:?Set OPENCODE_URL to your OpenCode server},DEFAULT_AGENT=sisyphus,SESSION_STORE_PATH=/tmp/sessions.json"

echo "==> Deployed. Fetching URL..."
gcloud run services describe "${SERVICE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)'
