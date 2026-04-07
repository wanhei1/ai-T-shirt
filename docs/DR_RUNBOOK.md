# DR Runbook (AZ Failover + Cross-Region Restore)

## 1. Purpose

Provide executable procedures and evidence outputs for disaster recovery drills and incidents.

## 2. Roles

- Incident commander: coordinates failover/restore decisions.
- Platform owner: executes infrastructure switch commands.
- Application owner: validates API and queue recovery.
- Scribe: records timestamps and attaches evidence.

## 3. AZ Failover Drill (Monthly)

### Preconditions

- Candidate and baseline environments are healthy.
- `npm run dr:readiness` passes.
- Drill window approved by owner.

### Execution

1. Trigger workload traffic at low but stable rate.
2. Inject AZ fault (instance stop / node drain / network isolation).
3. Run:

```bash
npm run dr:drill:az
```

Optional env overrides:

- `API_BASE_URL`
- `TARGET_RTO_MINUTES`
- `FAULT_INJECTION_COMMAND`
- `RECOVERY_COMMAND`

### Success criteria

- API readiness recovered within target RTO.
- No unrecoverable queue-state corruption.
- Report generated under `artifacts/dr/`.

## 4. Cross-Region Restore Drill (Quarterly)

### Preconditions

- Latest backup snapshot timestamp known.
- Restore target region prepared.

### Execution

1. Start restore workflow in DR region.
2. When completed, run:

```bash
BACKUP_SNAPSHOT_AT=2026-04-04T08:00:00Z \
OUTAGE_STARTED_AT=2026-04-04T08:30:00Z \
RESTORE_COMPLETED_AT=2026-04-04T09:10:00Z \
npm run dr:drill:cross-region
```

### Success criteria

- Measured RTO and RPO are within target values.
- Object assets and job-state consistency checks pass.
- Postmortem actions tracked for any breach.

## 5. Incident Escalation

- If core transaction path exceeds RTO/RPO target, open P0 incident.
- If AI async path exceeds target, open P1 incident and apply degradation mode.

## 6. Evidence Required

- Drill report markdown from scripts.
- Platform logs (LB, DB failover/restore, queue recovery).
- Application validation logs (`/health/ready`, queue stats, sample order/job consistency).
