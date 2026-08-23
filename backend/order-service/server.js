// -----------------------------------------------------------------------
// ORDER SERVICE (vključno s plačilom)
// Tehnologije: Node.js + Express + MySQL (mysql2)
// Povezave z drugimi storitvami:
//   - Login/Register Service -> preverjanje tokena (/token/verify)
//   - Static Menu Service    -> pridobi uradno ceno/naziv jedi (/menu/:id),
//                                da cene ni mogoče ponarediti s strani klienta
//
// Endpointi (2x GET, 2x POST, 2x PUT, 2x DELETE):
//   GET    /orders                  - seznam naročil (lastnih ali vseh za admina)
//   GET    /orders/:id              - podrobnosti naročila + postavke
//   POST   /order                   - ustvari novo naročilo
//   POST   /order/:id/pay           - "plačilo" naročila (mock)
//   PUT    /order/:id               - posodobi lokacijo dostave (dokler ni plačano)
//   PUT    /order/:id/status        - ročna sprememba statusa (administrator)
//   DELETE /order/:id               - prekliči/izbriši naročilo (dokler ni plačano)
//   DELETE /order/:id/item/:itemId  - odstrani postavko iz naročila
// -----------------------------------------------------------------------

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const { correlationMiddleware, requestLoggerMiddleware } = require('./requestLogger');
const statsMiddleware = require('./statsMiddleware');

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
app.use(correlationMiddleware);
app.use(requestLoggerMiddleware);
app.use(statsMiddleware);

