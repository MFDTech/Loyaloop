# Backend de LoyaLoop

## Cómo está armado

```
Navegador (React)  ──POST /api/rpc/<método>──▶  Servidor Node (Hono)  ──▶  PostgreSQL
                                                    │
Mercado Pago ──POST /api/webhooks/mercadopago/<negocio>──┘
```

- **Una sola lógica.** Las reglas y permisos viven en `src/lib/service.ts` y `src/lib/engine.ts`. El servidor ejecuta ese mismo código; la vista previa sin servidor también. Por eso las mismas pruebas corren contra la memoria y contra PostgreSQL.
- **`src/lib/api.ts`** decide el modo: con `VITE_API_URL=/api` llama al servidor; sin él, corre todo en el navegador (vista previa).
- **Base de datos.** Una tabla por entidad (`users`, `customers`, `transactions`…). Cada fila guarda el documento JSON con la forma de `src/lib/types.ts`, más columnas e índices para búsquedas: correo único, token de tarjeta único, celular único por negocio, código de sucursal único, cobro externo único.
- **Escrituras seguras.** Cada cambio abre una transacción, toma un candado del negocio, carga sus datos de trabajo (configuración, clientes, 400 días de movimientos, escaneos y cobros recientes) y guarda solo las filas que cambiaron. Dos cobros que llegan al mismo tiempo nunca se asignan al mismo escaneo (hay una prueba de eso).
- **Sesiones.** Cookie `ll_session` aleatoria, `HttpOnly`, `Secure` y `SameSite=Lax`; la base guarda solo su hash. Duran 30 días. Cambiar la contraseña cierra las demás sesiones.
- **Contraseñas** con scrypt (N=32768) y sal aleatoria.
- **Protecciones.** Encabezado propio obligatorio en cada llamada (contra CSRF), límite de intentos por IP y por correo o celular, cabeceras de seguridad (CSP, HSTS…), límite de 2 MB por solicitud, y métodos internos que no se pueden llamar desde el navegador.
- **Escáneres de caja.** Al vincularse reciben un token propio que mandan en `X-Device-Token`; desvincularlo desde el panel lo invalida al instante.

## Correr en tu computadora

```bash
pnpm install
# PostgreSQL local (o con Docker: docker run -e POSTGRES_PASSWORD=loyaloop -p 5432:5432 postgres:16)
export DATABASE_URL=postgresql://loyaloop:loyaloop@localhost:5432/loyaloop_dev
pnpm server:build
node server/dist/cli.js seed-demo            # datos de ejemplo (cuentas *.test)
PREVIEW=true SIMULATOR=true pnpm server:dev  # API en http://localhost:3000
VITE_API_URL=/api pnpm build                 # la app la sirve el mismo servidor
```

Pruebas: `TEST_DATABASE_URL=postgresql://…/loyaloop_test pnpm test`. Sin esa variable corren solo las de memoria.

## Publicar en el VPS de Hostinger

1. **VPS.** En hPanel, elige la plantilla *Ubuntu 24.04 con Docker*. Con 2 GB de RAM (KVM 1) basta para el piloto.
2. **Dominio.** En tu DNS crea un registro **A** del subdominio (por ejemplo `app.loyaloop.mx`) hacia la IP del VPS.
3. **Entrar al servidor** desde la terminal de VS Code: `ssh root@IP_DEL_VPS`.
4. **Bajar el código:**
   ```bash
   git clone https://github.com/MFDTech/Loyaloop.git loyaloop && cd loyaloop
   cp .env.example .env && nano .env   # DOMAIN, PUBLIC_URL, POSTGRES_PASSWORD (openssl rand -base64 32)
   ```
5. **Arrancar:** `docker compose up -d --build`. Caddy saca el certificado HTTPS solo.
6. **Tu cuenta de administrador:**
   ```bash
   docker compose exec app node server/dist/cli.js create-admin tu@correo.com Miguel
   ```
   Te muestra una contraseña temporal; cámbiala en «Mi cuenta».
7. **Actualizar** después de cada cambio en GitHub: `git pull && docker compose up -d --build`.
8. **Firewall:** `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`.

**Respaldos.** El servicio `backup` guarda un respaldo diario en `./backups` (se quedan los últimos 14). Copia esa carpeta fuera del VPS de vez en cuando. Para restaurar:
`docker compose exec -T db pg_restore -U loyaloop -d loyaloop --clean < backups/ARCHIVO.dump`

## Lo que falta conectar

| Pieza | Qué se necesita | Dónde va |
|---|---|---|
| SMS del registro | Elegir proveedor (Twilio, AWS SNS…) y su cuenta | `server/src/messenger.ts` |
| Correo (invitaciones, contraseñas) | Proveedor (Resend, Amazon SES…) y dominio verificado | `server/src/messenger.ts` |
| Apple Wallet | Cuenta de Apple Developer y certificado *Pass Type ID*; firmar `.pkpass` y servicio de actualización de pases | nuevo `server/src/wallet/apple.ts` |
| Google Wallet | Cuenta de emisor de Google Wallet y clase de lealtad | nuevo `server/src/wallet/google.ts` |
| Mercado Pago Point | Credenciales del piloto. El webhook ya valida la firma y guarda cada aviso en `webhook_events`; falta consultar el pago con el token del negocio, ligar cada terminal Point a una caja de LoyaLoop y llamar a `recordPayment` | `server/src/mercadopago.ts` |

Mientras no haya SMS ni correo, el servidor debe correr con `PREVIEW=true`: el código de verificación y los enlaces aparecen en pantalla.

## Límites conocidos

- Los datos de trabajo de un negocio incluyen 400 días de movimientos. Para un negocio con decenas de miles de movimientos al año conviene pasar el resumen y la actividad a consultas SQL agregadas.
- El límite de intentos vive en la memoria del proceso: con un solo servidor es suficiente.
