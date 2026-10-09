import { Icon, Logo, Button, type IconName } from "./components/ui"
import ProductModules from "./components/ProductModules"
import { demoGlobalMetrics } from "./components/demo-model"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"

const go = (path: string) => {
  window.location.hash = path
  window.scrollTo(0, 0)
}
const coffeePhoto =
  "https://images.unsplash.com/photo-1621135177072-57c9b6242e7a?auto=format&fit=crop&w=900&q=85"

function LoyaltyCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`loyalty-card ${compact ? "compact" : ""}`}>
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
            {i < 5 ? (
              <Icon name="coffee" size={20} />
            ) : i === 7 ? (
              <Icon name="gift" size={20} />
            ) : (
              i + 1
            )}
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

function Landing() {
  const [mobileMenu, setMobileMenu] = useState(false)
  const [faq, setFaq] = useState<number | null>(0)
  const [callRequest, setCallRequest] = useState("")
  function scheduleCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCallRequest("")
    const values = new FormData(event.currentTarget)
    const request = {
      name: String(values.get("name") || "").trim(),
      company: String(values.get("company") || "").trim(),
      email: String(values.get("email") || "").trim(),
      phone: String(values.get("phone") || "").trim(),
      teamSize: String(values.get("teamSize") || ""),
      preferredDate: String(values.get("preferredDate") || ""),
      preferredTime: String(values.get("preferredTime") || ""),
      notes: String(values.get("notes") || "").trim(),
      createdAt: new Date().toISOString(),
    }
    if (
      !request.name ||
      !request.company ||
      !request.email ||
      !request.preferredDate ||
      !request.preferredTime
    ) {
      setCallRequest(
        "Completa los campos obligatorios para solicitar la llamada.",
      )
      return
    }
    try {
      const previous = JSON.parse(
        localStorage.getItem("loyaloop-call-requests") || "[]",
      )
      localStorage.setItem(
        "loyaloop-call-requests",
        JSON.stringify([...(Array.isArray(previous) ? previous : []), request]),
      )
      event.currentTarget.reset()
      setCallRequest(
        "Hemos registrado tu solicitud en esta demostración. El equipo confirmará la fecha cuando conectemos el formulario al canal comercial.",
      )
    } catch {
      setCallRequest(
        "No pudimos guardar la solicitud en este navegador. Inténtalo nuevamente.",
      )
    }
  }
  return (
    <div className="landing">
      <header className="site-header container">
        <Logo />
        <nav className={mobileMenu ? "open" : ""}>
          <a href="#how-it-works" onClick={() => setMobileMenu(false)}>
            Cómo funciona
          </a>
          <a href="#features" onClick={() => setMobileMenu(false)}>
            Funciones
          </a>
          <a href="#pricing" onClick={() => setMobileMenu(false)}>
            Precios
          </a>
          <a href="#about" onClick={() => setMobileMenu(false)}>
            Nosotros
          </a>
        </nav>
        <div className="header-actions">
          <a className="login-link" href="#/login">
            Iniciar sesión <Icon name="arrow" size={16} />
          </a>
          <Button
            onClick={() =>
              document
                .querySelector("#agenda")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Agenda una llamada <Icon name="arrow" size={16} />
          </Button>
        </div>
        <button
          className="menu-button"
          aria-label="Abrir o cerrar navegación"
          onClick={() => setMobileMenu(!mobileMenu)}
        >
          <Icon name={mobileMenu ? "close" : "menu"} />
        </button>
      </header>
      <main>
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> BUENOS CLIENTES. GRANDES
              CONEXIONES.
            </div>
            <h1>
              Dales un motivo
              <br />
              para volver.
              <br />
              <em>Y volver.</em>
            </h1>
            <p>
              Convierte a quienes te visitan por primera vez en clientes
              habituales con
              <br className="desktop-br" /> tarjetas de fidelidad tan especiales
              como tu negocio.
            </p>
            <div className="hero-actions">
              <Button
                onClick={() =>
                  document
                    .querySelector("#agenda")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Agenda una llamada <Icon name="arrow" size={18} />
              </Button>
            </div>
            <Button secondary className="mt-5" onClick={() => go("/owner")}>
              <Icon name="grid" size={17} />
              Abrir mi panel de propietario
              <span className="text-xs opacity-60">Demo</span>
            </Button>
          </div>
          <div className="hero-visual">
            <div className="visual-orbit" />
            <div className="photo-card">
              <img
                src={coffeePhoto}
                alt="Un café recién preparado en una cafetería de barrio"
              />
              <div className="photo-caption">
                <span>Hecho para negocios como el tuyo.</span>
                <Icon name="heart" size={17} />
              </div>
            </div>
            <div className="phone">
              <div className="phone-top">
                <span>9:41</span>
                <div>
                  <span className="signal">▮▮▮</span>{" "}
                  <span className="battery" />
                </div>
              </div>
              <div className="phone-camera" />
              <div className="wallet-heading">
                <span>Mi cartera</span>
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
                <div
                  className="wallet-qr"
                  aria-label="Código QR decorativo de la tarjeta de fidelidad"
                >
                  {Array.from({ length: 49 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        (i * 7 + Math.floor(i / 7) * 3) % 5 < 3 ? "filled" : ""
                      }
                    />
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
                <strong>Un pequeño agradecimiento.</strong>
                <small>¡Te invitamos al próximo café!</small>
              </span>
              <span className="toast-spark">
                <Icon name="spark" size={17} />
              </span>
            </div>
            <div className="loyalty-note">
              <svg width="52" height="43" viewBox="0 0 52 43" fill="none">
                <path
                  d="M48 3C44 32 20 41 5 24m0 0 3 13M5 24l13-2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
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
          <div className="trust-label">
            PARA ESOS LUGARES A LOS QUE SIEMPRE QUEREMOS VOLVER
          </div>
          <div className="business-types">
            <span>
              <Icon name="coffee" /> Cafeterías
            </span>
            <i />
            <span className="bakery-icon">
              ♧ <b>Panaderías</b>
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
              <Icon name="heart" /> Tu negocio
            </span>
          </div>
        </section>
        <section id="how-it-works" className="how-section section container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                MENOS COMPLICACIONES. MÁS CLIENTES HABITUALES.
              </span>
              <h2>
                Fidelizar puede ser <em>un placer.</em>
              </h2>
            </div>
            <p>
              Sin tarjetas de papel perdidas. Sin apps complicadas.
              <br />
              Solo una forma sencilla de seguir conectando.
            </p>
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
              <p>
                Crea una tarjeta digital de fidelidad con la esencia de tu
                marca. Lista en minutos.
              </p>
            </article>
            <article>
              <div className="step-visual share-visual">
                <div className="qr-sheet">
                  <span>Aquí empieza algo bueno.</span>
                  <div className="fake-qr">
                    {Array.from({ length: 64 }, (_, i) => (
                      <i className={i % 3 !== 1 ? "filled" : ""} key={i} />
                    ))}
                  </div>
                  <small>ESCANEA PARA UNIRTE</small>
                </div>
                <span className="floating-label">
                  <Icon name="check" size={15} /> Añadida a la cartera
                </span>
              </div>
              <div className="step-heading">
                <span>02</span>
                <h3>Comparte algo bueno</h3>
              </div>
              <p>
                Tus clientes escanean un QR y guardan la tarjeta en Apple Wallet
                en Apple Wallet. Sin descargar apps.
              </p>
            </article>
            <article>
              <div className="step-visual grow-visual">
                <div className="growth-mini">
                  <span>
                    <Icon name="chart" size={16} /> Clientes que vuelven
                  </span>
                  <strong>
                    +32% <small>↑ este mes</small>
                  </strong>
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
                <h3>Haz crecer tu comunidad</h3>
              </div>
              <p>
                Premia cada visita, crea vínculos de verdad y descubre los
                resultados en tu panel.
              </p>
            </article>
          </div>
        </section>
        <section id="features" className="feature-section">
          <div className="container feature-inner">
            <div className="feature-preview">
              <div className="feature-dashboard">
                <div className="preview-top">
                  <Logo />
                  <span>Resumen del negocio</span>
                </div>
                <div className="preview-welcome">Lo bueno sigue creciendo.</div>
                <div className="preview-metrics">
                  <div>
                    <small>Miembros activos</small>
                    <strong>1.284</strong>
                    <span>↑ 18,6 % este mes</span>
                  </div>
                  <div>
                    <small>Recompensas canjeadas</small>
                    <strong>342</strong>
                    <span>↑ 24,2 % este mes</span>
                  </div>
                </div>
                <div className="preview-chart">
                  <span>Visitas de clientes</span>
                  <svg viewBox="0 0 360 100">
                    <path
                      d="M0 88 30 81 60 85 90 65 120 72 150 48 180 55 210 30 240 39 270 19 300 28 330 10 360 3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                  </svg>
                </div>
              </div>
              <div className="feature-badge">
                <Icon name="heart" /> Pensado para personas, no solo para
                puntos.
              </div>
            </div>
            <div className="feature-copy">
              <span className="eyebrow">
                PEQUEÑOS NEGOCIOS. GRANDES POSIBILIDADES.
              </span>
              <h2>
                Un poco más de fidelidad.
                <br />
                Muchas más <em>posibilidades.</em>
              </h2>
              <p>
                Tú pones lo mejor de tu negocio. Nosotros ayudamos a que tus
                clientes sigan volviendo.
              </p>
              {[
                [
                  "card",
                  "Tu marca, en su bolsillo",
                  "Tarjetas personalizadas que viven en su cartera digital.",
                ],
                [
                  "chart",
                  "Descubre qué funciona",
                  "Información clara sobre visitas, recompensas y clientes habituales.",
                ],
                [
                  "heart",
                  "Haz que cada cliente se sienta especial",
                  "Recompensas y novedades que crean vínculos de verdad.",
                ],
              ].map(([icon, title, desc]) => (
                <div className="feature-item" key={title}>
                  <span>
                    <Icon name={icon as IconName} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
              <a href="#/signup" className="text-link accent-link">
                Encuentra a tu próximo cliente habitual{" "}
                <Icon name="arrow" size={18} />
              </a>
            </div>
          </div>
        </section>
        <section className="section container">
          <span className="eyebrow">UN PROGRAMA PARA CADA NEGOCIO</span>
          <h2 className="mt-4">Cuatro formas de volver.</h2>
          <div className="product-reward-grid">
            {[
              [
                "Puntos",
                "Acumula según el gasto, sin propina y con reglas por negocio.",
                "Previsto para v1",
              ],
              [
                "Sellos",
                "Cada compra elegible o visita integrada acerca al cliente a su recompensa.",
                "Previsto para v1",
              ],
              [
                "Recompensas",
                "Catálogo con costo en puntos y canje en caja con el mismo QR.",
                "Vista preparada · etapa posterior",
              ],
              [
                "Niveles",
                "Beneficios por gasto acumulado de los últimos 12 meses.",
                "Vista preparada · etapa posterior",
              ],
            ].map(([title, description, scope]) => (
              <article className="product-reward" key={title}>
                <Icon name="card" size={28} />
                <h3>{title}</h3>
                <p>{description}</p>
                <small className="product-help">{scope}</small>
              </article>
            ))}
          </div>
          <div className="product-notice">
            <Icon name="globe" size={18} />
            <p>
              Esta es una demostración. La integración de pagos, la emisión de
              Apple Wallet y las notificaciones reales requieren backend y
              cuentas de proveedor. Google Wallet queda para después de la v1.
            </p>
          </div>
          <a href="#/registro" className="button">
            Probar registro NFC de ejemplo <Icon name="arrow" size={18} />
          </a>
        </section>
        <section id="pricing" className="section container pricing-section">
          <span className="eyebrow">UN PRECIO JUSTO. SIN SORPRESAS.</span>
          <h2>
            Pequeña inversión.
            <br />
            <em>Relaciones duraderas.</em>
          </h2>
          <p>Un plan sencillo para cada etapa de tu negocio.</p>

          <div className="pricing-grid">
            {[
              {
                name: "Semilla",
                desc: "Un buen lugar para empezar.",
                price: 0,
                features: [
                  "Cobro por sucursal",
                  "Límites por definir",
                  "Tarjetas digitales personalizadas",
                  "Apple Wallet · previsto en v1",
                ],
              },
              {
                name: "Crece",
                desc: "Para una comunidad en crecimiento.",
                price: 0,
                features: [
                  "Cobro por sucursal",
                  "Límites por definir",
                  "Todo lo incluido en Semilla",
                  "Estadísticas avanzadas y campañas",
                ],
              },
              {
                name: "Florece",
                desc: "Más locales. Más posibilidades.",
                price: 0,
                features: [
                  "Cobro por sucursal",
                  "Miembros activos ilimitados",
                  "Todo lo incluido en Crece",
                  "Soporte y puesta en marcha prioritarios",
                ],
              },
            ].map((plan, i) => (
              <article
                className={`price-card ${i === 1 ? "featured" : ""}`}
                key={plan.name}
              >
                {i === 1 && (
                  <div className="popular-label">
                    EL FAVORITO DE LA COMUNIDAD
                  </div>
                )}
                <h3>{plan.name}</h3>
                <p>{plan.desc}</p>
                <div className="price">
                  <span>Tarifa por definir</span>
                </div>
                <small>Facturación manual · precio pendiente</small>
                <Button
                  secondary={i !== 1}
                  onClick={() =>
                    i === 2
                      ? document
                          .querySelector("#agenda")
                          ?.scrollIntoView({ behavior: "smooth" })
                      : go(`/signup?plan=${plan.name}`)
                  }
                >
                  {i === 2 ? "Agenda una llamada" : "Explora la demo"}{" "}
                  <Icon name="arrow" size={16} />
                </Button>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <Icon name="check" size={16} />
                      {f}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
        <section id="about" className="about-section container">
          <div className="about-symbol">
            <img
              src="/brand/loyaloop-symbol.svg"
              className="brand-symbol"
              alt=""
            />
          </div>
          <div>
            <span className="eyebrow">CONOCE UN POCO MÁS A LoyaLoop</span>
            <h2>
              Detrás de cada negocio local,
              <br />
              hay <em>mucho corazón.</em>
            </h2>
            <p>
              Creemos que los mejores negocios no solo venden. Alegran el día,
              recuerdan un nombre y unen a todo un barrio. LoyaLoop te ayuda a
              convertir esos momentos cotidianos en relaciones duraderas.
            </p>
            <p>
              Nuestra misión es sencilla: dar a los negocios independientes las
              herramientas para crecer sin perder lo que los hace especiales.
            </p>
            <a className="text-link accent-link" href="#agenda">
              Agenda una llamada <Icon name="arrow" size={18} />
            </a>
          </div>
        </section>
        <section className="faq-section container section">
          <div>
            <span className="eyebrow">ALGUNAS BUENAS PREGUNTAS</span>
            <h2>
              Nos encanta que <em>preguntes.</em>
            </h2>
            <p>
              ¿Tienes alguna otra duda?
              <br />
              <a href="#agenda">Agenda una llamada con nuestro equipo.</a>
            </p>
          </div>
          <div className="faq-list">
            {[
              [
                "¿Mis clientes tienen que descargar una app?",
                "No. Solo tienen que escanear tu código QR y añadir la tarjeta de fidelidad a Apple Wallet. La integración real está pendiente; Google Wallet se contempla después de la v1.",
              ],
              [
                "¿Puedo personalizar mi tarjeta de fidelidad?",
                "¡Sí! Personalízala con el nombre de tu negocio, tus colores, tu logotipo y la recompensa ideal para tus clientes.",
              ],
              [
                "¿Puedo usar LoyaLoop en varios locales?",
                "El modelo contempla negocios, sucursales y cajas. Los límites y las tarifas por sucursal están pendientes de definir.",
              ],
            ].map(([q, a], i) => (
              <div className="faq-item" key={q}>
                <button
                  onClick={() => setFaq(faq === i ? null : i)}
                  aria-expanded={faq === i}
                >
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
            <p>
              Cuéntanos sobre tu negocio. Revisaremos tus necesidades y te
              mostraremos cómo LoyaLoop puede ayudarte a conectar con quienes
              regresan.
            </p>
            <ul>
              <li>
                <Icon name="check" size={17} />
                Recorrido personalizado por el producto
              </li>
              <li>
                <Icon name="check" size={17} />
                Espacio para resolver tus preguntas
              </li>
              <li>
                <Icon name="check" size={17} />
                Conversación sobre sucursales e integraciones
              </li>
            </ul>
            <div className="call-note">
              <Icon name="globe" size={18} />
              <span>
                Enviar este formulario solicita una llamada. La fecha queda
                pendiente de confirmación.
              </span>
            </div>
          </div>
          <form className="call-form" onSubmit={scheduleCall}>
            <div className="owner-form-grid">
              <label>
                Nombre <span>*</span>
                <input name="name" autoComplete="name" required />
              </label>
              <label>
                Empresa <span>*</span>
                <input name="company" autoComplete="organization" required />
              </label>
            </div>
            <div className="owner-form-grid">
              <label>
                Correo electrónico <span>*</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Teléfono
                <input name="phone" type="tel" autoComplete="tel" />
              </label>
            </div>
            <label>
              Número de sucursales
              <select name="teamSize" defaultValue="1">
                <option value="1">1 sucursal</option>
                <option value="2-5">2 a 5 sucursales</option>
                <option value="6-10">6 a 10 sucursales</option>
                <option value="11+">Más de 10 sucursales</option>
              </select>
            </label>
            <div className="owner-form-grid">
              <label>
                Fecha preferida <span>*</span>
                <input
                  name="preferredDate"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                Horario preferido <span>*</span>
                <select name="preferredTime" defaultValue="" required>
                  <option value="" disabled>
                    Selecciona un horario
                  </option>
                  <option>Mañana · 9:00 a 12:00</option>
                  <option>Tarde · 12:00 a 17:00</option>
                </select>
              </label>
            </div>
            <label>
              ¿Qué te gustaría conocer?
              <textarea
                name="notes"
                rows={3}
                maxLength={500}
                placeholder="Cuéntanos sobre tu negocio o tus preguntas."
              />
            </label>
            <label className="product-checkbox">
              <input type="checkbox" required />
              Acepto que LoyaLoop use estos datos para contactarme sobre esta
              solicitud. <a href="#/legal">Consultar privacidad</a>
            </label>
            <Button type="submit">
              Solicitar llamada <Icon name="arrow" size={18} />
            </Button>
            {callRequest && (
              <p className="call-form-message" role="status">
                {callRequest}
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
          <a href="#how-it-works">Cómo funciona</a>
          <a href="#pricing">Precios</a>
          <a href="#about">Nosotros</a>
          <a href="#/login">Iniciar sesión</a>
          <a href="#/owner">Panel de propietario · Demo</a>
        </div>
        <span>
          © {new Date().getFullYear()} LoyaLoop. Hecho para negocios con
          corazón.
        </span>
      </footer>
    </div>
  )
}

function Auth({ signup }: { signup: boolean }) {
  const [role, setRole] = useState("business")
  const [error, setError] = useState("")
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    if ((data.get("password") as string).length < 6) {
      setError("Utiliza una contraseña de al menos 6 caracteres.")
      return
    }
    localStorage.setItem("ember-name", String(data.get("name") || "Alex"))
    if (data.get("business"))
      localStorage.setItem("ember-business", String(data.get("business")))
    go(role === "owner" ? "/owner" : "/dashboard")
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo light />
        <div>
          <span className="eyebrow">AQUÍ EMPIEZA LO BUENO.</span>
          <h1>
            Un poco de fidelidad.
            <br />
            Un mundo de
            <br />
            <em>posibilidades.</em>
          </h1>
          <p>Crea una comunidad que siempre quiera volver.</p>
          <LoyaltyCard />
          <div className="auth-quote">
            «Porque lo mejor de un negocio
            <br />
            son las personas que lo hacen posible».
          </div>
        </div>
        <span>Hecho para negocios con corazón.</span>
      </div>
      <div className="auth-main">
        <header className="auth-main-header">
          <div className="auth-mobile-logo">
            <Logo />
          </div>
          <a href="#/" className="back-link">
            ← Volver al inicio
          </a>
        </header>
        <div className="auth-form-wrap">
          <span className="eyebrow">TE DAMOS LA BIENVENIDA A LoyaLoop</span>
          <h2>
            {signup ? "Haz que lo bueno crezca." : "Qué bueno verte de nuevo."}
          </h2>
          <p>
            {signup
              ? "Explora la plataforma con datos de demostración."
              : "Tu comunidad te espera. Entra y sigue conectando."}
          </p>
          <div className="role-tabs">
            <button
              className={role === "business" ? "active" : ""}
              onClick={() => setRole("business")}
            >
              <Icon name="coffee" size={17} />
              Negocio
            </button>
            <button
              className={role === "owner" ? "active" : ""}
              onClick={() => setRole("owner")}
            >
              <Icon name="grid" size={17} />
              Propietario de la plataforma
            </button>
          </div>
          <form onSubmit={submit}>
            {signup && (
              <>
                <label>
                  Tu nombre
                  <input
                    name="name"
                    placeholder="Alex Morgan"
                    required
                    autoComplete="name"
                  />
                </label>
                <label>
                  Nombre del negocio
                  <input name="business" placeholder="Tu negocio" required />
                </label>
              </>
            )}
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                placeholder="tu@tunegocio.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                placeholder="Al menos 6 caracteres"
                minLength={6}
                required
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <Button type="submit">
              {signup ? "Crear cuenta" : "Iniciar sesión"}
              <Icon name="arrow" size={18} />
            </Button>
          </form>
          <p className="auth-switch">
            {signup
              ? "¿Ya formas parte de la comunidad?"
              : "¿Es tu primera visita?"}{" "}
            <a href={signup ? "#/login" : "#/signup"}>
              {signup ? "Iniciar sesión" : "Explora la demo"}
            </a>
          </p>
          <div className="demo-callout">
            <Icon name="spark" size={18} />
            <div>
              <strong>¿Solo quieres echar un vistazo?</strong>
              <p>Esta es una demo interactiva. No se crea una cuenta real.</p>
              <button
                onClick={() => go(role === "owner" ? "/owner" : "/dashboard")}
              >
                Explora el panel de{" "}
                {role === "owner" ? "propietario" : "negocio"} <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type Entry = {
  name: string
  email: string
  visits: number
  status: string
}
const localizedStatuses: Record<string, string> = {
  Regular: "Habitual",
  "New member": "Nuevo miembro",
  Seed: "Semilla",
  Grow: "Crece",
  Bloom: "Florece",
}
const baseCustomers: Entry[] = [
  {
    name: "Olivia Parker",
    email: "olivia@example.com",
    visits: 24,
    status: "Habitual",
  },
  {
    name: "James Wilson",
    email: "james@example.com",
    visits: 18,
    status: "Habitual",
  },
  {
    name: "Sofia Martinez",
    email: "sofia@example.com",
    visits: 12,
    status: "Habitual",
  },
  {
    name: "Noah Bennett",
    email: "noah@example.com",
    visits: 5,
    status: "Nuevo miembro",
  },
  {
    name: "Amelia Chen",
    email: "amelia@example.com",
    visits: 8,
    status: "Habitual",
  },
]
const baseCompanies: Entry[] = [
  {
    name: "Goodthings Coffee",
    email: "hello@goodthings.example",
    visits: 1284,
    status: "Crece",
  },
  {
    name: "Sunday Bakery",
    email: "hello@sunday.example",
    visits: 846,
    status: "Crece",
  },
  {
    name: "The Little Studio",
    email: "hello@studio.example",
    visits: 324,
    status: "Semilla",
  },
  {
    name: "Fern & Found",
    email: "hello@fern.example",
    visits: 2138,
    status: "Florece",
  },
  {
    name: "Common Ground",
    email: "hello@common.example",
    visits: 612,
    status: "Crece",
  },
]
function demoBusinessDirectory() {
  try {
    const saved = JSON.parse(localStorage.getItem("ember-companies") || "null")
    return Array.isArray(saved) ? saved : baseCompanies
  } catch {
    return baseCompanies
  }
}
function Dashboard({ owner }: { owner: boolean }) {
  const [tab, setTab] = useState("Resumen")
  const [search, setSearch] = useState("")
  const [period, setPeriod] = useState("Este mes")
  const [modal, setModal] = useState(false)
  const [notice, setNotice] = useState("")
  const [businessName, setBusinessName] = useState(
    () => localStorage.getItem("ember-business") || "Affair · demo",
  )
  const [entries, setEntries] = useState<Entry[]>(() => {
    try {
      const storedEntries: Entry[] =
        JSON.parse(
          localStorage.getItem(owner ? "ember-companies" : "ember-customers") ||
            "null",
        ) || (owner ? baseCompanies : baseCustomers)
      return storedEntries.map((entry) => ({
        ...entry,
        status: localizedStatuses[entry.status] || entry.status,
      }))
    } catch {
      return owner ? baseCompanies : baseCustomers
    }
  })
  const [reward, setReward] = useState(() => {
    const saved = localStorage.getItem("ember-reward")
    return !saved || saved === "A free coffee" ? "Un café gratis" : saved
  })
  const [goal, setGoal] = useState(
    () => localStorage.getItem("ember-goal") || "8",
  )
  const [sidebar, setSidebar] = useState(false)
  const nav: {
    label: string
    icon: IconName
  }[] = [
    { label: "Resumen", icon: "grid" },
    { label: owner ? "Empresas" : "Clientes", icon: "users" },
    { label: owner ? "Suscripciones" : "Tarjetas de fidelidad", icon: "card" },
    { label: "Estadísticas", icon: "chart" },
    { label: "Actividad", icon: "chart" },
    { label: "Recompensas", icon: "gift" },
    { label: "Notificaciones", icon: "mail" },
    { label: "Sucursales y cajas", icon: "globe" },
    { label: "Integraciones", icon: "card" },
    { label: "Equipo", icon: "users" },
    { label: "Escáner", icon: "grid" },
    { label: "Configuración", icon: "settings" },
  ]
  function notify(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(""), 4000)
  }
  function addEntry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const next = [
      ...entries,
      {
        name: String(f.get("name")),
        email: String(f.get("email")),
        visits: 0,
        status: owner ? "Semilla" : "Nuevo miembro",
      },
    ]
    setEntries(next)
    localStorage.setItem(
      owner ? "ember-companies" : "ember-customers",
      JSON.stringify(next),
    )
    setModal(false)
    notify(`${owner ? "Empresa añadida" : "Cliente añadido"} correctamente.`)
  }
  const filtered = entries.filter((e) =>
    `${e.name} ${e.email}`.toLowerCase().includes(search.toLowerCase()),
  )
  const metrics = owner
    ? [
        ["Ingresos mensuales", "$12.840", "+18,6 %", "chart"],
        [
          "Empresas activas",
          String(128 + entries.length - 5),
          "+12,4 %",
          "users",
        ],
        ["Miembros del programa", "24.692", "+21,8 %", "card"],
        ["Conversión de prospectos", "68,4 %", "+8,2 %", "spark"],
      ]
    : [
        [
          "Miembros activos",
          (1284 + entries.length - 5).toLocaleString("es-MX"),
          "+18,6 %",
          "users",
        ],
        [
          "Visitas de clientes",
          period === "Esta semana" ? "684" : "2.846",
          "+24,2 %",
          "coffee",
        ],
        [
          "Recompensas canjeadas",
          period === "Esta semana" ? "82" : "342",
          "+12,8 %",
          "gift",
        ],
        ["Puntos Canjeados", "64,000", "+8,4 %", "heart"],
        ["Tasa de retorno", "64,8 %", "+8,4 %", "heart"],
        ["Putos Daddos", "70,000", "+8,4 %", "heart"],
      ]
  return (
    <div className="dashboard">
      <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
        <Logo />
        <div className="workspace">
          <span className="workspace-icon">
            <Icon name={owner ? "globe" : "coffee"} />
          </span>
          <div>
            <strong>{owner ? "Plataforma LoyaLoop" : businessName}</strong>
            <small>
              {owner ? "Panel del propietario" : "Panel del negocio"}
            </small>
          </div>
        </div>
        <span className="nav-label">ESPACIO DE TRABAJO</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.label}
              className={tab === n.label ? "selected" : ""}
              onClick={() => {
                setTab(n.label)
                setSearch("")
                setSidebar(false)
              }}
            >
              <Icon name={n.icon} />
              {n.label}
              {tab === n.label && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <Icon name="spark" size={25} />
            <strong>Un poco de ayuda hace mucho.</strong>
            <p>¿Dudas? Estamos para ayudarte.</p>
            <a href="mailto:hello@loyaloop.example">
              Hablemos <Icon name="arrow" size={15} />
            </a>
          </div>
          <button
            className="switch-workspace"
            onClick={() => go(owner ? "/dashboard" : "/owner")}
          >
            <Icon name="globe" size={18} />
            Ver demo de {owner ? "negocio" : "propietario"}
          </button>
          <button className="logout-button" onClick={() => go("/login")}>
            <Icon name="logout" size={18} />
            Cerrar sesión
          </button>
          <div className="sidebar-user">
            <span>{owner ? "AM" : "GT"}</span>
            <div>
              <strong>{owner ? "Alex Morgan" : businessName}</strong>
              <small>
                {owner ? "Administrador de la plataforma" : "Plan Crece"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <button
              className="menu-button"
              onClick={() => setSidebar(!sidebar)}
              aria-label="Abrir o cerrar menú lateral"
            >
              <Icon name="menu" />
            </button>
            <span>
              {owner ? "Plataforma" : "Espacio de trabajo"}{" "}
              <Icon name="chevron" size={13} /> <strong>{tab}</strong>
            </span>
          </div>
          <div>
            <span className="demo-badge">
              <span className="status-dot" />
              Espacio de demostración
            </span>
            <a href="#/" className="dashboard-home">
              Volver al sitio web <Icon name="arrow" size={15} />
            </a>
          </div>
        </header>
        <main className="dashboard-content">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">
                {owner
                  ? "UNA VISIÓN GLOBAL"
                  : "TU DOSIS DIARIA DE BUENAS NOTICIAS"}
              </span>
              <h1>
                {tab === "Resumen"
                  ? owner
                    ? "Juntos, hacemos crecer lo bueno."
                    : "Bienvenido, lo bueno continúa."
                  : tab}
              </h1>
              <p>
                {tab === "Resumen"
                  ? owner
                    ? "Así va la comunidad de LoyaLoop."
                    : "Un vistazo a los vínculos que estás creando."
                  : `Gestiona ${tab.toLowerCase()} desde un solo lugar.`}
              </p>
            </div>
            {tab === "Resumen" && (
              <div className="dashboard-title-actions">
                <select
                  aria-label="Periodo del informe"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option>Este mes</option>
                  <option>Esta semana</option>
                  <option>Mes pasado</option>
                </select>
                <Button onClick={() => setTab("Clientes")}>
                  <Icon name="plus" size={17} />
                  Gestionar clientes
                </Button>
              </div>
            )}
          </div>
          <ProductModules
            section={tab === "Estadísticas" ? "Resumen" : tab}
            businesses={demoBusinessDirectory()}
          />
          {(tab === "Resumen" || tab === "Estadísticas") && (
            <>
              <p className="product-help">
                Tarjetas conservadas del diseño inicial: valores de muestra, no
                métricas de transacciones reales.
              </p>
              <div className="metric-grid">
                {metrics.map(([title, value, change, icon]) => (
                  <article className="metric-card" key={title}>
                    <div>
                      <span>{title}</span>
                      <span className="metric-icon">
                        <Icon name={icon as IconName} size={18} />
                      </span>
                    </div>
                    <strong>{value}</strong>
                    <small>
                      <span>
                        ↑ {period === "Mes pasado" ? "+10,2 %" : change}
                      </span>{" "}
                      frente al periodo anterior
                    </small>
                  </article>
                ))}
              </div>
              <div className="dashboard-chart-grid">
                <section className="panel activity-panel">
                  <div className="panel-title">
                    <div>
                      <h3>
                        {owner
                          ? "Crecimiento de la comunidad"
                          : "Una comunidad en crecimiento"}
                      </h3>
                      <p>
                        {owner
                          ? "Nuevos negocios que se unen a LoyaLoop"
                          : "Evolución de las visitas de clientes"}
                      </p>
                    </div>
                    <span className="chart-legend">
                      <i />
                      {owner ? "Empresas" : "Visitas"}
                    </span>
                  </div>
                  <div className="large-chart">
                    <div className="chart-y">
                      <span>{owner ? "40" : "800"}</span>
                      <span>{owner ? "30" : "600"}</span>
                      <span>{owner ? "20" : "400"}</span>
                      <span>{owner ? "10" : "200"}</span>
                      <span>0</span>
                    </div>
                    <div className="chart-plot">
                      <div className="chart-grid-lines">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <svg viewBox="0 0 600 180" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="0%"
                              stopColor="var(--brand-orange)"
                              stopOpacity=".22"
                            />
                            <stop
                              offset="100%"
                              stopColor="var(--brand-orange)"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d={
                            period === "Esta semana"
                              ? "M0 160 C50 150 60 110 100 120 S160 60 200 85 S260 100 300 55 S360 85 400 45 S450 65 500 25 S570 40 600 10 L600 180H0Z"
                              : "M0 150 C40 140 60 155 100 123 S160 135 200 97 S250 117 300 68 S360 99 400 57 S460 77 500 36 S565 48 600 12 L600 180H0Z"
                          }
                          fill="url(#area)"
                        />
                        <path
                          d="M0 150 C40 140 60 155 100 123 S160 135 200 97 S250 117 300 68 S360 99 400 57 S460 77 500 36 S565 48 600 12"
                          stroke="var(--brand-orange)"
                          strokeWidth="3"
                          fill="none"
                        />
                      </svg>
                      <div className="chart-x">
                        {(period === "Esta semana"
                          ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
                          : [
                              "1 jun",
                              "5 jun",
                              "10 jun",
                              "15 jun",
                              "20 jun",
                              "25 jun",
                              "30 jun",
                            ]
                        ).map((v) => (
                          <span key={v}>{v}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
                <section className="panel reward-panel">
                  <div className="panel-title">
                    <div>
                      <h3>
                        {owner
                          ? "Distribución de planes"
                          : "Lo bueno se repite"}
                      </h3>
                      <p>
                        {owner
                          ? "Tu comunidad de negocios"
                          : "La fidelidad de tus clientes, de un vistazo"}
                      </p>
                    </div>
                    <Icon name="heart" size={19} />
                  </div>
                  <div className="donut">
                    <div>
                      <strong>{owner ? "128" : "64,8 %"}</strong>
                      <span>
                        {owner ? "empresas activas" : "tasa de retorno"}
                      </span>
                    </div>
                  </div>
                  <div className="donut-legend">
                    <span>
                      <i />
                      {owner ? "Crece" : "Clientes que vuelven"}
                      <strong>{owner ? "72" : "64,8 %"}</strong>
                    </span>
                    <span>
                      <i />
                      {owner ? "Semilla y Florece" : "Nuevos visitantes"}
                      <strong>{owner ? "56" : "35,2 %"}</strong>
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}

          {tab === "Suscripciones" && (
            <section className="panel subscriptions">
              <h3>Un resumen de cada plan.</h3>
              <p>Datos de demostración. La facturación no está conectada.</p>
              <div className="subscription-grid">
                {["Semilla", "Crece", "Florece"].map((plan, i) => (
                  <article key={plan}>
                    <Icon
                      name={i === 0 ? "spark" : i === 1 ? "chart" : "heart"}
                      size={30}
                    />
                    <h3>{plan}</h3>
                    <strong>
                      ${[19, 49, 99][i]}
                      <small>/mes</small>
                    </strong>
                    <p>
                      {entries.filter((e) => e.status === plan).length} empresas
                      en este espacio
                    </p>
                    <Button
                      secondary
                      onClick={() => {
                        setTab("Empresas")
                        setSearch("")
                      }}
                    >
                      Ver empresas <Icon name="arrow" size={15} />
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="dashboard-footnote">
            <Icon name="heart" size={14} />
            Un poco de fidelidad hace mucho.
            <span>
              Datos de demostración · los cambios se guardan en este navegador
            </span>
          </div>
        </main>
      </div>
      {notice && (
        <div className="notification" role="status">
          <Icon name="check" size={20} />
          {notice}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setModal(false)}
              aria-label="Cerrar"
            >
              <Icon name="close" />
            </button>
            <span className="eyebrow">HAZ CRECER TU COMUNIDAD</span>
            <h2 id="modal-title">
              {owner ? "Un nuevo negocio." : "Un nuevo cliente."}
            </h2>
            <p>
              Añadir{" "}
              {owner
                ? "una empresa a la comunidad de LoyaLoop"
                : "un cliente a tu programa de fidelidad"}
              .
            </p>
            <form onSubmit={addEntry}>
              <label>
                {owner ? "Nombre de la empresa" : "Nombre del cliente"}
                <input
                  name="name"
                  required
                  placeholder={owner ? "Sunday Bakery" : "Alex Morgan"}
                  autoFocus
                />
              </label>
              <label>
                Correo electrónico
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="hola@ejemplo.com"
                />
              </label>
              <Button type="submit">
                Añadir {owner ? "empresa" : "cliente"}
                <Icon name="plus" size={17} />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

type OwnerCompany = Entry & {
  contact?: string
  phone?: string
  sector?: string
  accountStatus?: "Activa" | "En prueba"
  createdAt?: string
}
interface OwnerMetric {
  label: string
  value: string
  detail: string
  icon: IconName
}
const ownerPlans = [
  { name: "Semilla", price: 0 },
  { name: "Crece", price: 0 },
  { name: "Florece", price: 0 },
]
const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value)
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

function OwnerDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const dialog = ref.current
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex="0"]',
        ) || [],
      )
    const fields = focusable()
    ;(dialog?.querySelector<HTMLElement>("input") || fields[0])?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current()
      if (event.key !== "Tab") return
      const items = focusable()
      const first = items[0],
        last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="modal owner-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Cerrar ventana"
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">TU COMUNIDAD, MÁS CERCA</span>
        <h2 id="owner-dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function OwnerDashboard() {
  const [section, setSection] = useState("Inicio")
  const [sidebar, setSidebar] = useState(false)
  const [search, setSearch] = useState("")
  const [planFilter, setPlanFilter] = useState("Todos los planes")
  const [statusFilter, setStatusFilter] = useState("Todos los estados")
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<OwnerCompany | null>(null)
  const [formError, setFormError] = useState("")
  const [notice, setNotice] = useState("")
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [companies, setCompanies] = useState<OwnerCompany[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("ember-companies") || "null",
      )
      const records = Array.isArray(saved) ? saved : baseCompanies
      return records.map((entry: OwnerCompany) => ({
        ...entry,
        status: localizedStatuses[entry.status] || entry.status,
        accountStatus: entry.accountStatus || "Activa",
      }))
    } catch {
      return baseCompanies.map((entry) => ({
        ...entry,
        accountStatus: "Activa",
      }))
    }
  })
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )
  const name = localStorage.getItem("ember-name") || "Alex"
  const active = companies.filter(
    (company) => company.accountStatus !== "En prueba",
  )
  const trials = companies.length - active.length
  const revenue = active.reduce(
    (sum, company) =>
      sum +
      (ownerPlans.find((plan) => plan.name === company.status)?.price || 0),
    0,
  )
  const members = companies.reduce((sum, company) => sum + company.visits, 0)
  const filtered = companies.filter(
    (company) =>
      normalizeSearch(
        `${company.name} ${company.email} ${company.contact || ""}`,
      ).includes(normalizeSearch(search)) &&
      (planFilter === "Todos los planes" || company.status === planFilter) &&
      (statusFilter === "Todos los estados" ||
        company.accountStatus === statusFilter),
  )
  function navigate(next: string) {
    setSection(next)
    setSidebar(false)
    setSearch("")
    setPlanFilter("Todos los planes")
    setStatusFilter("Todos los estados")
  }
  function openAdd() {
    setFormError("")
    setAdding(true)
  }
  function addCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const companyName = String(data.get("name") || "").trim()
    const email = String(data.get("email") || "")
      .trim()
      .toLowerCase()
    const contact = String(data.get("contact") || "").trim()
    if (!companyName || !contact) {
      setFormError(
        "Introduce el nombre de la empresa y de la persona de contacto.",
      )
      return
    }
    if (companies.some((company) => company.email.toLowerCase() === email)) {
      setFormError("Ya existe una cuenta con este correo electrónico.")
      return
    }
    const company: OwnerCompany = {
      name: companyName,
      email,
      contact,
      phone: String(data.get("phone") || "").trim(),
      sector: String(data.get("sector")),
      status: String(data.get("plan")),
      accountStatus: data.get("accountStatus") as OwnerCompany["accountStatus"],
      visits: 0,
      createdAt: new Date().toISOString(),
    }
    const next = [...companies, company]
    try {
      localStorage.setItem("ember-companies", JSON.stringify(next))
    } catch {
      setFormError(
        "No se ha podido guardar la cuenta en este navegador. Inténtalo de nuevo.",
      )
      return
    }
    setCompanies(next)
    setAdding(false)
    navigate("Clientes y empresas")
    setNotice(`${companyName} se ha añadido correctamente.`)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(""), 5000)
  }
  function renderCompanyTable({ preview = false }: { preview?: boolean }) {
    const records = preview ? companies.slice(-4).reverse() : filtered
    return (
      <div className="table-scroll owner-table">
        <table>
          <thead>
            <tr>
              <th>Empresa / cliente</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Miembros</th>
              <th>Cuenta</th>
            </tr>
          </thead>
          <tbody>
            {records.map((company, index) => (
              <tr key={company.email}>
                <td>
                  <div className="table-person">
                    <span className={`person-avatar avatar-${index % 3}`}>
                      {company.name
                        .split(" ")
                        .map((word) => word[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div>
                      <button
                        className="owner-company-name"
                        onClick={() => setSelected(company)}
                      >
                        {company.name}
                      </button>
                      <small>{company.email}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`owner-plan plan-${ownerPlans.findIndex((plan) => plan.name === company.status)}`}
                  >
                    {company.status}
                  </span>
                </td>
                <td>
                  <span
                    className={`owner-account-state ${
                      company.accountStatus === "En prueba" ? "trial" : ""
                    }`}
                  >
                    <i />
                    {company.accountStatus || "Activa"}
                  </span>
                </td>
                <td>{company.visits.toLocaleString("es-MX")}</td>
                <td>
                  <button
                    className="owner-view-account"
                    onClick={() => setSelected(company)}
                    aria-label={`Ver cuenta de ${company.name}`}
                  >
                    Ver cuenta <Icon name="chevron" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && (
          <div className="owner-empty">
            <Icon name="search" size={28} />
            <h3>
              {companies.length
                ? "No encontramos coincidencias"
                : "Tu comunidad empieza aquí"}
            </h3>
            <p>
              {companies.length
                ? "Prueba con otro nombre, correo o filtro."
                : "Añade tu primera empresa para empezar."}
            </p>
            <Button
              secondary
              onClick={
                companies.length
                  ? () => {
                      setSearch("")
                      setPlanFilter("Todos los planes")
                      setStatusFilter("Todos los estados")
                    }
                  : openAdd
              }
            >
              {companies.length ? "Limpiar búsqueda" : "Añadir primera empresa"}
            </Button>
          </div>
        )}
      </div>
    )
  }
  const globalMetrics = demoGlobalMetrics()
  const stats: OwnerMetric[] = [
    {
      label: "Transacciones demo",
      value: String(globalMetrics.transactions),
      detail: "Actividad de los espacios locales guardados",
      icon: "chart",
    },
    {
      label: "Empresas en tu plataforma",
      value: String(companies.length),
      detail: `${active.length} activas · ${trials} en prueba`,
      icon: "users",
    },
    {
      label: "Pases de muestra",
      value: String(globalMetrics.passes),
      detail: "Clientes con vista de pase; ninguno firmado",
      icon: "card",
    },
    {
      label: "Errores de integración",
      value: String(globalMetrics.errors),
      detail: "Errores simulados; proveedores no conectados",
      icon: "globe",
    },
  ]
  return (
    <div className="dashboard owner-dashboard">
      <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
        <Logo />
        <div className="workspace">
          <span className="workspace-icon">
            <Icon name="globe" />
          </span>
          <div>
            <strong>Plataforma LoyaLoop</strong>
            <small>Panel del propietario</small>
          </div>
          <span className="owner-workspace-dot" />
        </div>
        <span className="nav-label">ADMINISTRACIÓN</span>
        <nav>
          {[
            { label: "Inicio", icon: "grid" },
            { label: "Clientes y empresas", icon: "users" },
            { label: "Métricas", icon: "chart" },
            { label: "Tarjetas y reglas", icon: "card" },
            { label: "Integraciones", icon: "globe" },
          ].map((item) => (
            <button
              key={item.label}
              className={section === item.label ? "selected" : ""}
              onClick={() => navigate(item.label)}
              aria-current={section === item.label ? "page" : undefined}
            >
              <Icon name={item.icon as IconName} />
              {item.label}
              {section === item.label && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="owner-sidebar-note">
          <Icon name="spark" size={22} />
          <p>
            Pequeños negocios.
            <br />
            <em>Grandes posibilidades.</em>
          </p>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <Icon name="heart" size={23} />
            <strong>Tu comunidad empieza contigo.</strong>
            <p>Cada nuevo negocio es una nueva conexión.</p>
            <button className="text-link accent-link" onClick={openAdd}>
              Añadir una empresa <Icon name="plus" size={14} />
            </button>
          </div>
          <button className="switch-workspace" onClick={() => go("/dashboard")}>
            <Icon name="globe" size={17} />
            Ver demo de negocio
          </button>
          <button className="logout-button" onClick={() => go("/login")}>
            <Icon name="logout" size={17} />
            Cerrar sesión
          </button>
          <div className="sidebar-user">
            <span>{name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{name}</strong>
              <small>Propietario de LoyaLoop</small>
            </div>
            <span className="owner-admin-label">ADMIN</span>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <button
              className="menu-button"
              aria-label="Abrir o cerrar menú"
              onClick={() => setSidebar(!sidebar)}
            >
              <Icon name="menu" />
            </button>
            <span>
              Administración <Icon name="chevron" size={13} />
              <strong>{section}</strong>
            </span>
          </div>
          <div>
            <span className="demo-badge">
              <span className="status-dot" />
              Modo demostración
            </span>
            <a href="#/" className="dashboard-home">
              Volver al sitio <Icon name="arrow" size={15} />
            </a>
          </div>
        </header>
        <main className="dashboard-content owner-content">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">
                {section === "Inicio"
                  ? "EL HOGAR DE TU COMUNIDAD"
                  : section === "Métricas"
                    ? "LOS NÚMEROS DETRÁS DE LO BUENO"
                    : "TODAS TUS CUENTAS, EN UN LUGAR"}
              </span>
              <h1>
                {section === "Inicio" ? (
                  <>
                    Tu negocio, <em>de un vistazo.</em>
                  </>
                ) : section === "Métricas" ? (
                  <>
                    Así crece <em>LoyaLoop.</em>
                  </>
                ) : (
                  <>
                    Tus clientes y <em>empresas.</em>
                  </>
                )}
              </h1>
              <p>
                {section === "Inicio"
                  ? `Hola, ${name}. Gestiona tu plataforma, sin complicaciones.`
                  : section === "Métricas"
                    ? "Conoce el valor de tu comunidad y los planes que la hacen crecer."
                    : "Busca, consulta y organiza los negocios que usan tu software."}
              </p>
            </div>
            <Button onClick={openAdd}>
              <Icon name="plus" size={17} />
              Añadir cliente
            </Button>
          </div>
          {(section === "Tarjetas y reglas" || section === "Integraciones") && (
            <ProductModules admin section={section} businesses={companies} />
          )}
          {section === "Inicio" && (
            <section
              className="owner-quick-actions"
              aria-label="Acciones principales"
            >
              <button
                className="owner-action owner-action-primary"
                onClick={() => navigate("Clientes y empresas")}
              >
                <span className="owner-action-icon">
                  <Icon name="search" size={24} />
                </span>
                <span>
                  <strong>Buscar una cuenta</strong>
                  <small>Encuentra a cualquier cliente o empresa.</small>
                </span>
                <Icon name="arrow" size={21} />
              </button>
              <button
                className="owner-action"
                onClick={() => navigate("Métricas")}
              >
                <span className="owner-action-icon">
                  <Icon name="chart" size={24} />
                </span>
                <span>
                  <strong>Ver mis métricas</strong>
                  <small>Los números de tu negocio, claros.</small>
                </span>
                <Icon name="arrow" size={21} />
              </button>
              <button className="owner-action" onClick={openAdd}>
                <span className="owner-action-icon">
                  <Icon name="plus" size={24} />
                </span>
                <span>
                  <strong>Añadir un cliente</strong>
                  <small>Crea una cuenta de forma manual.</small>
                </span>
                <Icon name="arrow" size={21} />
              </button>
            </section>
          )}
          {(section === "Inicio" || section === "Métricas") && (
            <>
              <div className="owner-section-label">
                <h2>
                  {section === "Inicio"
                    ? "Lo importante, en resumen"
                    : "El estado de tu negocio"}
                </h2>
                <span>
                  <span className="status-dot" />
                  Datos del espacio de demostración
                </span>
              </div>
              <div className="metric-grid">
                {stats.map((stat) => (
                  <article className="metric-card" key={stat.label}>
                    <div>
                      <span>{stat.label}</span>
                      <span className="metric-icon">
                        <Icon name={stat.icon} size={18} />
                      </span>
                    </div>
                    <strong>{stat.value}</strong>
                    <p className="owner-metric-detail">{stat.detail}</p>
                  </article>
                ))}
              </div>
            </>
          )}
          {section === "Inicio" && (
            <>
              <section className="panel owner-recent">
                <div className="panel-title">
                  <div>
                    <h3>Los negocios que hacen comunidad</h3>
                    <p>Las últimas cuentas de tu plataforma.</p>
                  </div>
                  <button
                    className="text-link accent-link"
                    onClick={() => navigate("Clientes y empresas")}
                  >
                    Ver todas las cuentas <Icon name="arrow" size={16} />
                  </button>
                </div>
                {renderCompanyTable({ preview: true })}
              </section>
              <section className="owner-bottom-banner">
                <span className="owner-banner-icon">
                  <Icon name="heart" size={26} />
                </span>
                <div>
                  <h3>Más negocios. Más buenas conexiones.</h3>
                  <p>Tu próxima empresa puede empezar a fidelizar hoy.</p>
                </div>
                <Button secondary onClick={openAdd}>
                  Añadir un cliente <Icon name="plus" size={16} />
                </Button>
              </section>
            </>
          )}
          {section === "Clientes y empresas" && (
            <section className="panel owner-directory">
              <div className="panel-title">
                <div>
                  <h3>
                    Todas las cuentas{" "}
                    <span className="owner-count">{companies.length}</span>
                  </h3>
                  <p>Consulta los datos y el estado de cada negocio.</p>
                </div>
                <span className="owner-result-count">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "resultado" : "resultados"}
                </span>
              </div>
              <div className="owner-filters">
                <div className="owner-search">
                  <Icon name="search" size={19} />
                  <input
                    type="search"
                    placeholder="Buscar por empresa, correo o contacto…"
                    aria-label="Buscar cuentas de clientes y empresas"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    autoFocus
                  />
                </div>
                <select
                  aria-label="Filtrar por plan"
                  value={planFilter}
                  onChange={(event) => setPlanFilter(event.target.value)}
                >
                  <option>Todos los planes</option>
                  {ownerPlans.map((plan) => (
                    <option key={plan.name}>{plan.name}</option>
                  ))}
                </select>
                <select
                  aria-label="Filtrar por estado"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option>Todos los estados</option>
                  <option>Activa</option>
                  <option>En prueba</option>
                </select>
              </div>
              {renderCompanyTable({})}
              <div className="owner-table-footer">
                Mostrando {filtered.length} de {companies.length} cuentas
                <span>Todos tus clientes, sin perder de vista a ninguno.</span>
              </div>
            </section>
          )}
          {section === "Métricas" && (
            <>
              <div className="owner-analytics-grid">
                <section className="panel owner-plan-panel">
                  <div className="panel-title">
                    <div>
                      <h3>Ingresos por plan</h3>
                      <p>Previsión mensual según las cuentas activas.</p>
                    </div>
                    <span className="owner-chart-icon">
                      <Icon name="chart" size={20} />
                    </span>
                  </div>
                  <div className="owner-revenue-total">
                    <strong>{formatMoney(revenue)}</strong>
                    <span>/ mes</span>
                  </div>
                  <div className="owner-plan-bars">
                    {ownerPlans.map((plan, index) => {
                      const count = active.filter(
                        (company) => company.status === plan.name,
                      ).length
                      const amount = count * plan.price
                      return (
                        <div className="owner-plan-row" key={plan.name}>
                          <div>
                            <span>
                              <i className={`plan-color-${index}`} />
                              {plan.name}
                              <small>
                                {count} {count === 1 ? "empresa" : "empresas"}
                              </small>
                            </span>
                            <strong>{formatMoney(amount)}</strong>
                          </div>
                          <div className="owner-bar-track">
                            <span
                              className={`plan-color-${index}`}
                              style={{
                                width: `${
                                  revenue ? (amount / revenue) * 100 : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="owner-chart-note">
                    Estimación en MXN. Tarifas por sucursal pendientes de
                    definir. No son pagos cobrados: la facturación aún no está
                    conectada.
                  </p>
                </section>
                <section className="panel owner-plan-panel">
                  <div className="panel-title">
                    <div>
                      <h3>Tu comunidad, por plan</h3>
                      <p>Cómo se distribuyen las cuentas de tu software.</p>
                    </div>
                    <Icon name="users" size={20} />
                  </div>
                  <div className="owner-community-total">
                    <strong>{companies.length}</strong>
                    <span>empresas en total</span>
                  </div>
                  <div className="owner-stacked-bar">
                    {ownerPlans.map((plan, index) => {
                      const count = companies.filter(
                        (company) => company.status === plan.name,
                      ).length
                      return (
                        <span
                          key={plan.name}
                          className={`plan-color-${index}`}
                          style={{
                            width: `${
                              companies.length
                                ? (count / companies.length) * 100
                                : 0
                            }%`,
                          }}
                        />
                      )
                    })}
                  </div>
                  <div className="owner-plan-legend">
                    {ownerPlans.map((plan, index) => (
                      <div key={plan.name}>
                        <span>
                          <i className={`plan-color-${index}`} />
                          {plan.name}
                        </span>
                        <strong>
                          {
                            companies.filter(
                              (company) => company.status === plan.name,
                            ).length
                          }{" "}
                          <small>cuentas</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="owner-trial-note">
                    <Icon name="spark" size={17} />
                    <span>
                      {trials}{" "}
                      {trials === 1 ? "cuenta en prueba" : "cuentas en prueba"}{" "}
                      · {active.length} activas
                    </span>
                  </div>
                </section>
              </div>
              <section className="panel owner-member-panel">
                <div className="panel-title">
                  <div>
                    <h3>El alcance de tus empresas</h3>
                    <p>Miembros de fidelidad registrados en cada negocio.</p>
                  </div>
                  <span className="owner-count">
                    {members.toLocaleString("es-MX")} miembros
                  </span>
                </div>
                {companies.length ? (
                  [...companies]
                    .sort((a, b) => b.visits - a.visits)
                    .map((company) => (
                      <div className="owner-member-row" key={company.email}>
                        <button onClick={() => setSelected(company)}>
                          {company.name}
                        </button>
                        <div className="owner-bar-track">
                          <span
                            style={{
                              width: `${
                                members
                                  ? (company.visits /
                                      Math.max(
                                        ...companies.map((c) => c.visits),
                                        1,
                                      )) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <strong>
                          {company.visits.toLocaleString("es-MX")}
                        </strong>
                      </div>
                    ))
                ) : (
                  <div className="empty-state">
                    Añade tu primera empresa para empezar a ver sus métricas.
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="dashboard-footnote">
            <Icon name="heart" size={14} />
            Un poco de fidelidad hace mucho.
            <span>
              Demo local · sin cuentas reales ni facturación conectada
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="notification" role="status">
          <Icon name="check" size={20} />
          {notice}
        </div>
      )}
      {adding && (
        <OwnerDialog
          title="Un nuevo comienzo."
          onClose={() => setAdding(false)}
        >
          <p className="owner-modal-intro">
            Añade un cliente o empresa a tu plataforma.
          </p>
          <form onSubmit={addCompany}>
            <label>
              Nombre de la empresa <span>*</span>
              <input
                name="name"
                placeholder="Ej. La Esquina Café"
                required
                maxLength={100}
              />
            </label>
            <div className="owner-form-grid">
              <label>
                Persona de contacto <span>*</span>
                <input
                  name="contact"
                  placeholder="Nombre y apellidos"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
              <label>
                Teléfono
                <input
                  name="phone"
                  type="tel"
                  placeholder="+34 600 000 000"
                  autoComplete="tel"
                  maxLength={30}
                />
              </label>
            </div>
            <label>
              Correo de la cuenta <span>*</span>
              <input
                name="email"
                type="email"
                placeholder="hola@tunegocio.com"
                required
                autoComplete="email"
              />
            </label>
            <div className="owner-form-grid">
              <label>
                Tipo de negocio
                <select name="sector">
                  <option>Cafetería</option>
                  <option>Panadería</option>
                  <option>Salón o estudio</option>
                  <option>Tienda</option>
                  <option>Restaurante</option>
                  <option>Otro</option>
                </select>
              </label>
              <label>
                Plan
                <select name="plan" defaultValue="Crece">
                  {ownerPlans.map((plan) => (
                    <option key={plan.name} value={plan.name}>
                      {plan.name} · tarifa por sucursal pendiente
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Estado de la cuenta
              <select name="accountStatus" defaultValue="En prueba">
                <option>En prueba</option>
                <option>Activa</option>
              </select>
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="owner-form-disclaimer">
              <Icon name="globe" size={16} />
              <p>
                Se guarda en este navegador. No se envía una invitación ni se
                crea acceso real.
              </p>
            </div>
            <div className="owner-modal-actions">
              <Button secondary onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                Crear cuenta <Icon name="plus" size={17} />
              </Button>
            </div>
          </form>
        </OwnerDialog>
      )}
      {selected && (
        <OwnerDialog
          title="Ficha de la cuenta."
          onClose={() => setSelected(null)}
        >
          <div className="owner-detail-heading">
            <span className="person-avatar">
              {selected.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.sector || "Empresa de tu comunidad"}</p>
            </div>
            <span
              className={`owner-account-state ${
                selected.accountStatus === "En prueba" ? "trial" : ""
              }`}
            >
              <i />
              {selected.accountStatus || "Activa"}
            </span>
          </div>
          <dl className="owner-details">
            <div>
              <dt>Correo electrónico</dt>
              <dd>
                <a href={`mailto:${selected.email}`}>{selected.email}</a>
              </dd>
            </div>
            <div>
              <dt>Persona de contacto</dt>
              <dd>{selected.contact || "Sin especificar"}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{selected.phone || "Sin especificar"}</dd>
            </div>
            <div>
              <dt>Plan contratado</dt>
              <dd>{selected.status} · tarifa por sucursal pendiente</dd>
            </div>
            <div>
              <dt>Miembros de fidelidad</dt>
              <dd>{selected.visits.toLocaleString("es-MX")}</dd>
            </div>
            <div>
              <dt>Fecha de alta</dt>
              <dd>
                {selected.createdAt
                  ? new Date(selected.createdAt).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "Cuenta de ejemplo"}
              </dd>
            </div>
          </dl>
          <div className="owner-form-disclaimer">
            <Icon name="globe" size={16} />
            <p>
              Ficha de demostración. No hay acceso a datos ni sesiones de una
              empresa real.
            </p>
          </div>
          <Button
            className="owner-detail-close"
            onClick={() => setSelected(null)}
          >
            Cerrar ficha <Icon name="check" size={17} />
          </Button>
        </OwnerDialog>
      )}
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash)
  useEffect(() => {
    const update = () => setRoute(window.location.hash)
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])
  const path = route.split("?")[0]
  if (path === "#/login" || path === "#/signup")
    return <Auth key={path} signup={path === "#/signup"} />
  if (path === "#/owner") return <OwnerDashboard />
  if (path === "#/dashboard") return <Dashboard key={path} owner={false} />
  if (path === "#/registro")
    return <ProductModules key={route} section="Registro público" />
  if (path === "#/escaner")
    return <ProductModules key={route} section="Escáner público" />
  if (path === "#/legal") return <ProductModules section="Legal" />
  return <Landing />
}
