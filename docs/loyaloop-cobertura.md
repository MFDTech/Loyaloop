# Cobertura de requisitos de LoyaLoop

## Resultado y alcance

Revisión del documento más reciente, idéntico al anterior. La autorización recibida permite completar la **interfaz y la demostración**, no conectar un backend ni publicar un servicio real. Ver `decisiones-ui.md`.

- **66 parámetros** registrados, sin omitir las recomendaciones del documento.
- **27 apartados de interfaz** con pantalla, componente o estado de demo; esto no equivale a funciones de producción.
- **4 pendientes externos** identificados: Apple Developer, cuentas Mercado Pago/Clip, proveedor piloto y revisión legal.
- Los 27 apartados incluyen vistas futuras y acciones deliberadamente no conectadas (por ejemplo Apple Wallet).
- Se conserva la identidad LoyaLoop y las tarjetas que el usuario añadió con el editor visual.
- Las claves de los datos anteriores no se sobrescriben; los clientes compartidos antiguos requieren asignación explícita a un negocio antes de migrarlos.

## Acceso a las pantallas

- Sitio: `#/`.
- Administración: `#/owner` → Tarjetas y reglas / Integraciones.
- Negocio: `#/dashboard` → menú con todos los módulos y selector de rol de demo.
- Cliente final: `#/registro` o enlace de una sucursal.
- Caja: `#/escaner` o menú Escáner del negocio.
- Legal: `#/legal`, con resúmenes pendientes de revisión.

## Matriz de los 66 parámetros

**UI** = representación o formulario. **Simulación** = comportamiento local probado, sin proveedor. **Pendiente** = no implementado para producción. Ninguna de las filas certifica seguridad, pago, SMS, NFC físico, emisión de Wallet ni infraestructura real.

