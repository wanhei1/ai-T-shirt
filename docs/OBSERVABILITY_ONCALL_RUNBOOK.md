# Observability On-call Runbook

This runbook closes the "metrics exists but no alerting/SLO loop" gap by defining alert handling, escalation, and verification steps.

## Severity and Escalation

| Severity | Target acknowledge | Target mitigation start | Escalation |
|---|---:|---:|---|
| critical | 5 minutes | 10 minutes | page primary on-call, then backup after 10 minutes |
| warning | 30 minutes | 60 minutes | notify team channel; escalate during business hours |

## Incident Workflow

1. Alert fires in Alertmanager.
2. On-call acknowledges and records incident id.
3. Triage affected SLO and business impact.
4. Execute the matching runbook section below.
5. Confirm recovery from both /health/ready and metric return-to-baseline.
6. File postmortem within 24 hours for any critical incident.

## Alert Procedures

### ApiHighErrorRate

1. Check release/version delta and recent deployment logs.
2. Inspect 5xx routes from `http_requests_total` split by route.
3. Roll back latest deployment if error ratio remains above threshold for 10 minutes.
4. Verify burn rate normalizes below 1% before closing.

### ApiHighLatencyP95

1. Inspect p95 route breakdown and dependency latency metrics.
2. If dependency latency is elevated, jump to DependencyCheckSlow.
3. Scale API replicas or rollback high-latency release.

### QueueBacklogGrowing

1. Compare queue depth vs active worker count.
2. Inspect worker error logs and retry rates.
3. Scale workers, then validate queue depth trend reversal.

### QueueWaitP95TooHigh

1. Confirm queue backlog and worker throughput.
2. Increase worker concurrency if CPU/GPU headroom exists.
3. Validate p95 queue wait drops below 120 seconds.

### WorkerFailureRateHigh

1. Inspect failed job samples and classify errors (validation, dependency, timeout).
2. If dependency-related, follow dependency runbook sections.
3. Rollback recent worker-side prompt/workflow changes when failures are model-specific.

### DependencyDown

1. Identify dependency label (`postgres`, `rabbitmq`, `redis`).
2. Validate connection from API container and dependency logs.
3. Trigger failover/manual switchover if available.
4. Keep incident open until dependency_up returns 1 for 5 continuous minutes.

### DependencyCheckSlow

1. Identify slow dependency by label dimension.
2. Check saturation (connections, CPU, I/O, network RTT).
3. Apply throttling, pool tuning, or temporary scale-out.

### ComfyUiFailureRateHigh

1. Validate ComfyUI health and model loading status.
2. Check timeout and queue saturation on generation service.
3. Switch to degraded mode (fallback style/model) if needed.

### CacheHitRateLow

1. Check `cache_requests_total` by `route` and identify the top miss contributors.
2. Validate recent write traffic for affected entities (`orders`, `cart`, `membership`, `gallery`) to distinguish expected invalidation vs abnormal misses.
3. Check Redis availability/latency and cache prefix settings (`CACHE_REDIS_PREFIX`, endpoint failover status).
4. If misses are abnormal, temporarily increase hot-route TTL (env) and open a follow-up issue for key design or invalidation frequency optimization.

### BillingReconciliationMismatch

1. Run `npm run billing:reconcile` and open the generated report under `artifacts/reconciliation/`.
2. Prioritize the mismatch kind with highest count: membership payment missing tx, tx missing payment record, or order-payment amount mismatch.
3. For `order_payment_amount_mismatch`, lock affected users from checkout temporarily and reconcile wallet balance manually before reopening traffic.
4. Keep incident open until reconciliation total mismatches returns to 0 for 10 continuous minutes.

### BillingReconciliationStale

1. Check backend logs for `billing_reconciliation_failed` events and confirm DB connectivity.
2. Validate environment values for `BILLING_RECONCILIATION_ENABLED`, interval, and lookback hours.
3. Run `npm run billing:reconcile` manually; if successful, restore periodic loop and verify metric freshness.

### CoreTransactionRtoRisk / CoreTransactionRtoBreach

1. Start DR incident bridge immediately and assign incident commander.
2. Trigger same-city failover runbook from `docs/DR_RUNBOOK.md`.
3. Validate `/health/ready` recovery and confirm order path read/write availability.
4. Record outage start/recovery timestamps for RTO evidence.

### AiAsyncRtoBreach

1. Switch AI path to degraded mode and protect core order path first.
2. Recover RabbitMQ service or fail over to alternate endpoint cluster.
3. Verify queue draining resumes and no unrecoverable job-state corruption appears.
4. Attach queue recovery evidence to DR report.

## Postmortem Minimum Template

- Incident id
- Start/end time
- Customer impact
- Trigger alert
- Primary root cause
- Corrective actions
- Preventive actions
- Owner and due date
