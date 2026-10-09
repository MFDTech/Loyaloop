# Alcance aprobado para la interfaz de LoyaLoop

## Aprobación recibida

El usuario autorizó: «Sí, usar las recomendaciones para completar la interfaz».
La aprobación cubre las pantallas y los flujos **de demostración**, no la
implementación ni la publicación del backend.

El segundo DOCX recibido tiene el mismo contenido que el primero. La
transcripción original se conserva en `loyaloop-requisitos.md`; su columna
«Tu respuesta» continúa vacía porque no se rellenó en el archivo original.

## Recomendaciones utilizadas en la demo

- Negocios → sucursales → cajas → dispositivos.
- Identidad del cliente separada por negocio, usando datos locales distintos.
- Solo el administrador de LoyaLoop configura tarjetas y reglas.
- Vistas de administrador, dueño, gerente y cajero. Los permisos son visuales;
  no hay autorización de servidor.
- Registro NFC mediante un enlace por sucursal y teléfono obligatorio.
- Código de verificación de muestra `123456`; no se envía SMS.
- Apple Wallet en v1, con cuatro vistas conceptuales frente/reverso; Google
  Wallet, recompensas y niveles se identifican como alcance posterior cuando
  corresponde. No se emite ni firma un pase.
- Simulación de puntos y sellos, canje, reinicio por recompensa, bitácora,
  límites y exclusión de empleados. No hay integración de pagos real.
- Español y MXN, precio por sucursal pendiente y facturación manual futura.

## Decisiones y recursos que siguen pendientes

- El usuario no confirmó el sistema de cobro de Affair. Mercado Pago Point y
  Clip permanecen como candidatos, no integraciones aprobadas o conectadas.
- Precios por sucursal, límites, bonos, tasas, umbrales y multiplicadores no se
  inventaron. Los campos nuevos empiezan vacíos salvo recomendaciones con un
  valor explícito; los datos de ejemplo se identifican como demo.
- Empresa emisora de facturas, contrato y documentos legales definitivos.
- Cuenta Apple Developer de organización, entidad legal, D-U-N-S, certificado
  de pases y cuentas/permisos de proveedores de pago.
- Arquitectura final del backend, base de datos PostgreSQL, autenticación,
  aislamiento y autorización reales, idempotencia, jobs de caducidad y niveles,
  antifraude, webhooks y actualización de Wallet.
- Dominios, Hostinger, entornos, GitHub/despliegue y respaldos automáticos.
- Política de borrado y tratamiento de casos límite de saldos y devoluciones.

## Datos anteriores

Los registros de los prototipos anteriores se conservan en sus claves locales
originales. No se asignan automáticamente los antiguos clientes compartidos a
un negocio porque no tienen una relación de propiedad por negocio ni teléfonos
verificados. La asignación/migración requerirá una decisión explícita; la nueva
demo no ofrece seguridad multiempresa de producción.

## Validación

- `pnpm run test`: renderizado de rutas/módulos y lógica del simulador.
- `pnpm exec tsc --noEmit`: revisión de tipos.
- `pnpm run build`: compilación de producción.

Estas comprobaciones no certifican navegación en un navegador real ni
integraciones, seguridad, pagos o emisión de pases. La matriz en
`loyaloop-cobertura.md` distingue interfaz, simulación y pendientes reales.
