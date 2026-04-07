import axios from 'axios';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

type CounterSeries = {
  labels: Record<string, string>;
  value: number;
};

type Snapshot = {
  counters: Map<string, CounterSeries[]>;
  gauges: Map<string, CounterSeries[]>;
};

type CostReport = {
  sampledAt: string;
  sampleSeconds: number;
  usage: {
    aiCompletedJobs: number;
    tryonCompletedJobs: number;
    aiSuccessOps: number;
    tryonSuccessOps: number;
    waitingDepthAi: number;
    waitingDepthTryon: number;
  };
  cost: {
    infraCostUsd: number;
    variableAiCostUsd: number;
    variableTryonCostUsd: number;
    totalAiCostUsd: number;
    totalTryonCostUsd: number;
    aiCostPer1kUsd: number;
    tryonCostPer1kUsd: number;
  };
  thresholds: {
    aiCostPer1kMaxUsd: number;
    tryonCostPer1kMaxUsd: number;
  };
  verdict: 'pass' | 'fail';
  findings: string[];
  recommendations: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseLabels = (labelsRaw: string): Record<string, string> => {
  const labels: Record<string, string> = {};
  if (!labelsRaw) return labels;

  const parts = labelsRaw.split(',');
  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || rawValue === undefined) continue;

    const key = rawKey.trim();
    const value = rawValue.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    labels[key] = value;
  }

  return labels;
};

const parsePrometheus = (raw: string): Snapshot => {
  const counters = new Map<string, CounterSeries[]>();
  const gauges = new Map<string, CounterSeries[]>();
  const typeByMetric = new Map<string, string>();

  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# TYPE ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        typeByMetric.set(parts[2], parts[3]);
      }
      continue;
    }

    if (trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)$/);
    if (!match) continue;

    const metric = match[1];
    const labels = parseLabels(match[3] || '');
    const value = Number.parseFloat(match[4]);

    const baseMetric = metric.replace(/_(bucket|sum|count)$/, '');
    const metricType = typeByMetric.get(baseMetric) || typeByMetric.get(metric) || '';
    const targetMap = metricType === 'gauge' ? gauges : counters;

    const arr = targetMap.get(metric) || [];
    arr.push({ labels, value });
    targetMap.set(metric, arr);
  }

  return { counters, gauges };
};

const seriesDelta = (
  begin: CounterSeries[] | undefined,
  end: CounterSeries[] | undefined,
  filter?: (labels: Record<string, string>) => boolean
): number => {
  if (!end || end.length === 0) return 0;

  const beginByLabel = new Map<string, number>();
  for (const item of begin || []) {
    beginByLabel.set(JSON.stringify(item.labels), item.value);
  }

  let sum = 0;
  for (const item of end) {
    if (filter && !filter(item.labels)) continue;

    const key = JSON.stringify(item.labels);
    const startValue = beginByLabel.get(key) || 0;
    const delta = item.value - startValue;
    if (delta > 0) sum += delta;
  }

  return sum;
};

const gaugeValue = (
  snapshot: Snapshot,
  metric: string,
  filter?: (labels: Record<string, string>) => boolean
): number => {
  const rows = snapshot.gauges.get(metric) || [];
  if (rows.length === 0) return 0;

  let sum = 0;
  for (const row of rows) {
    if (filter && !filter(row.labels)) continue;
    sum += row.value;
  }
  return sum;
};

const parsePositive = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const sampleSnapshots = async (metricsUrl: string, token: string | undefined, sampleSeconds: number) => {
  const headers: Record<string, string> = {};
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const begin = await axios.get<string>(metricsUrl, { headers, responseType: 'text', timeout: 10000 });
  await sleep(sampleSeconds * 1000);
  const end = await axios.get<string>(metricsUrl, { headers, responseType: 'text', timeout: 10000 });

  return {
    begin: parsePrometheus(begin.data),
    end: parsePrometheus(end.data),
  };
};

