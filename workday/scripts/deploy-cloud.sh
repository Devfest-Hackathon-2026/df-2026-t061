#!/usr/bin/env bash
set -euo pipefail
project=devfest-512005
region=asia-northeast1
runtime=workday-runtime
account="$runtime@$project.iam.gserviceaccount.com"
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com --project "$project"
gcloud iam service-accounts describe "$account" --project "$project" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$runtime" --display-name="Workday runtime" --project "$project"
for role in roles/datastore.user roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$account" --role="$role" --condition=None --quiet >/dev/null
done
# The regional database location is chosen only on first creation.
if ! gcloud firestore databases describe --database='(default)' --project "$project" >/dev/null 2>&1; then
  gcloud firestore databases create --database='(default)' --location="$region" --type=firestore-native --edition=standard --no-enable-pitr --project "$project"
fi
node scripts/initialize-cloud.mjs
number=$(gcloud projects describe "$project" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:$number-compute@developer.gserviceaccount.com" --role=roles/run.builder --condition=None --quiet >/dev/null
gcloud run deploy workday --source . --project "$project" --region "$region"   --service-account "$account" --set-env-vars WORKDAY_STORE=firestore   --allow-unauthenticated --min=0 --max=1 --max-instances=1   --cpu=1 --memory=512Mi --concurrency=8 --timeout=90 --cpu-throttling --quiet

node scripts/retire-local-inference.mjs
