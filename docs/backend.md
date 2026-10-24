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

**Respaldos.** El servicio `backup` guarda un respaldo diario en `./backups` (se quedan los últimos 14) y el servicio `offsite` copia cada uno a Cloudflare R2 (se quedan 30 días allá). Ver «Respaldos fuera del servidor». Para restaurar:
`docker compose exec -T db pg_restore -U loyaloop -d loyaloop --clean < backups/ARCHIVO.dump`

## Lo que falta conectar

| Pieza | Qué se necesita | Dónde va |
|---|---|---|
| Código del registro | **Programado** por WhatsApp con Meta (`server/src/whatsapp.ts`) o por SMS con Twilio Verify (`server/src/twilio.ts`). Falta: cuentas y llaves, ver abajo | `.env` |
| Correo (invitaciones, contraseñas) | **Programado** con Resend. Falta: verificar `loyaloop.com.mx` en Resend y poner `RESEND_API_KEY` | `.env` |
| Apple Wallet | **Programado** (`server/src/wallet/apple.ts`). Falta: que Apple apruebe la cuenta de desarrollador y crear el certificado, ver abajo | `.env` y `secrets/` |
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

## Cobro mensual con Mercado Pago (suscripciones)

Los negocios pagan su plan con tarjeta desde **Plan y pagos** en su panel (`src/pages/business/Plan.tsx`). LoyaLoop crea una suscripción de Mercado Pago (`/preapproval`) en **la cuenta de Mercado Pago de LoyaLoop** y manda al dueño a la página de Mercado Pago a poner su tarjeta. Mercado Pago cobra ese día y después cada mes; el dinero llega a la cuenta de LoyaLoop.

- Monto: Starter $390, Pro $990, +$250 por sucursal adicional, o el precio acordado que pongas en la ficha del negocio (admin). Si cambia, se actualiza en Mercado Pago para el siguiente cobro.
- El primer cobro activa la tarjeta (estado «Por activar» o «En prueba» → «Activo»).
- Si un cobro falla, Mercado Pago reintenta y al dueño le llega un correo. 7 días después de terminar el mes pagado, la tarjeta vuelve a «Por activar» hasta que pague.
- El dueño cancela desde su panel; la tarjeta funciona hasta que termina el mes pagado.
- Los negocios sin pago automático (por ejemplo, los que pagan por transferencia) no se tocan.
- Nos enteramos de tres formas: al volver de Mercado Pago (`/api/billing/return`), por la notificación (`/api/webhooks/billing`) y releyendo cada suscripción cada 12 horas.

Configurarlo:

