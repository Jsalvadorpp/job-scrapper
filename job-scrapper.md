# Job Scraper App Documentation

## Overview
Job Scraper is an AI-powered LinkedIn job scraping application that automates and personalises the job search process. It scrapes job listings, scores them against your resume using AI, and presents the best matches in a clean dashboard. Built as a production-grade monorepo using a 2026 industry-standard stack so you can learn every layer while building something real.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Orchestration | Turborepo + pnpm | Fastest, most standard way to manage TypeScript monorepos |
| Frontend UI | Next.js 15/16 | Gold standard for React dashboards (SSR, App Router) |
| Scraper | Node.js + TypeScript + Playwright | Best-in-class bot-detection bypass; TypeScript gives full-stack type safety |
| Database | PostgreSQL + Drizzle ORM | High performance; SQL-first feel; shared schema across the monorepo |
| AI Intelligence | Vercel AI SDK + LangChain | Type-safe AI provider integration + advanced prompt orchestration |
| Styling | Tailwind v4 + Shadcn | Maximum speed with a professional "Enterprise" look |
| Containerization | Docker | Standardised packaging for all services |
| Orchestration (prod) | Kubernetes (GKE) | Worker pod auto-restart, horizontal scaling, self-healing |
| Infrastructure as Code | Terraform (HCL) | Provision all GCP resources declaratively — no console clicking |
| Internal Communication | gRPC | Binary, ultra-fast worker ↔ AI service communication |
| External API | GraphQL (graphql-yoga) | Dashboard fetches only the fields it needs — no over-fetching |
| Task Queue | RabbitMQ | Work-queue model for distributing scrape URLs across worker pods |
| Search | Elasticsearch / Typesense | Fuzzy search and search-as-you-type across large job datasets |
| Cloud Platform | Google Cloud Platform (GCP) | GKE + Cloud SQL + Artifact Registry + Secret Manager |

---

## Project Structure (Monorepo)

```
job-scrapper/
├── apps/
│   ├── web/                        # Dashboard (Next.js 15)
│   │   ├── src/
│   │   │   ├── app/                # App Router pages, layouts, API routes
│   │   │   └── components/         # Reusable UI components (JobCard, etc.)
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── worker/                     # Scraper (Node.js + TypeScript)
│       ├── src/
│       │   ├── playwright/         # Extraction logic & stealth scripts
│       │   └── queue/              # RabbitMQ consumer/publisher
│       ├── tsconfig.json
│       └── Dockerfile
├── services/
│   ├── ai-grpc/                    # Internal AI scoring service (gRPC)
│   │   ├── src/index.ts
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── graphql-api/                # External API for Dashboard (GraphQL)
│       ├── src/index.ts
│       ├── tsconfig.json
│       └── Dockerfile
├── packages/
│   ├── db/                         # Single source of truth for the DB
│   │   ├── src/
│   │   │   ├── schema.ts           # Shared Drizzle schema
│   │   │   └── index.ts            # DB client factory
│   │   └── tsconfig.json
│   ├── ai/                         # LLM logic
│   │   ├── src/
│   │   │   ├── prompts.ts          # Structured prompts for scoring
│   │   │   ├── engine.ts           # Job scoring logic (Zod-validated output)
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── contracts/                  # Shared API contracts
│   │   ├── proto/
│   │   │   └── scorer.proto        # gRPC service definition
│   │   ├── graphql/
│   │   │   └── schema.graphql      # GraphQL schema
│   │   ├── src/
│   │   │   ├── grpc-loader.ts      # Loads proto into grpc-js
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── types/                      # Shared TypeScript interfaces
│       ├── src/index.ts
│       └── tsconfig.json
├── infra/
│   ├── terraform/                  # GCP infrastructure as code
│   │   ├── main.tf                 # Provider + backend config
│   │   ├── gcp.tf                  # GKE, Cloud SQL, Artifact Registry, VPC
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── k8s/                        # Kubernetes manifests
│       ├── worker-deployment.yaml  # Worker Deployment + HPA
│       ├── worker-cronjob.yaml     # Scheduled scraping CronJob
│       ├── services.yaml           # graphql-api + ai-grpc Deployments/Services
│       └── configmap.yaml          # ConfigMap + Secret template
├── docs/                           # Project documentation
│   └── README.md
├── tests/                          # Tests (unit, integration, e2e, fixtures)
│   └── README.md
├── docker-compose.yml              # Full local stack (all services + infra)
├── turbo.json                      # Turborepo pipeline config
├── pnpm-workspace.yaml             # Workspace package declarations
├── tsconfig.base.json              # Shared TypeScript base config
├── .env.example                    # Environment variable template
└── package.json                    # Root package.json
```

