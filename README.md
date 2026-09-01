# Asistencia QR

Sistema de asistencia con QR dinámico. Cada día se genera un código QR nuevo;
los trabajadores lo escanean con la cámara de su celular y su asistencia
queda registrada automáticamente. Incluye panel de administrador con login,
vista en vivo, historial y exportación a CSV.

## Stack

- Node.js + Express (backend y vistas server-rendered con EJS)
- PostgreSQL (via Knex.js para migraciones y consultas)
- `qrcode` (npm) para generar el QR localmente, sin servicios externos
- Autenticación admin: bcrypt + JWT en cookie httpOnly
- Reconocimiento del trabajador en su dispositivo: cookie httpOnly firmada (no requiere cuenta)

## 1. Configuración local

Requisitos: Node.js 18+ y una base Postgres (local o en la nube).

```bash
npm install
cp .env.example .env
```

Edita `.env`:
- `DATABASE_URL`: cadena de conexión a tu Postgres
- `JWT_SECRET`: un valor largo y aleatorio (por ejemplo `openssl rand -hex 32`)
- `BASE_URL`: en local, `http://localhost:3000`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: credenciales del primer administrador

Crea el esquema y el primer admin:

```bash
npm run migrate
npm run create-admin
```

Levanta el servidor:

```bash
npm run dev
```

Abre `http://localhost:3000/admin`, inicia sesión y verás el QR del día.
Para simular un trabajador, abre la URL que aparece bajo el QR
(`/checkin/<token>`) en otro navegador o en modo incógnito.

## 2. Despliegue en Railway (recomendado)

Railway aloja en un solo lugar tanto la app como la base de datos, sin
necesidad de Dockerfile ni configuración compleja — ideal si es tu primer
despliegue en la nube.

1. Sube este proyecto a un repositorio de GitHub.
2. En [railway.app](https://railway.app), crea un **New Project** → **Deploy from GitHub repo** y selecciona el repo.
3. En el mismo proyecto, agrega **New → Database → PostgreSQL**. Railway
   crea automáticamente la variable `DATABASE_URL` y la conecta al servicio.
4. En el servicio de la app, ve a **Variables** y agrega:
   - `DATABASE_URL` → referencia la variable del plugin de Postgres (Railway te la sugiere)
   - `JWT_SECRET` → un valor largo y aleatorio
   - `BASE_URL` → el dominio público que Railway te asigna (ej. `https://tuapp.up.railway.app`), lo puedes actualizar después de que Railway genere el dominio
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` → credenciales del primer admin
   - `NODE_ENV=production`
5. Railway detecta `package.json` y corre `npm install` + `npm start`
   automáticamente. Si quieres forzarlo, en **Settings → Deploy** define
   el *Start Command* como `npm start`.
6. Genera un dominio público en **Settings → Networking → Generate Domain**.
   Actualiza `BASE_URL` con ese dominio (importante: el QR codifica esta URL).
7. Corre las migraciones y crea el admin una sola vez, desde tu máquina
   apuntando a la base de Railway, o usando la pestaña **Shell** de Railway:
   ```bash
   npm run migrate
   npm run create-admin
   ```
8. Entra a `https://tudominio/admin`, inicia sesión y verifica que el QR
   apunte al dominio correcto.

### Notas de producción

- El código del día se regenera automáticamente a medianoche (hora de Lima)
  vía `node-cron`. Si el servicio estuvo caído justo a esa hora, el primer
  request del día (admin o trabajador) genera el código igual, de forma
  perezosa.
- Las cookies (`admin_token`, `worker_token`) se marcan `secure` cuando
  `NODE_ENV=production`, por lo que el dominio debe servir sobre HTTPS
  (Railway lo hace por defecto).
- Para agregar un segundo admin, corre `npm run create-admin` de nuevo con
  otro `ADMIN_EMAIL` en `.env`, o inserta directamente en la tabla `admins`.

## 3. Estructura del proyecto

```
src/
  config/       # conexión a DB y variables de entorno
  controllers/  # lógica de cada ruta
  middleware/   # auth de admin, manejo de errores
  routes/       # definición de endpoints
  services/     # generación de código diario, asistencia, QR, cron
  views/        # plantillas EJS (admin y check-in del trabajador)
  public/       # CSS y JS estático
migrations/     # esquema de base de datos versionado (Knex)
scripts/        # utilitario para crear/actualizar el admin
```
