# DR Strategy: Multi-AZ and Cross-Region

## Scope

This document defines disaster recovery objectives and architecture path for:

- Core transaction path: order creation, payment callback, order query.
- AI async path: generate/try-on submit, queueing, result callback.

## Target RTO / RPO

### Core transaction path

- Same-city multi-AZ: RTO <= 15 minutes, RPO <= 5 minutes.
- Cross-region DR: RTO <= 60 minutes, RPO <= 15 minutes.

### AI async path

- Same-city multi-AZ: RTO <= 60 minutes, RPO <= 15 minutes.
- Cross-region DR: RTO <= 4 hours, RPO <= 60 minutes.

## Architecture Phases

### Phase 1 (0-30 days): Multi-AZ failover

- Deploy API/Worker across AZs with load balancer health checks.
- PostgreSQL HA (managed preferred), Redis Sentinel/Cluster, RabbitMQ multi-node.
- Apply failover runbook and assign incident ownership rotation.

### Phase 2 (30-60 days): Cross-region restore

- DB cross-region read replica or periodic snapshots (5-15 min incremental + daily full).
- Object storage cross-region replication for design/result assets.
- Multi-region key/config hosting and restoration verification.

### Phase 3 (60-90 days): Drill operationalization

- Monthly AZ failover drill.
- Quarterly cross-region restore drill.
- Report every drill with measured RTO/RPO, data-loss estimate, and remediation owner/date.

## Tooling in Repository

- DR readiness gate: `npm run dr:readiness`
- AZ drill script: `npm run dr:drill:az`
- Cross-region restore drill script: `npm run dr:drill:cross-region`
- Drill runbook: `docs/DR_RUNBOOK.md`

## Sign-off Checklist (Go/No-Go)

- [ ] Business and engineering owners approve RTO/RPO targets.
- [ ] Multi-AZ endpoint lists configured (`DATABASE_URLS`, `RABBITMQ_URLS`, `REDIS_URLS`).
- [ ] Incremental backup interval <= 15 minutes and daily full backup enabled.
- [ ] Cross-region object replication enabled for critical assets.
- [ ] Monthly/quarterly drill schedule entered in on-call calendar.