1. En [mercadopago.com.mx/developers/panel](https://www.mercadopago.com.mx/developers/panel), con la cuenta de LoyaLoop, **Crear aplicación** → nombre «LoyaLoop cobros» → producto **Suscripciones**.
2. En la aplicación → **Credenciales de producción** → copia el **Access token** (`APP_USR-…`). Mercado Pago puede pedir datos del negocio para activarlas.
3. **Webhooks** → **Configurar notificaciones** → URL de producción `https://loyaloop.com.mx/api/webhooks/billing` → eventos **Planes y suscripciones** (pagos recurrentes y vinculación de suscripciones) → guarda y copia la **clave secreta**.
4. En el servidor, sin pegarlos en el chat:
   ```
   cd ~/loyaloop
   read -rsp "Access token: " T && echo && sed -i "/^BILLING_MP_ACCESS_TOKEN=/d" .env && echo "BILLING_MP_ACCESS_TOKEN=$T" >> .env
   read -rsp "Clave secreta: " S && echo && sed -i "/^BILLING_MP_WEBHOOK_SECRET=/d" .env && echo "BILLING_MP_WEBHOOK_SECRET=$S" >> .env
   unset T S && docker compose up -d
   ```
5. El registro del servidor debe decir `[cobro] Pago automático con Mercado Pago activo`.

Para probar con dinero ficticio usa las credenciales de prueba y dos **cuentas de prueba** (vendedor y comprador) de Mercado Pago; el correo que el dueño escribe debe ser el de la cuenta con la que entra a pagar.

## Apple Wallet

**Cómo funciona.** Al registrarse o recuperar la tarjeta, el cliente recibe el enlace `https://<dominio>/api/apple/download/<cliente>?t=<token>`. Safari abre el archivo `.pkpass` y muestra «Agregar». El pase se arma en el momento: `pass.json` (saldo, nivel, QR con el token del cliente, reglas al reverso), ícono y logo del negocio, y en tarjetas de sellos una franja con los sellos dibujados. Se firma con el certificado *Pass Type ID* (más el intermedio WWDR de Apple).

Cuando el iPhone guarda el pase, se registra con el servidor (`/api/apple/v1/devices/...`). Después, cada cambio de saldo, nivel, marca o un aviso nuevo se encola en `wallet_jobs` igual que Google; el proceso en segundo plano marca el pase como cambiado y manda un *push* vacío por APNs; el iPhone pregunta qué cambió y descarga el pase nuevo. Los avisos (puntos ganados, recompensa disponible…) aparecen en la pantalla de bloqueo gracias a los `changeMessage` y al campo «Último aviso» del reverso. Si Apple responde que un dispositivo ya no existe, se borra su registro. Los negocios discretos usan el nombre neutral y no muestran su logo.

**Configurarlo (cuando Apple apruebe la cuenta), todo en el VPS:**
1. Crea la llave y la solicitud de certificado (no salen del servidor):
   ```bash
   cd ~/loyaloop/secrets
   openssl req -new -newkey rsa:2048 -nodes -keyout apple-pass.key -out apple-pass.csr -subj "/CN=LoyaLoop Pass/O=LoyaLoop/C=MX"
   cat apple-pass.csr   # copia todo el texto
   ```
2. En [developer.apple.com](https://developer.apple.com/account/resources/identifiers/list/passTypeId) → **Identifiers** → **+** → **Pass Type IDs**, crea `pass.mx.com.loyaloop.tarjeta` (o el que prefieras).
3. Entra al identificador → **Create Certificate** → sube el `apple-pass.csr` (guárdalo en tu Mac como archivo) → descarga `pass.cer` y súbelo al VPS: `scp pass.cer root@IP:/root/loyaloop/secrets/`.
4. Conviértelo y baja el certificado intermedio de Apple:
   ```bash
   cd ~/loyaloop/secrets
   openssl x509 -inform der -in pass.cer -out apple-pass.pem
   curl -sO https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out apple-wwdr.pem
   chown 1000 apple-* && chmod 600 apple-*
   ```
5. En `.env` pon `APPLE_PASS_TYPE_ID` (el identificador del paso 2) y `APPLE_TEAM_ID` (Membership → Team ID, 10 caracteres). Reinicia: `docker compose up -d`. El registro debe decir `[wallet] Apple Wallet activo`.

El certificado dura un año: Apple avisa por correo; se renueva repitiendo los pasos 3 y 4 con la misma `apple-pass.key`. Las pruebas (`tests/apple.test.ts`) usan certificados falsos generados al vuelo y verifican la firma con openssl, así que el código ya está probado sin cuenta de Apple.

## Respaldos fuera del servidor (Cloudflare R2)

Si el VPS se pierde, los respaldos de `./backups` se pierden con él. El servicio `offsite` (rclone) revisa cada hora y sube a R2 los respaldos terminados que aún no estén allá; borra en R2 los de más de 30 días. R2 es gratis hasta 10 GB y no cobra por descargar.

**Configurarlo (una sola vez):**
1. En Cloudflare → **R2 Object Storage** → activa R2 (pide una tarjeta aunque sea gratis) → **Create bucket** → nombre `loyaloop-respaldos`, ubicación automática. Déjalo **privado** (sin dominio público).
2. En R2 → **Manage API tokens** → **Create API token** → permiso **Object Read & Write**, solo para el bucket `loyaloop-respaldos`. Copia el **Access Key ID** y el **Secret Access Key** (el secreto solo se muestra una vez).
3. El **Account ID** está en la página principal de R2 (columna derecha).
4. En el VPS, agrega en `.env`: `R2_ACCOUNT_ID`, `R2_BUCKET=loyaloop-respaldos`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Luego `docker compose up -d`.
5. Revisa: `docker compose logs offsite` debe decir «respaldos copiados a R2», y el bucket debe mostrar la carpeta `loyaloop/`.

**Restaurar desde R2** (por ejemplo en un VPS nuevo): descarga el `.dump` desde el panel de R2 o bájalo directo a `./backups` con `docker compose run --rm -v "$PWD/backups:/restore" offsite "rclone copy r2:loyaloop-respaldos/loyaloop/ARCHIVO.dump /restore"`, y usa el `pg_restore` de arriba.

## Twilio Verify (códigos de registro)

Twilio crea el código de 6 dígitos, lo manda por SMS al `+52` del cliente y lo revisa. LoyaLoop nunca lo ve ni lo muestra, aunque `PREVIEW=true`. Se siguen aplicando los límites propios: 30 s entre códigos, 10 minutos de vigencia y 5 intentos. **Fraud Guard** de Twilio bloquea el abuso del formulario para mandar SMS caros.

1. Crea la cuenta en [twilio.com](https://www.twilio.com/try-twilio) y verifica tu correo y tu celular. La cuenta de prueba solo puede mandar a números verificados; para clientes reales, **Upgrade** (agregar saldo, unos US$20).
2. Consola → **Verify** → **Services** → **Create new**: *Friendly name* `LoyaLoop` (aparece en el SMS; no menciona al negocio), canal **SMS**. Copia el **Service SID** (empieza con `VA`).
3. En el servicio, **Fraud Guard** activado (viene así) y, en **Geo permissions** de la cuenta, deja solo **México**.
4. Consola → página principal: **Account SID** (empieza con `AC`) y **Auth Token**.
5. En el VPS pon `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_VERIFY_SID` en `.env` y reinicia. El registro debe decir `[sms] Twilio Verify activo (sms)`.
6. Prueba un registro con tu celular. Cuando también funcione el correo, cambia `PREVIEW=false`.

WhatsApp: `TWILIO_VERIFY_CHANNEL=whatsapp`, solo después de conectar un remitente de WhatsApp en Twilio.

## WhatsApp con Meta (códigos de registro)

LoyaLoop crea el código de 6 dígitos y lo manda con una plantilla de **autenticación** aprobada por Meta, con botón «Copiar código». El código se revisa en LoyaLoop (10 minutos, 5 intentos, 30 s entre envíos). Si están configurados WhatsApp y Twilio, se usa WhatsApp.

1. **Portafolio de negocio:** en [business.facebook.com](https://business.facebook.com) crea el portafolio de LoyaLoop. Más adelante, en *Centro de seguridad*, verifica el negocio (constancia de situación fiscal y comprobante de domicilio) para quitar el límite inicial de envíos.
2. **App:** en [developers.facebook.com](https://developers.facebook.com) → *Mis apps* → *Crear app* → caso de uso **WhatsApp** (conectar con clientes) → elige el portafolio.
3. **Número:** en WhatsApp → *Configuración de la API* agrega un número propio que **no** esté usando la app de WhatsApp (un chip nuevo sirve). Nombre visible: `LoyaLoop`. Agrega una tarjeta en *WhatsApp Manager → Configuración de pagos*. Copia el **Identificador del número de teléfono**.
4. **Plantilla:** WhatsApp Manager → *Plantillas de mensajes* → *Crear* → categoría **Autenticación** → nombre `codigo_registro` → idioma **Español (MEX)** → entrega del código **Copiar código** → activa el aviso de seguridad y la vigencia de 10 minutos → enviar. Suele aprobarse en minutos.
5. **Token permanente:** *Configuración del negocio* → *Usuarios del sistema* → *Agregar* (administrador) → *Asignar activos*: la app y la cuenta de WhatsApp → *Generar token* con permisos `whatsapp_business_messaging` y `whatsapp_business_management`, sin vencimiento.
6. En el VPS pon `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` en `.env` y reinicia. El registro debe decir `[codigo] WhatsApp de Meta activo`.

Si el cliente no tiene WhatsApp, el mensaje no le llega. Para esos casos se puede sumar SMS de respaldo más adelante.
