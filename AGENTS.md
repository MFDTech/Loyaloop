# LoyaLoop

Tarjetas de lealtad digitales (Apple Wallet y Google Wallet) para negocios. React 19 + Vite + TypeScript.
Este repositorio ya no se edita desde Figma Make: un push desde Figma sobrescribiría el código.

## Comandos

- `pnpm dev` — servidor de desarrollo
- `pnpm test` — reglas del negocio (vitest)
- `pnpm typecheck` — TypeScript
- `pnpm build` — producción (`--base ./` para hospedar en una subcarpeta)

## Estructura

- `src/lib/types.ts` — modelo de datos (una tabla por entidad en el servidor)
- `src/lib/engine.ts` — reglas puras: puntos, sellos, niveles, emparejar escaneo y cobro (5 min por caja), revisión, canjes, devoluciones, vencimientos, bonos
- `src/lib/api.ts` — contrato con el servidor. Hoy guarda en `localStorage`; cada función ya valida permisos como lo hará el backend, así que el backend reemplaza el cuerpo y conserva las firmas
- `src/lib/preview.ts` — `PREVIEW = true` muestra cuentas de prueba, el código SMS en pantalla, enlaces de invitación y el simulador de cobros. Apagar al conectar el servidor
- `src/lib/seed.ts` — datos ficticios de ejemplo (Affair y Café La Esquina)
- `src/pages/` — `Landing`, `Auth`, `Registration` (`#/r/<código>`, enlace de la etiqueta NFC), `Kiosk` (`#/caja`), `BusinessApp` (`#/panel/...`), `AdminApp` (`#/admin/...`), `Legal`
- `src/components/` — `ui.tsx` (sistema de componentes), `Shell`, `Pass` (vista previa del pase), `Qr`, `VisitsChart`
- `src/styles/app.css` — estilos de la app (prefijo `ll-`); `src/index.css` — estilos heredados de la landing

## Roles

admin (LoyaLoop; puede entrar a la cuenta de un negocio y todo queda en bitácora) · owner · manager · cashier (solo caja y su cuenta).

## Estilo

Marca: Manrope en títulos, Inter en texto. Texto mínimo 14 px, inputs a 16 px. Negro sobre naranja, blanco sobre terracota. Escribir "LoyaLoop".
Strings con apóstrofo en comillas dobles. Componentes de página con export default.
