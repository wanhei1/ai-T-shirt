# SLO Targets and Error Budget Policy

## Scope

These SLOs apply to backend API, async worker pipeline, and dependency availability probes.

## SLO Targets

| SLI | Target | Window |
|---|---:|---:|
| API availability (non-5xx success ratio) | 99.9% | 30 days |
| API latency p95 (`http_request_duration_seconds`) | <= 1000ms | rolling 7 days |
| Queue wait p95 (`job_queue_wait_duration_seconds`) | <= 120s | rolling 24 hours |
| Dependency availability (`dependency_up`) | >= 99.95% | 30 days |

## Error Budget

- API availability error budget: 0.1% per 30 days.
- If 50% budget is consumed in first 15 days, freeze non-essential releases.
- If 80% budget is consumed at any time, allow only reliability/security changes until recovery.

## Review Cadence

- Weekly: service owner reviews SLI trend and alert noise.
- Monthly: platform lead reviews burn rate and updates thresholds if needed.

## Dashboard Minimum Panels

1. API request rate, 5xx ratio, p95 latency.
2. Queue depth, queue wait p95, worker success/failure ratio.
3. Dependency availability by label and dependency check p95 latency.
4. ComfyUI success/failure ratio and duration.
5. Cache hit ratio by route: `sum(rate(cache_requests_total{result="hit"}[5m])) by (route) / clamp_min(sum(rate(cache_requests_total{result=~"hit|miss"}[5m])) by (route), 1)`.
6. Cache backsource QPS by route: `sum(rate(cache_backsource_total[5m])) by (route)`.
7. DR RTO risk panel: `dependency_up{dependency=~"postgres|redis|rabbitmq"}` with 10m/15m/60m alert overlays.
8. Weekly unit cost report: `artifacts/cost/` output from `npm run cost:report` (AI/Try-on USD per 1k) and threshold trend.

See DR target details in `docs/DR_MULTI_AZ_CROSS_REGION_STRATEGY.md`, operational procedures in `docs/DR_RUNBOOK.md`, and cost model definitions in `docs/COST_OBSERVABILITY_AND_UNIT_ECONOMICS.md`.
