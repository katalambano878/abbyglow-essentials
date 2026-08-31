#!/usr/bin/env bash
set -euo pipefail
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='applications' AND column_name ILIKE '%id%' ORDER BY 1;"
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT uuid,name,git_repository,git_branch,destination_id,source_id,environment_id FROM applications WHERE name='anaelcosmetics-staging';"
docker exec coolify-db psql -U coolify -d coolify -c \
  "SELECT id,uuid,name,project_id FROM environments WHERE project_id=28;"
