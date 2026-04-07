# Cost Observability and Unit Economics

## Goal

Turn cost from a post-hoc concern into an operational SLO-adjacent signal.

Primary business metrics:

- AI generate cost per 1000 jobs.
- Try-on cost per 1000 jobs.
- Peak window cost under current replica policy.

## Data Sources

- `/metrics` counters:
  - `jobs_completed_total{queue=...}`
  - `comfyui_requests_total{operation=...,status=success}`
  - `queue_depth{queue=...,state=waiting}`

## Cost Report Tooling

- Script: `backend/src/release/cost-model-report.ts`
- Command: `npm run cost:report`
- Output: `artifacts/cost/cost-model-<timestamp>.json|md`

## Model (Window-based)

For sample window $T$ hours:

$$
C_{infra}(T)=T\times (p_{api}n_{api}+p_{worker}n_{worker}+p_{gpu}n_{gpu})
$$

$$
C_{ai}=C_{infra}\cdot share_{ai}+N_{ai,op}\cdot c_{ai,var}
$$

$$
C_{tryon}=C_{infra}\cdot share_{tryon}+N_{tryon,op}\cdot c_{tryon,var}
$$

$$
CostPer1K_{ai}=\frac{C_{ai}}{\max(1,N_{ai,job})}\times 1000
$$

$$
CostPer1K_{tryon}=\frac{C_{tryon}}{\max(1,N_{tryon,job})}\times 1000
$$

## Thresholds

- `COST_AI_MAX_PER_1K_USD` (default 120)
- `COST_TRYON_MAX_PER_1K_USD` (default 180)

If any threshold is breached, script exits non-zero to block release/scale actions.

## Scaling Linkage Policy

- If cost per 1k is above threshold and waiting queue depth is low:
  - treat as over-provisioning risk, reduce baseline replicas or shorten high-capacity windows.
- If cost per 1k is above threshold and waiting queue depth is high:
  - bottleneck likely compute efficiency, tune model steps/cfg/size first, then scale.
- Do not increase long-term replica baseline without checking cost report trend for 2 consecutive windows.

## Weekly Cadence

1. Run weekly cost workflow.
2. Review trend vs threshold and compare with queue backlog behavior.
3. Create action item if threshold is breached in 2 consecutive reports.