---

## Module Responsibilities

### 1. `packages/db` — The Foundation
Defines the database schema once. Both the worker (writes scraped jobs) and the GraphQL API (reads and updates jobs) import this exact schema. Change a column → the whole project type-checks instantly.

- **schema.ts**: Drizzle table definitions (`jobs` table with `matchScore`, `status`, etc.)
- **index.ts**: Exports a `createDb()` factory used by all consumers

### 2. `packages/ai` — The Brains
Takes raw job text and returns a Zod-validated JSON scoring result.

- **engine.ts**: Scores a job description; returns `{ matchScore: 0–100, summary: "2 sentences" }`
- **prompts.ts**: Prompt templates used when calling LLM providers
- Swap between Claude, GPT, Gemini in one file — the UI never changes

### 3. `packages/contracts` — The API Layer
Single source of truth for all inter-service communication.

- **proto/scorer.proto**: gRPC contract for worker ↔ ai-grpc
- **graphql/schema.graphql**: GraphQL contract for Dashboard ↔ graphql-api
- **src/grpc-loader.ts**: Loads the proto file for use in Node.js services

### 4. `packages/types` — Shared Interfaces
TypeScript interfaces shared across all apps and services (e.g. `JobRecord`, `ScoreJobResult`).

### 5. `apps/worker` — The Heavy Lifter
The scraper is a standalone TypeScript service.

- Pulls URLs from a **RabbitMQ** work queue
- Uses **Playwright** (headless Chromium) to extract job details from LinkedIn
- Calls **ai-grpc** via gRPC to get a match score
- Writes the result to **PostgreSQL** via `@job-scrapper/db`
- Runs as Kubernetes pods — if a pod is blocked or crashes, K8s restarts it automatically

### 6. `services/ai-grpc` — Internal AI Runtime
Wraps `packages/ai` and exposes it as a gRPC server.

- Accepts `{ resume_text, job_description }` from the worker
- Returns `{ match_score, summary }` (Zod-validated)
- Binary gRPC is significantly faster than JSON-over-HTTP for high-volume internal traffic

### 7. `services/graphql-api` — External API Layer
The client-facing API consumed by the Next.js dashboard.

- Built with **graphql-yoga** (lightweight, modern GraphQL server)
- Queries: `jobs(minScore, status, limit, offset)`, `job(id)`
- Mutations: `markApplied(id)`, `markIgnored(id)` — updates DB and prevents re-scraping

### 8. `apps/web` — The Command Center
Next.js 15 App Router dashboard.

- Server component fetches jobs with score ≥ 80 from GraphQL API
- **JobCard** component shows title, company, location, match score, and AI summary
- "Mark as Applied" button fires a mutation via a Next.js API route
- Styled with **Tailwind v4**

---

## Data Flow

```
RabbitMQ Queue
     │
     ▼
apps/worker  ──(Playwright)──▶  LinkedIn page
     │
     │──(gRPC ScoreJob)──▶  services/ai-grpc  ──▶  packages/ai (LLM)
     │                              │
     │◀──── { match_score, summary }┘
     │
     ▼
PostgreSQL (packages/db)
     │
     ▼
services/graphql-api  ──(GraphQL query)──▶  apps/web (Dashboard)
```

---

## Setup Steps

### Prerequisites
- Node.js 22+
- pnpm (`npm install -g pnpm`)
- Docker Desktop
- Kubernetes cluster (`kind` or `minikube` locally, GKE in production)
- Terraform CLI (for cloud provisioning)

