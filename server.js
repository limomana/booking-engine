import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
app.use(cors());
app.use(express.json());

// --- Auth middleware (accepts Bearer, x-api-key, or ?api_key= for easy testing) ---
function requireAuth(req, res, next) {
  const want = process.env.API_KEY || '';
  if (!want) return next(); // allow if not set
  const hdr = req.headers.authorization || '';
  const viaBearer = hdr.startsWith('Bearer ') && hdr.slice(7) === want;
  const viaXKey   = req.headers['x-api-key'] === want;
  const viaQuery  = req.query.api_key === want;
  if (!(viaBearer || viaXKey || viaQuery)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// --- Postgres via PG* env vars (short keys so Render UI is happy) ---
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function dbPing() {
  try { await pool.query('select 1'); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

// --- Health ---
app.get('/health', async (_req, res) => {
  const ping = await dbPing();
  res.json({ ok: true, db: ping.ok, db_error: ping.ok ? null : ping.error, uptime: process.uptime() });
});

// --- Minimal schema endpoint (stub for now) ---
app.get('/api/form-schema', requireAuth, async (req, res) => {
  const tenant = String(req.query.tenant || 'all-limos');
  const bookingType = String(req.query.booking_type || 'general');
  res.json({
    ok: true,
    tenant,
    booking_type: bookingType,
    sections: [
      { id: "basics", fields: ["pickup", "dropoff", "date", "time", "pax", "luggage"] },
      { id: "vehicle", fields: ["vehicle"] }
    ],
    vehicles: [
      { code: "sedan", label: "Sedan", seats_total: 4 },
      { code: "suv", label: "SUV", seats_total: 6 },
      { code: "van", label: "Van", seats_total: 7 }
    ],
    extras: [
      { code: "water", label: "Bottled Water", price: 0 }
    ]
  });
});

// --- Minimal quote endpoint (stub calculation) ---
app.post('/api/quote', requireAuth, async (req, res) => {
  const { tenant = 'all-limos', booking_type = 'general', route = {}, pax = 1, vehicle = 'sedan', hints = {} } = req.body || {};
  const km = Number(hints.distance_km || 10);
  const base = 30;                 // base fee
  const perKm = 3;                 // $/km
  const vehicleAdj = vehicle === 'suv' ? 1.2 : vehicle === 'van' ? 1.35 : 1.0;

  const raw = base + km * perKm;
  const total = Math.round(raw * vehicleAdj * 100) / 100;

  return res.json({
    ok: true,
    tenant,
    booking_type,
    inputs: { route, pax, vehicle, km },
    currency: "AUD",
    breakdown: { base, perKm, km, vehicleAdj },
    total
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`booking-engine listening on :${port}`);
});
