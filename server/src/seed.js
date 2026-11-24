import './env.js';
import bcrypt from 'bcryptjs';
import { ensureSchema, execute, first } from './db.js';

const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || '');

if (!adminEmail || !/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error('Configurá ADMIN_EMAIL con un email válido.');
if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');

await ensureSchema();
const existingUser = await first('SELECT id FROM users WHERE email = $1', [adminEmail]);
if (existingUser) {
  console.log(`El administrador ${adminEmail} ya existe. No se modificó su contraseña.`);
} else {
  await execute('INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,$4)', [adminEmail, bcrypt.hashSync(adminPassword, 12), 'Administrador', 'admin']);
  console.log(`Administrador creado: ${adminEmail}`);
}

const properties = [
  { slug: 'loft-centro', title: 'Loft luminoso en el centro', city: 'Resistencia', neighborhood: 'Microcentro', address: 'Marcelo T. de Alvear 450, Resistencia, Chaco', description: 'Loft moderno y funcional, a pasos de comercios, cafés y los principales puntos del centro. Ideal para viajes de trabajo o escapadas.', guests: 2, bedrooms: 1, bathrooms: 1, beds: 1, price: 48000, cleaning: 8000, currency: 'ARS', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=85', amenities: ['Wi-Fi de alta velocidad', 'Aire acondicionado', 'Cocina equipada', 'Smart TV', 'Ropa blanca', 'Check-in autónomo'], latitude: -27.4515, longitude: -58.9867 },
  { slug: 'depto-rio', title: 'Departamento con balcón y luz natural', city: 'Corrientes', neighborhood: 'La Rosada', address: 'Carlos Pellegrini 980, Corrientes, Argentina', description: 'Departamento cálido con balcón, cocina completa y espacios cómodos. Buena conexión con la costanera y el centro comercial.', guests: 4, bedrooms: 2, bathrooms: 1, beds: 3, price: 65000, cleaning: 10000, currency: 'ARS', image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=85', amenities: ['Wi-Fi', 'Aire acondicionado', 'Balcón', 'Cocina equipada', 'Smart TV', 'Lavarropas', 'Ropa blanca'], latitude: -27.4692, longitude: -58.8341 },
  { slug: 'casa-jardin', title: 'Casa tranquila con patio', city: 'Resistencia', neighborhood: 'Villa San Juan', address: 'Av. Sarmiento 1850, Resistencia, Chaco', description: 'Casa equipada con patio privado, parrilla y ambientes amplios. Una opción cómoda para familias o grupos pequeños.', guests: 5, bedrooms: 2, bathrooms: 2, beds: 4, price: 79000, cleaning: 12000, currency: 'ARS', image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=85', amenities: ['Wi-Fi', 'Aire acondicionado', 'Patio privado', 'Parrilla', 'Cochera', 'Cocina equipada', 'Ropa blanca'], latitude: -27.4388, longitude: -58.9792 }
];

for (const property of properties) {
  await execute(
    `INSERT INTO properties(slug,title,city,neighborhood,address,description,guests,bedrooms,bathrooms,beds,price_per_night,cleaning_fee,currency,image,amenities,latitude,longitude)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT(slug) DO NOTHING`,
    [property.slug, property.title, property.city, property.neighborhood, property.address, property.description, property.guests, property.bedrooms, property.bathrooms, property.beds, property.price, property.cleaning, property.currency, property.image, JSON.stringify(property.amenities), property.latitude, property.longitude]
  );
}

console.log('Seed completado. Se verificaron los 3 alojamientos de demostración.');