### 1. Install dependencies
```bash
pnpm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in DATABASE_URL, OPENAI_API_KEY, RABBITMQ_URL
```

### 3. Start local infrastructure
```bash
docker compose up db rabbitmq elasticsearch -d
```

### 4. Run database migrations
```bash
pnpm --filter @job-scrapper/db drizzle-kit migrate
```

### 5. Start all services in dev mode
```bash
pnpm dev
# Or run individually:
pnpm --filter @job-scrapper/graphql-api dev
pnpm --filter @job-scrapper/ai-grpc dev
pnpm --filter @job-scrapper/worker dev
pnpm --filter @job-scrapper/web dev
```

### 6. Build all Docker images
```bash
docker compose build
docker compose up
```

### 7. Deploy to GCP with Terraform
```bash
cd infra/terraform
terraform init
terraform plan -var="project_id=YOUR_GCP_PROJECT" -var="db_password=SECRET"
terraform apply
```

### 8. Deploy to Kubernetes
```bash
kubectl apply -f infra/k8s/configmap.yaml
kubectl apply -f infra/k8s/services.yaml
kubectl apply -f infra/k8s/worker-deployment.yaml
kubectl apply -f infra/k8s/worker-cronjob.yaml
```

---

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `DATABASE_URL` | worker, graphql-api | PostgreSQL connection string |
| `RABBITMQ_URL` | worker | RabbitMQ AMQP connection string |
| `OPENAI_API_KEY` | ai-grpc | OpenAI API key for scoring |
| `AI_GRPC_PORT` | ai-grpc | gRPC server port (default: 50051) |
| `GRAPHQL_PORT` | graphql-api | GraphQL server port (default: 4000) |
| `GRAPHQL_URL` | web | URL of the graphql-api (from Next.js) |
| `ELASTICSEARCH_URL` | worker (future) | Elasticsearch node URL |

---

## Communication Architecture

### Internal — gRPC
Worker → AI service. Binary protocol, strongly typed via `.proto` file. Fast for passing large job descriptions.

### External — GraphQL
Dashboard → graphql-api. Client asks for exactly the fields it needs. Mutations update job status directly.

### Message Queue — RabbitMQ
Producers (seed scripts / cron) publish LinkedIn URLs to the `scrape_jobs` queue. Workers consume and ack/nack independently. K8s scales worker replicas based on CPU/queue depth.

---

## Infrastructure (GCP)

| Resource | Service | Purpose |
|---|---|---|
| Kubernetes cluster | GKE | Runs worker pods, ai-grpc, graphql-api |
| Managed PostgreSQL | Cloud SQL | Primary database |
| Container registry | Artifact Registry | Stores Docker images |
| Networking | VPC + Subnet | Isolates services |
| Secrets | GCP Secret Manager | API keys, DB passwords |
| IaC | Terraform | All of the above provisioned as code |

---

## Testing Structure

```
tests/
├── unit/          # Fast isolated tests for functions/modules
├── integration/   # DB, queue, and service integration tests
├── e2e/           # End-to-end critical flows (scraper → DB → dashboard)
└── fixtures/      # Shared test data, mocks, seeds
```

---

## Security Considerations
- LinkedIn scraping: respect rate limits; use headless browser stealth and IP rotation
- Never commit real `.env` values — use GCP Secret Manager in production
- Kubernetes Secrets should use Workload Identity or External Secrets Operator
- GDPR: only store job data, not personal LinkedIn user data

---

## Future Enhancements
- Add Indeed, Glassdoor scrapers as additional worker modules
- Elasticsearch-powered "search as you type" in the dashboard
- Resume upload page to personalise AI scoring
- Real-time score updates via GraphQL subscriptions
- Mobile-friendly PWA companion

---

## Contributing
1. Fork and create a feature branch
2. Follow the TypeScript and ESLint rules already configured
3. Add tests for any new logic
4. Submit a pull request with a clear description

---

## License
[Specify license here]
