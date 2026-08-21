// -----------------------------------------------------------------------
// STATIC MENU SERVICE
// Tehnologije: Node.js + Express + MySQL (mysql2)
// Povezava z drugo storitvijo: kliče Login/Register Service (/token/verify),
// da preveri, ali je uporabnik prijavljen in kakšno vlogo ima.
//
// Endpointi (2x GET, 2x POST, 2x PUT, 2x DELETE):
//   GET    /menu                       - seznam vseh jedi
//   GET    /menu/:id                   - podrobnosti jedi + komentarji
//   POST   /menu                       - dodaj jed (administrator)
//   POST   /menu/:id/comment           - dodaj komentar (prijavljen uporabnik)
//   PUT    /menu/:id                   - posodobi jed (administrator)
//   PUT    /menu/:id/comment/:cId      - uredi svoj komentar
//   DELETE /menu/:id                   - izbriši jed (administrator)
//   DELETE /menu/:id/comment/:cId      - izbriši svoj komentar
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

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'menu_db',
  waitForConnections: true,
  connectionLimit: 5,   // omejeno število povezav -> nadzorovana poraba virov
  queueLimit: 0,
};

let pool;

async function initDb(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      pool = mysql.createPool(dbConfig);
      const conn = await pool.getConnection();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS dishes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          naziv VARCHAR(150) NOT NULL,
          opis TEXT,
          cena DECIMAL(6,2) NOT NULL,
          kategorija VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
      `);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          dish_id INT NOT NULL,
          user_id INT NOT NULL,
          username VARCHAR(80),
          besedilo VARCHAR(500) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);
      conn.release();
      console.log('[static-menu-service] Baza pripravljena.');
      return;
    } catch (err) {
      console.log(`[static-menu-service] Baza še ni pripravljena (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Povezava z bazo ni uspela.');
}

// ---- pomožna funkcija: preveri token pri Login/Register storitvi ----
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

function requireAuth() {
  return async (req, res, next) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Neveljaven ali manjkajoč token' });
    req.user = user;
    next();
  };
}

// ================= GET =================

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'static-menu-service' }));

app.get('/menu', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM dishes ORDER BY kategorija, naziv');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju menija' });
  }
});

app.get('/menu/:id', async (req, res) => {
  try {
    const [dishRows] = await pool.query('SELECT * FROM dishes WHERE id=?', [req.params.id]);
    if (dishRows.length === 0) return res.status(404).json({ error: 'Jed ne obstaja' });

    const [comments] = await pool.query(
      'SELECT id, user_id, username, besedilo, created_at FROM comments WHERE dish_id=? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ ...dishRows[0], comments });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju jedi' });
  }
});

// ================= POST =================

app.post('/menu', requireAuth(), async (req, res) => {
  if (req.user.vloga !== 'administrator') {
    return res.status(403).json({ error: 'Samo administrator lahko dodaja jedi' });
  }
  const { naziv, opis, cena, kategorija } = req.body;
  if (!naziv || cena === undefined) {
    return res.status(400).json({ error: 'naziv in cena sta obvezna' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO dishes (naziv, opis, cena, kategorija) VALUES (?, ?, ?, ?)',
      [naziv, opis || null, cena, kategorija || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Jed dodana' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri dodajanju jedi' });
  }
});

app.post('/menu/:id/comment', requireAuth(), async (req, res) => {
  const { besedilo } = req.body;
  if (!besedilo || !besedilo.trim()) {
    return res.status(400).json({ error: 'besedilo komentarja je obvezno' });
  }
  try {
    const [dishRows] = await pool.query('SELECT id FROM dishes WHERE id=?', [req.params.id]);
    if (dishRows.length === 0) return res.status(404).json({ error: 'Jed ne obstaja' });

    const [result] = await pool.query(
      'INSERT INTO comments (dish_id, user_id, username, besedilo) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.user_id, req.user.username, besedilo.trim()]
    );
    res.status(201).json({ id: result.insertId, message: 'Komentar dodan' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri dodajanju komentarja' });
  }
});

// ================= PUT =================

app.put('/menu/:id', requireAuth(), async (req, res) => {
  if (req.user.vloga !== 'administrator') {
    return res.status(403).json({ error: 'Samo administrator lahko ureja jedi' });
  }
  const fields = [];
  const values = [];
  for (const col of ['naziv', 'opis', 'cena', 'kategorija']) {
    if (req.body[col] !== undefined) {
      fields.push(`${col}=?`);
      values.push(req.body[col]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Ni podanih polj za posodobitev' });

  values.push(req.params.id);
  try {
    const [result] = await pool.query(`UPDATE dishes SET ${fields.join(', ')} WHERE id=?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Jed ne obstaja' });
    res.json({ message: 'Jed posodobljena' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri posodabljanju jedi' });
  }
});

app.put('/menu/:id/comment/:commentId', requireAuth(), async (req, res) => {
  const { besedilo } = req.body;
  if (!besedilo || !besedilo.trim()) {
    return res.status(400).json({ error: 'besedilo komentarja je obvezno' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM comments WHERE id=? AND dish_id=?', [
      req.params.commentId,
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Komentar ne obstaja' });
    if (rows[0].user_id !== req.user.user_id && req.user.vloga !== 'administrator') {
      return res.status(403).json({ error: 'Lahko urejate le svoje komentarje' });
    }

    await pool.query('UPDATE comments SET besedilo=? WHERE id=?', [besedilo.trim(), req.params.commentId]);
    res.json({ message: 'Komentar posodobljen' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri urejanju komentarja' });
  }
});

// ================= DELETE =================

app.delete('/menu/:id', requireAuth(), async (req, res) => {
  if (req.user.vloga !== 'administrator') {
    return res.status(403).json({ error: 'Samo administrator lahko briše jedi' });
  }
  try {
    const [result] = await pool.query('DELETE FROM dishes WHERE id=?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Jed ne obstaja' });
    res.json({ message: 'Jed izbrisana' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri brisanju jedi' });
  }
});

app.delete('/menu/:id/comment/:commentId', requireAuth(), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM comments WHERE id=? AND dish_id=?', [
      req.params.commentId,
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Komentar ne obstaja' });
    if (rows[0].user_id !== req.user.user_id && req.user.vloga !== 'administrator') {
      return res.status(403).json({ error: 'Lahko brišete le svoje komentarje' });
    }

    await pool.query('DELETE FROM comments WHERE id=?', [req.params.commentId]);
    res.json({ message: 'Komentar izbrisan' });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri brisanju komentarja' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[static-menu-service] Teče na portu ${PORT}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
