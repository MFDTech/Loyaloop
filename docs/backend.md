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
| Correo (invitaciones, contraseñas) | **Programado** con Resend. Falta: verificar `loyaloop.com.mx` en Resend y poner `RESEND_API_KEY` | `.env` |
| Apple Wallet | Cuenta de Apple Developer y certificado *Pass Type ID*; firmar `.pkpass` y servicio de actualización de pases | nuevo `server/src/wallet/apple.ts` |
| Google Wallet | **Programado** (`server/src/wallet/`). Falta: ID de emisor y llave de la cuenta de servicio, ver abajo | `.env` y `secrets/` |
| Mercado Pago Point | Credenciales del piloto. El webhook ya valida la firma y guarda cada aviso en `webhook_events`; falta consultar el pago con el token del negocio, ligar cada terminal Point a una caja de LoyaLoop y llamar a `recordPayment` | `server/src/mercadopago.ts` |

Mientras no haya SMS ni correo, el servidor debe correr con `PREVIEW=true`: el código de verificación y los enlaces aparecen en pantalla.

## Límites conocidos

- Los datos de trabajo de un negocio incluyen 400 días de movimientos. Para un negocio con decenas de miles de movimientos al año conviene pasar el resumen y la actividad a consultas SQL agregadas.
- El límite de intentos vive en la memoria del proceso: con un solo servidor es suficiente.

## Google Wallet

**Cómo funciona.** Cada negocio tiene una *clase* (diseño, logo, reglas) y cada cliente un *objeto* (saldo, nivel y QR con su token). Al registrarse o recuperar la tarjeta, el servidor crea o actualiza ambos y devuelve un enlace firmado «Agregar a Google Wallet». Después, cada cambio de saldo, nivel o marca se encola en `wallet_jobs` dentro de la misma transacción y un proceso en segundo plano lo manda a Google, con reintentos (1, 2, 4… minutos, hasta 8 veces). Los avisos (puntos ganados, recompensa disponible, puntos por vencer) llegan como notificación en el celular. Si Google falla al registrarse, la tarjeta se crea igual y el cliente puede agregarla después con «Recupérala».

**Configurarlo (una sola vez):**
1. En [Google Pay & Wallet Console](https://pay.google.com/business/console) crea la cuenta de emisor y copia el **ID de emisor** (Google Wallet API → arriba).
2. En [Google Cloud Console](https://console.cloud.google.com) crea un proyecto, activa **Google Wallet API**, crea una **cuenta de servicio** y descarga su llave en **JSON**.
3. De vuelta en Wallet Console → **Usuarios**, invita el correo de la cuenta de servicio (`…@….iam.gserviceaccount.com`) como **Desarrollador**.
4. En el VPS: guarda la llave como `secrets/google-wallet.json` y dale lectura a la app (`chown 1000 secrets/google-wallet.json && chmod 600 secrets/google-wallet.json`), pon `GOOGLE_WALLET_ISSUER_ID` en `.env` y reinicia (`docker compose up -d`).
5. Mientras la cuenta está en modo demo, los pases dicen «[TEST ONLY]» y solo los pueden guardar los correos que agregues como usuarios de prueba. Cuando funcione, pide **acceso de publicación** en la consola.

Google descarga el logo desde `https://<dominio>/api/public/brand/<negocio>/logo`, así que solo funciona con el servidor ya publicado con HTTPS. Los logos deben ser PNG o JPG; si no hay, usa el ícono de LoyaLoop.

## Correo con Resend

Las invitaciones, el alta de un negocio y el cambio de contraseña se envían como correo con la marca de LoyaLoop (`server/src/messenger.ts`). Si el envío falla, la acción no se deshace y queda en el registro. El enlace para restablecer contraseña nunca se muestra en pantalla fuera de la vista previa.

1. Crea la cuenta en [resend.com](https://resend.com) → **Domains** → **Add domain** → `loyaloop.com.mx`, región **North Virginia (us-east-1)**.
2. Agrega en Cloudflare (DNS) los registros que Resend muestra (DKIM `TXT`, y `MX` + `TXT` del subdominio `send`), todos en **DNS only**. Resend ofrece hacerlo solo con «Sign in to Cloudflare».
3. Cuando el dominio diga **Verified**, crea una **API key** con permiso *Sending access* y ponla en `RESEND_API_KEY` en el `.env` del servidor.
4. Opcional: en Cloudflare → **Email** → **Email Routing**, crea `hola@loyaloop.com.mx` reenviando a tu Gmail para recibir respuestas.