| Sección | Parámetro | Recomendación original | Estado de interfaz / demo | Evidencia y límite |
| --- | --- | --- | --- | --- |
| 1 | Tipos de tarjeta en la v1 | Puntos y sellos primero; recompensas y niveles se montan sobre el mismo motor | UI + simulación | Selector puntos/sellos en administración. Cuatro vistas de pase; recompensas/niveles se marcan como posteriores. |
| 1 | Google Wallet | Después de la v1, con el modelo de datos ya preparado | Alcance posterior | La landing y el flujo de tarjeta distinguen Google Wallet después de v1; no se anuncia como conectado. |
| 1 | Negocio piloto | Affair, con el sistema de cobro que usa hoy | Visible; proveedor pendiente | Affair es un espacio de ejemplo, no un negocio conectado. El sistema de cobro no fue confirmado. |
| 1 | ★ Jerarquía | Negocio, sucursales y cajas | UI + datos locales | Módulo Sucursales y cajas; sucursales, cajas y dispositivos con referencias por negocio. |
| 1 | ★ Identidad del cliente final | Una cuenta separada por negocio; ningún negocio ve clientes de otro | Simulada; seguridad pendiente | Datos locales por identificador de negocio. No hay aislamiento, identidad ni autorización de servidor. |
| 1 | ★ Quién configura las tarjetas | Solo tú en la v1; el negocio las ve pero no las edita | UI restringida | Tarjetas y reglas editables solo en panel de administrador; negocio con consulta y vista previa. |
| 1 | Roles | Cuatro: administrador Loyaloop, dueño, gerente y cajero | UI de cuatro roles | Administrador global y selector de dueño/gerente/cajero en negocio. Permisos de producción pendientes. |
| 1 | Unidad de cobro del plan | Por sucursal, que es lo más fácil de medir. El precio lo defines tú | Visible; tarifa pendiente | Configuración y landing indican cobro por sucursal. No se convirtieron precios USD ni se inventaron tarifas MXN. |
| 1 | Cómo cobras a los negocios | Factura manual en la v1; cobro automático después | Visible; servicio pendiente | Configuración indica facturación manual v1 y automatización posterior. Sin facturas reales ni cobros. |
| 2 | Puntos por peso gastado | Configurable por negocio, con redondeo hacia abajo | Configurable + simulación | Tasa por negocio vacía inicialmente; simulador con Math.floor sobre compra de ejemplo. |
| 2 | Sobre qué monto se calculan | Total pagado, sin propina | Visible + simulación | Total pagado sin propina. No hay captura de monto por cajero; compra fija de ejemplo, sin webhooks. |
| 2 | Compra mínima | Configurable; por defecto ninguna | Configurable + simulación | Campo por negocio, cero por defecto; la compra de muestra respeta el mínimo. |
| 2 | Sellos: qué cuenta como sello | Una compra arriba de un monto mínimo | Configurable; integración pendiente | Monto mínimo visible/configurable. El escáner actual simula visitas sin proveedor integrado. |
| 2 | Sellos: al completar la tarjeta | Se genera la recompensa y la tarjeta reinicia | Simulación local | Meta y recompensa configurables. La demo otorga una recompensa local y reinicia; no actualiza Wallet real. |
| 2 | Recompensas: catálogo | Lo define cada negocio, con costo en puntos | UI + datos locales | Catálogo configurable por negocio. Costos de muestra identificados como demo. |
| 2 | Recompensas: cómo se canjean | En caja, con el mismo QR, y queda registrado | Simulación local | Escáner permite canjear con el mismo escaneo, valida saldo/recompensa y deja registro. QR y backend pendientes. |
| 2 | Niveles: sobre qué se calculan | Gasto acumulado de los últimos 12 meses | Vista futura | Pase de niveles, gasto de últimos 12 meses y umbral por definir. Sin cálculo real de nivel. |
| 2 | Niveles: se puede bajar | Sí, al revisar cada periodo | Regla visible; motor pendiente | Consulta de reglas explica revisión periódica y descenso. No hay revisión programada. |
| 2 | Niveles: beneficios | Multiplicador de puntos por nivel | Configurable; motor pendiente | Multiplicador configurado como dato de demo; no se ejecuta un motor de niveles sobre cobros. |
| 2 | Caducidad de puntos | A los 12 meses sin actividad | Regla visible; job pendiente | 12 meses sin actividad en reglas y pase. No se eliminan puntos automáticamente. |
| 2 | Devoluciones y cancelaciones | Se restan los puntos de esa compra | Simulación parcial | Actividad incluye devolución de compra de ejemplo, reversión de puntos y referencia única. Casos límite y cancelación real pendientes. |
| 2 | Bonos | Bienvenida en la v1; cumpleaños y referidos después | UI + simulación | Bienvenida por definir; se registra en el alta demo cuando se configura. Cumpleaños y referidos se señalan como posteriores. |
| 2 | Ajustes manuales de saldo | Solo dueño o gerente, con motivo obligatorio y bitácora | UI + simulación | Ficha del cliente permite ajuste al dueño/gerente con motivo y bitácora. Seguridad de servidor pendiente. |
| 3 | Datos que se piden | Nombre y teléfono obligatorios; correo y cumpleaños opcionales | UI | Registro y alta demo con nombre/teléfono obligatorios, correo/cumpleaños opcionales. |
| 3 | Identificador único | Teléfono, verificado con un código | Simulación; servicio pendiente | Teléfono normalizado por negocio; código de muestra 123456 visible. No hay verificación real ni SMS. |
| 3 | Link de la etiqueta NFC | Uno por sucursal | UI por sucursal | Enlace de registro con negocio y sucursal. No se escribe ni se lee una etiqueta física desde la app. |
| 3 | Si ya tiene cuenta | Se reconoce el teléfono y se le vuelve a entregar su tarjeta | Flujo de demo | Ya tengo cuenta identifica el teléfono dentro del negocio y recupera la vista de tarjeta, sin duplicar saldo inicial. |
| 3 | Consentimientos | Privacidad obligatoria; promociones en una casilla aparte | UI + registro local | Privacidad requerida, promociones separadas/opcionales. Documentos definitivos y evidencia de consentimiento real pendientes. |
| 3 | ★ Con qué se escanea el QR | Tablet o celular fijo en el mostrador, viendo hacia el cliente, con la página de escáner abierta | UI de escáner | Pantalla adaptable a tablet/celular fijo. Simulador sin cámara ni lectura real de QR. |
| 3 | Cómo se empareja escáner y caja | Un código de emparejamiento, una sola vez, desde el dashboard | Simulación local | Dispositivo y caja vinculados mediante código de ejemplo. Códigos temporales/únicos de servidor pendientes. |
| 3 | Ventana entre escaneo y cobro | 5 minutos, antes o después de pagar | Simulación parcial | Caducidad local de 5 minutos para escaneo; emparejar un pago antes/después exige integración y backend. |
| 3 | Dos cobros seguidos | Cada escaneo se usa una sola vez y cada cobro se asigna una sola vez | Simulación local; seguridad pendiente | Un token local se usa una vez; el simulador rechaza duplicados. Idempotencia de pagos real pendiente. |
| 3 | Sin internet | El escaneo no se registra y la pantalla lo avisa | UI + simulación | Estado sin conexión; el simulador no escribe el escaneo. No hay sincronización offline real. |
| 3 | Pagos en efectivo | Fuera de la v1, salvo que el negocio tenga punto de venta integrado | Alcance visible | Escáner/actividad indican fuera de v1 salvo POS integrado; no hay captura de efectivo. |
| 3 | Qué ve el cajero | Solo la confirmación en la pantalla del escáner; nada editable | UI restringida | Vista de escáner y confirmación; no edita saldos, reglas o montos. La restricción no sustituye autorización real. |
| 3 | Límite por cliente | Máximo de compras con puntos al día, configurable | Configurable + simulación | Límite diario por negocio, inicialmente vacío; prueba de compra respeta el valor configurado. |
| 3 | Tarjetas sospechosas | Alerta cuando una tarjeta acumula muchas más compras que el promedio | Vista + umbral de demo | Equipo muestra señales sobre promedio cuando se configura un umbral. No certifica fraude ni hace detección de servidor. |
| 3 | Empleados | Sus teléfonos se registran y quedan excluidos o marcados | UI + simulación | Teléfonos marcados o excluidos; simulador bloquea acumulación de empleados excluidos. |
| 3 | Bitácora | Cada escaneo guarda sucursal, caja, dispositivo y hora | Datos locales | Cada registro simulado conserva cliente, sucursal, caja, dispositivo, fecha y razón. Auditoría inmutable pendiente. |
| 4 | ★ Primeras integraciones | Mercado Pago Point y Clip, sujeto a lo que use el piloto | Pendiente de proveedor | Mercado Pago Point y Clip son candidatos visibles. No hay decisión de proveedor ni conexión. |
| 4 | Quién conecta la cuenta del negocio | Tú, durante el alta del negocio | UI + procedimiento | Panel administrador ofrece preparación; negocio consulta estado. No se reciben credenciales ni se ejecuta OAuth. |
| 4 | Negocio sin sistema integrado | Tarjeta de sellos por visita hasta que exista su integración | Simulación local | Sellos de visita en escáner de ejemplo. Acreditación operativa real pendiente. |
| 4 | Segunda etapa | Puntos de venta de restaurantes, como Parrot y Soft Restaurant | Alcance visible | Parrot y Soft Restaurant indicados como posteriores, sin conexión. |
| 4 | Cuenta de Apple Developer | A nombre de la empresa de Loyaloop. Las cuentas de organización piden entidad legal y número D-U-N-S | Pendiente externo visible | Integraciones explica organización, entidad legal y D-U-N-S. |
| 4 | Certificado de pases | Uno solo para todos los negocios; el nombre de cada negocio va en su pase | Pendiente externo visible | Un certificado para todos los negocios; no se almacenan claves/certificados en cliente. |
| 4 | Campos por tipo de tarjeta | Frente: saldo o sellos y nivel. Reverso: reglas, contacto y novedades | UI conceptual | Frente/reverso de puntos, sellos, recompensas y niveles. Apple controla el layout final del pase real. |
| 4 | Qué personaliza el negocio | Logo, colores e imagen principal | UI central | Logo HTTPS, colores, imagen y nombre del pase configurables por administrador para cada negocio. |
| 4 | Contenido del QR | Un identificador aleatorio, sin datos personales | Conceptual; emisión pendiente | QR de muestra sin información personal; el servidor deberá emitir identificador aleatorio seguro y validable. |
| 4 | Eventos que avisan | Puntos ganados, recompensa disponible, cambio de nivel y puntos por vencer | UI; automatización pendiente | Puntos ganados, recompensa, cambio de nivel y vencimiento están en el módulo; sin disparadores reales. |
| 4 | Canales en la v1 | Solo Wallet; WhatsApp o SMS después | Alcance visible | Apple Wallet v1; WhatsApp/SMS de notificaciones posteriores. No se envía ningún mensaje real. |
| 4 | Promociones del negocio | Sí, con un límite mensual por negocio | UI + simulación | Borradores por negocio y simulación limitada por cuota configurable; no se envían campañas reales. |
| 4 | Avisos por ubicación | Opcionales por negocio | Configurable; servicio pendiente | Control opcional del administrador; requiere emisión/actualización del pase real. |
| 4 | Modo discreto | Sí: nombre neutro en el pase y sin avisos por ubicación, para giros como moteles | UI | Nombre neutro del pase y ubicación desactivada; vista previa local. |
| 5 | Métricas del negocio | Clientes nuevos y activos, visitas, gasto promedio, puntos emitidos y canjeados, recompensas canjeadas | Datos de simulación | Clientes nuevos/activos, visitas, gasto promedio, puntos emitidos/canjeados y recompensas canjeadas. Sin cobros reales. |
| 5 | Exportar clientes | Sí, en CSV, solo el dueño | UI + CSV local | Acción visible para dueño; CSV del espacio seleccionado con escape de campos. Restricción de servidor pendiente. |
| 5 | De quién son los datos | Del negocio; Loyaloop los procesa por su cuenta | Regla visible | Configuración declara propiedad del negocio y tratamiento por LoyaLoop. Contrato real pendiente. |
| 5 | Si un negocio cancela | Puede exportar sus datos y se borran después de un plazo | Política visible; servicio pendiente | Exportación, plazo de borrado por definir; no se programa una eliminación ni una baja de producción. |
| 5 | Tu panel global | Negocios activos, pases emitidos, transacciones y errores de integración | Datos de simulación | Negocios activos, vistas de pase, transacciones y errores locales. No se presentan pases sin firmar como emitidos. |
| 5 | Aviso de privacidad y términos | Para negocios y para clientes finales, revisados por un abogado antes de lanzar | Borradores visibles; externo | Ruta legal con resúmenes para negocios/clientes, no documentos válidos o revisados. |
| 5 | Contrato con los negocios | Una plantilla única | Pendiente externo visible | Ruta legal incluye plantilla única pendiente de revisión y redacción. |
| 5 | Facturación | Definir quién factura y desde qué empresa | Pendiente comercial visible | Se declara empresa emisora y facturación por definir; sin CFDI ni servicio fiscal. |
| 5 | Tecnologías | Un solo proyecto con web y backend, y base de datos PostgreSQL | Frontend; backend pendiente | React/Vite existente. PostgreSQL y arquitectura web/backend documentados, no implementados. |
| 5 | Dominios | El dominio principal y un subdominio corto para los links de registro | Pendiente técnico visible | Preparación central muestra dominio principal y subdominio corto, todavía por definir. |
| 5 | Ambientes | Pruebas y producción separados | Pendiente técnico visible | Pruebas/producción separados como requisito; no se aprovisionaron entornos. |
| 5 | Respaldos | Diarios, automáticos y guardados fuera del VPS | Pendiente técnico visible | Requisito diario automático fuera de VPS documentado; no hay infraestructura ni respaldo remoto funcionando. |
| 5 | Idioma y moneda | Español y pesos mexicanos en la v1 | UI | Español y MXN; las tarifas quedan pendientes en vez de convertir/importar precios de muestra USD. |

