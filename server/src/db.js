import { neon } from '@neondatabase/serverless';

let sqlClient;
let schemaPromise;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Configurá la conexión PostgreSQL de Neon en las variables de entorno.');
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin'
  )`,
  `CREATE TABLE IF NOT EXISTS properties (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    city TEXT NOT NULL,
    neighborhood TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    description TEXT NOT NULL,
    guests INTEGER NOT NULL,
    bedrooms INTEGER NOT NULL,
    bathrooms DOUBLE PRECISION NOT NULL,
    beds INTEGER NOT NULL,
    price_per_night DOUBLE PRECISION NOT NULL,
    cleaning_fee DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'ARS',
    image TEXT NOT NULL,
    amenities TEXT NOT NULL DEFAULT '[]',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    property_id BIGINT NOT NULL REFERENCES properties(id),
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_phone TEXT NOT NULL DEFAULT '',
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guests INTEGER NOT NULL,
    nights INTEGER NOT NULL,
    total DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Visitante',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    property_id BIGINT REFERENCES properties(id),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    escalated INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(property_id, check_in, check_out, status)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC)`
];

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      for (const statement of schemaStatements) await sql.query(statement, []);
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export async function query(text, params = [], options = {}) {
  await ensureSchema();
  return getSql().query(text, params, options);
}

export async function rows(text, params = []) {
  return query(text, params);
}

export async function first(text, params = []) {
  const result = await query(text, params);
  return result[0] || null;
}

export async function execute(text, params = []) {
  return query(text, params, { fullResults: true });
}