const PORT = process.env.PORT || 5000;
const LOGIN_SERVICE_URL = process.env.LOGIN_SERVICE_URL || 'http://login-register-service:5000';
const MENU_SERVICE_URL = process.env.MENU_SERVICE_URL || 'http://static-menu-service:5000';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'order_db',
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
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          username VARCHAR(80),
          lokacija_dostave VARCHAR(255) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          skupni_znesek DECIMAL(8,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          dish_id INT NOT NULL,
          naziv VARCHAR(150) NOT NULL,
          kolicina INT NOT NULL,
          cena_na_enoto DECIMAL(6,2) NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);
      conn.release();
      console.log('[order-service] Baza pripravljena.');
      return;
    } catch (err) {
      console.log(`[order-service] Baza še ni pripravljena (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Povezava z bazo ni uspela.');
}

// ---- Login/Register Service: preveri token ----
async function verifyToken(authHeader, correlationId) {
  if (!authHeader) return null;
  try {
    const res = await axios.get(`${LOGIN_SERVICE_URL}/token/verify`, {
      headers: {
        Authorization: authHeader,
        'X-Correlation-Id': correlationId,
      },
      timeout: 5000,
    });
    return res.data.valid ? res.data : null;
  } catch (err) {
    return null;
  }
}

async function getDish(dishId, correlationId) {
  try {
    const res = await axios.get(`${MENU_SERVICE_URL}/menu/${dishId}`, {
      headers: { 'X-Correlation-Id': correlationId },
      timeout: 5000,
    });
    return res.data;
  } catch (err) {
    return null;
  }
}

function requireAuth() {
  return async (req, res, next) => {
    const user = await verifyToken(req.headers.authorization, req.correlationId);
    if (!user) return res.status(401).json({ error: 'Neveljaven ali manjkajoč token' });
    req.user = user;
    next();
  };
}

async function loadOrderWithItems(orderId) {
  const [orderRows] = await pool.query('SELECT * FROM orders WHERE id=?', [orderId]);
  if (orderRows.length === 0) return null;
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
  return { ...orderRows[0], items };
}

function canAccessOrder(order, user) {
  return order.user_id === user.user_id || user.vloga === 'administrator';
}

// ================= GET =================

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'order-service' }));

app.get('/orders', requireAuth(), async (req, res) => {
  try {
    let rows;
    if (req.user.vloga === 'administrator') {
      [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    } else {
      [rows] = await pool.query(
        'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',
        [req.user.user_id]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju naročil' });
  }
});

app.get('/orders/:id', requireAuth(), async (req, res) => {
  try {
    const order = await loadOrderWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Naročilo ne obstaja' });
    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ error: 'Nimate dostopa do tega naročila' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju naročila' });
  }
});

// ================= POST =================

// POST /order - ustvari novo naročilo
// body: { lokacija_dostave, items: [{ dish_id, kolicina }, ...] }
app.post('/order', requireAuth(), async (req, res) => {
  const { lokacija_dostave, items } = req.body;
  if (!lokacija_dostave || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'lokacija_dostave in vsaj ena postavka (items) sta obvezna' });
  }

  // Preveri vsako jed pri Static Menu Service (uradna cena/naziv)
  const resolvedItems = [];
  for (const it of items) {
    if (!it.dish_id || !it.kolicina || it.kolicina < 1) {
      return res.status(400).json({ error: 'Vsaka postavka potrebuje dish_id in kolicina >= 1' });
    }
    const dish = await getDish(it.dish_id, req.correlationId);
    if (!dish || dish.error) {
      return res.status(400).json({ error: `Jed z id=${it.dish_id} ne obstaja na meniju` });
    }
    resolvedItems.push({
      dish_id: dish.id,
      naziv: dish.naziv,
      kolicina: it.kolicina,
      cena_na_enoto: dish.cena,
    });
  }

  const skupniZnesek = resolvedItems.reduce((sum, i) => sum + i.kolicina * Number(i.cena_na_enoto), 0);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orderResult] = await conn.query(
      'INSERT INTO orders (user_id, username, lokacija_dostave, status, skupni_znesek) VALUES (?, ?, ?, ?, ?)',
      [req.user.user_id, req.user.username, lokacija_dostave, 'pending', skupniZnesek]
    );
    const orderId = orderResult.insertId;

    for (const it of resolvedItems) {
      await conn.query(
        'INSERT INTO order_items (order_id, dish_id, naziv, kolicina, cena_na_enoto) VALUES (?, ?, ?, ?, ?)',
        [orderId, it.dish_id, it.naziv, it.kolicina, it.cena_na_enoto]
      );
    }
    await conn.commit();
    res.status(201).json({ id: orderId, skupni_znesek: skupniZnesek, message: 'Naročilo ustvarjeno' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Napaka pri ustvarjanju naročila' });
  } finally {
    conn.release();
  }
});

// POST /order/:id/pay - mock plačilo
app.post('/order/:id/pay', requireAuth(), async (req, res) => {
  try {
    const order = await loadOrderWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Naročilo ne obstaja' });
    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ error: 'Nimate dostopa do tega naročila' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: `Naročilo je že v statusu "${order.status}"` });
    }

    // Tu bi šla prava integracija s plačilnim ponudnikom -> poenostavljeno na "mock"
    await pool.query('UPDATE orders SET status=? WHERE id=?', ['paid', req.params.id]);
    res.json({ message: 'Plačilo uspešno (simulacija)', status: 'paid' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri plačilu' });
  }
});

// ================= PUT =================

app.put('/order/:id', requireAuth(), async (req, res) => {
  try {
    const order = await loadOrderWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Naročilo ne obstaja' });
    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ error: 'Nimate dostopa do tega naročila' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Naročila po plačilu ni več mogoče urejati' });
    }
    const { lokacija_dostave } = req.body;
    if (!lokacija_dostave) {
      return res.status(400).json({ error: 'lokacija_dostave je obvezna' });
    }
    await pool.query('UPDATE orders SET lokacija_dostave=? WHERE id=?', [lokacija_dostave, req.params.id]);
    res.json({ message: 'Naročilo posodobljeno' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri posodabljanju naročila' });
  }
});

// PUT /order/:id/status - ročna sprememba statusa (npr. delivered), samo administrator
app.put('/order/:id/status', requireAuth(), async (req, res) => {
  if (req.user.vloga !== 'administrator') {
    return res.status(403).json({ error: 'Samo administrator lahko ročno spreminja status' });
  }
  const { status } = req.body;
  const dovoljeni = ['pending', 'paid', 'delivered', 'preklicano'];
  if (!dovoljeni.includes(status)) {
    return res.status(400).json({ error: `status mora biti eden od: ${dovoljeni.join(', ')}` });
  }
  try {
    const [result] = await pool.query('UPDATE orders SET status=? WHERE id=?', [status, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Naročilo ne obstaja' });
    res.json({ message: 'Status posodobljen', status });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri posodabljanju statusa' });
  }
});

// ================= DELETE =================

app.delete('/order/:id', requireAuth(), async (req, res) => {
  try {
    const order = await loadOrderWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Naročilo ne obstaja' });
    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ error: 'Nimate dostopa do tega naročila' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Plačanega naročila ni več mogoče izbrisati' });
    }
    await pool.query('DELETE FROM orders WHERE id=?', [req.params.id]);
    res.json({ message: 'Naročilo izbrisano' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri brisanju naročila' });
  }
});

app.delete('/order/:id/item/:itemId', requireAuth(), async (req, res) => {
  try {
    const order = await loadOrderWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Naročilo ne obstaja' });
    if (!canAccessOrder(order, req.user)) {
      return res.status(403).json({ error: 'Nimate dostopa do tega naročila' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Postavk po plačilu ni več mogoče spreminjati' });
    }
    const item = order.items.find((i) => i.id == req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Postavka ne obstaja' });

    await pool.query('DELETE FROM order_items WHERE id=?', [req.params.itemId]);

    const preostaliZnesek = order.items
      .filter((i) => i.id != req.params.itemId)
      .reduce((sum, i) => sum + i.kolicina * Number(i.cena_na_enoto), 0);
    await pool.query('UPDATE orders SET skupni_znesek=? WHERE id=?', [preostaliZnesek, req.params.id]);

    res.json({ message: 'Postavka odstranjena', skupni_znesek: preostaliZnesek });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri brisanju postavke' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[order-service] Teče na portu ${PORT}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
