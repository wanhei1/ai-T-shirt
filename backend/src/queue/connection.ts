import * as amqp from "amqplib";

const parseCandidates = (multiValue?: string, singleValue?: string, fallback: string[] = []) => {
  const multi = (multiValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const single = (singleValue || "").trim();
  const merged = [...multi, ...(single ? [single] : []), ...fallback];
  return Array.from(new Set(merged));
};

export const rabbitmqUrl =
  parseCandidates(process.env.RABBITMQ_URLS, process.env.RABBITMQ_URL, ["amqp://127.0.0.1:5672"])[0] ||
  "amqp://127.0.0.1:5672";

let sharedConnection: amqp.ChannelModel | null = null;

const buildConnectionCandidates = (): string[] => {
  const explicitList = parseCandidates(process.env.RABBITMQ_URLS, process.env.RABBITMQ_URL);
  if (explicitList.length > 0) return explicitList;

  // Local development fallback sequence:
  // 1) bare URL (for custom brokers that allow it), 2) guest credentials.
  return [
    "amqp://127.0.0.1:5672",
    "amqp://guest:guest@127.0.0.1:5672/",
  ];
};

export const getRabbitConnection = async (): Promise<amqp.ChannelModel> => {
  if (sharedConnection) {
    return sharedConnection;
  }

  const candidates = buildConnectionCandidates();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const connection = await amqp.connect(candidate);
      connection.on("close", () => {
        sharedConnection = null;
      });
      connection.on("error", () => {
        sharedConnection = null;
      });
      sharedConnection = connection;
      return connection;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isAuthError = message.includes("ACCESS_REFUSED") || message.includes("403");
      const isLastCandidate = candidate === candidates[candidates.length - 1];

      if (isAuthError && isLastCandidate) {
        throw new Error(
          `RabbitMQ auth failed for attempted URLs: ${candidates.join(", ")}. Please verify username/password or create the user in broker.`
        );
      }

      if (isLastCandidate) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to connect RabbitMQ");
};

export const closeRabbitConnection = async () => {
  if (!sharedConnection) return;
  const conn = sharedConnection;
  sharedConnection = null;
  await conn.close();
};
