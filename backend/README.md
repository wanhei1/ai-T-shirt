# Backend Project

This project is a backend application that allows users to register and log in. It connects to a Neon database to store user information securely.

## Project Structure

```
backend-project
├── src
│   ├── config          # Configuration files
│   │   └── database.ts # Database connection setup
│   ├── controllers     # Request handling
│   │   └── index.ts    # UserController for registration and login
│   ├── middleware      # Middleware functions
│   │   └── auth.ts     # Authentication middleware
│   ├── models          # Data models
│   │   └── index.ts    # User model for database interaction
│   ├── routes          # API routes
│   │   └── index.ts    # Route setup
│   ├── services        # Business logic
│   │   └── index.ts    # UserService for user operations
│   ├── utils           # Utility functions
│   │   └── index.ts    # Password handling utilities
│   └── app.ts         # Application entry point
├── .env                # Environment variables
├── package.json        # NPM dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # Project documentation
```

## Features

- User registration and login functionality
- Secure password handling
- Middleware for authentication
- Connection to a Neon database

## Getting Started

1. Clone the repository.
2. Install dependencies using `npm install`.
3. Set up your `.env` file with the necessary environment variables.
4. Run the application using `npm start`.

## Queue Service (RabbitMQ)

This backend uses RabbitMQ for async jobs (`ai-image` and `virtual-tryon`).

Start RabbitMQ locally:

```bash
cd backend
docker compose up -d
```

Management UI: `http://localhost:15672` (default `xxyopen` / `test123456`)

## High Availability Topology (API/Worker/LB)

This repository now includes a runnable HA application topology in `docker-compose.ha.yml`:

- `api1` + `api2`: two stateless API instances
- `worker1` + `worker2`: two background worker instances
- `lb` (Nginx): L7 load balancer in front of APIs
- `migrate`: one-shot schema migration job (must succeed before APIs start)
- shared dependencies: PostgreSQL / RabbitMQ / Redis

### Start HA stack

```bash
cd backend
docker compose -f docker-compose.ha.yml up -d
```

Or from workspace root:

```bash
npm run dev:infra:ha
```

### Verify readiness and failover behavior

- LB entrypoint: `http://localhost:8189/health`
- API readiness probe: `GET /health/ready`

Nginx forwards traffic only to healthy API instances. If one API instance loses DB connectivity, `/health/ready` returns `503`, and the instance can be removed from traffic.

### Important production notes

- Replace all demo secrets in `docker-compose.ha.yml` before production use.
- For production-grade HA of stateful dependencies, use managed/clustered services:
	- PostgreSQL: Multi-AZ managed instance or primary-standby with failover
	- RabbitMQ: managed cluster / mirrored quorum queues
	- Redis: managed Redis with replication/failover (or Sentinel/Cluster)

## Dependency-Layer HA (DB / MQ / Redis)

For local rehearsal of dependency HA patterns, use:

```bash
cd backend
docker compose -f docker-compose.deps-ha.yml up -d
```

This file provides:

- PostgreSQL primary + standby (repmgr image)
- RabbitMQ 3-node cluster skeleton
- Redis master/replica + Sentinel

Then configure app-side failover candidates:

```env
DATABASE_URLS=postgresql://primary:5432/db,postgresql://standby:5432/db
RABBITMQ_URLS=amqp://user:pass@mq-1:5672/vhost,amqp://user:pass@mq-2:5672/vhost
REDIS_URLS=redis://redis-1:6379,redis://redis-2:6379,redis://redis-3:6379
```

The backend now probes these candidate lists and connects to the first reachable endpoint.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.