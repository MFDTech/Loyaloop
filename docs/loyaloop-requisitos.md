# Documento de requisitos de LoyaLoop

> Transcripción del DOCX adjunto. Las columnas «Tu respuesta» se conservan vacías: las recomendaciones no equivalen a decisiones aprobadas.

> La aprobación posterior para completar exclusivamente la interfaz de demo está registrada en `decisiones-ui.md`. No autoriza backend, cobros ni emisión de pases reales.

Loyaloop: todo lo que hay que definir antes del backend

Oct 7, 2026 · @Miguel Farah Dagdug

Cómo trabajamos

Este documento es la fuente de verdad de Loyaloop: nada se programa hasta que su decisión esté cerrada aquí. Las decisiones marcadas con ★ definen la base de datos y van primero.

| Qué | Dónde | Para qué |
| --- | --- | --- |
| Decisiones | Este documento | Cada punto con su respuesta final |
| Diseño de UI | Figma, exportado por pantalla | Lo que Claude replica en código |
| Código | VS Code con Claude y un repositorio en GitHub | Construir backend y conectar tu UI |
| Publicación | VPS de Hostinger | Web, backend, base de datos y firmado de pases |

Claude en VS Code no ve esta conversación. Cuando el documento esté cerrado, se exporta a Markdown y se guarda dentro del repositorio para que lo lea ahí.

Publicar será subir cambios a GitHub y que el VPS los descargue; eso se deja automatizado desde el inicio.

Decisiones ya tomadas

Esto ya quedó definido y no hay que volver a discutirlo.

Modelo: B2B2C. Loyaloop se vende a negocios de todo tipo y tú les creas sus tarjetas.

Plataforma: aplicación web, sin app en la App Store.

Tarjetas: digitales en Apple Wallet, de cuatro tipos: puntos, sellos, recompensas y niveles.

Acumulación: según lo que gasta el cliente, sin captura manual del cajero.

En caja: el cliente presenta el QR de su pase.

Registro: el cliente crea su cuenta al tocar una etiqueta NFC.

Integraciones: con los sistemas de cobro más populares. Candidatos por confirmar: Mercado Pago Point y Clip.

Notificaciones: los usuarios reciben avisos.

Superficies: landing page, dashboard por negocio y tu panel de administrador.

Hosting: VPS de Hostinger.

## 1. Alcance y estructura de cuentas

Aquí están tres de las cinco decisiones ★. Escribe tu respuesta en la última columna; si la recomendación te sirve, pon "ok".

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Tipos de tarjeta en la v1 | Puntos y sellos primero; recompensas y niveles se montan sobre el mismo motor |  |
| Google Wallet | Después de la v1, con el modelo de datos ya preparado |  |
| Negocio piloto | Affair, con el sistema de cobro que usa hoy |  |
| ★ Jerarquía | Negocio, sucursales y cajas |  |
| ★ Identidad del cliente final | Una cuenta separada por negocio; ningún negocio ve clientes de otro |  |
| ★ Quién configura las tarjetas | Solo tú en la v1; el negocio las ve pero no las edita |  |
| Roles | Cuatro: administrador Loyaloop, dueño, gerente y cajero |  |
| Unidad de cobro del plan | Por sucursal, que es lo más fácil de medir. El precio lo defines tú |  |
| Cómo cobras a los negocios | Factura manual en la v1; cobro automático después |  |

## 2. Reglas de lealtad

Cada regla debe poder configurarse por negocio; aquí defines los valores por defecto y los límites.

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Puntos por peso gastado | Configurable por negocio, con redondeo hacia abajo |  |
| Sobre qué monto se calculan | Total pagado, sin propina |  |
| Compra mínima | Configurable; por defecto ninguna |  |
| Sellos: qué cuenta como sello | Una compra arriba de un monto mínimo |  |
| Sellos: al completar la tarjeta | Se genera la recompensa y la tarjeta reinicia |  |
| Recompensas: catálogo | Lo define cada negocio, con costo en puntos |  |
| Recompensas: cómo se canjean | En caja, con el mismo QR, y queda registrado |  |
| Niveles: sobre qué se calculan | Gasto acumulado de los últimos 12 meses |  |
| Niveles: se puede bajar | Sí, al revisar cada periodo |  |
| Niveles: beneficios | Multiplicador de puntos por nivel |  |
| Caducidad de puntos | A los 12 meses sin actividad |  |
| Devoluciones y cancelaciones | Se restan los puntos de esa compra |  |
| Bonos | Bienvenida en la v1; cumpleaños y referidos después |  |
| Ajustes manuales de saldo | Solo dueño o gerente, con motivo obligatorio y bitácora |  |

