import type { ReactNode } from "react"
import * as api from "../lib/api"
import { useAsync } from "../lib/hooks"
import { LOYALOOP_LEGAL, loyaloopName } from "../lib/legal"
import { Loading, Logo } from "../components/ui"

/** Customer-facing facts the card notice needs; generic when no business is known. */
type Holder = { responsible: string; address: string; email: string; askPhone: boolean; promotions: boolean }

const GENERIC: Holder = { responsible: "", address: "", email: "", askPhone: true, promotions: true }

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function Toc({ items }: { items: [string, string][] }) {
  return (
    <nav className="ll-legal-toc" aria-label="Contenido">
      {items.map(([id, label]) => (
        <button key={id} type="button" onClick={() => scrollTo(id)}>
          {label}
        </button>
      ))}
    </nav>
  )
}

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="ll-legal-part">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Rights({ email, who }: { email: string; who: string }) {
  return (
    <>
      <h3>Tus derechos (ARCO) y cómo revocar tu consentimiento</h3>
      <p>
        Puedes pedir acceso a tus datos, corregirlos, cancelarlos u oponerte a su uso, y también revocar tu consentimiento. Escribe a{" "}
        {email ? <a href={`mailto:${email}`}>{email}</a> : who} con:
      </p>
      <ul>
        <li>Tu nombre y un medio para responderte.</li>
        <li>Qué derecho quieres ejercer y sobre qué datos.</li>
        <li>Algo que muestre que los datos son tuyos; por ejemplo, el código que aparece debajo del QR de tu tarjeta.</li>
      </ul>
      <p>
        Te respondemos en un máximo de 20 días y, si procede, lo hacemos efectivo dentro de los 15 días siguientes. Estos plazos pueden ampliarse una sola vez
        por un periodo igual cuando el caso lo justifique. Es gratis. Si no estás de acuerdo con la respuesta, puedes acudir a la Secretaría Anticorrupción y
        Buen Gobierno, autoridad en materia de protección de datos personales.
      </p>
    </>
  )
}

function Providers() {
  return (
    <ul>
      <li>Hostinger: servidores donde vive la plataforma.</li>
      <li>Cloudflare: red, seguridad y copias de respaldo.</li>
      <li>Apple y Google: entregan y actualizan el pase en tu Wallet.</li>
      <li>Resend y Zoho: envío de correos.</li>
    </ul>
  )
}

/** Notice for the people who carry a card. The business is responsible; LoyaLoop is the processor. */
function HolderNotice({ h }: { h: Holder }) {
  const business = h.responsible || "el negocio que te dio la tarjeta"
  return (
    <>
      <h3>Quién es responsable de tus datos</h3>
      <p>
        {h.responsible ? (
          <>
            <b>{h.responsible}</b>
            {h.address ? `, con domicilio en ${h.address},` : ""} es responsable
          </>
        ) : (
          "El negocio donde te registras es responsable"
        )}{" "}
        de tus datos personales. {loyaloopName()} opera la plataforma por cuenta de {h.responsible ? "ese negocio" : "él"}, como persona encargada, y solo usa
        tus datos para lo que se describe aquí.
      </p>

      <h3>Qué datos usamos</h3>
      <ul>
        <li>
          <b>Identificación y contacto:</b> tu nombre o un apodo; tu correo, si lo das; tu fecha de cumpleaños (día y mes), si la das
          {h.askPhone ? "; y tu número de celular, que confirmamos con un código" : ""}.
        </li>
        <li>
          <b>Consumo en el negocio:</b> fecha, hora, sucursal y caja de tus visitas y compras, el monto pagado sin propina, tus puntos, sellos, nivel, canjes y
          devoluciones.
        </li>
        <li>
          <b>Técnicos:</b> el identificador de tu tarjeta, los identificadores que Apple o Google asignan para actualizar tu pase, y la dirección IP y fecha de
          los accesos, por seguridad.
        </li>
      </ul>
      <p>
        No usamos datos sensibles ni datos financieros o patrimoniales. No recibimos los datos de tu tarjeta bancaria: de la terminal del negocio solo llega el
        monto y la hora del cobro. El código QR de tu pase es un identificador aleatorio.
      </p>

      <h3>Para qué los usamos</h3>
      <p>Finalidades necesarias para darte la tarjeta:</p>
      <ul>
        <li>Crear y administrar tu tarjeta.</li>
        <li>Sumar y canjear tus puntos, sellos y recompensas, y calcular tu nivel.</li>
        <li>Unir el cobro de la terminal del negocio con tu tarjeta cuando la escaneas al pagar.</li>
        <li>Actualizar tu pase y enviarte avisos sobre tu saldo, recompensas, nivel, vencimientos, bienvenida y cumpleaños.</li>
        <li>Mandarte un enlace para recuperar tu tarjeta, si diste tu correo.</li>
        <li>Prevenir el uso indebido de las tarjetas: límites diarios, alertas y registro de cada escaneo.</li>
        <li>Atender tus solicitudes y cumplir obligaciones legales.</li>
      </ul>
      <p>
        Finalidad que requiere tu consentimiento: {h.promotions ? "enviarte a tu tarjeta las promociones del negocio, solo si marcaste la casilla al registrarte" : "enviarte a tu tarjeta promociones del negocio, solo si lo aceptas"}.
        Puedes negarte o cambiar de opinión cuando quieras, y tu tarjeta seguirá funcionando igual.
      </p>

      <h3>Con quién se comparten</h3>
      <p>
        No vendemos tus datos ni los compartimos con otros negocios. Para operar el servicio, {loyaloopName()} se apoya en proveedores que los tratan por su
        cuenta y con las mismas obligaciones de confidencialidad:
      </p>
      <Providers />
      <p>
        Algunos de estos proveedores procesan información fuera de México. Solo entregaremos tus datos a una autoridad cuando una ley o una orden lo exija.
      </p>

      <h3>Cómo limitar su uso</h3>
      <ul>
        <li>Pide que dejen de enviarte promociones; los avisos de tu saldo seguirán llegando.</li>
        <li>Apaga las notificaciones del pase desde tu Wallet, o elimínalo.</li>
        <li>Pide que borren tu tarjeta. Eliminar el pase de tu Wallet no la borra.</li>
      </ul>

      <Rights email={h.email} who={business} />

      <h3>Cuánto tiempo los guardamos</h3>
      <p>
        Mientras tu tarjeta exista. Si pides borrarla, o si el negocio deja de usar {loyaloopName()}, tus datos se eliminan en un máximo de{" "}
        {LOYALOOP_LEGAL.retentionDays} días, salvo lo que una ley obligue a conservar.
      </p>

      <h3>Cookies y almacenamiento</h3>
      <p>No usamos cookies de publicidad ni de seguimiento. La página solo guarda lo técnico necesario para funcionar.</p>
    </>
  )
}

