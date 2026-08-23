// -----------------------------------------------------------------------
// LOGGING SERVICE
// Tehnologije: Node.js + Express + MySQL (mysql2) + RabbitMQ (amqplib)
//
// Prebere loge iz skupne RabbitMQ vrste ("logging_queue"), ki jih vanjo
// objavljajo vse ostale mikrostoritve, in jih shrani v lastno bazo.
//
// Endpointi:
//   POST   /logs                    - poveže se na RabbitMQ in prenese VSE
//                                      čakajoče loge iz vrste v bazo
//   GET    /logs/:datumOd/:datumDo  - izpiše loge med dvema datumoma
//   DELETE /logs                    - izbriše vse shranjene loge
// -----------------------------------------------------------------------

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://gostilna:gostilnapass@rabbitmq:5672';
const EXCHANGE_NAME = process.env.EXCHANGE_NAME || 'logs_exchange';
const QUEUE_NAME = process.env.QUEUE_NAME || 'logging_queue';
const ROUTING_PATTERN = process.env.ROUTING_PATTERN || 'log.#';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'logs_db',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

let pool;
let amqpConnection;
let amqpChannel;

async function initDb(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      pool = mysql.createPool(dbConfig);
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          log_timestamp DATETIME(3) NOT NULL,
          log_type VARCHAR(10) NOT NULL,
          url VARCHAR(500),
          correlation_id VARCHAR(100),
          app_name VARCHAR(100),
          message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);
      conn.release();
      console.log('[logging-service] Baza pripravljena.');
      return;
    } catch (err) {
      console.log(`[logging-service] Baza še ni pripravljena (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Povezava z bazo ni uspela.');
}

async function initRabbit(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      amqpConnection = await amqp.connect(RABBITMQ_URL);
      amqpChannel = await amqpConnection.createChannel();
      await amqpChannel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
      await amqpChannel.assertQueue(QUEUE_NAME, { durable: true });
      await amqpChannel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_PATTERN);

      amqpConnection.on('close', () => {
        console.log('[logging-service] RabbitMQ povezava prekinjena, poskušam znova...');
        amqpChannel = null;
        setTimeout(() => initRabbit(), delay);
      });

      console.log('[logging-service] Povezan na RabbitMQ, exchange in queue pripravljena.');
      return;
    } catch (err) {
      console.log(`[logging-service] RabbitMQ še ni pripravljen (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Povezava z RabbitMQ ni uspela.');
}

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'logging-service', rabbitmq_connected: !!amqpChannel })
);

// ================= POST /logs =================
// "Izprazni" trenutno vsebino vrste (vsa čakajoča sporočila) in jih zapiše v bazo.
app.post('/logs', async (req, res) => {
  if (!amqpChannel) {
    return res.status(503).json({ error: 'Povezava z RabbitMQ trenutno ni na voljo' });
  }

  let count = 0;
  let failed = 0;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const msg = await amqpChannel.get(QUEUE_NAME, { noAck: false });
      if (!msg) break; // vrsta je prazna, končamo

      try {
        const entry = JSON.parse(msg.content.toString());
        await pool.query(
          `INSERT INTO logs (log_timestamp, log_type, url, correlation_id, app_name, message)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            new Date(entry.timestamp),
            entry.level,
            entry.url || null,
            entry.correlationId || null,
            entry.service || null,
            entry.message || null,
          ]
        );
        amqpChannel.ack(msg);
        count++;
      } catch (parseErr) {
        // neveljavno sporočilo -> zavrzi, da ne blokira vrste v neskončnost
        amqpChannel.nack(msg, false, false);
        failed++;
      }
    }
    res.json({ message: `Preneseno ${count} logov iz sporočilne vrste v bazo.`, zavrzenih: failed });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri prenosu logov iz RabbitMQ' });
  }
});

// ================= GET /logs/:datumOd/:datumDo =================
// Format datumov: YYYY-MM-DD ali YYYY-MM-DDTHH:mm:ss
app.get('/logs/:datumOd/:datumDo', async (req, res) => {
  const { datumOd, datumDo } = req.params;

  const od = new Date(datumOd);
  const do_ = new Date(datumDo);
  if (isNaN(od.getTime()) || isNaN(do_.getTime())) {
    return res.status(400).json({ error: 'Neveljaven format datuma. Uporabite YYYY-MM-DD.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM logs WHERE log_timestamp BETWEEN ? AND ? ORDER BY log_timestamp ASC`,
      [od, do_]
    );

    const formatted = rows.map((r) => ({
      id: r.id,
      timestamp: r.log_timestamp,
      level: r.log_type,
      url: r.url,
      correlationId: r.correlation_id,
      service: r.app_name,
      message: r.message,
      formatted_line: `${r.log_timestamp.toISOString().replace('T', ' ').slice(0, 23)} ${r.log_type} ${r.url} Correlation: ${r.correlation_id} [${r.app_name}] - ${r.message}`,
    }));

    res.json({ count: formatted.length, logs: formatted });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju logov' });
  }
});

// ================= DELETE /logs =================
app.delete('/logs', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM logs');
    res.json({ message: `Izbrisanih ${result.affectedRows} logov.` });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri brisanju logov' });
  }
});

Promise.all([initDb(), initRabbit()])
  .then(() => {
    app.listen(PORT, () => console.log(`[logging-service] Teče na portu ${PORT}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });