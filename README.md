# Rinova Stays

Plataforma de alquileres temporarios con frontend React/Vite, API Express, reservas, panel de administración y Concierge.

## Arquitectura de despliegue

- Vercel: frontend estático y función API.
- Neon PostgreSQL: almacenamiento persistente.
- Frontend y API comparten el mismo dominio; el cliente usa `/api`.
- Esta copia de despliegue usa Neon. No incluye la base SQLite local ni datos personales de huéspedes.

## Requisitos

- Node.js 20 o superior.
- Una base PostgreSQL de Neon.
- Cuenta de Vercel y un repositorio Git para importar el proyecto.

## Preparar el entorno local

1. Copiar `.env.example` como `.env`.
2. Completar `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
3. `JWT_SECRET` debe tener al menos 32 caracteres aleatorios.
4. `ADMIN_PASSWORD` debe tener al menos 12 caracteres.

El archivo `.env` está excluido de Git.

## Instalar y preparar la base de datos

Desde la raíz del proyecto:

```powershell
npm install
npm run seed
```

El seed crea las tablas si no existen, crea el administrador si todavía no existe y carga los tres alojamientos de demostración. No modifica la contraseña de un administrador ya creado ni importa reservas o datos personales de la SQLite local.

## Desarrollo local

```powershell
npm run dev
```

Frontend: `http://localhost:5174`  
API: `http://localhost:4001/api/health`

Vite proxya `/api` al backend local.

## Despliegue en Vercel

1. Subir esta carpeta a un repositorio privado de GitHub.
2. Importar el repositorio en Vercel.
3. Mantener la raíz del proyecto como Root Directory.
4. Build Command: `npm run build`.
5. Output Directory: `client/dist`.
6. Configurar en Vercel las variables `DATABASE_URL` y `JWT_SECRET` para Production, Preview y Development según corresponda.
7. Desplegar una Preview y comprobar `/api/health`.
8. Ejecutar `npm run seed` desde una máquina local con el `.env` apuntando a esa misma base Neon.
9. Probar login, alojamientos, reservas, Concierge y panel antes de promover a producción.

## Seguridad

- No subir `.env`, credenciales, archivos SQLite ni datos de huéspedes a GitHub.
- El formulario de acceso no incluye credenciales precargadas.
- No reutilizar secretos de otros proyectos.
- El Concierge usa respuestas locales por defecto. Ollama en `localhost` no es accesible desde Vercel.
- La validación de disponibilidad se realiza en la API; antes de aceptar tráfico real o reservas concurrentes, hay que incorporar una restricción transaccional contra superposición de fechas en PostgreSQL.