function HolderTerms({ business }: { business: string }) {
  return (
    <ul>
      <li>El programa de lealtad es de {business}. Sus reglas aparecen en tu tarjeta y el negocio puede cambiarlas; te avisará en tu pase.</li>
      <li>Los puntos, sellos y recompensas no tienen valor en dinero, no se cambian por efectivo y no se transfieren a otra persona.</li>
      <li>Los puntos pueden vencer según las reglas del negocio, que verás en tu tarjeta. Si devuelves una compra, se restan los puntos que te dio.</li>
      <li>Las recompensas y promociones las otorga el negocio; cualquier duda o reclamación sobre ellas es con él.</li>
      <li>El negocio puede cancelar una tarjeta si detecta uso indebido.</li>
      <li>Apple Wallet y Google Wallet son marcas de sus dueños, que no patrocinan este programa.</li>
    </ul>
  )
}

function Updated() {
  return <p className="ll-legal-updated">Última actualización: {LOYALOOP_LEGAL.updated}.</p>
}

/** The notice a customer opens from the registration page: names that business. */
function CardNotice({ code }: { code: string }) {
  const notice = useAsync(() => api.privacyNotice(code), [code])
  if (notice.loading) return <Loading />
  if (notice.error || !notice.data) return <p>{notice.error || "Este enlace no corresponde a ninguna sucursal."}</p>
  const h = notice.data
  return (
    <>
      <h1>Aviso de privacidad de tu tarjeta</h1>
      <Updated />
      <Toc items={[["aviso", "Aviso de privacidad"], ["tarjeta", "Términos de la tarjeta"]]} />
      <Part id="aviso" title="Aviso de privacidad">
        <HolderNotice h={h} />
        <p>
          Si este aviso cambia, publicaremos la nueva versión en esta página con su fecha. Si llegáramos a usar tus datos para algo distinto, te pediremos tu
          consentimiento otra vez.
        </p>
      </Part>
      <Part id="tarjeta" title="Términos de la tarjeta">
        <HolderTerms business={h.responsible} />
      </Part>
    </>
  )
}