## 3. Registro, caja y antifraude

El flujo en caja es lo que hace único al producto; el escáner es la cuarta decisión ★.

Registro del cliente

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Datos que se piden | Nombre y teléfono obligatorios; correo y cumpleaños opcionales |  |
| Identificador único | Teléfono, verificado con un código |  |
| Link de la etiqueta NFC | Uno por sucursal |  |
| Si ya tiene cuenta | Se reconoce el teléfono y se le vuelve a entregar su tarjeta |  |
| Consentimientos | Privacidad obligatoria; promociones en una casilla aparte |  |

Flujo en caja

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| ★ Con qué se escanea el QR | Tablet o celular fijo en el mostrador, viendo hacia el cliente, con la página de escáner abierta |  |
| Cómo se empareja escáner y caja | Un código de emparejamiento, una sola vez, desde el dashboard |  |
| Ventana entre escaneo y cobro | 5 minutos, antes o después de pagar |  |
| Dos cobros seguidos | Cada escaneo se usa una sola vez y cada cobro se asigna una sola vez |  |
| Sin internet | El escaneo no se registra y la pantalla lo avisa |  |
| Pagos en efectivo | Fuera de la v1, salvo que el negocio tenga punto de venta integrado |  |
| Qué ve el cajero | Solo la confirmación en la pantalla del escáner; nada editable |  |

Antifraude

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Límite por cliente | Máximo de compras con puntos al día, configurable |  |
| Tarjetas sospechosas | Alerta cuando una tarjeta acumula muchas más compras que el promedio |  |
| Empleados | Sus teléfonos se registran y quedan excluidos o marcados |  |
| Bitácora | Cada escaneo guarda sucursal, caja, dispositivo y hora |  |

## 4. Integraciones, pases y notificaciones

La primera integración es la quinta decisión ★ y depende de con qué cobra el negocio piloto.

Integraciones

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| ★ Primeras integraciones | Mercado Pago Point y Clip, sujeto a lo que use el piloto |  |
| Quién conecta la cuenta del negocio | Tú, durante el alta del negocio |  |
| Negocio sin sistema integrado | Tarjeta de sellos por visita hasta que exista su integración |  |
| Segunda etapa | Puntos de venta de restaurantes, como Parrot y Soft Restaurant |  |

Pases de Wallet

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Cuenta de Apple Developer | A nombre de la empresa de Loyaloop. Las cuentas de organización piden entidad legal y número D-U-N-S |  |
| Certificado de pases | Uno solo para todos los negocios; el nombre de cada negocio va en su pase |  |
| Campos por tipo de tarjeta | Frente: saldo o sellos y nivel. Reverso: reglas, contacto y novedades |  |
| Qué personaliza el negocio | Logo, colores e imagen principal |  |
| Contenido del QR | Un identificador aleatorio, sin datos personales |  |

Notificaciones

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Eventos que avisan | Puntos ganados, recompensa disponible, cambio de nivel y puntos por vencer |  |
| Canales en la v1 | Solo Wallet; WhatsApp o SMS después |  |
| Promociones del negocio | Sí, con un límite mensual por negocio |  |
| Avisos por ubicación | Opcionales por negocio |  |
| Modo discreto | Sí: nombre neutro en el pase y sin avisos por ubicación, para giros como moteles |  |

## 5. Dashboard, datos, legal y técnico

Las métricas se definen ahora porque deciden qué datos se guardan desde el primer día.

