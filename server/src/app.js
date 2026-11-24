import './env.js';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { ensureSchema, first, rows, execute } from './db.js';
import { requireAuth } from './auth.js';
import { answerConcierge } from './concierge.js';

const app = express();
// Frontend y API se sirven bajo el mismo dominio. En desarrollo, Vite proxya /api al servidor local.
app.use(express.json({ limit: '1mb' }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const publicProperty = (property) => ({ ...property, amenities: JSON.parse(property.amenities || '[]'), active: Boolean(property.active) });
const validId = (value) => /^\d+$/.test(String(value || ''));

app.get('/api/health', asyncRoute(async (_req, res) => {
  await ensureSchema();
  res.json({ ok: true, service: 'Rinova Stays API', database: 'connected' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await first('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()]);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({ error: 'El servidor no tiene configurado un secreto JWT seguro' });
  }
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}));

app.get('/api/properties', asyncRoute(async (req, res) => {
  const { city, guests, checkIn, checkOut } = req.query;
  const conditions = ['p.active = 1'];
  const params = [];
  if (city) { params.push(`%${String(city)}%`); conditions.push(`p.city ILIKE $${params.length}`); }
  if (guests) { params.push(Number(guests)); conditions.push(`p.guests >= $${params.length}`); }
  if (checkIn && checkOut) {
    params.push(checkIn, checkOut);
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.property_id = p.id AND b.status IN ('pending','confirmed')
      AND b.check_in < $${params.length - 1} AND b.check_out > $${params.length}
    )`);
  }
  const properties = await rows(`SELECT p.* FROM properties p WHERE ${conditions.join(' AND ')} ORDER BY p.id DESC`, params);
  res.json(properties.map(publicProperty));
}));

app.get('/api/properties/:slug', asyncRoute(async (req, res) => {
  const property = await first('SELECT * FROM properties WHERE slug = $1 AND active = 1', [req.params.slug]);
  if (!property) return res.status(404).json({ error: 'Propiedad no encontrada' });
  res.json(publicProperty(property));
}));

app.get('/api/properties/:id/availability', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de propiedad inválido' });
  const property = await first('SELECT id FROM properties WHERE id = $1 AND active = 1', [req.params.id]);
  if (!property) return res.status(404).json({ error: 'Propiedad no encontrada' });
  const bookings = await rows("SELECT check_in, check_out, status FROM bookings WHERE property_id = $1 AND status IN ('pending','confirmed')", [property.id]);
  res.json({ blocked: bookings.map((booking) => ({ from: booking.check_in, to: booking.check_out, status: booking.status })) });
}));

app.post('/api/bookings', asyncRoute(async (req, res) => {
  const { propertyId, guestName, guestEmail, guestPhone = '', checkIn, checkOut, guests, notes = '' } = req.body || {};
  if (!validId(propertyId)) return res.status(400).json({ error: 'Propiedad inválida' });
  const property = await first('SELECT * FROM properties WHERE id = $1 AND active = 1', [propertyId]);
  if (!property) return res.status(404).json({ error: 'Propiedad no encontrada' });
  if (!guestName?.trim() || !/^\S+@\S+\.\S+$/.test(guestEmail || '')) return res.status(400).json({ error: 'Ingresá nombre y un email válido' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || '') || checkOut <= checkIn) {
    return res.status(400).json({ error: 'Las fechas no son válidas' });
  }
  if (!Number.isInteger(Number(guests)) || Number(guests) < 1 || Number(guests) > property.guests) {
    return res.status(400).json({ error: `Esta propiedad admite hasta ${property.guests} huéspedes` });
  }
  const nights = (new Date(`${checkOut}T12:00:00Z`) - new Date(`${checkIn}T12:00:00Z`)) / 86400000;
  if (nights < 1 || nights > 90) return res.status(400).json({ error: 'La estadía debe ser de entre 1 y 90 noches' });
  const conflict = await first(
    "SELECT id FROM bookings WHERE property_id = $1 AND status IN ('pending','confirmed') AND check_in < $2 AND check_out > $3",
    [property.id, checkOut, checkIn]
  );
  if (conflict) return res.status(409).json({ error: 'Las fechas seleccionadas ya no están disponibles. Elegí otras fechas.' });

  const total = nights * Number(property.price_per_night) + Number(property.cleaning_fee);
  const code = `RNV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const result = await execute(
    `INSERT INTO bookings(code,property_id,guest_name,guest_email,guest_phone,check_in,check_out,guests,nights,total,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [code, property.id, guestName.trim(), guestEmail.toLowerCase(), guestPhone, checkIn, checkOut, Number(guests), nights, total, notes]
  );
  res.status(201).json({ id: result.rows[0].id, code, status: 'pending', nights, total, currency: property.currency, message: 'Solicitud recibida. El anfitrión debe confirmar la reserva.' });
}));

app.post('/api/concierge/chat', asyncRoute(async (req, res) => {
  const { message, propertyId, name, email, phone } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Escribí tu consulta' });
  if (message.length > 1500) return res.status(400).json({ error: 'La consulta es demasiado larga' });
  res.json(await answerConcierge({ message: message.trim(), propertyId: validId(propertyId) ? Number(propertyId) : null, name, email, phone }));
}));

app.get('/api/admin/summary', requireAuth, asyncRoute(async (_req, res) => {
  const summary = await first(`SELECT
    (SELECT COUNT(*)::int FROM properties) AS properties,
    (SELECT COUNT(*)::int FROM bookings) AS bookings,
    (SELECT COUNT(*)::int FROM bookings WHERE status = 'pending') AS pending,
    (SELECT COALESCE(SUM(total),0)::float8 FROM bookings WHERE status = 'confirmed') AS revenue,
    (SELECT COUNT(*)::int FROM conversations) AS conversations`);
  res.json(summary);
}));

app.get('/api/admin/bookings', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await rows('SELECT b.*, p.title AS property_title, p.city, p.currency FROM bookings b JOIN properties p ON p.id = b.property_id ORDER BY b.created_at DESC'));
}));

app.patch('/api/admin/bookings/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de reserva inválido' });
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  const booking = await first('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
  if (status !== 'cancelled') {
    const clash = await first("SELECT id FROM bookings WHERE property_id = $1 AND id <> $2 AND status IN ('pending','confirmed') AND check_in < $3 AND check_out > $4", [booking.property_id, booking.id, booking.check_out, booking.check_in]);
    if (clash) return res.status(409).json({ error: 'Existe otra reserva que se superpone' });
  }
  await execute('UPDATE bookings SET status = $1 WHERE id = $2', [status, booking.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/conversations', requireAuth, asyncRoute(async (_req, res) => {
  res.json(await rows('SELECT c.*, p.title AS property_title FROM conversations c LEFT JOIN properties p ON p.id = c.property_id ORDER BY c.created_at DESC'));
}));

app.patch('/api/admin/conversations/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de conversación inválido' });
  const { status } = req.body || {};
  if (!['open', 'resolved'].includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  const result = await execute('UPDATE conversations SET status = $1 WHERE id = $2 RETURNING id', [status, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Conversación no encontrada' });
  res.json({ ok: true });
}));

app.get('/api/admin/properties', requireAuth, asyncRoute(async (_req, res) => {
  const properties = await rows('SELECT * FROM properties ORDER BY id DESC');
  res.json(properties.map(publicProperty));
}));

app.post('/api/admin/properties', requireAuth, asyncRoute(async (req, res) => {
  const property = req.body || {};
  const required = ['title', 'city', 'address', 'description', 'image'];
  if (required.some((key) => !String(property[key] || '').trim())) return res.status(400).json({ error: 'Completá título, ciudad, dirección, descripción e imagen' });
  const slug = `${(property.slug || property.title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomBytes(2).toString('hex')}`;
  const result = await execute(
    `INSERT INTO properties(slug,title,city,neighborhood,address,description,guests,bedrooms,bathrooms,beds,price_per_night,cleaning_fee,currency,image,amenities,latitude,longitude)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [slug, property.title, property.city, property.neighborhood || '', property.address, property.description, Number(property.guests) || 2, Number(property.bedrooms) || 1, Number(property.bathrooms) || 1, Number(property.beds) || 1, Number(property.pricePerNight) || 0, Number(property.cleaningFee) || 0, property.currency || 'ARS', property.image, JSON.stringify(Array.isArray(property.amenities) ? property.amenities : []), property.latitude ? Number(property.latitude) : null, property.longitude ? Number(property.longitude) : null]
  );
  res.status(201).json({ id: result.rows[0].id, slug });
}));

app.put('/api/admin/properties/:id', requireAuth, asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador de propiedad inválido' });
  const property = req.body || {};
  const old = await first('SELECT * FROM properties WHERE id = $1', [req.params.id]);
  if (!old) return res.status(404).json({ error: 'Propiedad no encontrada' });
  await execute(
    `UPDATE properties SET title=$1, city=$2, neighborhood=$3, address=$4, description=$5, guests=$6, bedrooms=$7, bathrooms=$8, beds=$9,
      price_per_night=$10, cleaning_fee=$11, currency=$12, image=$13, amenities=$14, latitude=$15, longitude=$16, active=$17 WHERE id=$18`,
    [property.title || old.title, property.city || old.city, property.neighborhood ?? old.neighborhood, property.address || old.address, property.description || old.description, Number(property.guests) || old.guests, Number(property.bedrooms) || old.bedrooms, Number(property.bathrooms) || old.bathrooms, Number(property.beds) || old.beds, Number(property.pricePerNight) || old.price_per_night, Number(property.cleaningFee) || old.cleaning_fee, property.currency || old.currency, property.image || old.image, JSON.stringify(property.amenities || JSON.parse(old.amenities)), property.latitude ?? old.latitude, property.longitude ?? old.longitude, property.active === false ? 0 : 1, old.id]
  );
  res.json({ ok: true });
}));

app.use((error, _req, res, _next) => {
  console.error('[Rinova API]', error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
