# LoyaLoop

Tarjetas de lealtad digitales (Apple Wallet y Google Wallet) para negocios. React 19 + Vite + TypeScript.
Este repositorio ya no se edita desde Figma Make: un push desde Figma sobrescribiría el código.

## Comandos

- `pnpm dev` — la app sola, sin servidor (datos en el navegador)
- `pnpm server:dev` — API con PostgreSQL (`DATABASE_URL`); `pnpm server:build` la empaqueta en `server/dist`
- `pnpm test` — reglas y servidor (vitest). Con `TEST_DATABASE_URL` también corren contra PostgreSQL
- `pnpm typecheck` — TypeScript de la app y del servidor
- `VITE_API_URL=/api pnpm build` — app que habla con el servidor
- Despliegue: `docker compose up -d --build` (ver `docs/backend.md`)

## Estructura

- `src/lib/types.ts` — modelo de datos (una tabla por entidad en el servidor)
- `src/lib/engine.ts` — reglas puras: puntos, sellos, niveles, emparejar escaneo y cobro (5 min por caja), revisión, canjes, devoluciones, vencimientos, bonos
- `src/lib/service.ts` — toda la lógica y los permisos; la ejecuta el servidor y también la vista previa
- `src/lib/api.ts` — fachada para las páginas: llama al servidor (`VITE_API_URL`) o al servicio en el navegador
- `src/lib/memoryStore.ts` — almacenamiento en memoria/localStorage; `server/src/pgStore.ts` — PostgreSQL
- `src/lib/preview.ts` — `PREVIEW` muestra cuentas de prueba y el simulador; activo sin servidor o con `VITE_PREVIEW=true`
- `server/src/` — `app.ts` (rutas, sesiones, límites), `migrations.ts` (esquema; nunca editar una migración ya aplicada), `cli.ts` (migrate, create-admin, seed-demo), `mercadopago.ts` (webhook), `wallet/` (Google y Apple Wallet: pases, servicio web de Apple, cola `wallet_jobs`)
- `src/lib/seed.ts` — datos ficticios de ejemplo (Affair y Café La Esquina)
- `src/pages/` — `Landing`, `Auth`, `Registration` (`#/r/<código>`, enlace de la etiqueta NFC), `Kiosk` (`#/caja`), `BusinessApp` (`#/panel/...`), `AdminApp` (`#/admin/...`), `Legal`
- `src/components/` — `ui.tsx` (sistema de componentes), `Shell`, `Pass` (vista previa del pase), `Qr`, `VisitsChart`
- `src/styles/app.css` — estilos de la app (prefijo `ll-`); `src/index.css` — estilos heredados de la landing

## Roles

admin (LoyaLoop; puede entrar a la cuenta de un negocio y todo queda en bitácora) · owner · manager · cashier (solo caja y su cuenta).

## Estilo

Marca: Manrope en títulos, Inter en texto. Texto mínimo 14 px, inputs a 16 px. Negro sobre naranja, blanco sobre terracota. Escribir "LoyaLoop".
Strings con apóstrofo en comillas dobles. Componentes de página con export default.
