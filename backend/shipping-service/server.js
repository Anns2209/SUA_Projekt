// -----------------------------------------------------------------------
// SHIPPING SERVICE
// Tehnologije: Node.js + Express + MySQL (mysql2)
// Povezave z drugimi storitvami:
//   - Login/Register Service -> preverjanje tokena, dostop samo za administratorje/zaposlene
//   - Order Service          -> pridobi podrobnosti plačanega naročila (/orders/:id)
//                                in sporoči nazaj, ko je dostava zaključena (PUT /order/:id/status)
//
// Endpointi (2x GET, 2x POST, 2x PUT, 2x DELETE):
//   GET    /shipping                - seznam vseh pošiljk
//   GET    /shipping/:id            - podrobnosti pošiljke
//   POST   /shipping                - ustvari zapis o dostavi za plačano naročilo
//   POST   /shipping/:id/assign     - dodeli pošiljko zaposlenemu
//   PUT    /shipping/:id            - posodobi podrobnosti dostave (opomba, lokacija)
//   PUT    /shipping/:id/status     - spremeni status (v_dostavi, dostavljeno)
//   DELETE /shipping/:id            - izbriši posamezen zapis
//   DELETE /shipping/archive        - množično brisanje dostavljenih pošiljk (avtomatizirano čiščenje)
// -----------------------------------------------------------------------

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');

const app = express();
app.use((req, res, next) => {
  const allowedOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

const PORT = process.env.PORT || 5000;
const LOGIN_SERVICE_URL = process.env.LOGIN_SERVICE_URL || 'http://login-register-service:5000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:5000';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shipping_db',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

let pool;

async function initDb(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      pool = mysql.createPool(dbConfig);
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS shipping (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL UNIQUE,
          user_id INT NOT NULL,
          lokacija_dostave VARCHAR(255) NOT NULL,
          dodeljen_zaposlenemu VARCHAR(80),
          opomba VARCHAR(255),
          status VARCHAR(20) NOT NULL DEFAULT 'cakajoca',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);
      conn.release();
      console.log('[shipping-service] Baza pripravljena.');
      return;
    } catch (err) {
      console.log(`[shipping-service] Baza še ni pripravljena (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Povezava z bazo ni uspela.');
}

// ---- Login/Register Service ----
async function verifyToken(authHeader) {
  if (!authHeader) return null;
  try {
    const res = await axios.get(`${LOGIN_SERVICE_URL}/token/verify`, {
      headers: { Authorization: authHeader },
      timeout: 5000,
    });
    return res.data.valid ? res.data : null;
  } catch (err) {
    return null;
  }
}

// ---- Order Service ----
async function getOrder(orderId, authHeader) {
  try {
    const res = await axios.get(`${ORDER_SERVICE_URL}/orders/${orderId}`, {
      headers: { Authorization: authHeader },
      timeout: 5000,
    });
    return res.data;
  } catch (err) {
    return null;
  }
}

async function markOrderDelivered(orderId, authHeader) {
  try {
    await axios.put(
      `${ORDER_SERVICE_URL}/order/${orderId}/status`,
      { status: 'delivered' },
      { headers: { Authorization: authHeader }, timeout: 5000 }
    );
    return true;
  } catch (err) {
    return false;
  }
}

function requireStaff() {
  return async (req, res, next) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Neveljaven ali manjkajoč token' });
    if (user.vloga !== 'administrator') {
      return res.status(403).json({ error: 'Dostop imajo samo zaposleni/administratorji' });
    }
    req.user = user;
    next();
  };
}

// ================= GET =================

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'shipping-service' }));

app.get('/shipping', requireStaff(), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shipping ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju pošiljk' });
  }
});

app.get('/shipping/:id', requireStaff(), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM shipping WHERE id=?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pošiljka ne obstaja' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju pošiljke' });
  }
});

// ================= POST =================

// POST /shipping - ustvari zapis o dostavi za plačano naročilo
// body: { order_id }
app.post('/shipping', requireStaff(), async (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'order_id je obvezen' });

  const order = await getOrder(order_id, req.headers.authorization);
  if (!order || order.error) {
    return res.status(404).json({ error: 'Naročilo ne obstaja v Order Service' });
  }
  if (order.status !== 'paid') {
    return res.status(400).json({ error: `Naročilo ni plačano (status: ${order.status})` });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO shipping (order_id, user_id, lokacija_dostave, status) VALUES (?, ?, ?, ?)',
      [order.id, order.user_id, order.lokacija_dostave, 'cakajoca']
    );
    res.status(201).json({ id: result.insertId, message: 'Zapis o dostavi ustvarjen' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Zapis o dostavi za to naročilo že obstaja' });
    }
    res.status(500).json({ error: 'Napaka pri ustvarjanju zapisa o dostavi' });
  }
});

// POST /shipping/:id/assign - dodeli pošiljko zaposlenemu
app.post('/shipping/:id/assign', requireStaff(), async (req, res) => {
  const { zaposleni } = req.body;
  if (!zaposleni) return res.status(400).json({ error: 'zaposleni je obvezen' });

  try {
    const [result] = await pool.query(
      'UPDATE shipping SET dodeljen_zaposlenemu=? WHERE id=?',
      [zaposleni, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pošiljka ne obstaja' });
    res.json({ message: `Pošiljka dodeljena osebi ${zaposleni}` });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri dodeljevanju pošiljke' });
  }
});

// ================= PUT =================

app.put('/shipping/:id', requireStaff(), async (req, res) => {
  const fields = [];
  const values = [];
  for (const col of ['lokacija_dostave', 'opomba']) {
    if (req.body[col] !== undefined) {
      fields.push(`${col}=?`);
      values.push(req.body[col]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Ni podanih polj za posodobitev' });

  values.push(req.params.id);
  try {
    const [result] = await pool.query(`UPDATE shipping SET ${fields.join(', ')} WHERE id=?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pošiljka ne obstaja' });
    res.json({ message: 'Pošiljka posodobljena' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri posodabljanju pošiljke' });
  }
});

// PUT /shipping/:id/status - sprememba statusa; ob "dostavljeno" obvesti Order Service
app.put('/shipping/:id/status', requireStaff(), async (req, res) => {
  const { status } = req.body;
  const dovoljeni = ['cakajoca', 'v_dostavi', 'dostavljeno'];
  if (!dovoljeni.includes(status)) {
    return res.status(400).json({ error: `status mora biti eden od: ${dovoljeni.join(', ')}` });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM shipping WHERE id=?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Pošiljka ne obstaja' });

    await pool.query('UPDATE shipping SET status=? WHERE id=?', [status, req.params.id]);

    let orderSync = true;
    if (status === 'dostavljeno') {
      orderSync = await markOrderDelivered(rows[0].order_id, req.headers.authorization);
    }

    res.json({
      message: 'Status posodobljen',
      status,
      order_service_synced: orderSync,
    });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri posodabljanju statusa' });
  }
});

// ================= DELETE =================

app.delete('/shipping/:id', requireStaff(), async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM shipping WHERE id=?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pošiljka ne obstaja' });
    res.json({ message: 'Pošiljka izbrisana' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri brisanju pošiljke' });
  }
});

// DELETE /shipping/archive - množično brisanje že dostavljenih pošiljk
// (simulira avtomatiziran periodičen proces čiščenja, omenjen v specifikaciji)
app.delete('/shipping/archive', requireStaff(), async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM shipping WHERE status='dostavljeno'");
    res.json({ message: `Arhivirano/izbrisano ${result.affectedRows} dostavljenih pošiljk` });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri arhiviranju pošiljk' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[shipping-service] Teče na portu ${PORT}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
