// -----------------------------------------------------------------------
// STATISTICS SERVICE
// Tehnologije: Node.js + Express + MongoDB Atlas (mongoose) + Swagger
//
// Spremlja klice na Order Service. Order Service ob vsakem zahtevku
// pošlje POST /stats/update s podatkom, kateri endpoint je bil klican.
//
// Endpointi:
//   GET  /stats/last-called   - zadnje klican endpoint
//   GET  /stats/most-called   - najpogosteje klican endpoint
//   GET  /stats/counts        - število klicev za vsak endpoint
//   POST /stats/update        - zabeleži nov klic { klicanaStoritev: "/order" }
//   GET  /api-docs            - Swagger UI dokumentacija
// -----------------------------------------------------------------------

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const EndpointStat = require('./models/EndpointStat');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/statistics_db';

async function initDb(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('[statistics-service] Povezan na MongoDB Atlas.');
      return;
    } catch (err) {
      console.log(`[statistics-service] MongoDB še ni pripravljen (${attempt}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Povezava z MongoDB ni uspela.');
}

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Storitev deluje
 */
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'statistics-service' }));

/**
 * @openapi
 * /stats/last-called:
 *   get:
 *     summary: Vrne zadnje klican endpoint
 *     responses:
 *       200:
 *         description: Podatki o zadnjem klicu
 */
app.get('/stats/last-called', async (req, res) => {
  try {
    const last = await EndpointStat.findOne().sort({ lastCalledAt: -1 });
    if (!last) return res.status(404).json({ error: 'Še ni zabeleženih klicev' });
    res.json({ endpoint: last.endpoint, lastCalledAt: last.lastCalledAt, count: last.count });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju statistike' });
  }
});

/**
 * @openapi
 * /stats/most-called:
 *   get:
 *     summary: Vrne najpogosteje klican endpoint
 *     responses:
 *       200:
 *         description: Podatki o najpogosteje klicanem endpointu
 */
app.get('/stats/most-called', async (req, res) => {
  try {
    const top = await EndpointStat.findOne().sort({ count: -1 });
    if (!top) return res.status(404).json({ error: 'Še ni zabeleženih klicev' });
    res.json({ endpoint: top.endpoint, count: top.count, lastCalledAt: top.lastCalledAt });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju statistike' });
  }
});

/**
 * @openapi
 * /stats/counts:
 *   get:
 *     summary: Vrne število klicev za vsak endpoint
 *     responses:
 *       200:
 *         description: Seznam endpointov s števili klicev
 */
app.get('/stats/counts', async (req, res) => {
  try {
    const all = await EndpointStat.find().sort({ count: -1 });
    res.json(
      all.map((e) => ({ endpoint: e.endpoint, count: e.count, lastCalledAt: e.lastCalledAt }))
    );
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri branju statistike' });
  }
});

/**
 * @openapi
 * /stats/update:
 *   post:
 *     summary: Zabeleži nov klic endpointa (kliče ga sledena mikrostoritev)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               klicanaStoritev:
 *                 type: string
 *                 example: /registrirajUporabnika
 *     responses:
 *       200:
 *         description: Statistika posodobljena
 */
app.post('/stats/update', async (req, res) => {
  const { klicanaStoritev } = req.body;
  if (!klicanaStoritev) {
    return res.status(400).json({ error: 'klicanaStoritev je obvezno polje' });
  }

  try {
    const updated = await EndpointStat.findOneAndUpdate(
      { endpoint: klicanaStoritev },
      { $inc: { count: 1 }, $set: { lastCalledAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ message: 'Statistika posodobljena', endpoint: updated.endpoint, count: updated.count });
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri posodabljanju statistike' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[statistics-service] Teče na portu ${PORT}`));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });