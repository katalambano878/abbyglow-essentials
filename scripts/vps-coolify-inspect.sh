#!/usr/bin/env bash
set -euo pipefail
token="$(cat /data/fleet/secrets/coolify-api.token)"
api="http://127.0.0.1:8000/api/v1"
auth=(-H "Authorization: Bearer ${token}" -H "Content-Type: application/json")

echo "=== abby apps ==="
curl -sS "${auth[@]}" "$api/applications" | jq '[.[] | select(.name|test("abby";"i")) | {name, uuid, fqdn, git_repository, git_branch, status}]'

echo "=== veecare template ==="
curl -sS "${auth[@]}" "$api/applications" | jq '.[] | select(.name=="veecare-app") | {uuid, name, git_repository, git_branch, build_pack, ports_exposes, destination_uuid, project_uuid, environment_id, health_check_enabled, health_check_path, health_check_port, health_check_host, health_check_method, health_check_scheme, health_check_response_text, health_check_interval, health_check_timeout, health_check_retries, limits_memory, limits_memory_swap, limits_memory_swappiness, limits_memory_reservation, limits_cpus, custom_labels, custom_docker_run_options, post_deployment_command, post_deployment_command_container, pre_deployment_command, pre_deployment_command_container, manual_webhook_secret_github, manual_webhook_secret_gitlab, manual_webhook_secret_bitbucket, publish_directory, base_directory, install_command, start_command, build_command, dockerfile, docker_compose, docker_compose_raw, docker_compose_location, watch_paths, use_build_server, is_static, autogenerate_domain, domains, description}'

echo "=== servers ==="
curl -sS "${auth[@]}" "$api/servers" | jq '[.[] | {uuid, name, ip}]'

echo "=== projects ==="
curl -sS "${auth[@]}" "$api/projects" | jq '[.[] | {uuid, name}]'

echo "=== store_abbyglow env (keys only) ==="
if [[ -f /data/fleet/secrets/store_abbyglow.env ]]; then
  grep -E '^[A-Z_]+=' /data/fleet/secrets/store_abbyglow.env | cut -d= -f1
fi
