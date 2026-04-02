#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# WatchPost Installer
# One-command setup for self-hosted venue security
# ──────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo -e "${BOLD}"
echo "  _    _       _       _     ____            _   "
echo " | |  | |     | |     | |   |  _ \\          | |  "
echo " | |  | | __ _| |_ ___| |__ | |_) | ___  ___| |_ "
echo " | |/\\| |/ _\` | __/ __| '_ \\|  __/ / _ \\/ __| __|"
echo " \\  /\\  / (_| | || (__| | | || |   | (_) \\__ \\ |_ "
echo "  \\/  \\/ \\__,_|\\__\\___|_| |_||_|    \\___/|___/\\__|"
echo ""
echo "  Intelligent venue security for UniFi Protect"
echo -e "${NC}"

# ── Check prerequisites ──────────────────────────────────

info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Install Docker first: https://docs.docker.com/get-docker/"
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 is required. Update Docker or install the compose plugin."
fi

DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "0")
info "Docker version: $DOCKER_VERSION"

# ── Set up environment ───────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  info "Creating .env from .env.example..."
  cp .env.example .env

  # Generate a random JWT secret
  if command -v openssl &>/dev/null; then
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i.bak "s/changeme-generate-a-real-secret/$JWT_SECRET/" .env && rm -f .env.bak
    info "Generated random JWT secret"
  else
    warn "Could not generate JWT secret. Please edit .env manually."
  fi

  echo ""
  warn "Please edit .env with your UniFi Protect credentials:"
  warn "  PROTECT_URL=https://your-protect-ip"
  warn "  PROTECT_USERNAME=your-service-account"
  warn "  PROTECT_PASSWORD=your-password"
  echo ""
  read -rp "Press Enter to continue after editing .env (or Ctrl+C to abort)..."
else
  info ".env already exists, skipping..."
fi

# ── Pull images and start services ───────────────────────

info "Pulling Docker images..."
docker compose -f infra/docker-compose.yml pull

info "Starting WatchPost services..."
docker compose -f infra/docker-compose.yml up -d

# ── Wait for services ────────────────────────────────────

info "Waiting for services to be healthy..."
RETRIES=30
until docker compose -f infra/docker-compose.yml ps --format json 2>/dev/null | grep -q '"Health":"healthy"' || [ $RETRIES -eq 0 ]; do
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
  warn "Some services may still be starting. Check: docker compose -f infra/docker-compose.yml ps"
fi

# ── Done ─────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}WatchPost is running!${NC}"
echo ""
echo "  Dashboard:   http://localhost:3000"
echo "  API:         http://localhost:3001"
echo "  MinIO:       http://localhost:9001"
echo ""
echo "  Logs:        docker compose -f infra/docker-compose.yml logs -f"
echo "  Stop:        docker compose -f infra/docker-compose.yml down"
echo ""
info "Create your first admin user via the API or database."