const resolveMetricsUrl = async (token: string | undefined): Promise<string> => {
  const explicit = process.env.COST_METRICS_URL || process.env.RELEASE_CANDIDATE_METRICS_URL;
  if (explicit && explicit.trim()) {
    return explicit.trim();
  }

  const candidates = [
    'http://127.0.0.1:8185/metrics',
    'http://127.0.0.1:8181/metrics',
    'http://localhost:8185/metrics',
    'http://localhost:8181/metrics',
  ];

  const headers: Record<string, string> = {};
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  for (const candidate of candidates) {
    try {
      const response = await axios.get<string>(candidate, {
        headers,
        responseType: 'text',
        timeout: 3000,
      });
      if (response.status >= 200 && response.status < 300) {
        console.log(`[cost-model] auto-detected metrics url: ${candidate}`);
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    [
      'No metrics endpoint detected.',
      'Set COST_METRICS_URL explicitly, or start backend and expose /metrics.',
      'Examples:',
      '  COST_METRICS_URL=http://127.0.0.1:8185/metrics npm run cost:report',
      '  npm run dev:backend  # then rerun npm run cost:report',
    ].join(' ')
  );
};

const buildReport = (begin: Snapshot, end: Snapshot, sampleSeconds: number): CostReport => {
  const aiCompletedJobs = seriesDelta(
    begin.counters.get('jobs_completed_total'),
    end.counters.get('jobs_completed_total'),
    (labels) => labels.queue === 'ai-image'
  );

  const tryonCompletedJobs = seriesDelta(
    begin.counters.get('jobs_completed_total'),
    end.counters.get('jobs_completed_total'),
    (labels) => labels.queue === 'virtual-tryon'
  );

  const aiSuccessOps = seriesDelta(
    begin.counters.get('comfyui_requests_total'),
    end.counters.get('comfyui_requests_total'),
    (labels) => labels.operation === 'ai-generate' && labels.status === 'success'
  );

  const tryonSuccessOps = seriesDelta(
    begin.counters.get('comfyui_requests_total'),
    end.counters.get('comfyui_requests_total'),
    (labels) => labels.operation === 'tryon' && labels.status === 'success'
  );

  const waitingDepthAi = gaugeValue(end, 'queue_depth', (labels) => labels.queue === 'ai-image' && labels.state === 'waiting');
  const waitingDepthTryon = gaugeValue(end, 'queue_depth', (labels) => labels.queue === 'virtual-tryon' && labels.state === 'waiting');

  const apiHourlyUsd = parsePositive(process.env.COST_API_HOURLY_USD, 0.12);
  const workerHourlyUsd = parsePositive(process.env.COST_WORKER_HOURLY_USD, 0.18);
  const gpuHourlyUsd = parsePositive(process.env.COST_GPU_HOURLY_USD, 1.5);
  const apiReplicaCount = parsePositive(process.env.COST_API_REPLICA_COUNT, 2);
  const workerReplicaCount = parsePositive(process.env.COST_WORKER_REPLICA_COUNT, 2);
  const gpuReplicaCount = parsePositive(process.env.COST_GPU_REPLICA_COUNT, 1);

  const aiVariablePerOp = parsePositive(process.env.COST_AI_VARIABLE_PER_OP_USD, 0.002);
  const tryonVariablePerOp = parsePositive(process.env.COST_TRYON_VARIABLE_PER_OP_USD, 0.003);

  const hours = sampleSeconds / 3600;
  const infraCostUsd = hours * (
    apiHourlyUsd * apiReplicaCount +
    workerHourlyUsd * workerReplicaCount +
    gpuHourlyUsd * gpuReplicaCount
  );

  const totalOps = Math.max(1, aiSuccessOps + tryonSuccessOps);
  const aiShare = aiSuccessOps / totalOps;
  const tryonShare = tryonSuccessOps / totalOps;

  const aiInfraCostUsd = infraCostUsd * aiShare;
  const tryonInfraCostUsd = infraCostUsd * tryonShare;

  const variableAiCostUsd = aiSuccessOps * aiVariablePerOp;
  const variableTryonCostUsd = tryonSuccessOps * tryonVariablePerOp;

  const totalAiCostUsd = aiInfraCostUsd + variableAiCostUsd;
  const totalTryonCostUsd = tryonInfraCostUsd + variableTryonCostUsd;

  const aiCostPer1kUsd = (totalAiCostUsd / Math.max(1, aiCompletedJobs)) * 1000;
  const tryonCostPer1kUsd = (totalTryonCostUsd / Math.max(1, tryonCompletedJobs)) * 1000;

  const aiCostPer1kMaxUsd = parsePositive(process.env.COST_AI_MAX_PER_1K_USD, 120);
  const tryonCostPer1kMaxUsd = parsePositive(process.env.COST_TRYON_MAX_PER_1K_USD, 180);

  const findings: string[] = [];
  const recommendations: string[] = [];

  if (aiCostPer1kUsd > aiCostPer1kMaxUsd) {
    findings.push(`AI generate cost per 1k (${aiCostPer1kUsd.toFixed(2)} USD) exceeds threshold ${aiCostPer1kMaxUsd.toFixed(2)} USD`);
  }
  if (tryonCostPer1kUsd > tryonCostPer1kMaxUsd) {
    findings.push(`Try-on cost per 1k (${tryonCostPer1kUsd.toFixed(2)} USD) exceeds threshold ${tryonCostPer1kMaxUsd.toFixed(2)} USD`);
  }

  if (findings.length === 0) {
    recommendations.push('Current unit economics are within configured thresholds. Keep weekly cost review cadence.');
  } else {
    recommendations.push('Review worker/GPU replica sizing and reduce idle over-provisioning windows.');
    recommendations.push('Tune model steps/cfg and image dimensions for lower per-op compute cost where quality permits.');
    recommendations.push('Link autoscaling guardrail: avoid scale-out when queue waiting depth remains low but cost per 1k is high.');
  }

  if (waitingDepthAi > 30 || waitingDepthTryon > 20) {
    recommendations.push('Queue waiting depth is elevated; assess if higher cost is caused by backlog rather than over-provisioning.');
  }

  return {
    sampledAt: new Date().toISOString(),
    sampleSeconds,
    usage: {
      aiCompletedJobs,
      tryonCompletedJobs,
      aiSuccessOps,
      tryonSuccessOps,
      waitingDepthAi,
      waitingDepthTryon,
    },
    cost: {
      infraCostUsd,
      variableAiCostUsd,
      variableTryonCostUsd,
      totalAiCostUsd,
      totalTryonCostUsd,
      aiCostPer1kUsd,
      tryonCostPer1kUsd,
    },
    thresholds: {
      aiCostPer1kMaxUsd,
      tryonCostPer1kMaxUsd,
    },
    verdict: findings.length > 0 ? 'fail' : 'pass',
    findings,
    recommendations,
  };
};

const toMarkdown = (report: CostReport): string => {
  return [
    '# Cost Model Report',
    '',
    `- sampledAt: ${report.sampledAt}`,
    `- sampleSeconds: ${report.sampleSeconds}`,
    `- verdict: ${report.verdict}`,
    '',
    '## Usage',
    '',
    `- aiCompletedJobs: ${report.usage.aiCompletedJobs}`,
    `- tryonCompletedJobs: ${report.usage.tryonCompletedJobs}`,
    `- aiSuccessOps: ${report.usage.aiSuccessOps}`,
    `- tryonSuccessOps: ${report.usage.tryonSuccessOps}`,
    `- waitingDepthAi: ${report.usage.waitingDepthAi}`,
    `- waitingDepthTryon: ${report.usage.waitingDepthTryon}`,
    '',
    '## Unit Cost',
    '',
    `- aiCostPer1kUsd: ${report.cost.aiCostPer1kUsd.toFixed(2)}`,
    `- tryonCostPer1kUsd: ${report.cost.tryonCostPer1kUsd.toFixed(2)}`,
    `- infraCostUsd (window): ${report.cost.infraCostUsd.toFixed(4)}`,
    '',
    '## Thresholds',
    '',
    `- aiCostPer1kMaxUsd: ${report.thresholds.aiCostPer1kMaxUsd.toFixed(2)}`,
    `- tryonCostPer1kMaxUsd: ${report.thresholds.tryonCostPer1kMaxUsd.toFixed(2)}`,
    '',
    '## Findings',
    '',
    ...(report.findings.length > 0 ? report.findings.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Recommendations',
    '',
    ...report.recommendations.map((item) => `- ${item}`),
    '',
  ].join('\n');
};

const main = async () => {
  const token = process.env.COST_METRICS_TOKEN || process.env.METRICS_TOKEN;
  const sampleSeconds = Math.max(30, Number.parseInt(process.env.COST_SAMPLE_SECONDS || '300', 10));
  const metricsUrl = await resolveMetricsUrl(token);

  const { begin, end } = await sampleSnapshots(metricsUrl, token, sampleSeconds);
  const report = buildReport(begin, end, sampleSeconds);

  const outputDir = path.resolve(process.cwd(), '..', 'artifacts', 'cost');
  mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `cost-model-${stamp}.json`);
  const mdPath = path.join(outputDir, `cost-model-${stamp}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdPath, toMarkdown(report), 'utf8');

  console.log(`[cost-model] report json: ${jsonPath}`);
  console.log(`[cost-model] report markdown: ${mdPath}`);
  console.log(JSON.stringify(report, null, 2));

  if (report.verdict === 'fail') {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('[cost-model] fatal error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
