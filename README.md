# Manos VZLA

Mapa colaborativo de necesidades para coordinar la respuesta a los terremotos de Venezuela del 24 de junio de 2026. PWA (web app instalable) construida con React + Supabase + Leaflet. Funciona offline.

## Stack

- **Frontend:** React 18 + Vite + react-leaflet (OpenStreetMap, sin token)
- **Backend:** Supabase (Postgres + PostGIS + Realtime + Storage)
- **Offline:** Service Worker (Workbox) + IndexedDB queue
- **Hosting recomendado:** Cloudflare Pages o Vercel (ambos free tier)

## Setup en 10 minutos

### 1. Supabase

1. Crear proyecto en [supabase.com](https://supabase.com) (free tier sirve).
2. Abrir **SQL Editor** → pegar el contenido de `supabase/schema.sql` → Run.
3. Ir a **Project Settings → API** → copiar:
   - `Project URL`
   - `anon public key`
4. **Database → Extensions** → confirmar que `postgis` esté activo.
5. **Database → Cron Jobs** (opcional pero recomendado): crear job que corra `select public.expire_old_reports()` cada 10 minutos.

### 2. Frontend local

```bash
cd manos-vzla
cp .env.example .env
# editar .env y poner las claves de Supabase

npm install
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173).

### 3. Build y deploy

```bash
npm run build
# se genera la carpeta /dist
```

**Cloudflare Pages:** conectar el repo, build command `npm run build`, output directory `dist`, agregar las variables de entorno (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

**Vercel:** mismo proceso, framework preset = Vite.

El `landing.html` es independiente — súbelo a la raíz del dominio y la app en `/app` (o configura el routing como prefieras).

## Estructura

```
manos-vzla/
├── supabase/
│   └── schema.sql           # esquema completo: tablas, triggers, RLS, realtime
├── public/
│   └── favicon.svg
├── src/
│   ├── lib/
│   │   ├── supabase.js      # cliente + device hash anonimo
│   │   └── offlineQueue.js  # cola IndexedDB para offline
│   ├── App.jsx              # app principal (mapa + flujo publicar)
│   ├── main.jsx
│   └── styles.css
├── landing.html             # landing bilingue ES/EN (standalone)
├── index.html
├── vite.config.js           # PWA + caching tiles + offline
├── package.json
└── README.md
```

## Decisiones clave (por si las quieres revisar)

- **Leaflet sobre Mapbox:** sin token, sin límites por request, tiles cacheables en service worker.
- **Anon key publica:** está bien, la seguridad esta en Row Level Security. Cualquiera puede insertar/leer dentro de las políticas definidas.
- **Sin auth:** registrarse en medio de un rescate es absurdo. Usamos un `device_hash` anónimo en localStorage para rate-limit (max 10 reportes/hora por dispositivo) y para evitar votos duplicados.
- **5 categorías fijas:** decisión deliberada, más categorías = menos uso.
- **Auto-expiración:** puntos urgentes pasan a "activo" tras 2h, y a "resuelto" tras 24h sin confirmaciones. Esto mantiene el mapa limpio sin moderación manual constante.
- **Confirmaciones sociales:** 3 votos "resuelto" cierran el punto. 3 flags lo ocultan como spam. Para casos delicados, los moderadores verificados pueden actuar manualmente.

## Próximos pasos (orden sugerido)

1. **Hoy:** desplegar el landing en un dominio (`manosvzla.org` u otro), aunque la app no esté lista. Empezar a recoger emails de voluntarios moderadores.
2. **Mañana:** desplegar el MVP del frontend conectado a Supabase. Probar el flujo completo con 5-10 personas.
3. **Día 3:** contactar a Cruz Roja Venezolana, Cáritas, voluntarios locales en La Guaira y Caracas para sumar moderadores verificados.
4. **Día 4-5:** distribución agresiva por Twitter/X, Instagram, WhatsApp — apuntar primero a la diáspora venezolana (Miami, Madrid, Bogotá), ellos lo bajan a la familia en VE.
5. **Día 6+:** iterar con feedback real. Posibles features que NO incluí en el MVP a propósito pero podrían sumar después:
   - Filtro por radio ("mostrar solo lo que está a 5km")
   - Lista de hospitales y refugios verificados (capa estática)
   - Integración con WhatsApp para reportar por mensaje
   - Modo "voluntario": notificaciones push cuando algo urgente aparece cerca

## Cosas que faltan generar antes de lanzar

- [ ] Iconos PWA: `public/icon-192.png` y `public/icon-512.png` (puedes exportarlos desde el favicon.svg, usa cualquier generador online de PWA assets)
- [ ] Términos de uso y aviso de privacidad cortos (la diáspora va a preguntar)
- [ ] Dominio y certificado SSL (Cloudflare lo da gratis)
- [ ] Cuenta de Twitter/X y de Instagram para distribuir

## Licencia

MIT. Tómalo, mejóralo, lánzalo, salva vidas.