/** LoyaLoop's own notice (businesses, panel users, call requests) and terms. */
function LoyaloopNotice() {
  const name = loyaloopName()
  const email = LOYALOOP_LEGAL.email
  return (
    <>
      <h1>Aviso de privacidad y términos</h1>
      <Updated />
      <Toc
        items={[
          ["privacidad", "Aviso de privacidad de LoyaLoop"],
          ["clientes", "Clientes de las tarjetas"],
          ["terminos", "Términos del servicio para negocios"],
          ["tarjeta", "Términos de la tarjeta"],
        ]}
      />

      <Part id="privacidad" title="Aviso de privacidad de LoyaLoop">
        <p>
          <b>{name}</b>
          {LOYALOOP_LEGAL.address ? `, con domicilio en ${LOYALOOP_LEGAL.address},` : ""} es responsable de los datos de las personas que solicitan
          información, contratan el servicio o usan el panel de LoyaLoop (dueños, gerentes y cajeros). Contacto: <a href={`mailto:${email}`}>{email}</a>.
        </p>
        <h3>Qué datos usamos</h3>
        <ul>
          <li>
            <b>Solicitudes de llamada:</b> nombre, negocio, correo, teléfono, número de sucursales, fecha y horario preferidos, y lo que nos cuentes.
          </li>
          <li>
            <b>Usuarios del panel:</b> nombre, correo, celular si lo das, rol, contraseña (guardada cifrada), registro de las acciones en el panel, y dirección IP
            y fecha de los accesos.
          </li>
          <li>
            <b>Negocios que contratan:</b> datos de contacto y de facturación, como razón social, RFC, domicilio fiscal y correo para facturas.
          </li>
        </ul>
        <p>No usamos datos sensibles. No guardamos datos de tarjetas bancarias.</p>
        <h3>Para qué los usamos</h3>
        <p>Finalidades necesarias:</p>
        <ul>
          <li>Responder tu solicitud y agendar la llamada.</li>
          <li>Dar el servicio, crear las cuentas del panel y darles acceso.</li>
          <li>Proteger las cuentas: sesiones, límites de intentos y bitácora de acciones.</li>
          <li>Dar soporte, cobrar, facturar y cumplir obligaciones legales.</li>
        </ul>
        <p>
          Finalidades que requieren tu consentimiento: enviarte novedades y promociones de LoyaLoop, y mencionar a tu negocio como cliente o caso de éxito (esto
          último, solo con tu autorización por escrito). Puedes negarte escribiendo a <a href={`mailto:${email}`}>{email}</a>, sin que cambie el servicio.
        </p>
        <h3>Con quién se comparten</h3>
        <p>No vendemos datos. Nos apoyamos en proveedores que los tratan por nuestra cuenta, algunos fuera de México:</p>
        <Providers />
        <p>
          Para el pago mensual usamos Mercado Pago: la tarjeta se captura en su página y la guarda Mercado Pago; LoyaLoop solo recibe el estado de cada cobro y el
          correo de la cuenta que paga.
        </p>
        <p>Solo entregaremos datos a una autoridad cuando una ley o una orden lo exija.</p>
        <Rights email={email} who={name} />
        <h3>Cookies y almacenamiento</h3>
        <p>
          Usamos una cookie de sesión, necesaria para que entres al panel. No usamos cookies de publicidad ni de seguimiento. La página puede guardar en tu
          navegador preferencias técnicas, como el uso de la cámara del escáner.
        </p>
        <h3>Cambios</h3>
        <p>Publicaremos cualquier cambio en esta página con su fecha. Si una nueva finalidad lo requiere, pediremos tu consentimiento otra vez.</p>
      </Part>

      <Part id="clientes" title="Clientes de las tarjetas">
        <p>
          Cuando te registras en la tarjeta de un negocio, ese negocio es el responsable de tus datos y LoyaLoop los trata por su cuenta. En la página de registro
          encuentras el aviso con los datos del negocio; este es su contenido general.
        </p>
        <HolderNotice h={GENERIC} />
      </Part>

      <Part id="terminos" title="Términos del servicio para negocios">
        <ol>
          <li>
            <b>Servicio.</b> {name} ofrece una plataforma para crear y operar programas de lealtad en Apple Wallet y Google Wallet. El plan, el precio y lo
            incluido son los de la propuesta o el plan que el negocio acepta.
          </li>
          <li>
            <b>Cuentas.</b> El negocio es responsable de sus usuarios, de cuidar sus contraseñas y de lo que se haga con ellas. Debe avisarnos si sospecha de un
            acceso indebido.
          </li>
          <li>
            <b>El programa es del negocio.</b> El negocio define las reglas, recompensas, vigencias y promociones, las informa a sus clientes y responde ante ellos
            por cumplirlas. LoyaLoop no es parte de esa relación comercial.
          </li>
          <li>
            <b>Datos de los clientes.</b> El negocio es responsable de los datos de sus clientes y {name} los trata como persona encargada: solo para operar el
            programa y según sus instrucciones, con confidencialidad y medidas de seguridad, sin usarlos para fines propios y sin venderlos. Los proveedores que
            usamos están listados en el aviso de privacidad. El negocio debe darnos su razón social, domicilio y un correo para el aviso de su tarjeta, y atender
            las solicitudes de sus clientes; nosotros le ayudamos.
          </li>
          <li>
            <b>Activación y pruebas.</b> Una cuenta creada desde la página queda por activar: el negocio puede diseñar su tarjeta, pero los clientes no
            pueden registrarse hasta que se reciba el primer pago. Si acordamos un periodo de prueba, al terminar sin que se active el pago la tarjeta deja de
            registrar clientes nuevos y de sumar visitas; el negocio puede activarla después y conserva su configuración.
          </li>
          <li>
            <b>Precio y pago.</b> Se paga por adelantado, cada mes o cada año según el plan; los impuestos que en su caso apliquen se suman al precio. El pago mensual puede
            hacerse en automático con tarjeta a través de Mercado Pago: al activarlo, el negocio autoriza un cargo cada mes, el mismo día, por el precio de su plan y sus
            sucursales, hasta que lo cancele desde su panel. Si un cobro no pasa, Mercado Pago lo reintenta; si 7 días después de terminar el mes pagado no se ha cubierto,
            la tarjeta deja de registrar clientes y de sumar visitas hasta que se pague. Los cambios de precio se avisan con 30 días de anticipación.
          </li>
          <li>
            <b>Cancelación.</b> El plan mensual no tiene plazo forzoso: se cancela cuando el negocio quiera y termina al final del periodo pagado. Los pagos anuales
            no se reembolsan de forma proporcional, salvo que el servicio falle de forma grave por causa nuestra.
          </li>
          <li>
            <b>Al terminar.</b> El negocio puede exportar la lista de sus clientes antes de irse. Pasados {LOYALOOP_LEGAL.retentionDays} días de la cancelación,
            borramos sus datos y los de sus clientes, salvo lo que una ley obligue a conservar.
          </li>
          <li>
            <b>Equipo.</b> Las etiquetas NFC y el material del kit se entregan al negocio. Los dispositivos de caja (tablet, celular o lector) los pone el negocio,
            salvo acuerdo distinto. La terminal de cobro y sus comisiones son un asunto entre el negocio y su proveedor de pagos.
          </li>
          <li>
            <b>Servicios de terceros.</b> El servicio depende de Apple, Google y, en su caso, del proveedor de la terminal. Si cambian sus reglas o dejan de estar
            disponibles, algunas funciones pueden cambiar.
          </li>
          <li>
            <b>Disponibilidad.</b> Hacemos lo razonable para que el servicio esté disponible y avisamos los mantenimientos programados. Hacemos respaldos diarios.
            No garantizamos un servicio sin interrupciones.
          </li>
          <li>
            <b>Uso correcto.</b> El negocio se compromete a no enviar promociones engañosas ni excesivas y a cumplir la Ley Federal de Protección al Consumidor y
            las demás leyes que apliquen a sus promociones.
          </li>
          <li>
            <b>Responsabilidad.</b> {name} no responde por daños indirectos ni por ganancias no obtenidas. Su responsabilidad total se limita a lo que el negocio
            pagó en los 3 meses anteriores al hecho que la origine.
          </li>
          <li>
            <b>Propiedad.</b> La plataforma es de {name}. El logo, la marca y el contenido del negocio son suyos; nos autoriza a usarlos solo para su tarjeta y su
            programa.
          </li>
          <li>
            <b>Confidencialidad.</b> Ambas partes guardan como confidencial la información de la otra que no sea pública.
          </li>
          <li>
            <b>Cambios.</b> Si estos términos cambian, los avisamos con 30 días de anticipación. Seguir usando el servicio después de esa fecha significa
            aceptarlos.
          </li>
          <li>
            <b>Ley aplicable.</b> Se rigen por las leyes federales de México. Para cualquier controversia, las partes se someten a los tribunales de la Ciudad de
            México.
          </li>
        </ol>
      </Part>

      <Part id="tarjeta" title="Términos de la tarjeta">
        <HolderTerms business="cada negocio" />
      </Part>
    </>
  )
}

export default function Legal({ code = "" }: { code?: string }) {
  return (
    <div style={{ background: "var(--ll-bg)", minHeight: "100vh" }}>
      <header className="ll-legal-head">
        <Logo size={140} />
      </header>
      <article className="ll-legal">
        {code ? <CardNotice code={code} /> : <LoyaloopNotice />}
        <p className="ll-hint">
          <a className="ll-link" href={code ? `#/r/${code}` : "#/"}>
            {code ? "Volver al registro" : "Volver al inicio"}
          </a>
        </p>
      </article>
    </div>
  )
}
