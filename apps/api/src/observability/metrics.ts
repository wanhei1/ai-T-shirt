type LabelValue = string | number | boolean;
type Labels = Record<string, LabelValue>;

type CounterMetric = {
  type: "counter";
  help: string;
  values: Map<string, number>;
};

type HistogramMetric = {
  type: "histogram";
  help: string;
  buckets: number[];
  bucketValues: Map<string, number[]>;
  countValues: Map<string, number>;
  sumValues: Map<string, number>;
};

type GaugeMetric = {
  type: "gauge";
  help: string;
  values: Map<string, number>;
};

type Metric = CounterMetric | HistogramMetric | GaugeMetric;

const metrics = new Map<string, Metric>();

const defaultHistogramBucketsSeconds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

const normalizeLabelValue = (value: LabelValue) => String(value).replace(/\\/g, "\\\\").replace(/\"/g, '\\"');

const serializeLabels = (labels?: Labels): string => {
  if (!labels || Object.keys(labels).length === 0) {
    return "";
  }

  const sorted = Object.keys(labels)
    .sort()
    .map((key) => `${key}="${normalizeLabelValue(labels[key])}"`)
    .join(",");

  return `{${sorted}}`;
};

const metricKeyForLabels = (labels?: Labels): string => {
  if (!labels) return "";
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${normalizeLabelValue(labels[key])}`)
    .join("|");
};

export const registerCounter = (name: string, help: string) => {
  if (metrics.has(name)) return;
  metrics.set(name, { type: "counter", help, values: new Map() });
};

export const registerHistogram = (name: string, help: string, buckets = defaultHistogramBucketsSeconds) => {
  if (metrics.has(name)) return;
  metrics.set(name, {
    type: "histogram",
    help,
    buckets: [...buckets].sort((a, b) => a - b),
    bucketValues: new Map(),
    countValues: new Map(),
    sumValues: new Map(),
  });
};

export const registerGauge = (name: string, help: string) => {
  if (metrics.has(name)) return;
  metrics.set(name, { type: "gauge", help, values: new Map() });
};

export const incrementCounter = (name: string, labels?: Labels, value = 1) => {
  const metric = metrics.get(name);
  if (!metric || metric.type !== "counter") return;

  const key = metricKeyForLabels(labels);
  const current = metric.values.get(key) || 0;
  metric.values.set(key, current + value);
};

export const observeHistogram = (name: string, value: number, labels?: Labels) => {
  const metric = metrics.get(name);
  if (!metric || metric.type !== "histogram") return;

  const key = metricKeyForLabels(labels);
  const bucketCounts = metric.bucketValues.get(key) || new Array(metric.buckets.length).fill(0);

  for (let i = 0; i < metric.buckets.length; i += 1) {
    if (value <= metric.buckets[i]) {
      bucketCounts[i] += 1;
    }
  }

  metric.bucketValues.set(key, bucketCounts);
  metric.countValues.set(key, (metric.countValues.get(key) || 0) + 1);
  metric.sumValues.set(key, (metric.sumValues.get(key) || 0) + value);
};

export const setGauge = (name: string, value: number, labels?: Labels) => {
  const metric = metrics.get(name);
  if (!metric || metric.type !== "gauge") return;

  const key = metricKeyForLabels(labels);
  metric.values.set(key, value);
};

export const getMetricsAsPrometheus = () => {
  const lines: string[] = [];

  for (const [name, metric] of metrics.entries()) {
    lines.push(`# HELP ${name} ${metric.help}`);
    lines.push(`# TYPE ${name} ${metric.type}`);

    if (metric.type === "counter") {
      if (metric.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [key, value] of metric.values.entries()) {
          const labels = key
            ? key.split("|").reduce<Record<string, string>>((acc, pair) => {
                const [labelKey, ...rest] = pair.split("=");
                acc[labelKey] = rest.join("=");
                return acc;
              }, {})
            : undefined;
          lines.push(`${name}${serializeLabels(labels)} ${value}`);
        }
      }
    } else if (metric.type === "histogram") {
      const keys = new Set<string>([
        ...metric.bucketValues.keys(),
        ...metric.countValues.keys(),
        ...metric.sumValues.keys(),
      ]);

      if (keys.size === 0) {
        keys.add("");
      }

      for (const key of keys) {
        const labels = key
          ? key.split("|").reduce<Record<string, string>>((acc, pair) => {
              const [labelKey, ...rest] = pair.split("=");
              acc[labelKey] = rest.join("=");
              return acc;
            }, {})
          : {};

        const counts = metric.bucketValues.get(key) || new Array(metric.buckets.length).fill(0);
        for (let i = 0; i < metric.buckets.length; i += 1) {
          lines.push(`${name}_bucket${serializeLabels({ ...labels, le: metric.buckets[i] })} ${counts[i]}`);
        }

        const totalCount = metric.countValues.get(key) || 0;
        lines.push(`${name}_bucket${serializeLabels({ ...labels, le: "+Inf" })} ${totalCount}`);
        lines.push(`${name}_count${serializeLabels(labels)} ${totalCount}`);
        lines.push(`${name}_sum${serializeLabels(labels)} ${metric.sumValues.get(key) || 0}`);
      }
    } else {
      if (metric.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [key, value] of metric.values.entries()) {
          const labels = key
            ? key.split("|").reduce<Record<string, string>>((acc, pair) => {
                const [labelKey, ...rest] = pair.split("=");
                acc[labelKey] = rest.join("=");
                return acc;
              }, {})
            : undefined;
          lines.push(`${name}${serializeLabels(labels)} ${value}`);
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
};

registerCounter("http_requests_total", "Total HTTP requests");
registerHistogram("http_request_duration_seconds", "HTTP request duration in seconds");
registerCounter("jobs_enqueued_total", "Total number of enqueued jobs");
registerCounter("jobs_completed_total", "Total number of completed jobs");
registerCounter("jobs_failed_total", "Total number of failed jobs");
registerHistogram("job_processing_duration_seconds", "Job processing duration in seconds", [0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300]);
registerCounter("rate_limited_total", "Total number of requests rejected by rate limiter");
registerCounter("queue_overloaded_total", "Total number of requests rejected because queue is overloaded");
registerGauge("queue_depth", "Current queue depth by queue and state");
registerCounter("comfyui_requests_total", "Total ComfyUI requests");
registerHistogram("comfyui_request_duration_seconds", "ComfyUI request duration in seconds", [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120]);
registerCounter("cache_hits_total", "Total cache hits");
registerCounter("cache_misses_total", "Total cache misses");
registerCounter("cache_requests_total", "Total cache requests by route and result(hit/miss/store/invalidate/error)");
registerCounter("cache_backsource_total", "Total cache backsource reads from database by route");
registerCounter("api_errors_total", "Total API errors by code and status");
registerGauge("dependency_up", "Dependency availability status (1=up, 0=down)");
registerHistogram("dependency_check_duration_seconds", "Dependency check duration in seconds", [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]);
registerHistogram("job_queue_wait_duration_seconds", "Queue waiting duration before a worker starts processing a job", [0.1, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300]);
registerCounter("billing_reconciliation_runs_total", "Total billing reconciliation runs by status");
registerGauge("billing_reconciliation_mismatch_count", "Billing reconciliation mismatch count by mismatch kind");
registerGauge("billing_reconciliation_total_mismatches", "Total billing reconciliation mismatches in current lookback window");
registerGauge("billing_reconciliation_last_run_status", "Billing reconciliation last run status (1=success, 0=failed)");
registerGauge("billing_reconciliation_last_run_timestamp_seconds", "Unix timestamp of the last billing reconciliation run");
