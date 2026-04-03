# API Release Strategy: Canary / Blue-Green

## Objective

Standardize release and rollback with measurable SLO gates so deployment safety does not rely on individual experience.

## Supported Strategies

- Canary:
  - Roll out candidate API to a small percentage of traffic.
  - Compare candidate SLO to absolute thresholds (and optionally baseline).
  - Promote only when gate passes.

- Blue-Green:
  - Keep blue (current) and green (candidate) both live.
  - Gate candidate using side-by-side SLO comparison.
  - Switch traffic to green only when gate passes.

## Automated Gate

Repository includes:

- Script: `backend/src/release/slo-rollout-guard.ts`
- Command: `npm run release:guard`
- Workflow: `.github/workflows/release-rollout-gate.yml`

The guard samples Prometheus text metrics and enforces:

- API 5xx ratio (`http_requests_total`) <= `RELEASE_MAX_ERROR_RATE`
- API p95 latency (`http_request_duration_seconds`) <= `RELEASE_MAX_API_P95_SECONDS`
- Queue wait p95 (`job_queue_wait_duration_seconds`) <= `RELEASE_MAX_QUEUE_WAIT_P95_SECONDS`
- Dependency up ratio (`dependency_up`) >= `RELEASE_MIN_DEPENDENCY_UP_RATIO`

For blue-green/canary compare mode, candidate degradation is constrained by:

- `RELEASE_MAX_ERROR_RATE_DEGRADATION_RATIO`
- `RELEASE_MAX_LATENCY_DEGRADATION_RATIO`
- `RELEASE_MAX_QUEUE_WAIT_DEGRADATION_RATIO`

## Rollback Rules

If any guard rule fails:

1. Block promotion/switch.
2. If `RELEASE_AUTO_ROLLBACK=true`, send rollback event to `RELEASE_ROLLBACK_WEBHOOK_URL`.
3. Keep incident open until SLO recovers and postmortem owner is assigned.

## Rollback Webhook Contract

`POST RELEASE_ROLLBACK_WEBHOOK_URL`

Payload fields:

- `event`: `release_auto_rollback`
- `happenedAt`
- `reasons`: failed rule list
- `candidate`: sampled metrics summary
- `baseline`: optional baseline metrics summary

## GitHub Actions Usage

Run workflow `Release Rollout Gate` manually with inputs:

- `strategy`: `canary` or `blue-green`
- `candidate_metrics_url`: candidate API `/metrics` URL
- `baseline_metrics_url`: blue/stable `/metrics` URL (required for blue-green)
- `auto_rollback`: whether to trigger rollback webhook
- `sample_seconds`: sampling window (default 60)

Required repository secrets:

- `JWT_SECRET`
- `DATABASE_URL`
- `RABBITMQ_URL`
- `REDIS_URL`
- Optional: `RELEASE_METRICS_TOKEN`
- Optional: `RELEASE_ROLLBACK_WEBHOOK_URL`
- Optional: `RELEASE_ROLLBACK_WEBHOOK_TOKEN`

## Suggested Rollout SOP

1. Run `npm run release:preflight`.
2. Deploy candidate API with canary traffic (e.g., 5%).
3. Execute `Release Rollout Gate` workflow (strategy `canary`).
4. If pass, increase to 25% then rerun gate.
5. If pass again, promote to 100% or switch blue-green router.
6. If fail, auto/manual rollback and start incident workflow.