## Comprobación de pantallas y recursos

| Apartado del documento | Estado | Acceso o pendiente |
| --- | --- | --- |
| Logo, colores, tipografías y espaciados | Interfaz de demo | src/components/ui.tsx y src/index.css: identidad LoyaLoop. |
| Componentes: botones, campos, tablas, tarjetas, menús, modales y avisos | Interfaz de demo | Primitivas compartidas y módulos de producto; no son un backend. |
| Estados: vacío, cargando y error | Interfaz de demo | Clientes/actividad vacíos, actualización local en carga y formularios/escáner con errores. |
| Registro al tocar la NFC | Interfaz de demo | #/registro?negocio=...&sucursal=...; enlace de muestra por sucursal. |
| Verificación con código | Interfaz de demo | Paso de registro con código demo 123456; sin SMS. |
| Agregar a Apple Wallet | Interfaz de demo | Vista y acción explicativa; no descarga ni emite .pkpass. |
| Ya tengo cuenta y recuperar mi tarjeta | Interfaz de demo | Flujo de teléfono existente dentro del negocio. |
| Tarjeta de puntos, frente y reverso | Interfaz de demo | Tarjetas y reglas y flujo de cliente: selector de tipo, frente/reverso; vista conceptual no firmada. |
| Tarjeta de sellos, frente y reverso | Interfaz de demo | Tarjetas y reglas y flujo de cliente: selector de tipo, frente/reverso; vista conceptual no firmada. |
| Tarjeta de recompensas, frente y reverso | Interfaz de demo | Tarjetas y reglas y flujo de cliente: selector de tipo, frente/reverso; vista conceptual no firmada. |
| Tarjeta de niveles, frente y reverso | Interfaz de demo | Tarjetas y reglas y flujo de cliente: selector de tipo, frente/reverso; vista conceptual no firmada. |
| Inicio de sesión | Interfaz de demo | #/login, formulario de demo sin autenticación real. |
| Resumen con métricas | Interfaz de demo | Dashboard → Resumen; datos simulados y tarjetas originales conservadas. |
| Clientes: lista y detalle con historial | Interfaz de demo | Dashboard → Clientes, ficha/historial, ajustes con motivo y CSV para dueño. |
| Actividad y transacciones | Interfaz de demo | Dashboard → Actividad; filtros, trazabilidad y devolución de ejemplo. |
| Tarjeta y reglas, con vista previa del pase | Interfaz de demo | Dashboard consulta; propietario global configura en Tarjetas y reglas. |
| Recompensas | Interfaz de demo | Dashboard → Recompensas; catálogo y canje simulado desde escáner. |
| Notificaciones y promociones | Interfaz de demo | Dashboard → Notificaciones; borradores, eventos y cuotas, sin entrega real. |
| Sucursales, cajas y dispositivos | Interfaz de demo | Dashboard → Sucursales y cajas; altas, enlace NFC y emparejamiento demo. |
| Integraciones | Interfaz de demo | Dashboard y administrador → Integraciones; proveedores candidatos, errores demo y preparación Apple/técnica. |
| Equipo y permisos | Interfaz de demo | Dashboard → Equipo; personas, roles, teléfonos, exclusiones y matriz de permisos de muestra. |
| Configuración y plan | Interfaz de demo | Dashboard → Configuración; contactos, plan por sucursal, MXN y pendientes comerciales/legales. |
| Pantalla de espera | Interfaz de demo | Dashboard → Escáner o #/escaner. |
| Cliente identificado y puntos ganados | Interfaz de demo | Escáner → QR válido de ejemplo y confirmación de compra fija simulada. |
| Canje de recompensa | Interfaz de demo | Escáner → canje con token y saldo/recompensa local. |
| Errores: QR inválido y sin conexión | Interfaz de demo | Escáner → controles de prueba y estados sin registro de actividad. |
| Página principal: qué es, cómo funciona, tipos de tarjeta, precios y contacto | Interfaz de demo | Landing; cuatro tipos y precios por definir, contacto aún de ejemplo. |
| Cuenta de Apple Developer a nombre de la empresa | Pendiente externo | No puede sustituirse con una pantalla: requiere acción, cuenta, proveedor o revisión externa. |
| Cuentas de desarrollador en Mercado Pago y Clip | Pendiente externo | No puede sustituirse con una pantalla: requiere acción, cuenta, proveedor o revisión externa. |
| Confirmar con qué cobra el negocio piloto | Pendiente externo | No puede sustituirse con una pantalla: requiere acción, cuenta, proveedor o revisión externa. |
| Abogado para aviso de privacidad y términos | Pendiente externo | No puede sustituirse con una pantalla: requiere acción, cuenta, proveedor o revisión externa. |