Dashboard y datos

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Métricas del negocio | Clientes nuevos y activos, visitas, gasto promedio, puntos emitidos y canjeados, recompensas canjeadas |  |
| Exportar clientes | Sí, en CSV, solo el dueño |  |
| De quién son los datos | Del negocio; Loyaloop los procesa por su cuenta |  |
| Si un negocio cancela | Puede exportar sus datos y se borran después de un plazo |  |
| Tu panel global | Negocios activos, pases emitidos, transacciones y errores de integración |  |

Legal

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Aviso de privacidad y términos | Para negocios y para clientes finales, revisados por un abogado antes de lanzar |  |
| Contrato con los negocios | Una plantilla única |  |
| Facturación | Definir quién factura y desde qué empresa |  |

Técnico

Estas las propone Claude y tú las apruebas.

| Decisión | Recomendación | Tu respuesta |
| --- | --- | --- |
| Tecnologías | Un solo proyecto con web y backend, y base de datos PostgreSQL |  |
| Dominios | El dominio principal y un subdominio corto para los links de registro |  |
| Ambientes | Pruebas y producción separados |  |
| Respaldos | Diarios, automáticos y guardados fuera del VPS |  |
| Idioma y moneda | Español y pesos mexicanos en la v1 |  |

## 6. Qué diseñar de UI

Son seis grupos, en orden de prioridad; con los tres primeros, más el resumen y los clientes del dashboard, Claude puede derivar el resto. Marca cada pantalla al terminarla.

Sistema de diseño (primero)

- [ ] Logo, colores, tipografías y espaciados
- [ ] Componentes: botones, campos, tablas, tarjetas, menús, modales y avisos
- [ ] Estados: vacío, cargando y error
Cliente final, en celular

- [ ] Registro al tocar la NFC
- [ ] Verificación con código
- [ ] Agregar a Apple Wallet
- [ ] Ya tengo cuenta y recuperar mi tarjeta
Pases de Wallet

- [ ] Tarjeta de puntos, frente y reverso
- [ ] Tarjeta de sellos, frente y reverso
- [ ] Tarjeta de recompensas, frente y reverso
- [ ] Tarjeta de niveles, frente y reverso
Los pases se diseñan dentro de la plantilla fija de Apple: eliges colores, logo, imagen y campos, no la distribución.

Dashboard del negocio

- [ ] Inicio de sesión
- [ ] Resumen con métricas
- [ ] Clientes: lista y detalle con historial
- [ ] Actividad y transacciones
- [ ] Tarjeta y reglas, con vista previa del pase
- [ ] Recompensas
- [ ] Notificaciones y promociones
- [ ] Sucursales, cajas y dispositivos
- [ ] Integraciones
- [ ] Equipo y permisos
- [ ] Configuración y plan
Escáner en caja

- [ ] Pantalla de espera
- [ ] Cliente identificado y puntos ganados
- [ ] Canje de recompensa
- [ ] Errores: QR inválido y sin conexión
Landing page

- [ ] Página principal: qué es, cómo funciona, tipos de tarjeta, precios y contacto
Tu panel de administrador no necesita diseño pantalla por pantalla: Claude lo construye con el sistema de diseño.

## 7. Cómo entregar todo y orden de trabajo

El backend puede empezar cuando las secciones 1 a 5 estén cerradas; el diseño avanza en paralelo.

Cierra las cinco decisiones ★ (secciones 1, 3 y 4).

Cierra el resto de las secciones 1 a 5.

Diseña el sistema de diseño y las pantallas del cliente final.

Crea el repositorio en GitHub y guarda ahí este documento exportado en Markdown.

Exporta cada pantalla de Figma como imagen a una carpeta diseno/ del repositorio, con nombres como dashboard-clientes.png.

En VS Code, Claude construye el backend a partir del documento y después conecta tu UI.

Se publica en el VPS de Hostinger, con respaldos automáticos desde el primer día.

Pendientes que no dependen del código y conviene iniciar ya, porque tardan:

- [ ] Cuenta de Apple Developer a nombre de la empresa
- [ ] Cuentas de desarrollador en Mercado Pago y Clip
- [ ] Confirmar con qué cobra el negocio piloto
- [ ] Abogado para aviso de privacidad y términos
