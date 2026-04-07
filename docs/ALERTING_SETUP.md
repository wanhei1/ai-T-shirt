# Alerting Setup Guide

## 1) Prometheus rules

Use `backend/monitoring/prometheus/prometheus.yml` and include `backend/monitoring/prometheus/rules/tshirt-alerts.yml`.

## 2) Alertmanager routing

Use `backend/monitoring/alertmanager/alertmanager.yml` and replace webhook URLs with real endpoints.

## 3) Protect /metrics

If public exposure is possible, set `METRICS_TOKEN` in backend env and configure Prometheus with Bearer token.

## 4) Verify rules

Run promtool check in your Prometheus container image:

```bash
promtool check rules backend/monitoring/prometheus/rules/tshirt-alerts.yml
```

## 5) Fire-drill checklist

1. Stop Redis or block port to trigger `DependencyDown`.
2. Generate synthetic 5xx traffic to trigger `ApiHighErrorRate`.
3. Reduce worker count to trigger `QueueBacklogGrowing`.
4. Confirm alerts route to correct receiver and incident workflow starts.

## 6) DR target alignment drills

1. Run `npm run dr:readiness` and ensure multi-AZ endpoint checks pass.
2. Run `npm run dr:drill:az` to generate AZ failover RTO evidence under `artifacts/dr/`.
3. Run `npm run dr:drill:cross-region` with backup/outage timestamps to validate RTO/RPO objectives.
4. Confirm `CoreTransactionRtoRisk`, `CoreTransactionRtoBreach`, and `AiAsyncRtoBreach` alerts are visible in Alertmanager.
