import axios from 'axios';

type CounterSeries = {
  labels: Record<string, string>;
  value: number;
};

type Snapshot = {
  counters: Map<string, CounterSeries[]>;
  gauges: Map<string, CounterSeries[]>;
};

type HistogramStats = {
  count: number;
  p95: number;
};

type WindowMetrics = {
  requestTotal: number;
  request5xx: number;
  errorRate: number;
  latencyP95: number;
  queueWaitP95: number;
  dependencyUpRatio: number;
};

type GuardResult = {
  passed: boolean;
  reasons: string[];
  candidate: WindowMetrics;
  baseline?: WindowMetrics;
};

const parseBoolean = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
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
    const key = JSON.stringify(item.labels);
    beginByLabel.set(key, item.value);
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

const histogramP95FromDelta = (begin: Snapshot, end: Snapshot, metricName: string): HistogramStats => {
  const bucketsBegin = begin.counters.get(`${metricName}_bucket`) || [];
  const bucketsEnd = end.counters.get(`${metricName}_bucket`) || [];

  const beginMap = new Map<string, number>();
  for (const item of bucketsBegin) {
    if (!item.labels.le) continue;
    beginMap.set(item.labels.le, item.value);
  }

  const bucketRows: Array<{ le: number; count: number }> = [];
  for (const item of bucketsEnd) {
    const leRaw = item.labels.le;
    if (!leRaw || leRaw === '+Inf') continue;
    const le = Number.parseFloat(leRaw);
    if (!Number.isFinite(le)) continue;
    const start = beginMap.get(leRaw) || 0;
    const delta = item.value - start;
    bucketRows.push({ le, count: Math.max(0, delta) });
  }

  bucketRows.sort((a, b) => a.le - b.le);

  const countDelta = seriesDelta(begin.counters.get(`${metricName}_count`), end.counters.get(`${metricName}_count`));
  if (countDelta <= 0 || bucketRows.length === 0) {
    return { count: 0, p95: 0 };
  }

  const threshold = countDelta * 0.95;
  let p95 = bucketRows[bucketRows.length - 1].le;
  for (const row of bucketRows) {
    if (row.count >= threshold) {
      p95 = row.le;
      break;
    }
  }

  return { count: countDelta, p95 };
};

const dependencyUpRatio = (snapshot: Snapshot): number => {
  const series = snapshot.gauges.get('dependency_up') || [];
  if (series.length === 0) return 1;

  let sum = 0;
  for (const row of series) {
    sum += row.value >= 1 ? 1 : 0;
  }

  return sum / series.length;
};

const collectWindowMetrics = (begin: Snapshot, end: Snapshot): WindowMetrics => {
  const requestTotal = seriesDelta(begin.counters.get('http_requests_total'), end.counters.get('http_requests_total'));
  const request5xx = seriesDelta(
    begin.counters.get('http_requests_total'),
    end.counters.get('http_requests_total'),
    (labels) => /^5\d\d$/.test(String(labels.status || ''))
  );

  const latency = histogramP95FromDelta(begin, end, 'http_request_duration_seconds');
  const queueWait = histogramP95FromDelta(begin, end, 'job_queue_wait_duration_seconds');

  return {
    requestTotal,
    request5xx,
    errorRate: requestTotal > 0 ? request5xx / requestTotal : 0,
    latencyP95: latency.p95,
    queueWaitP95: queueWait.p95,
    dependencyUpRatio: dependencyUpRatio(end),
  };
};

const sampleMetricsWindow = async (metricsUrl: string, bearerToken: string | undefined, sampleSeconds: number): Promise<WindowMetrics> => {
  const headers: Record<string, string> = {};
  if (bearerToken && bearerToken.trim().length > 0) {
    headers.Authorization = `Bearer ${bearerToken.trim()}`;
  }

  const first = await axios.get<string>(metricsUrl, { headers, timeout: 10000, responseType: 'text' });
  await sleep(sampleSeconds * 1000);
  const second = await axios.get<string>(metricsUrl, { headers, timeout: 10000, responseType: 'text' });

  const firstSnapshot = parsePrometheus(first.data);
  const secondSnapshot = parsePrometheus(second.data);
  return collectWindowMetrics(firstSnapshot, secondSnapshot);
};

const pctDiff = (candidate: number, baseline: number): number => {
  if (baseline <= 0) return candidate > 0 ? 1 : 0;
  return (candidate - baseline) / baseline;
};

