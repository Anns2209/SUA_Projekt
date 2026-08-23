const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://gostilna:gostilnapass@rabbitmq:5672';
const EXCHANGE_NAME = process.env.EXCHANGE_NAME || 'logs_exchange';
const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

let channel = null;
let connecting = null;

async function getChannel() {
  if (channel) return channel;
  if (connecting) return connecting;

  connecting = (async () => {
    const conn = await amqp.connect(RABBITMQ_URL);
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    conn.on('close', () => {
      channel = null;
      connecting = null;
    });
    conn.on('error', () => {
      channel = null;
      connecting = null;
    });
    channel = ch;
    return ch;
  })();

  try {
    return await connecting;
  } catch (err) {
    connecting = null;
    throw err;
  }
}

async function publishLog(level, url, correlationId, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    url,
    correlationId,
    service: SERVICE_NAME,
    message,
  };
  const routingKey = `log.${SERVICE_NAME}`;
  try {
    const ch = await getChannel();
    ch.publish(EXCHANGE_NAME, routingKey, Buffer.from(JSON.stringify(entry)), {
      persistent: true,
      contentType: 'application/json',
    });
  } catch (err) {
    console.log(`[${SERVICE_NAME}] Napaka pri pošiljanju loga v RabbitMQ: ${err.message}`);
  }
}

module.exports = { publishLog };