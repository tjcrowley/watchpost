# WatchPost

```
  _    _       _       _     ____            _
 | |  | |     | |     | |   |  _ \          | |
 | |  | | __ _| |_ ___| |__ | |_) | ___  ___| |_
 | |/\| |/ _` | __/ __| '_ \|  __/ / _ \/ __| __|
 \  /\  / (_| | || (__| | | || |   | (_) \__ \ |_
  \/  \/ \__,_|\__\___|_| |_||_|    \___/|___/\__|
```

**Intelligent venue security for UniFi Protect deployments**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB.svg)](https://www.python.org/)

---

WatchPost is a self-hosted security intelligence platform that sits on top of UniFi Protect camera systems. It adds watchlist management, AI-powered face detection, license plate recognition, real-time alerts, and audit logging — all running locally with zero cloud dependency.

Built for **maritime venues, co-working spaces, event venues, and marinas**.

## Screenshots

> _Screenshots coming soon. WatchPost features a dark-mode dashboard with real-time detection feeds, watchlist management, and camera overview._

## Features

### v1 — Core Platform
- **Watchlist Management** — Ban lists, watch lists, and VIP lists with expiration and notes
- **AI Face Detection** — InsightFace buffalo_sc model for 512-dimensional face embeddings
- **Face Enrollment** — Upload reference photos to enroll subjects for automated matching
- **Real-time Matching** — pgvector cosine similarity search against enrolled faces
- **Live Detection Feed** — WebSocket-powered real-time event stream in the dashboard
- **Multi-channel Alerts** — Webhook, SMS (Twilio), and email (SendGrid) notifications
- **Camera Sync** — Auto-import cameras from UniFi Protect controller
- **Event Review** — Confirm or dismiss detection events with full audit trail
- **Audit Logging** — Every action logged with user, timestamp, and IP address
- **Role-based Access** — Admin, operator, and viewer roles
- **Docker Deployment** — Single `docker compose up` to run everything
- **100% Local** — No cloud services required, all data stays on-premises

### Planned
- License plate recognition (LPR)
- Multi-site management
- Mobile push notifications
- Tailgating detection
- Occupancy counting
- Report generation and export

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │             Docker Compose               │
                    │                                          │
 ┌────────┐        │  ┌─────────┐     ┌──────────────────┐   │
 │ UniFi  │◄──wss──┤  │ Worker  │────►│  Face Sidecar    │   │
 │Protect │        │  │ (Node)  │     │  (Python/ONNX)   │   │
 └────────┘        │  └────┬────┘     └──────────────────┘   │
                    │       │                                  │
                    │       ▼                                  │
                    │  ┌─────────┐     ┌──────────────────┐   │
 ┌────────┐        │  │   API   │────►│    PostgreSQL     │   │
 │Browser │◄──ws───┤  │(Fastify)│     │   + pgvector     │   │
 │  /App  │◄──http─┤  └────┬────┘     └──────────────────┘   │
 └────────┘        │       │                                  │
                    │       ▼                                  │
                    │  ┌─────────┐     ┌──────────────────┐   │
                    │  │   Web   │     │      Redis       │   │
                    │  │(Next.js)│     │   (pub/sub)      │   │
                    │  └─────────┘     └──────────────────┘   │
                    │                                          │
                    │  ┌──────────────────────────────────┐   │
                    │  │         MinIO (S3 storage)        │   │
                    │  └──────────────────────────────────┘   │
                    └──────────────────────────────────────────┘
```

### Data Flow

1. **Worker** connects to UniFi Protect via WebSocket and subscribes to smart detection events
2. On detection, it fetches the camera snapshot and sends it to the **Face Sidecar**
3. **Face Sidecar** runs InsightFace to extract 512-d face embeddings
4. **Worker** queries **pgvector** for the nearest enrolled face
5. If a match is found (cosine distance < threshold), an **alert** is created
6. The event is published to **Redis** and broadcast to dashboard clients via **WebSocket**
7. Snapshots are stored in **MinIO** for later review

## Quick Start

### Prerequisites
- Docker and Docker Compose v2
- UniFi Protect controller with API access
- A machine with at least 4GB RAM (8GB recommended)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/tjcrowley/watchpost.git
cd watchpost

# 2. Copy environment config
cp .env.example .env

# 3. Edit .env with your Protect credentials
#    At minimum, set:
#    - PROTECT_URL
#    - PROTECT_USERNAME
#    - PROTECT_PASSWORD
#    - JWT_SECRET (generate with: openssl rand -hex 32)

# 4. Start all services
docker compose -f infra/docker-compose.yml up -d

# 5. Open the dashboard
open http://localhost:3000
```

Or use the one-command installer:

```bash
bash scripts/install.sh
```

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://watchpost:watchpost@postgres:5432/watchpost` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `MINIO_ENDPOINT` | `minio` | MinIO hostname |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_ACCESS_KEY` | `watchpost` | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `MINIO_BUCKET` | `watchpost` | MinIO bucket name |
| `JWT_SECRET` | — | **Required.** Secret for JWT signing |
| `PROTECT_URL` | — | **Required.** UniFi Protect controller URL |
| `PROTECT_USERNAME` | — | **Required.** Protect service account username |
| `PROTECT_PASSWORD` | — | **Required.** Protect service account password |
| `FACE_SIDECAR_URL` | `http://face-sidecar:5500` | Face detection service URL |
| `MATCH_THRESHOLD` | `0.4` | Cosine distance threshold (lower = stricter) |
| `ALERT_WEBHOOK_URL` | — | Webhook URL for alerts (optional) |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID for SMS (optional) |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token (optional) |
| `TWILIO_FROM` | — | Twilio sender phone number (optional) |
| `SENDGRID_API_KEY` | — | SendGrid API key for email (optional) |
| `FEATURE_LPR` | `false` | Enable license plate recognition |
| `FEATURE_MULTISITE` | `false` | Enable multi-site management |

## Supported Hardware

### Recommended Server
- **Intel N100 mini PC** (or equivalent ARM64)
- 8GB RAM minimum
- 256GB SSD (plus external storage for snapshots)
- Ubuntu 22.04 LTS or Debian 12

### Supported Cameras
- UniFi G4 Pro / G4 Bullet / G4 Dome
- UniFi G4 Instant
- UniFi G3 Flex / G3 Instant / G3 Bullet
- Any camera managed by UniFi Protect 4.x+

### Performance
- Face detection: ~50ms per frame on N100 (CPU/ONNX)
- pgvector matching: <5ms for 10,000 enrolled faces
- End-to-end detection-to-alert: <500ms typical

## Watchlist Management

### Adding a Subject

1. Navigate to **Watchlist** in the dashboard
2. Click **Add Subject**
3. Fill in name, list type (Ban/Watch/VIP), and optional reason
4. Click **Add**

### Enrolling a Face

1. Find the subject in the watchlist table
2. Click **Enroll Face**
3. Upload a clear photo of the person's face
4. The system extracts a 512-dimensional embedding and stores it
5. Multiple photos can be enrolled per subject for better accuracy

### List Types

| Type | Purpose | Alert Behavior |
|------|---------|----------------|
| **Ban** | Prohibited individuals | Immediate alert on all channels |
| **Watch** | Persons of interest | Alert on configured channels |
| **VIP** | Welcome guests | No alert (logged for records) |

## Alert Routing

### Webhook

Set `ALERT_WEBHOOK_URL` in your `.env` file. WatchPost sends a POST request with JSON payload:

```json
{
  "source": "watchpost",
  "event_id": "uuid",
  "event_type": "smartDetectZone",
  "camera_id": "uuid",
  "detected_at": "2025-01-15T10:30:00Z",
  "subject_name": "John Doe",
  "list_type": "ban",
  "confidence": 0.92,
  "sent_at": "2025-01-15T10:30:00Z"
}
```

### SMS (Twilio)

1. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` in `.env`
2. Configure recipient numbers in the settings (coming in v1.1)

### Email (SendGrid)

1. Set `SENDGRID_API_KEY` in `.env`
2. Configure recipient emails in the settings (coming in v1.1)

## Multi-site Setup

Enable with `FEATURE_MULTISITE=true`. Each site has:
- Its own UniFi Protect controller connection
- Separate camera and subject databases
- Independent alert configurations
- Shared user accounts with per-site role assignments

## API Reference

All endpoints require JWT authentication (except `/api/auth/login` and `/health`).

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login with email/password, returns JWT |
| `POST` | `/api/auth/logout` | Logout (client discards token) |
| `GET` | `/api/auth/me` | Get current user info |

### Watchlist
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/watchlist` | List subjects (paginated) |
| `GET` | `/api/watchlist/:id` | Get subject by ID |
| `POST` | `/api/watchlist` | Create subject |
| `PATCH` | `/api/watchlist/:id` | Update subject |
| `DELETE` | `/api/watchlist/:id` | Delete subject |
| `POST` | `/api/watchlist/:id/enroll` | Enroll face photo |

### Events
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | List events (paginated, filterable) |
| `GET` | `/api/events/:id` | Get event details |
| `PATCH` | `/api/events/:id/review` | Review event (confirm/dismiss) |

### Cameras
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/cameras` | List cameras |
| `GET` | `/api/cameras/:id` | Get camera details |
| `PATCH` | `/api/cameras/:id` | Update camera config |
| `POST` | `/api/cameras/sync` | Sync cameras from Protect |

### Alerts
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/alerts` | List alerts (paginated) |
| `GET` | `/api/alerts/:id` | Get alert details |

### WebSocket
| Path | Description |
|------|-------------|
| `ws://host:3001/api/ws` | Real-time event stream |

## Development Setup

```bash
# Install pnpm if needed
npm install -g pnpm

# Install dependencies
pnpm install

# Start infrastructure (Postgres, Redis, MinIO)
docker compose -f infra/docker-compose.yml up -d postgres redis minio

# Run all services in dev mode
pnpm dev

# Or run individually:
cd apps/api && pnpm dev     # API on :3001
cd apps/web && pnpm dev     # Web on :3000
cd apps/worker && pnpm dev  # Worker

# Face sidecar (Python)
cd apps/face-sidecar
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5500 --reload
```

### Project Structure

```
watchpost/
├── apps/
│   ├── api/          # Fastify REST API + WebSocket
│   ├── web/          # Next.js 15 dashboard
│   ├── worker/       # Protect connector + detection pipeline
│   └── face-sidecar/ # Python FastAPI + InsightFace
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── db/           # Database client + pg-boss queue
│   └── logger/       # Pino logger wrapper
├── infra/
│   ├── docker-compose.yml
│   ├── migrations/   # PostgreSQL schema
│   └── nginx.conf    # Reverse proxy config
└── scripts/
    └── install.sh    # One-command installer
```

## Roadmap

### v1.0 — Core Platform (current)
- [x] Watchlist management (ban/watch/VIP)
- [x] Face detection via InsightFace
- [x] pgvector face matching
- [x] Real-time WebSocket events
- [x] Multi-channel alerts (webhook, SMS, email)
- [x] Audit logging
- [x] Docker Compose deployment

### v1.1 — Polish
- [ ] Alert destination management UI
- [ ] User management UI
- [ ] Detection event image viewer
- [ ] Dashboard analytics widgets
- [ ] Configurable match threshold per list type

### v2.0 — Advanced Detection
- [ ] License plate recognition (LPR)
- [ ] Multi-site management
- [ ] Mobile push notifications (via Pushover/ntfy)
- [ ] Tailgating detection
- [ ] Occupancy counting
- [ ] Scheduled reports

### v3.0 — Enterprise
- [ ] SSO/SAML authentication
- [ ] Multi-tenant architecture
- [ ] API rate limiting and API keys
- [ ] Prometheus metrics and Grafana dashboards
- [ ] Kubernetes Helm chart
- [ ] Encrypted at-rest storage

## License

MIT License. See [LICENSE](LICENSE) for details.

## Built With

- [Turborepo](https://turbo.build/) — Monorepo build system
- [Fastify](https://fastify.dev/) — Node.js API framework
- [Next.js 15](https://nextjs.org/) — React framework
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS
- [InsightFace](https://github.com/deepinsight/insightface) — Face detection & recognition
- [pgvector](https://github.com/pgvector/pgvector) — Vector similarity for PostgreSQL
- [pg-boss](https://github.com/timgit/pg-boss) — Job queue for PostgreSQL
- [Redis](https://redis.io/) — Pub/sub and caching
- [MinIO](https://min.io/) — S3-compatible object storage
- [UniFi Protect](https://ui.com/camera-security) — Camera platform
