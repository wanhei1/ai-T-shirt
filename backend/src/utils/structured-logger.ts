type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const normalizeError = (value: unknown) => {
  if (!(value instanceof Error)) {
    return value;
  }

  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
};

const write = (level: LogLevel, message: string, fields?: LogFields) => {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(fields || {}),
  };

  if (payload.error) {
    payload.error = normalizeError(payload.error);
  }

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
};

export const logInfo = (message: string, fields?: LogFields) => write("info", message, fields);
export const logWarn = (message: string, fields?: LogFields) => write("warn", message, fields);
export const logError = (message: string, fields?: LogFields) => write("error", message, fields);
