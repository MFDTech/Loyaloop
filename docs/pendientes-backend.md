# Lo que falta para producción

La interfaz completa funciona con datos guardados en el navegador (`src/lib/api.ts`). Para operar de verdad:

1. **Servidor y base de datos** (VPS de Hostinger): implementar las funciones de `api.ts` como endpoints con las mismas reglas de permisos. Contraseñas con hash, sesiones con cookie.
2. **Apple Wallet**: certificado Pass Type ID (cuenta de Apple Developer pendiente), firma de `.pkpass` y servicio web de actualización de pases (avisos).
3. **Google Wallet**: cuenta de emisor y clase de lealtad.
4. **Mercado Pago Point**: OAuth del negocio y webhook de cobros → `registerPayment`. Clip después.
5. **SMS** para el código de registro.
6. **Correo** para invitaciones y recuperación de contraseña.
7. Revisión legal del aviso de privacidad y términos (`#/legal` es un borrador).
8. Apagar `PREVIEW` en `src/lib/preview.ts`.

Decisiones abiertas: quién factura, precio por sucursal, si el bono de cumpleaños y referidos entran en v1.
