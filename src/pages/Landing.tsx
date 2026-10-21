import { useState, type FormEvent, type MouseEvent, type ReactNode } from "react"
import * as api from "../lib/api"
import { href } from "../lib/router"
import RoiCalculator from "../components/RoiCalculator"
import { Button, Icon, Logo, asset, type IconName } from "../components/ui"

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** In-page links: the hash is used by the router, so scroll by script. */
function Jump({ to, children, className, onDone }: { to: string; children: ReactNode; className?: string; onDone?: () => void }) {
  return (
    <a
      href={`#/`}
      className={className}
      onClick={(e: MouseEvent) => {
        e.preventDefault()
        scrollToId(to)
        onDone?.()
      }}
    >
      {children}
    </a>
  )
}

function LoyaltyCard() {
  return (
    <div className="loyalty-card">
      <div className="card-brand">
        <span>
          <Icon name="coffee" size={21} /> goodthings
        </span>
        <span>CAFÉ Y BUENA COMPAÑÍA</span>
      </div>
      <div className="card-title">
        Un poco de fidelidad.
        <br />
        Mucho buen café.
      </div>
      <div className="stamps">
        {Array.from({ length: 8 }, (_, i) => (
          <span className={i < 5 ? "stamped" : ""} key={i}>
            {i < 5 ? <Icon name="coffee" size={20} /> : i === 7 ? <Icon name="gift" size={20} /> : i + 1}
          </span>
        ))}
      </div>
      <div className="card-bottom">
        <span>Tu próximo café lo invitamos nosotros.</span>
        <span>5 / 8 sellos</span>
      </div>
    </div>
  )
}

const CARD_TYPES: [IconName, string, string][] = [
  ["star", "Puntos", "Suman según lo que gasta cada cliente, sin contar la propina."],
  ["coffee", "Sellos", "Una compra, un sello. Al completar la tarjeta, la recompensa es suya."],
  ["gift", "Recompensas", "Un catálogo de premios que se canjean con puntos en la misma caja."],
  ["layers", "Niveles", "Clientes que suben de nivel con su gasto del año y ganan más puntos."],
]

const FAQ: [string, string][] = [
  ["¿Mis clientes tienen que descargar una app?", "No. Tocan la etiqueta NFC de tu mostrador (o escanean su QR), escriben su nombre y guardan la tarjeta en Apple Wallet o Google Wallet. No piden su celular."],
  ["¿El cajero tiene que capturar algo?", "No. El cliente muestra el QR de su tarjeta y paga como siempre. LoyaLoop recibe el cobro de tu terminal y suma los puntos solo, sin que nadie escriba montos."],
  ["¿Con qué terminales funciona?", "Empezamos con Mercado Pago Point y después Clip. Si tu tarjeta es de sellos, también puede sumar un sello por visita sin terminal conectada."],
  ["¿Puedo personalizar mi tarjeta?", "Sí. Usamos tu logo, tus colores y las reglas que quieras: cuántos puntos da cada compra, compra mínima, vencimiento, bonos de bienvenida y cumpleaños."],
  ["¿Funciona con varias sucursales?", "Sí. Cada sucursal tiene su etiqueta, sus cajas y su escáner, y ves todo junto o por sucursal en tu panel. Se cobra por sucursal."],
]

