import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8185";
const PASSWORD = __ENV.PERF_TEST_PASSWORD || "PerfTest-123456";
const MAX_POLL_SECONDS = Number(__ENV.JOB_MAX_POLL_SECONDS || 180);

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgN8j3ZkAAAAASUVORK5CYII=";

const jobTimeToTerminalMs = new Trend("job_time_to_terminal_ms", true);

export const options = {
  scenarios: {
    ai_async_queue: {
      executor: "ramping-vus",
      startVUs: Number(__ENV.START_VUS || 2),
      stages: [
        { duration: __ENV.STAGE_1 || "1m", target: Number(__ENV.STAGE_1_VUS || 10) },
        { duration: __ENV.STAGE_2 || "2m", target: Number(__ENV.STAGE_2_VUS || 25) },
        { duration: __ENV.STAGE_3 || "1m", target: Number(__ENV.STAGE_3_VUS || 0) },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1200"],
    job_time_to_terminal_ms: ["p(95)<120000"],
  },
};

function makeUser() {
  const suffix = `${Date.now()}-${__VU}`;
  return {
    username: `perf_ai_${suffix}`,
    email: `perf_ai_${suffix}@example.com`,
    password: PASSWORD,
  };
}

export function setup() {
  const user = makeUser();

  http.post(`${BASE_URL}/api/register`, JSON.stringify(user), {
    headers: { "Content-Type": "application/json" },
  });

  const loginResp = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { "Content-Type": "application/json" } }
  );

  check(loginResp, {
    "setup login succeeds": (r) => r.status === 200,
  });

  return {
    token: loginResp.json("token"),
  };
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default function (data) {
  if (!data || !data.token) {
    sleep(1);
    return;
  }

  const enqueueStartedAt = Date.now();
  const createJobResp = http.post(
    `${BASE_URL}/api/jobs`,
    JSON.stringify({
      type: "virtual-tryon",
      payload: {
        personDataUrl: tinyPng,
        clothDataUrl: tinyPng,
        clothType: "upper",
      },
    }),
    {
      headers: authHeaders(data.token),
      tags: { endpoint: "create_job_tryon" },
    }
  );

  const enqueued = check(createJobResp, {
    "job enqueue accepted": (r) => r.status === 202,
  });

  if (!enqueued) {
    sleep(0.5);
    return;
  }

  const queue = createJobResp.json("queue");
  const jobId = createJobResp.json("jobId");
  const deadline = Date.now() + MAX_POLL_SECONDS * 1000;

  let finished = false;
  while (Date.now() < deadline) {
    const statusResp = http.get(`${BASE_URL}/api/jobs/${queue}/${jobId}`, {
      headers: authHeaders(data.token),
      tags: { endpoint: "job_status_poll" },
    });

    if (statusResp.status === 200) {
      const state = statusResp.json("job.state");
      if (state === "completed" || state === "failed") {
        finished = true;
        jobTimeToTerminalMs.add(Date.now() - enqueueStartedAt);
        break;
      }
    }

    sleep(1);
  }

  check(finished, {
    "job reaches terminal state within timeout": (ok) => ok,
  });

  sleep(0.2);
}
