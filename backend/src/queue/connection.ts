import * as amqp from "amqplib";

export const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://127.0.0.1:5672";

let sharedConnection: amqp.ChannelModel | null = null;

export const getRabbitConnection = async (): Promise<amqp.ChannelModel> => {
  if (sharedConnection) {
    return sharedConnection;
  }

  let connection: amqp.ChannelModel;
  try {
    connection = await amqp.connect(rabbitmqUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ACCESS_REFUSED") || message.includes("403")) {
      throw new Error(
        `RabbitMQ auth failed for RABBITMQ_URL=${rabbitmqUrl}. Please verify username/password or create the user in broker.`
      );
    }
    throw error;
  }
  connection.on("close", () => {
    sharedConnection = null;
  });
  connection.on("error", () => {
    sharedConnection = null;
  });
  sharedConnection = connection;
  return connection;
};

export const closeRabbitConnection = async () => {
  if (!sharedConnection) return;
  const conn = sharedConnection;
  sharedConnection = null;
  await conn.close();
};