export default function Landing() {
  const [mobileMenu, setMobileMenu] = useState(false)
  const [faq, setFaq] = useState<number | null>(0)
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [sending, setSending] = useState(false)

  async function scheduleCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formEl = event.currentTarget
    const values = new FormData(formEl)
    const get = (key: string) => String(values.get(key) || "").trim()
    setSending(true)
    setStatus(null)
    try {
      await api.submitLead({
        name: get("name"),
        company: get("company"),
        email: get("email"),
        phone: get("phone"),
        branches: get("branches"),
        preferredDate: get("preferredDate"),
        preferredTime: get("preferredTime"),
        notes: get("notes"),
      })
      formEl.reset()
      setStatus({ tone: "ok", text: "¡Gracias! Recibimos tu solicitud. Te escribiremos para confirmar la fecha de la llamada." })
    } catch (e) {
      setStatus({ tone: "error", text: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const agenda = () => scrollToId("agenda")

  return (
    <div className="landing">
      <header className="site-header container">
        <Logo />
        <nav className={mobileMenu ? "open" : ""} aria-label="Secciones">
          <Jump to="how-it-works" onDone={() => setMobileMenu(false)}>
            Cómo funciona
          </Jump>
          <Jump to="features" onDone={() => setMobileMenu(false)}>
            Funciones
          </Jump>
          <Jump to="calculadora" onDone={() => setMobileMenu(false)}>
            Calculadora
          </Jump>
          <Jump to="pricing" onDone={() => setMobileMenu(false)}>
            Precio
          </Jump>
          <Jump to="faq" onDone={() => setMobileMenu(false)}>
            Preguntas
          </Jump>
          <Jump to="agenda" className="mobile-only-link" onDone={() => setMobileMenu(false)}>
            Agenda una llamada
          </Jump>
          <a className="mobile-only-link" href={href("/login")}>
            Iniciar sesión
          </a>
        </nav>
        <div className="header-actions">
          <a className="login-link" href={href("/login")}>
            Iniciar sesión <Icon name="arrow" size={16} />
          </a>
          <Button onClick={agenda}>
            Agenda una llamada <Icon name="arrow" size={16} />
          </Button>
        </div>
        <button className="menu-button" aria-label={mobileMenu ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}>
          <Icon name={mobileMenu ? "close" : "menu"} />
        </button>
      </header>
      <main>
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> TARJETAS DE LEALTAD EN APPLE WALLET Y GOOGLE WALLET
            </div>
            <h1>
              Dales un motivo
              <br />
              para volver.
              <br />
              <em>Y volver.</em>
            </h1>
            <p>Tus clientes guardan tu tarjeta en su Wallet con un toque y suman puntos solos cada vez que pagan. Sin apps, sin papel y sin que el cajero capture nada.</p>
            <div className="hero-actions">
              <Button onClick={agenda}>
                Agenda una llamada <Icon name="arrow" size={18} />
              </Button>
              <Button secondary onClick={() => scrollToId("how-it-works")}>
                Ver cómo funciona
              </Button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden>
            <div className="visual-orbit" />
            <div className="ll-landing-nfc">
              <span className="ll-nfc-mark">
                <Icon name="nfc" size={34} />
              </span>
              <strong>Toca y únete.</strong>
              <span>Acerca tu celular a la etiqueta del mostrador para crear tu tarjeta.</span>
            </div>
            <div className="phone">
              <div className="phone-top">
                <span>9:41</span>
                <div>
                  <span className="signal">▮▮▮</span> <span className="battery" />
                </div>
              </div>
              <div className="phone-camera" />
              <div className="wallet-heading">
                <span>Wallet</span>
                <span className="wallet-add">+</span>
              </div>
              <LoyaltyCard />
              <div className="phone-details">
                <div>
                  <span className="mini-coffee">
                    <Icon name="coffee" size={18} />
                  </span>
                  <span>
                    <strong>Un café por nuestra cuenta.</strong>
                    <small>Solo 3 visitas más para tu recompensa.</small>
                  </span>
                </div>
                <div className="progress-track">
                  <div />
                </div>
                <div className="wallet-qr">
                  {Array.from({ length: 49 }, (_, i) => (
                    <i key={i} className={(i * 7 + Math.floor(i / 7) * 3) % 5 < 3 ? "filled" : ""} />
                  ))}
                </div>
                <span className="scan-copy">Escanea. Disfruta. Repite.</span>
              </div>
              <div className="phone-home" />
            </div>
            <div className="reward-toast">
              <span className="toast-icon">
                <Icon name="gift" size={22} />
              </span>
              <span>
                <strong>+45 puntos</strong>
                <small>Se sumaron al pagar en caja.</small>
              </span>
              <span className="toast-spark">
                <Icon name="spark" size={17} />
              </span>
            </div>
            <div className="loyalty-note">
              <svg width="52" height="43" viewBox="0 0 52 43" fill="none">
                <path d="M48 3C44 32 20 41 5 24m0 0 3 13M5 24l13-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>
                Pequeña tarjeta.
                <br />
                Vínculos duraderos.
              </span>
            </div>
            <span className="visual-spark spark-one">
              <Icon name="spark" size={39} />
            </span>
            <span className="visual-spark spark-two">
              <Icon name="spark" size={24} />
            </span>
          </div>
        </section>

        <section className="trust-section container">
          <div className="trust-label">PARA ESOS LUGARES A LOS QUE SIEMPRE QUEREMOS VOLVER</div>
          <div className="business-types">
            <span>
              <Icon name="coffee" /> Cafeterías
            </span>
            <i />
            <span>
              <Icon name="heart" /> Hoteles
            </span>
            <i />
            <span>
              <Icon name="spark" /> Salones y estudios
            </span>
            <i />
            <span>
              <Icon name="gift" /> Tiendas locales
            </span>
            <i />
            <span>
              <Icon name="store" /> Tu negocio
            </span>
          </div>
        </section>

        <section id="how-it-works" className="how-section section container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MENOS COMPLICACIONES. MÁS CLIENTES HABITUALES.</span>
              <h2>
                Fidelizar puede ser <em>un placer.</em>
              </h2>
            </div>
            <p>Sin tarjetas de papel perdidas. Sin apps que descargar. Solo una tarjeta que vive en el celular de tus clientes.</p>
          </div>
          <div className="steps-grid">
            <article>
              <div className="step-visual create-visual">
                <div className="mini-loyalty">
                  <span>tu negocio, tu tarjeta</span>
                  <Icon name="spark" size={30} />
                  <div className="mini-stamps">● ● ● ○ ○ ○</div>
                </div>
                <span className="color-swatches">
                  <i />
                  <i />
                  <i />
                  <Icon name="check" size={12} />
                </span>
              </div>
              <div className="step-heading">
                <span>01</span>
                <h3>Dale tu estilo</h3>
              </div>
              <p>Diseñamos contigo tu tarjeta con tu logo, tus colores y tus reglas: puntos, sellos, recompensas o niveles.</p>
            </article>
            <article>
              <div className="step-visual share-visual">
                <div className="qr-sheet">
                  <span>Aquí empieza algo bueno.</span>
                  <span className="ll-nfc-sheet">
                    <Icon name="nfc" size={54} />
                  </span>
                  <small>TOCA PARA UNIRTE</small>
                </div>
                <span className="floating-label">
                  <Icon name="check" size={15} /> Agregada a la Wallet
                </span>
              </div>
              <div className="step-heading">
                <span>02</span>
                <h3>Tus clientes se unen con un toque</h3>
              </div>
              <p>Acercan su celular a la etiqueta NFC del mostrador, escriben su nombre y guardan la tarjeta en Apple Wallet o Google Wallet.</p>
            </article>
            <article>
              <div className="step-visual grow-visual">
                <div className="growth-mini">
                  <span>
                    <Icon name="chart" size={16} /> Clientes que vuelven
                  </span>
                  <strong>Tu panel</strong>
                  <div className="mini-bars">
                    {[30, 42, 36, 54, 47, 64, 78, 94].map((h, i) => (
                      <i key={i} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <span className="tiny-heart">
                  <Icon name="heart" size={20} />
                </span>
              </div>
              <div className="step-heading">
                <span>03</span>
                <h3>Pagan y suman solos</h3>
              </div>
              <p>Muestran su QR en la caja y pagan como siempre. Los puntos llegan a su tarjeta y tú ves cada visita en tu panel.</p>
            </article>
          </div>
        </section>

        <section className="container" style={{ marginBottom: 96 }}>
          <div className="ll-auto-section">
            <div>
              <span className="eyebrow ll-eyebrow-light">SIN CAPTURA MANUAL</span>
              <h2>Los puntos se suman solos. Nadie los puede regalar.</h2>
              <p>LoyaLoop se conecta con tu terminal de cobro. Cuando el cliente escanea su tarjeta y paga, el monto llega directo de la terminal: el cajero no escribe cantidades y no hay forma de inflar puntos.</p>
            </div>
            <div className="ll-auto-flow">
              <div>
                <Icon name="qr" size={22} />
                <span>
                  <b>1. El cliente escanea su tarjeta</b>
                  En la tablet o el lector de la caja, antes o después de pagar.
                </span>
              </div>
              <div>
                <Icon name="card" size={22} />
                <span>
                  <b>2. Paga en tu terminal</b>
                  Mercado Pago Point hoy; Clip después. La propina no cuenta.
                </span>
              </div>
              <div>
                <Icon name="check" size={22} />
                <span>
                  <b>3. LoyaLoop une escaneo y cobro</b>
                  Si hay dudas, el cobro espera a que el gerente lo asigne.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="feature-section">
          <div className="container feature-inner">
            <div className="feature-preview" aria-hidden>
              <div className="feature-dashboard">
                <div className="preview-top">
                  <Logo />
                  <span>Resumen del negocio</span>
                </div>
                <div className="preview-welcome">Lo bueno sigue creciendo.</div>
                <div className="preview-metrics">
                  <div>
                    <small>Clientes con tarjeta</small>
                    <strong>1,284</strong>
                    <span>Ejemplo</span>
                  </div>
                  <div>
                    <small>Recompensas canjeadas</small>
                    <strong>342</strong>
                    <span>Ejemplo</span>
                  </div>
                </div>
                <div className="preview-chart">
                  <span>Visitas por día</span>
                  <svg viewBox="0 0 360 100">
                    <path d="M0 88 30 81 60 85 90 65 120 72 150 48 180 55 210 30 240 39 270 19 300 28 330 10 360 3" fill="none" stroke="currentColor" strokeWidth="3" />
                  </svg>
                </div>
              </div>
              <div className="feature-badge">
                <Icon name="heart" /> Pensado para personas, no solo para puntos.
              </div>
            </div>
            <div className="feature-copy">
              <span className="eyebrow">PEQUEÑOS NEGOCIOS. GRANDES POSIBILIDADES.</span>
              <h2>
                Un poco más de fidelidad.
                <br />
                Muchas más <em>posibilidades.</em>
              </h2>
              <p>Tú pones lo mejor de tu negocio. Nosotros ayudamos a que tus clientes sigan volviendo.</p>
              {(
                [
                  ["card", "Tu marca, en su bolsillo", "La tarjeta vive en Apple Wallet y Google Wallet con tu logo y tus colores."],
                  ["bell", "Avisos que sí se ven", "Puntos ganados, recompensas disponibles y puntos por vencer llegan a la pantalla del celular."],
                  ["chart", "Descubre qué funciona", "Visitas, clientes que vuelven y canjes por sucursal en un panel claro."],
                  ["shield", "Control para tu equipo", "Roles de dueño, gerente y cajero, y alertas de tarjetas con actividad sospechosa."],
                ] as [IconName, string, string][]
              ).map(([icon, title, desc]) => (
                <div className="feature-item" key={title}>
                  <span>
                    <Icon name={icon} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section container">
          <span className="eyebrow">UN PROGRAMA PARA CADA NEGOCIO</span>
          <h2 className="mt-4">Cuatro formas de volver.</h2>
          <div className="product-reward-grid">
            {CARD_TYPES.map(([icon, title, description]) => (
              <article className="product-reward" key={title}>
                <Icon name={icon} size={28} />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="calculadora" className="section container ll-calc-section">
          <span className="eyebrow">HAZ LAS CUENTAS</span>
          <h2>
            ¿Cuánto vale que <em>vuelvan una vez más?</em>
          </h2>
          <p className="ll-calc-lead">Mueve los números de tu negocio y ve cuánto suman unas pocas visitas extra al mes.</p>
          <RoiCalculator onCall={agenda} />
        </section>

        <section id="pricing" className="section container pricing-section">
          <span className="eyebrow">UN PRECIO JUSTO. SIN SORPRESAS.</span>
          <h2>
            Pequeña inversión.
            <br />
            <em>Relaciones duraderas.</em>
          </h2>
          <p>Un solo plan. Pagas por cada sucursal activa, cada mes.</p>
          <div className="ll-price-single">
            <div>
              <h3>Por sucursal</h3>
              <p>Te damos el precio en la llamada según tu número de sucursales. Sin costo por cliente y sin permanencia forzosa.</p>
              <Button onClick={agenda} className="mt-5">
                Agenda una llamada <Icon name="arrow" size={16} />
              </Button>
            </div>
            <ul>
              {[
                "Tarjeta con tu marca en Apple Wallet y Google Wallet",
                "Clientes ilimitados",
                "Etiqueta NFC y escáner para cada caja",
                "Conexión con tu terminal de cobro",
                "Panel para dueño, gerentes y cajeros",
                "Configuración y soporte de LoyaLoop",
              ].map((f) => (
                <li key={f}>
                  <Icon name="check" size={18} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="about" className="about-section container">
          <div className="about-symbol">
            <img src={asset("brand/loyaloop-symbol.svg")} className="brand-symbol" alt="" />
          </div>
          <div>
            <span className="eyebrow">CONOCE UN POCO MÁS A LOYALOOP</span>
            <h2>
              Detrás de cada negocio local,
              <br />
              hay <em>mucho corazón.</em>
            </h2>
            <p>Creemos que los mejores negocios no solo venden. Alegran el día, recuerdan un nombre y unen a todo un barrio. LoyaLoop te ayuda a convertir esos momentos cotidianos en relaciones duraderas.</p>
            <p>Nuestra misión es sencilla: dar a los negocios independientes las herramientas para crecer sin perder lo que los hace especiales.</p>
            <Jump to="agenda" className="text-link accent-link">
              Agenda una llamada <Icon name="arrow" size={18} />
            </Jump>
          </div>
        </section>

        <section id="faq" className="faq-section container section">
          <div>
            <span className="eyebrow">ALGUNAS BUENAS PREGUNTAS</span>
            <h2>
              Nos encanta que <em>preguntes.</em>
            </h2>
            <p>
              ¿Tienes otra duda?
              <br />
              <Jump to="agenda">Agenda una llamada con nuestro equipo.</Jump>
            </p>
          </div>
          <div className="faq-list">
            {FAQ.map(([q, a], i) => (
              <div className="faq-item" key={q}>
                <button onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}>
                  {q}
                  <Icon name={faq === i ? "close" : "plus"} size={18} />
                </button>
                {faq === i && <p>{a}</p>}
              </div>
            ))}
          </div>
        </section>

        <section id="agenda" className="call-section container">
          <div className="call-copy">
            <span className="eyebrow">CONOCE LOYALOOP</span>
            <h2>Agenda una llamada para conocer el producto.</h2>
            <p>Cuéntanos sobre tu negocio. Revisaremos tus necesidades y te mostraremos cómo LoyaLoop puede ayudarte a que tus clientes regresen.</p>
            <ul>
              <li>
                <Icon name="check" size={17} />
                Recorrido personalizado por el producto
              </li>
              <li>
                <Icon name="check" size={17} />
                Precio para tu número de sucursales
              </li>
              <li>
                <Icon name="check" size={17} />
                Revisión de tu terminal de cobro
              </li>
            </ul>
            <div className="call-note">
              <Icon name="clock" size={18} />
              <span>Te escribimos para confirmar la fecha y la hora.</span>
            </div>
          </div>
          <form className="call-form" onSubmit={scheduleCall}>
            <div className="owner-form-grid">
              <label>
                Nombre <span>*</span>
                <input name="name" autoComplete="name" required />
              </label>
              <label>
                Negocio <span>*</span>
                <input name="company" autoComplete="organization" required />
              </label>
            </div>
            <div className="owner-form-grid">
              <label>
                Correo electrónico <span>*</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Teléfono
                <input name="phone" type="tel" autoComplete="tel" />
              </label>
            </div>
            <label>
              Número de sucursales
              <select name="branches" defaultValue="1 sucursal">
                <option>1 sucursal</option>
                <option>2 a 5 sucursales</option>
                <option>6 a 10 sucursales</option>
                <option>Más de 10 sucursales</option>
              </select>
            </label>
            <div className="owner-form-grid">
              <label>
                Fecha preferida <span>*</span>
                <input name="preferredDate" type="date" min={new Date().toISOString().slice(0, 10)} required />
              </label>
              <label>
                Horario preferido <span>*</span>
                <select name="preferredTime" defaultValue="" required>
                  <option value="" disabled>
                    Elige un horario
                  </option>
                  <option>Mañana · 9:00 a 12:00</option>
                  <option>Tarde · 12:00 a 17:00</option>
                </select>
              </label>
            </div>
            <label>
              ¿Qué te gustaría conocer?
              <textarea name="notes" rows={3} maxLength={500} placeholder="Cuéntanos sobre tu negocio o tus preguntas." />
            </label>
            <label className="product-checkbox">
              <input type="checkbox" required />
              <span>
                Acepto que LoyaLoop use estos datos para contactarme sobre esta solicitud. <a href={href("/legal")}>Consultar privacidad</a>
              </span>
            </label>
            <Button type="submit" loading={sending}>
              Solicitar llamada <Icon name="arrow" size={18} />
            </Button>
            {status && (
              <p className={`call-form-message ${status.tone === "error" ? "is-error" : ""}`} role={status.tone === "error" ? "alert" : "status"}>
                {status.text}
              </p>
            )}
          </form>
        </section>
      </main>
      <footer className="site-footer container">
        <div>
          <Logo />
          <p>Un poco de fidelidad hace mucho.</p>
        </div>
        <div>
          <Jump to="how-it-works">Cómo funciona</Jump>
          <Jump to="pricing">Precio</Jump>
          <Jump to="faq">Preguntas</Jump>
          <a href={href("/legal")}>Privacidad y términos</a>
          <a href={href("/login")}>Iniciar sesión</a>
        </div>
        <span>© {new Date().getFullYear()} LoyaLoop. Hecho para negocios con corazón.</span>
      </footer>
    </div>
  )
}
