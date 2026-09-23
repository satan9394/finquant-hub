#!/usr/bin/env bash

set -u

action="${1:-up}"
case "$action" in
  up|down|logs|status|doctor) ;;
  *)
    echo "Usage: ./scripts/local.sh {up|down|logs|status|doctor}" >&2
    exit 2
    ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "$script_dir/.." && pwd)"
env_file="$project_root/.env.local"
compose_file="$project_root/docker-compose.local.yml"
compose_args=(compose --env-file "$env_file" -f "$compose_file")
doctor_failures=0
compose_available=0

doctor_result() {
  local level="$1"
  local message="$2"
  printf '[%s] %s\n' "$level" "$message"
  if [[ "$level" == "FAIL" ]]; then
    doctor_failures=$((doctor_failures + 1))
  fi
}

read_env_value() {
  local requested="$1"
  local line name value
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *"="* ]] || continue
    name="${line%%=*}"
    name="${name//[[:space:]]/}"
    value="${line#*=}"
    if [[ "$name" == "$requested" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done < "$env_file"
}

create_local_env() {
  [[ -e "$env_file" ]] && return 0
  local master_key
  umask 077
  if command -v openssl >/dev/null 2>&1; then
    master_key="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '\r\n')"
  elif command -v base64 >/dev/null 2>&1 && [[ -r /dev/urandom ]]; then
    master_key="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '\r\n')"
  else
    echo "Cannot generate MASTER_KEY securely: install openssl or base64." >&2
    return 1
  fi
  printf 'MASTER_KEY=%s\nLOCAL_PORT=5173\n' "$master_key" > "$env_file"
  chmod 600 "$env_file" 2>/dev/null || true
  echo "Created .env.local with a random MASTER_KEY. The key was not displayed."
}

test_frontend_port() {
  local port="$1"
  if ! (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
    doctor_result PASS "LOCAL_PORT $port is available on 127.0.0.1."
    return
  fi

  local running_services=""
  if [[ "$compose_available" -eq 1 ]]; then
    running_services="$(docker "${compose_args[@]}" ps --status running --services 2>/dev/null || true)"
  fi
  if grep -qx 'frontend' <<<"$running_services"; then
    doctor_result WARN "LOCAL_PORT $port is already used by the running FinQuant Hub frontend."
  else
    doctor_result FAIL "LOCAL_PORT $port is occupied. Choose a free port in .env.local; no process was stopped."
  fi
}

run_doctor() {
  doctor_failures=0
  compose_available=0
  echo "FinQuant Hub local doctor (read-only)"

  local required relative
  for required in "$compose_file" "$project_root/Dockerfile" "$project_root/docker/nginx.local.conf"; do
    relative="${required#"$project_root/"}"
    if [[ -f "$required" ]]; then
      doctor_result PASS "Found $relative."
    else
      doctor_result FAIL "Missing $relative. Restore it from the project checkout."
    fi
  done

  if ! command -v docker >/dev/null 2>&1; then
    doctor_result FAIL "Docker CLI is unavailable. Install Docker with Compose v2 and reopen the terminal."
  else
    doctor_result PASS "Docker CLI is available."
    local compose_version server_version
    compose_version="$(docker compose version --short 2>/dev/null || true)"
    if [[ "$compose_version" =~ ^v?2\. ]]; then
      compose_available=1
      doctor_result PASS "Docker Compose v2 is available ($compose_version)."
    else
      doctor_result FAIL "Docker Compose v2 is required. Update Docker/Compose and retry."
    fi
    server_version="$(docker info --format '{{.ServerVersion}}' 2>/dev/null || true)"
    if [[ -n "$server_version" ]]; then
      doctor_result PASS "Docker daemon is reachable (server $server_version)."
    else
      doctor_result FAIL "Docker daemon is not reachable. Start Docker and retry."
    fi
  fi

  local environment_valid=1 master_key local_port model_key
  if [[ -f "$env_file" ]]; then
    doctor_result PASS "Found .env.local."
  else
    doctor_result FAIL ".env.local is missing. Run the 'up' action once to create it."
    environment_valid=0
  fi

  master_key="$(read_env_value MASTER_KEY)"
  if [[ -z "$master_key" ]]; then
    doctor_result FAIL "MASTER_KEY is missing from .env.local. Generate a Fernet-compatible key."
    environment_valid=0
  elif [[ ! "$master_key" =~ ^[A-Za-z0-9_-]{43}=$ ]]; then
    doctor_result FAIL "MASTER_KEY has an invalid format. Use 32 random bytes encoded as URL-safe base64."
    environment_valid=0
  else
    doctor_result PASS "MASTER_KEY format is valid; its value was not displayed."
  fi

  local_port="$(read_env_value LOCAL_PORT)"
  if [[ ! "$local_port" =~ ^[0-9]+$ ]] || [[ "${#local_port}" -gt 5 ]] || ((10#$local_port < 1 || 10#$local_port > 65535)); then
    doctor_result FAIL "LOCAL_PORT must be an integer from 1 to 65535 in .env.local."
    environment_valid=0
  else
    doctor_result PASS "LOCAL_PORT is valid ($local_port)."
    test_frontend_port "$local_port"
  fi

  model_key="$(read_env_value DEEPSEEK_API_KEY)"
  if [[ -z "$model_key" ]]; then
    doctor_result WARN "No DEEPSEEK_API_KEY is configured. The app can start, but model-backed AI features need a compatible API key."
  else
    doctor_result PASS "An optional model API key is configured; its value was not displayed."
  fi

  if [[ "$compose_available" -eq 1 && "$environment_valid" -eq 1 && -f "$compose_file" ]]; then
    if docker "${compose_args[@]}" config --quiet >/dev/null 2>&1; then
      doctor_result PASS "docker-compose.local.yml resolves with .env.local."
    else
      doctor_result FAIL "Compose configuration is invalid. Review .env.local and docker-compose.local.yml."
    fi
  else
    doctor_result FAIL "Compose configuration check could not run until Docker, Compose, files, and .env.local are valid."
  fi

  if [[ "$doctor_failures" -eq 0 ]]; then
    echo "Doctor result: PASS"
    return 0
  fi
  echo "Doctor result: FAIL ($doctor_failures check(s))"
  return 1
}

if [[ "$action" == "doctor" ]]; then
  run_doctor
  exit $?
fi

if [[ "$action" == "up" ]]; then
  create_local_env || exit $?
  if ! run_doctor; then
    echo "Startup was not attempted because doctor found blocking failures."
    exit 1
  fi
elif [[ ! -f "$env_file" ]]; then
  echo ".env.local is missing. Run the 'up' action once to create it." >&2
  exit 1
fi

case "$action" in
  up) docker "${compose_args[@]}" up --build -d ;;
  down) docker "${compose_args[@]}" down ;;
  logs) docker "${compose_args[@]}" logs -f ;;
  status) docker "${compose_args[@]}" ps ;;
esac