const evaluateGuard = (candidate: WindowMetrics, baseline: WindowMetrics | undefined): GuardResult => {
  const maxErrorRate = Number.parseFloat(process.env.RELEASE_MAX_ERROR_RATE || '0.02');
  const maxLatencyP95 = Number.parseFloat(process.env.RELEASE_MAX_API_P95_SECONDS || '1.0');
  const maxQueueWaitP95 = Number.parseFloat(process.env.RELEASE_MAX_QUEUE_WAIT_P95_SECONDS || '120');
  const minDependencyUp = Number.parseFloat(process.env.RELEASE_MIN_DEPENDENCY_UP_RATIO || '1.0');

  const maxErrorRateDegrade = Number.parseFloat(process.env.RELEASE_MAX_ERROR_RATE_DEGRADATION_RATIO || '0.5');
  const maxLatencyDegrade = Number.parseFloat(process.env.RELEASE_MAX_LATENCY_DEGRADATION_RATIO || '0.3');
  const maxQueueWaitDegrade = Number.parseFloat(process.env.RELEASE_MAX_QUEUE_WAIT_DEGRADATION_RATIO || '0.5');

  const reasons: string[] = [];

  if (candidate.errorRate > maxErrorRate) {
    reasons.push(`error_rate ${candidate.errorRate.toFixed(4)} > ${maxErrorRate.toFixed(4)}`);
  }
  if (candidate.latencyP95 > maxLatencyP95) {
    reasons.push(`api_p95 ${candidate.latencyP95.toFixed(3)}s > ${maxLatencyP95.toFixed(3)}s`);
  }
  if (candidate.queueWaitP95 > maxQueueWaitP95) {
    reasons.push(`queue_wait_p95 ${candidate.queueWaitP95.toFixed(2)}s > ${maxQueueWaitP95.toFixed(2)}s`);
  }
  if (candidate.dependencyUpRatio < minDependencyUp) {
    reasons.push(`dependency_up_ratio ${candidate.dependencyUpRatio.toFixed(3)} < ${minDependencyUp.toFixed(3)}`);
  }

  if (baseline) {
    if (pctDiff(candidate.errorRate, baseline.errorRate) > maxErrorRateDegrade) {
      reasons.push(
        `error_rate_degradation ${pctDiff(candidate.errorRate, baseline.errorRate).toFixed(3)} > ${maxErrorRateDegrade.toFixed(3)}`
      );
    }
    if (pctDiff(candidate.latencyP95, baseline.latencyP95) > maxLatencyDegrade) {
      reasons.push(
        `latency_p95_degradation ${pctDiff(candidate.latencyP95, baseline.latencyP95).toFixed(3)} > ${maxLatencyDegrade.toFixed(3)}`
      );
    }
    if (pctDiff(candidate.queueWaitP95, baseline.queueWaitP95) > maxQueueWaitDegrade) {
      reasons.push(
        `queue_wait_p95_degradation ${pctDiff(candidate.queueWaitP95, baseline.queueWaitP95).toFixed(3)} > ${maxQueueWaitDegrade.toFixed(3)}`
      );
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    candidate,
    baseline,
  };
};

const triggerRollback = async (result: GuardResult) => {
  const webhook = process.env.RELEASE_ROLLBACK_WEBHOOK_URL;
  if (!webhook || webhook.trim().length === 0) {
    console.error('Auto rollback requested but RELEASE_ROLLBACK_WEBHOOK_URL is missing.');
    return false;
  }

  const token = process.env.RELEASE_ROLLBACK_WEBHOOK_TOKEN;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  await axios.post(
    webhook,
    {
      event: 'release_auto_rollback',
      happenedAt: new Date().toISOString(),
      reasons: result.reasons,
      candidate: result.candidate,
      baseline: result.baseline || null,
    },
    { headers, timeout: 10000 }
  );

  return true;
};

const main = async () => {
  const candidateUrl = process.env.RELEASE_CANDIDATE_METRICS_URL;
  if (!candidateUrl || candidateUrl.trim().length === 0) {
    throw new Error('RELEASE_CANDIDATE_METRICS_URL is required');
  }

  const baselineUrl = process.env.RELEASE_BASELINE_METRICS_URL;
  const token = process.env.RELEASE_METRICS_TOKEN;
  const sampleSeconds = Math.max(15, Number.parseInt(process.env.RELEASE_SAMPLE_SECONDS || '60', 10));
  const autoRollback = parseBoolean(process.env.RELEASE_AUTO_ROLLBACK, false);

  console.log(`[release-guard] sampling candidate metrics for ${sampleSeconds}s from ${candidateUrl}`);
  const candidate = await sampleMetricsWindow(candidateUrl, token, sampleSeconds);

  let baseline: WindowMetrics | undefined;
  if (baselineUrl && baselineUrl.trim().length > 0) {
    console.log(`[release-guard] sampling baseline metrics for ${sampleSeconds}s from ${baselineUrl}`);
    baseline = await sampleMetricsWindow(baselineUrl, token, sampleSeconds);
  }

  const result = evaluateGuard(candidate, baseline);

  console.log('[release-guard] evaluation summary');
  console.log(JSON.stringify(result, null, 2));

  if (result.passed) {
    console.log('[release-guard] release SLO gate passed.');
    return;
  }

  console.error('[release-guard] release SLO gate failed:', result.reasons.join('; '));

  if (autoRollback) {
    try {
      const triggered = await triggerRollback(result);
      if (triggered) {
        console.error('[release-guard] auto rollback trigger sent.');
      }
    } catch (error) {
      console.error('[release-guard] auto rollback trigger failed:', error);
    }
  }

  process.exitCode = 1;
};

main().catch((error) => {
  console.error('[release-guard] fatal error:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