## Pendientes de producción: no presentarlos como terminados

1. Autenticación, autorización real de cuatro roles e identidad/aislamiento por negocio.
2. Backend y PostgreSQL, constraints, seguridad, auditoría inmutable, motor de lealtad, niveles/caducidad y políticas de saldos/devoluciones.
3. Confirmar el cobro de Affair y validar APIs, credenciales seguras, webhooks, idempotencia y ventana de 5 minutos antes/después del pago.
4. Verificación telefónica real, generación del QR seguro y enlace de etiquetas NFC físicas.
5. Certificado/Apple Developer y emisión/actualización de pases, APNs y eventos de notificación.
6. Condiciones y límites definitivos, precios por sucursal MXN, empresa emisora y facturación manual real.
7. Legal, contrato, consentimiento válido y política de cancelación/retención/borrado.
8. Dominios, Hostinger, ambientes, despliegue y respaldos remotos automáticos.

## Verificación realizada

- `pnpm run test`: 13 pruebas automatizadas de renderizado, landing, CSV y lógica del simulador.
- `pnpm exec tsc --noEmit`: revisión de tipos.
- `pnpm run build`: compilación de producción.
- Las pruebas de renderizado son sin navegador; no certifican interacción visual, cámara ni conexiones externas.
- La compilación advierte del tamaño del bundle JavaScript; no bloquea el build. La optimización de carga queda como trabajo posterior.
