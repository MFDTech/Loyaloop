import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { Icon, Logo, Button } from "./ui"
import {
  applyDemoScan,
  downloadCustomers,
  loadWorkspace,
  money,
  phoneId,
  pilotId,
  saveWorkspace,
  uid,
  type CardType,
  type Customer,
  type Program,
  type Role,
  type Transaction,
  type Workspace,
} from "./demo-model"

interface BusinessChoice {
  name: string
  email: string
}
type Props = {
  section: string
  admin?: boolean
  businesses?: BusinessChoice[]
}
const types: CardType[] = ["Puntos", "Sellos", "Recompensas", "Niveles"]
const dateLabel = (date: string) =>
  new Date(date).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  })
function passAppearance(color: string) {
  const luminance = (hex: string) => {
    const rgb = hex
      .slice(1)
      .match(/../g)!
      .map((value) => parseInt(value, 16) / 255)
    const values = rgb.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
  }
  const background = luminance(/^#[\da-f]{6}$/i.test(color) ? color : "#8A2E12")
  const lightContrast = 1.05 / (background + 0.05)
  const darkContrast = (background + 0.05) / (luminance("#191613") + 0.05)
  return {
    ink:
      lightContrast > darkContrast
        ? "var(--brand-white)"
        : "var(--brand-black)",
    contrast: Math.max(lightContrast, darkContrast),
  }
}
function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="product-notice">
      <Icon name="globe" size={18} />
      <p>
        {children ||
          "Demostración local. No hay autenticación real, cobros, SMS, conexión NFC física ni pases firmados. Cada negocio tiene sus propios datos de muestra en este navegador."}
      </p>
    </div>
  )
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string
  children: ReactNode
  close: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const fields = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "input, button, select, textarea, a[href]",
        ) || [],
      )
    ;(ref.current?.querySelector<HTMLElement>("input") || fields()[0])?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current()
      if (event.key !== "Tab") return
      const items = fields(),
        first = items[0],
        last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", onKey)
      previous?.focus()
    }
  }, [])
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal product-modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close" aria-label="Cerrar" onClick={close}>
          <Icon name="close" />
        </button>
        <h2 id="product-dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}
function PassPreview({
  data,
  customer,
  type,
}: {
  data: Workspace
  customer?: Customer
  type: CardType
}) {
  const [back, setBack] = useState(false)
  const name = data.program.discreet ? data.program.neutralName : data.name
  const safeImage = (url: string) => /^https:\/\//.test(url)
  return (
    <div className="pass-preview">
      <div className="pass-tabs">
        <button
          onClick={() => setBack(false)}
          className={!back ? "active" : ""}
        >
          Frente
        </button>
        <button onClick={() => setBack(true)} className={back ? "active" : ""}>
          Reverso
        </button>
      </div>
      <div
        className="apple-pass"
        style={{
          backgroundColor: data.program.color,
          color: passAppearance(data.program.color).ink,
        }}
      >
        <header>
          <span>
            {safeImage(data.program.logo) ? (
              <img src={data.program.logo} alt={`Logo de ${data.name}`} />
            ) : (
              <Icon name="card" size={24} />
            )}
            {name}
          </span>
          <small>{type}</small>
        </header>
        {!back ? (
          <>
            <div className="pass-main-field">
              <small>
                {type === "Puntos" || type === "Recompensas"
                  ? "PUNTOS DISPONIBLES"
                  : type === "Sellos"
                    ? "SELLOS ACUMULADOS"
                    : "TU NIVEL"}
              </small>
              <strong>
                {type === "Puntos" || type === "Recompensas"
                  ? (customer?.points || 0).toLocaleString("es-MX")
                  : type === "Sellos"
                    ? `${customer?.stamps || 0} / ${data.program.stampGoal || "—"}`
                    : customer?.tier || "Por configurar"}
              </strong>
            </div>
            {safeImage(data.program.image) && (
              <img
                className="pass-strip-image"
                src={data.program.image}
                alt="Imagen principal del negocio"
              />
            )}
            <div className="pass-secondary-fields">
              <span>
                <small>TITULAR</small>
                {customer?.name || "Tu nombre"}
              </span>
              <span>
                <small>VIGENCIA DE PUNTOS</small>12 meses sin actividad
              </span>
            </div>
            <div className="pass-qr-placeholder">
              <Icon name="grid" size={44} />
              <small>QR DE MUESTRA</small>
            </div>
            <small>Identificador opaco · sin datos personales</small>
          </>
        ) : (
          <dl className="pass-back">
            <dt>Reglas</dt>
            <dd>
              {type === "Puntos"
                ? `${data.program.rate || "Por definir"} puntos por peso. Redondeo hacia abajo, sin propina.`
                : type === "Sellos"
                  ? `Compra mínima: ${
                      data.program.stampMinimum
                        ? money(Number(data.program.stampMinimum))
                        : "por definir"
                    }. Meta: ${data.program.stampGoal || "por definir"} sellos. Al completarla se genera la recompensa y reinicia.`
                  : type === "Recompensas"
                    ? "Canje en caja con el mismo QR. Consulta el catálogo y el costo en puntos."
                    : "Nivel según el gasto de los últimos 12 meses. Se revisa por periodo y puede bajar."}
            </dd>
            <dt>Contacto</dt>
            <dd>
              {data.email}
              <br />
              {data.phone || "Teléfono por definir"}
            </dd>
            <dt>Novedades y condiciones</dt>
            <dd>
              La disponibilidad y las condiciones se consultan antes del canje.
              Esta tarjeta es una vista previa, no un pase válido.
            </dd>
          </dl>
        )}
      </div>
      <p className="product-help">
        Vista conceptual con campos de Apple Wallet. La distribución final la
        controla Apple; se requiere certificado para emitir el pase.
      </p>
    </div>
  )
}
function NumericField({
  label,
  name,
  value,
  onChange,
  integer = false,
}: {
  label: string
  name: keyof Program
  value: string
  onChange: (name: keyof Program, value: string) => void
  integer?: boolean
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={
          [
            "stampGoal",
            "dailyLimit",
            "promotionLimit",
            "tierMultiplier",
          ].includes(name)
            ? "1"
            : "0"
        }
        step={integer ? "1" : "0.01"}
        value={value}
        placeholder="Pendiente de definir"
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  )
}

export default function ProductModules({
  section,
  admin = false,
  businesses = [],
}: Props) {
  const [businessId, setBusinessId] = useState(
    () =>
      new URLSearchParams(window.location.hash.split("?")[1] || "").get(
        "negocio",
      ) ||
      localStorage.getItem("loyaloop-selected-business") ||
      pilotId,
  )
  if (section === "Registro público") return <ConsumerRegistration />
  if (section === "Escáner público") return <ScannerPage />
  if (section === "Legal") return <LegalPage />
  const name = businesses.find((business) => business.email === businessId)
    ?.name
  return (
    <section className="product-modules">
      <div className="product-toolbar">
        <div>
          <span className="eyebrow">
            {admin ? "CONFIGURACIÓN CENTRAL" : "ESPACIO DEL NEGOCIO"}
          </span>
          <p>
            {admin
              ? "Solo el administrador configura las tarjetas en la v1."
              : "Datos y permisos aislados en la demo por negocio."}
          </p>
        </div>
        <label>
          Negocio de demostración
          <select
            value={businessId}
            onChange={(event) => {
              setBusinessId(event.target.value)
              localStorage.setItem(
                "loyaloop-selected-business",
                event.target.value,
              )
            }}
          >
            <option value={pilotId}>Affair · piloto demo</option>
            {businessId !== pilotId &&
              !businesses.some((business) => business.email === businessId) && (
                <option value={businessId}>
                  {loadWorkspace(businessId).name}
                </option>
              )}
            {businesses
              .filter((business) => business.email !== pilotId)
              .map((business) => (
                <option key={business.email} value={business.email}>
                  {business.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <ModuleContent
        key={businessId}
        id={businessId}
        name={name}
        section={section}
        admin={admin}
      />
    </section>
  )
}

function ModuleContent({
  id,
  name,
  section,
  admin,
}: {
  id: string
  name?: string
  section: string
  admin: boolean
}) {
  const [data, setData] = useState(() => loadWorkspace(id, name))
  const [role, setRole] = useState<Role>("Dueño")
  const [query, setQuery] = useState("")
  const [modal, setModal] = useState("")
  const [detail, setDetail] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [cardType, setCardType] = useState<CardType>(data.program.type)
  const [program, setProgram] = useState(data.program)
  const [activityFilter, setActivityFilter] = useState("Todas")
  const [loading, setLoading] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current)
    },
    [],
  )
  function commit(next: Workspace, feedback = "Cambios guardados en la demo.") {
    try {
      saveWorkspace(id, next)
      setData(next)
      setMessage(feedback)
      setError("")
      return true
    } catch {
      setError(
        "No se han podido guardar los cambios. Revisa el almacenamiento del navegador.",
      )
      return false
    }
  }
  function open(value: string) {
    setError("")
    setModal(value)
  }
  function form(
    event: FormEvent<HTMLFormElement>,
    action: (values: FormData) => void,
  ) {
    event.preventDefault()
    setError("")
    action(new FormData(event.currentTarget))
  }
  const customer = data.customers.find((item) => item.id === detail)
  const canManage = admin || role !== "Cajero"
  const canExport = role === "Dueño" || admin
  const filtered = data.customers.filter((item) =>
    `${item.name} ${item.phone} ${item.email}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const transactionRows = data.transactions.filter(
    (item) => activityFilter === "Todas" || item.type === activityFilter,
  )
  function transactionTable(rows: Transaction[]) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Actividad</th>
              <th>Monto sin propina</th>
              <th>Puntos</th>
              <th>Trazabilidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{dateLabel(item.date)}</td>
                <td>
                  {data.customers.find(
                    (person) => person.id === item.customerId,
                  )?.name || "Cliente eliminado"}
                </td>
                <td>
                  {item.type}
                  <small className="table-note">{item.reason}</small>
                </td>
                <td>{money(item.amount)}</td>
                <td>
                  {item.points > 0 ? "+" : ""}
                  {item.points}
                </td>
                <td>
                  {item.branch}
                  <small className="table-note">
                    {item.register} · {item.device}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty-state">
            Todavía no hay actividad en este filtro.
          </p>
        )}
      </div>
    )
  }
  const summary = (
    <div className="product-summary-grid">
      {[
        [
          "Clientes nuevos",
          data.customers
            .filter(
              (item) =>
                Date.now() - new Date(item.createdAt).getTime() < 30 * 86400000,
            )
            .length.toLocaleString("es-MX"),
          "Altas en los últimos 30 días",
        ],
        [
          "Clientes activos",
          new Set(
            data.transactions
              .filter(
                (item) =>
                  Date.now() - new Date(item.date).getTime() < 30 * 86400000,
              )
              .map((item) => item.customerId),
          ).size.toLocaleString("es-MX"),
          "Con actividad en los últimos 30 días",
        ],
        [
          "Gasto promedio",
          money(
            data.transactions
              .filter((item) => item.type === "Compra")
              .reduce((sum, item) => sum + item.amount, 0) /
              Math.max(
                data.transactions.filter((item) => item.type === "Compra")
                  .length,
                1,
              ),
          ),
          "Compras de demostración · MXN",
        ],
      ].map(([title, value, description]) => (
        <article className="metric-card" key={title}>
          <div>
            <span>{title}</span>
            <Icon name="chart" size={18} />
          </div>
          <strong>{value}</strong>
          <small>{description}</small>
        </article>
      ))}
    </div>
  )
  if (section === "Escáner")
    return <Scanner id={id} data={data} update={commit} />
  return (
    <>
      <DemoNotice />
      {!admin && (
        <div className="product-role-bar">
          <label>
            Vista de rol
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              <option>Dueño</option>
              <option>Gerente</option>
              <option>Cajero</option>
            </select>
          </label>
          <span>
            Los permisos se simulan en pantalla; no sustituyen autorización de
            backend.
          </span>
        </div>
      )}
      {message && (
        <div className="product-feedback" role="status">
          <Icon name="check" size={18} />
          {message}
        </div>
      )}
      {error && !modal && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {role === "Cajero" && !admin ? (
        <section className="panel">
          <h3>Vista de caja</h3>
          <p>
            El cajero solo consulta confirmaciones y canjea en el escáner. No
            edita saldos, reglas ni datos.
          </p>
          <a
            href={`#/escaner?negocio=${encodeURIComponent(id)}`}
            className="button"
          >
            Abrir escáner de demostración <Icon name="arrow" size={18} />
          </a>
        </section>
      ) : (
        <>
          {section === "Resumen" && (
            <>
              <div className="product-section-heading">
                <h3>Métricas requeridas por tu operación</h3>
                <button
                  className="text-link accent-link"
                  onClick={() => {
                    setLoading(true)
                    if (timeout.current) clearTimeout(timeout.current)
                    timeout.current = setTimeout(() => {
                      setData(loadWorkspace(id, name))
                      setLoading(false)
                    }, 350)
                  }}
                >
                  Actualizar datos demo <Icon name="chart" size={16} />
                </button>
              </div>
              {loading ? (
                <div className="panel product-loading" role="status">
                  Cargando datos locales…
                </div>
              ) : (
                summary
              )}
              <div className="product-summary-grid">
                {[
                  [
                    "Visitas registradas",
                    data.transactions.filter(
                      (item) =>
                        item.type === "Compra" || item.type === "Visita",
                    ).length,
                  ],
                  [
                    "Puntos emitidos",
                    data.transactions.reduce(
                      (sum, item) => sum + Math.max(item.points, 0),
                      0,
                    ),
                  ],
                  [
                    "Puntos canjeados",
                    -data.transactions
                      .filter((item) => item.type === "Canje")
                      .reduce((sum, item) => sum + item.points, 0),
                  ],
                  [
                    "Recompensas canjeadas",
                    data.transactions.filter((item) => item.type === "Canje")
                      .length,
                  ],
                ].map(([label, value]) => (
                  <article className="metric-card" key={label}>
                    <div>
                      <span>{label}</span>
                    </div>
                    <strong>{value}</strong>
                    <small>Registros del negocio en esta demo</small>
                  </article>
                ))}
              </div>
            </>
          )}
          {section === "Clientes" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h3>Tus clientes</h3>
                  <p>
                    Una identidad separada por negocio. Datos de muestra, sin
                    verificación real.
                  </p>
                </div>
                <div className="product-actions">
                  {canExport && (
                    <Button
                      secondary
                      onClick={() => downloadCustomers(data.customers)}
                    >
                      Exportar CSV
                    </Button>
                  )}
                  <Button onClick={() => open("cliente")}>
                    <Icon name="plus" size={16} />
                    Añadir cliente demo
                  </Button>
                </div>
              </div>
              <input
                type="search"
                className="product-search"
                placeholder="Buscar por nombre, teléfono o correo"
                aria-label="Buscar clientes"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th>Saldo</th>
                      <th>Sellos</th>
                      <th>Cuenta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.name}
                          {data.team.some(
                            (member) =>
                              phoneId(member.phone) === phoneId(item.phone),
                          ) && (
                            <small className="table-note">
                              Empleado registrado
                            </small>
                          )}
                        </td>
                        <td>{item.phone}</td>
                        <td>{item.points.toLocaleString("es-MX")}</td>
                        <td>{item.stamps}</td>
                        <td>
                          <button
                            className="text-link accent-link"
                            onClick={() => setDetail(item.id)}
                          >
                            Ver historial <Icon name="chevron" size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="empty-state">
                    No hay clientes que coincidan con tu búsqueda.
                  </p>
                )}
              </div>
              {!canExport && (
                <p className="product-help">
                  La exportación CSV está reservada al dueño.
                </p>
              )}
            </section>
          )}
          {section === "Actividad" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h3>Actividad y transacciones</h3>
                  <p>Compras, canjes, ajustes y devoluciones con bitácora.</p>
                </div>
                <select
                  aria-label="Filtrar actividad"
                  value={activityFilter}
                  onChange={(event) => setActivityFilter(event.target.value)}
                >
                  {[
                    "Todas",
                    "Compra",
                    "Visita",
                    "Canje",
                    "Ajuste",
                    "Bono",
                    "Devolución",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              {transactionTable(transactionRows)}
              <div className="product-notice">
                <Icon name="card" size={18} />
                <p>
                  Las compras llegarán del proveedor de cobro. No hay captura
                  manual del cajero ni integración conectada. Efectivo queda
                  fuera de v1 salvo POS integrado.
                </p>
              </div>
              {canManage && (
                <div className="product-actions">
                  <Button secondary onClick={() => open("devolucion")}>
                    Simular devolución de una compra
                  </Button>
                </div>
              )}
            </section>
          )}
          {(section === "Tarjetas de fidelidad" ||
            section === "Tarjetas y reglas") && (
            <>
              <div className="panel product-card-controls">
                <div>
                  <h3>Tarjetas y reglas del negocio</h3>
                  <p>
                    {admin
                      ? "Configura los valores que el negocio podrá consultar."
                      : "Solo el administrador de LoyaLoop configura las tarjetas en la v1."}
                  </p>
                </div>
                <div className="product-actions">
                  {types.map((type) => (
                    <button
                      key={type}
                      className={`product-chip ${
                        cardType === type ? "active" : ""
                      }`}
                      onClick={() => setCardType(type)}
                    >
                      {type}
                      {type === "Recompensas" || type === "Niveles"
                        ? " · vista futura"
                        : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="product-two-columns">
                <section className="panel">
                  <h3>
                    {admin ? "Configuración central" : "Reglas de tu programa"}
                  </h3>
                  {admin ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!program.neutralName.trim()) {
                          setError(
                            "Define un nombre neutro para el modo discreto.",
                          )
                          return
                        }
                        if (passAppearance(program.color).contrast < 4.5) {
                          setError(
                            "Elige un color de pase con contraste suficiente para sus textos.",
                          )
                          return
                        }
                        if (
                          [program.logo, program.image].some(
                            (url) => url && !/^https:\/\//.test(url),
                          )
                        ) {
                          setError(
                            "Las imágenes del pase deben usar una URL HTTPS.",
                          )
                          return
                        }
                        if (commit({ ...data, program }))
                          setMessage(
                            "Reglas guardadas para este negocio. No se recalculan compras históricas en la demo.",
                          )
                      }}
                    >
                      <label>
                        Tipo principal en v1
                        <select
                          value={program.type}
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              type: event.target.value as CardType,
                            })
                          }
                        >
                          <option>Puntos</option>
                          <option>Sellos</option>
                        </select>
                      </label>
                      <div className="owner-form-grid">
                        {[
                          ["Puntos por peso gastado", "rate"],
                          ["Compra mínima para puntos (MXN)", "minimum"],
                          ["Compra mínima para un sello (MXN)", "stampMinimum"],
                          ["Sellos para recompensa", "stampGoal"],
                          [
                            "Compras con puntos por cliente al día",
                            "dailyLimit",
                          ],
                          [
                            "Umbral de alerta (veces el promedio)",
                            "suspiciousFactor",
                          ],
                          ["Bono de bienvenida (puntos)", "welcome"],
                          ["Promociones por mes", "promotionLimit"],
                          ["Gasto de nivel en 12 meses (MXN)", "tierThreshold"],
                          ["Multiplicador del nivel", "tierMultiplier"],
                        ].map(([label, key]) => (
                          <NumericField
                            key={key}
                            label={label}
                            name={key as keyof Program}
                            value={program[(key as keyof Program)] as string}
                            onChange={(field, value) =>
                              setProgram({ ...program, [field]: value })
                            }
                            integer={[
                              "stampGoal",
                              "dailyLimit",
                              "welcome",
                              "promotionLimit",
                            ].includes(key)}
                          />
                        ))}
                      </div>
                      <label>
                        Recompensa al completar los sellos
                        <select
                          value={program.stampReward || ""}
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              stampReward: event.target.value,
                            })
                          }
                        >
                          <option value="">Pendiente de definir</option>
                          {data.rewards.map((reward) => (
                            <option value={reward.id} key={reward.id}>
                              {reward.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Color del pase
                        <input
                          type="color"
                          value={program.color}
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              color: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        URL HTTPS del logo del negocio
                        <input
                          type="url"
                          value={program.logo}
                          placeholder="https://…"
                          onChange={(event) =>
                            setProgram({ ...program, logo: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        URL HTTPS de la imagen principal
                        <input
                          type="url"
                          value={program.image}
                          placeholder="https://…"
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              image: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Nombre neutro del pase
                        <input
                          value={program.neutralName}
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              neutralName: event.target.value,
                            })
                          }
                          required
                        />
                      </label>
                      <label className="product-checkbox">
                        <input
                          type="checkbox"
                          checked={program.discreet}
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              discreet: event.target.checked,
                              location: event.target.checked
                                ? false
                                : program.location,
                            })
                          }
                        />
                        Modo discreto: nombre neutro y sin avisos por ubicación
                      </label>
                      <label className="product-checkbox">
                        <input
                          type="checkbox"
                          checked={program.location}
                          disabled={program.discreet}
                          onChange={(event) =>
                            setProgram({
                              ...program,
                              location: event.target.checked,
                            })
                          }
                        />
                        Avisos por ubicación (opcionales)
                      </label>
                      <p className="product-help">
                        Los campos vacíos permanecen por definir. No se han
                        aprobado precios, límites ni bonos numéricos.
                      </p>
                      <Button type="submit">Guardar reglas demo</Button>
                    </form>
                  ) : (
                    <dl className="owner-details">
                      <div>
                        <dt>Puntos por peso</dt>
                        <dd>{data.program.rate || "Pendiente de definir"}</dd>
                      </div>
                      <div>
                        <dt>Monto base</dt>
                        <dd>Total pagado sin propina · redondeo hacia abajo</dd>
                      </div>
                      <div>
                        <dt>Compra mínima</dt>
                        <dd>{money(Number(data.program.minimum || 0))}</dd>
                      </div>
                      <div>
                        <dt>Sellos</dt>
                        <dd>
                          {data.program.stampGoal || "Meta por definir"} ·
                          reinicio tras recompensa
                        </dd>
                      </div>
                      <div>
                        <dt>Caducidad</dt>
                        <dd>12 meses sin actividad</dd>
                      </div>
                      <div>
                        <dt>Niveles</dt>
                        <dd>
                          Gasto de 12 meses · revisión y descenso permitidos
                        </dd>
                      </div>
                      <div>
                        <dt>Bonos</dt>
                        <dd>
                          Bienvenida: {data.program.welcome || "por definir"}.
                          Cumpleaños y referidos: etapa posterior.
                        </dd>
                      </div>
                      <div>
                        <dt>Límite diario</dt>
                        <dd>{data.program.dailyLimit || "Por definir"}</dd>
                      </div>
                      <div>
                        <dt>Ubicación</dt>
                        <dd>
                          {data.program.discreet
                            ? "Desactivada por modo discreto"
                            : data.program.location
                              ? "Activada (demo)"
                              : "Desactivada"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <DemoNotice>
                    V1: puntos y sellos. Recompensas y niveles se preparan sobre
                    el mismo modelo; no hay un motor de lealtad conectado ni
                    revisión automática de niveles.
                  </DemoNotice>
                </section>
                <PassPreview
                  key={`${cardType}-${JSON.stringify(data.program)}`}
                  data={data}
                  type={cardType}
                  customer={data.customers[0]}
                />
              </div>
            </>
          )}
          {section === "Recompensas" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h3>Catálogo de recompensas</h3>
                  <p>
                    El negocio define el catálogo. Las muestras no son
                    beneficios aprobados.
                  </p>
                </div>
                <Button onClick={() => open("recompensa")}>
                  <Icon name="plus" size={16} />
                  Añadir recompensa
                </Button>
              </div>
              <div className="product-reward-grid">
                {data.rewards.map((reward) => (
                  <article className="product-reward" key={reward.id}>
                    <Icon name="gift" size={30} />
                    <h3>{reward.name}</h3>
                    <strong>
                      {reward.cost.toLocaleString("es-MX")} puntos
                    </strong>
                    <p>
                      Canje en caja con el mismo QR. Cada canje queda en el
                      historial.
                    </p>
                    <a
                      className="text-link accent-link"
                      href={`#/escaner?negocio=${encodeURIComponent(id)}`}
                    >
                      Ver canje en escáner <Icon name="arrow" size={16} />
                    </a>
                  </article>
                ))}
              </div>
              {!data.rewards.length && (
                <p className="empty-state">
                  Todavía no has definido recompensas.
                </p>
              )}
            </section>
          )}
          {section === "Notificaciones" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h3>Notificaciones y promociones</h3>
                  <p>
                    Canal v1: Apple Wallet. WhatsApp y SMS quedan para otra
                    etapa.
                  </p>
                </div>
                <Button onClick={() => open("aviso")}>Crear borrador</Button>
              </div>
              <div className="product-events">
                {[
                  "Puntos ganados",
                  "Recompensa disponible",
                  "Cambio de nivel",
                  "Puntos por vencer",
                ].map((event) => (
                  <span className="product-chip" key={event}>
                    <Icon name="check" size={14} />
                    {event}
                  </span>
                ))}
              </div>
              <DemoNotice>
                Límite mensual:{" "}
                {data.program.promotionLimit || "pendiente de definir"}.{" "}
                {data.program.discreet
                  ? "Modo discreto activo: no se usarán avisos por ubicación."
                  : "Ubicación opcional por negocio."}{" "}
                Las simulaciones no envían avisos reales.
              </DemoNotice>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Aviso</th>
                      <th>Evento</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.notifications.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.title}
                          <small className="table-note">{item.message}</small>
                        </td>
                        <td>{item.event}</td>
                        <td>{item.status}</td>
                        <td>
                          {item.status === "Borrador" && (
                            <button
                              className="text-link accent-link"
                              onClick={() => {
                                if (!data.program.promotionLimit) {
                                  setError(
                                    "El administrador debe definir el límite mensual antes de simular el envío.",
                                  )
                                  return
                                }
                                const sent = data.notifications.filter(
                                  (notification) =>
                                    notification.status === "Simulado" &&
                                    notification.date.slice(0, 7) ===
                                      new Date().toISOString().slice(0, 7),
                                ).length
                                if (
                                  sent >= Number(data.program.promotionLimit)
                                ) {
                                  setError(
                                    "Se alcanzó el límite mensual configurado.",
                                  )
                                  return
                                }
                                commit(
                                  {
                                    ...data,
                                    notifications: data.notifications.map(
                                      (notification) =>
                                        notification.id === item.id
                                          ? {
                                              ...notification,
                                              status: "Simulado",
                                              date: new Date().toISOString(),
                                            }
                                          : notification,
                                    ),
                                  },
                                  "Aviso simulado; no se ha enviado a Apple Wallet.",
                                )
                              }}
                            >
                              Simular aviso Wallet
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.notifications.length && (
                  <p className="empty-state">
                    Aquí aparecerán los borradores y avisos simulados.
                  </p>
                )}
              </div>
            </section>
          )}
          {section === "Sucursales y cajas" && (
            <>
              <div className="product-actions">
                <Button onClick={() => open("sucursal")}>
                  Añadir sucursal
                </Button>
                <Button secondary onClick={() => open("caja")}>
                  Añadir caja
                </Button>
                <Button secondary onClick={() => open("dispositivo")}>
                  Emparejar dispositivo demo
                </Button>
              </div>
              <div className="product-reward-grid">
                {data.branches.map((branch) => (
                  <section className="panel" key={branch.id}>
                    <Icon name="globe" size={24} />
                    <h3>{branch.name}</h3>
                    <p>{branch.address}</p>
                    <p className="product-help">
                      NFC: un enlace de registro por sucursal.
                    </p>
                    <a
                      className="text-link accent-link"
                      href={`#/registro?negocio=${encodeURIComponent(id)}&sucursal=${encodeURIComponent(branch.id)}`}
                    >
                      Probar registro NFC <Icon name="arrow" size={16} />
                    </a>
                    <div className="product-branch-registers">
                      {data.registers
                        .filter((register) => register.branchId === branch.id)
                        .map((register) => (
                          <div key={register.id}>
                            <strong>{register.name}</strong>
                            {data.devices
                              .filter(
                                (device) => device.registerId === register.id,
                              )
                              .map((device) => (
                                <p key={device.id}>
                                  {device.name} · código demo {device.code}
                                </p>
                              ))}
                          </div>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
          {section === "Integraciones" && (
            <>
              <DemoNotice>
                El proveedor del piloto aún no está confirmado. Solo el
                administrador conectará la cuenta del negocio durante el alta.
                Sin integración, se contempla una tarjeta de sellos por visita.
              </DemoNotice>
              <div className="product-two-columns">
                {["Mercado Pago Point", "Clip"].map((provider) => (
                  <section className="panel product-integration" key={provider}>
                    <Icon name="card" size={30} />
                    <h3>{provider}</h3>
                    <span className="owner-account-state trial">
                      <i />
                      Por confirmar · no conectado
                    </span>
                    <p>
                      Requiere cuenta de desarrollador, validación de
                      API/webhooks y acceso autorizado del negocio.
                    </p>
                    <Button secondary onClick={() => open(provider)}>
                      Ver requisitos
                    </Button>
                    {admin && (
                      <button
                        className="text-link accent-link"
                        onClick={() =>
                          commit(
                            {
                              ...data,
                              errors: [
                                {
                                  id: uid(),
                                  provider,
                                  message:
                                    "Error de conexión de ejemplo: credenciales no configuradas",
                                  date: new Date().toISOString(),
                                },
                                ...data.errors,
                              ],
                            },
                            "Error de ejemplo registrado en el panel de integración.",
                          )
                        }
                      >
                        Simular error de integración
                      </button>
                    )}
                  </section>
                ))}
              </div>
              <section className="panel">
                <h3>Apple Wallet · preparación</h3>
                <p>
                  Cuenta Apple Developer a nombre de la empresa, entidad legal y
                  número D-U-N-S para organización. Un certificado de pases para
                  todos los negocios; el nombre y la identidad de cada negocio
                  aparecen en su pase.
                </p>
                <DemoNotice>
                  No se guardan certificados ni claves en el navegador. Se
                  requiere backend para firmar, actualizar pases y enviar
                  notificaciones. El QR será un identificador aleatorio sin
                  datos personales.
                </DemoNotice>
              </section>
              <section className="panel">
                <h3>Errores de integración · demo</h3>
                {data.errors.length ? (
                  data.errors.map((item) => (
                    <p className="product-error-row" key={item.id}>
                      {item.provider} · {item.message}
                      <small>{dateLabel(item.date)}</small>
                    </p>
                  ))
                ) : (
                  <p className="empty-state">No hay errores registrados.</p>
                )}
                <p className="product-help">
                  Etapa posterior: POS de restaurantes, como Parrot y Soft
                  Restaurant. No están conectados.
                </p>
              </section>
              {admin && (
                <section className="panel">
                  <h3>Preparación técnica y de lanzamiento</h3>
                  <dl className="owner-details">
                    <div>
                      <dt>Arquitectura prevista</dt>
                      <dd>
                        Un proyecto web y backend con PostgreSQL. El backend no
                        está implementado.
                      </dd>
                    </div>
                    <div>
                      <dt>Publicación</dt>
                      <dd>VPS de Hostinger; acceso y despliegue pendientes.</dd>
                    </div>
                    <div>
                      <dt>Dominios</dt>
                      <dd>
                        Principal y subdominio corto para registro: por definir.
                      </dd>
                    </div>
                    <div>
                      <dt>Ambientes</dt>
                      <dd>Pruebas y producción separados: pendientes.</dd>
                    </div>
                    <div>
                      <dt>Respaldos</dt>
                      <dd>
                        Diarios, automáticos y fuera del VPS: pendientes de
                        infraestructura.
                      </dd>
                    </div>
                    <div>
                      <dt>Cuentas externas</dt>
                      <dd>
                        Apple Developer, Mercado Pago y Clip: pendientes de
                        autorización.
                      </dd>
                    </div>
                  </dl>
                  <a href="#/legal" className="text-link accent-link">
                    Revisar pendientes legales <Icon name="arrow" size={16} />
                  </a>
                </section>
              )}
            </>
          )}
          {section === "Equipo" && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h3>Equipo y permisos</h3>
                  <p>Roles: administrador LoyaLoop, dueño, gerente y cajero.</p>
                </div>
                {canExport && (
                  <Button onClick={() => open("equipo")}>
                    Añadir miembro demo
                  </Button>
                )}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th>Teléfono</th>
                      <th>Rol</th>
                      <th>Antifraude</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.map((member) => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td>{member.phone}</td>
                        <td>{member.role}</td>
                        <td>
                          {member.excluded
                            ? "Excluido de acumular puntos"
                            : "Marcado como empleado"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.team.length && (
                  <p className="empty-state">
                    Añade empleados para mostrar sus roles y marcar o excluir
                    sus teléfonos.
                  </p>
                )}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Permiso</th>
                      <th>Administrador</th>
                      <th>Dueño</th>
                      <th>Gerente</th>
                      <th>Cajero</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Configurar tarjetas", "Sí", "No", "No", "No"],
                      [
                        "Consultar clientes y actividad",
                        "Sí",
                        "Sí",
                        "Sí",
                        "No",
                      ],
                      ["Ajustar saldo con motivo", "No", "Sí", "Sí", "No"],
                      ["Exportar clientes CSV", "—", "Sí", "No", "No"],
                      ["Consultar escáner y canjear", "—", "Sí", "Sí", "Sí"],
                    ].map((row) => (
                      <tr key={row[0]}>
                        {row.map((value, index) => (
                          <td key={index}>{value}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DemoNotice>
                Los permisos deben validarse en backend antes de producción. La
                comparación de actividad sospechosa y los límites antifraude
                están pendientes de ese motor.
              </DemoNotice>
              <h3>Alertas antifraude · vista de ejemplo</h3>
              <p className="product-help">
                Límite diario: {data.program.dailyLimit || "por definir"}.
                Umbral sobre el promedio:{" "}
                {data.program.suspiciousFactor || "por definir"}. Cada escaneo
                conserva sucursal, caja, dispositivo y fecha.
              </p>
              {data.program.suspiciousFactor ? (
                (() => {
                  const purchases = data.transactions.filter(
                    (item) => item.type === "Compra",
                  )
                  const average =
                    purchases.length / Math.max(data.customers.length, 1)
                  const alerts = data.customers.filter(
                    (person) =>
                      purchases.filter((item) => item.customerId === person.id)
                        .length >
                      average * Number(data.program.suspiciousFactor),
                  )
                  return alerts.length ? (
                    alerts.map((person) => (
                      <p className="product-error-row" key={person.id}>
                        Revisar actividad de {person.name}: por encima del
                        umbral configurado. Señal de demo, no una conclusión de
                        fraude.
                      </p>
                    ))
                  ) : (
                    <p className="product-help">
                      No hay señales sobre el umbral configurado en los datos de
                      muestra.
                    </p>
                  )
                })()
              ) : (
                <p className="product-help">
                  El administrador debe definir el umbral antes de mostrar
                  alertas de muestra.
                </p>
              )}
            </section>
          )}
          {section === "Configuración" && (
            <div className="product-two-columns">
              <section className="panel">
                <h3>Datos del negocio</h3>
                <form
                  onSubmit={(event) =>
                    form(event, (values) =>
                      commit({
                        ...data,
                        name: String(values.get("name")).trim(),
                        email: String(values.get("email")),
                        phone: String(values.get("phone")),
                      }),
                    )
                  }
                >
                  <label>
                    Nombre
                    <input name="name" defaultValue={data.name} required />
                  </label>
                  <label>
                    Correo de contacto
                    <input
                      type="email"
                      name="email"
                      defaultValue={data.email}
                      required
                    />
                  </label>
                  <label>
                    Teléfono
                    <input name="phone" type="tel" defaultValue={data.phone} />
                  </label>
                  <Button type="submit">Guardar datos demo</Button>
                </form>
              </section>
              <section className="panel">
                <h3>Plan y facturación</h3>
                <dl className="owner-details">
                  <div>
                    <dt>Idioma y moneda</dt>
                    <dd>Español · pesos mexicanos (MXN)</dd>
                  </div>
                  <div>
                    <dt>Unidad de cobro</dt>
                    <dd>Por sucursal · {data.branches.length} registradas</dd>
                  </div>
                  <div>
                    <dt>Tarifa</dt>
                    <dd>Pendiente de definir</dd>
                  </div>
                  <div>
                    <dt>Facturación v1</dt>
                    <dd>Manual · empresa emisora por definir</dd>
                  </div>
                  <div>
                    <dt>Datos</dt>
                    <dd>
                      Propiedad del negocio; LoyaLoop los procesa por su cuenta.
                    </dd>
                  </div>
                  <div>
                    <dt>Cancelación</dt>
                    <dd>
                      Exportación por el dueño. Plazo de borrado pendiente.
                    </dd>
                  </div>
                </dl>
                <a href="#/legal" className="text-link accent-link">
                  Privacidad, términos y contrato{" "}
                  <Icon name="arrow" size={16} />
                </a>
                <p className="product-help">
                  La facturación automática queda para después. No se cobran
                  importes en esta demo.
                </p>
              </section>
            </div>
          )}
        </>
      )}
      {customer && (
        <Dialog
          title={customer.name}
          close={() => {
            setDetail(null)
            setError("")
          }}
        >
          <dl className="owner-details">
            <div>
              <dt>Teléfono</dt>
              <dd>{customer.phone}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{customer.email || "No proporcionado"}</dd>
            </div>
            <div>
              <dt>Saldo</dt>
              <dd>
                {customer.points} puntos · {customer.stamps} sellos
              </dd>
            </div>
            <div>
              <dt>Gasto acumulado demo</dt>
              <dd>{money(customer.spending)}</dd>
            </div>
            <div>
              <dt>Promociones</dt>
              <dd>
                {customer.promotions
                  ? "Consentimiento de muestra registrado"
                  : "No autorizadas"}
              </dd>
            </div>
          </dl>
          <h3>Historial del cliente</h3>
          {transactionTable(
            data.transactions.filter((item) => item.customerId === customer.id),
          )}
          {canManage && (
            <form
              onSubmit={(event) =>
                form(event, (values) => {
                  const delta = Number(values.get("points")),
                    reason = String(values.get("reason") || "").trim()
                  if (!reason || !Number.isInteger(delta) || delta === 0) {
                    setError(
                      "Introduce un ajuste entero distinto de cero y un motivo.",
                    )
                    return
                  }
                  if (customer.points + delta < 0) {
                    setError("El ajuste no puede dejar un saldo negativo.")
                    return
                  }
                  const transaction: Transaction = {
                    id: uid(),
                    customerId: customer.id,
                    type: "Ajuste",
                    points: delta,
                    amount: 0,
                    reason: `${role}: ${reason}`,
                    date: new Date().toISOString(),
                    branch: "Panel del negocio",
                    register: "No aplica",
                    device: "Navegador demo",
                  }
                  commit(
                    {
                      ...data,
                      customers: data.customers.map((item) =>
                        item.id === customer.id
                          ? { ...item, points: item.points + delta }
                          : item,
                      ),
                      transactions: [transaction, ...data.transactions],
                    },
                    "Ajuste de demo guardado con motivo y bitácora.",
                  )
                })
              }
            >
              <h3>Ajuste manual de saldo</h3>
              <label>
                Puntos a sumar o restar
                <input name="points" type="number" step="1" required />
              </label>
              <label>
                Motivo obligatorio
                <textarea name="reason" required maxLength={250} />
              </label>
              <Button type="submit">Registrar ajuste demo</Button>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
      {modal && (
        <Dialog
          title={
            modal === "cliente"
              ? "Un nuevo cliente."
              : modal === "recompensa"
                ? "Define una recompensa."
                : modal === "aviso"
                  ? "Un mensaje cercano."
                  : modal === "sucursal"
                    ? "Una nueva sucursal."
                    : modal === "caja"
                      ? "Una nueva caja."
                      : modal === "dispositivo"
                        ? "Emparejar un escáner."
                        : modal === "equipo"
                          ? "Una persona de tu equipo."
                          : modal === "devolucion"
                            ? "Devolución de ejemplo."
                            : modal
          }
          close={() => setModal("")}
        >
          {["Mercado Pago Point", "Clip"].includes(modal) ? (
            <>
              <p className="product-help">
                Proveedor pendiente de confirmar con Affair. Necesitamos validar
                su sistema de cobro, cuentas de desarrollador, credenciales
                seguras, webhooks, idempotencia y ventana de escaneo de 5
                minutos.
              </p>
              <DemoNotice>
                No se solicita ni guarda ninguna credencial en esta interfaz. La
                conexión se implementará en backend.
              </DemoNotice>
              <Button onClick={() => setModal("")}>Entendido</Button>
            </>
          ) : (
            <form
              onSubmit={(event) =>
                form(event, (values) => {
                  const value = (key: string) =>
                    String(values.get(key) || "").trim()
                  let next = { ...data }
                  if (modal === "cliente") {
                    const phone = phoneId(value("phone"))
                    if (!value("name") || phone.length !== 10) {
                      setError(
                        "Introduce un nombre y un teléfono mexicano de 10 dígitos.",
                      )
                      return
                    }
                    if (
                      data.customers.some(
                        (item) => phoneId(item.phone) === phone,
                      )
                    ) {
                      setError("Este teléfono ya tiene cuenta en este negocio.")
                      return
                    }
                    next.customers = [
                      ...data.customers,
                      {
                        id: uid(),
                        name: value("name"),
                        phone,
                        email: value("email"),
                        birthday: value("birthday"),
                        points: 0,
                        stamps: 0,
                        spending: 0,
                        tier: "Sin nivel",
                        createdAt: new Date().toISOString(),
                        privacy: false,
                        promotions: false,
                      },
                    ]
                  }
                  if (modal === "recompensa") {
                    if (!value("name") || Number(value("cost")) < 1) {
                      setError("Define nombre y un costo positivo.")
                      return
                    }
                    next.rewards = [
                      ...data.rewards,
                      {
                        id: uid(),
                        name: value("name"),
                        cost: Number(value("cost")),
                      },
                    ]
                  }
                  if (modal === "aviso") {
                    if (!value("name") || !value("message")) {
                      setError("Completa título y mensaje.")
                      return
                    }
                    next.notifications = [
                      ...data.notifications,
                      {
                        id: uid(),
                        title: value("name"),
                        message: value("message"),
                        event: value("event"),
                        status: "Borrador",
                        date: new Date().toISOString(),
                      },
                    ]
                  }
                  if (modal === "sucursal") {
                    if (!value("name")) return
                    next.branches = [
                      ...data.branches,
                      {
                        id: uid(),
                        name: value("name"),
                        address: value("address"),
                      },
                    ]
                  }
                  if (modal === "caja")
                    next.registers = [
                      ...data.registers,
                      {
                        id: uid(),
                        name: value("name"),
                        branchId: value("branch"),
                      },
                    ]
                  if (modal === "dispositivo") {
                    if (!data.registers.length) {
                      setError(
                        "Crea una caja antes de emparejar un dispositivo.",
                      )
                      return
                    }
                    const device = data.devices.find(
                      (item) => item.code === value("code"),
                    )
                    if (!device) {
                      setError(
                        "Código demo inválido. Usa el código que aparece junto al dispositivo de ejemplo.",
                      )
                      return
                    }
                    next.devices = data.devices.map((item) =>
                      item.id === device.id
                        ? { ...item, registerId: value("register") }
                        : item,
                    )
                  }
                  if (modal === "equipo") {
                    if (
                      !value("name") ||
                      phoneId(value("phone")).length !== 10
                    ) {
                      setError("Introduce nombre y un teléfono de 10 dígitos.")
                      return
                    }
                    next.team = [
                      ...data.team,
                      {
                        id: uid(),
                        name: value("name"),
                        phone: phoneId(value("phone")),
                        role: value("role") as Role,
                        excluded: values.get("exclude") === "on",
                      },
                    ]
                  }
                  if (modal === "devolucion") {
                    const purchase = data.transactions.find(
                      (item) => item.id === value("purchase"),
                    )
                    if (
                      !purchase ||
                      data.transactions.some(
                        (item) =>
                          item.type === "Devolución" &&
                          item.reference === purchase.id,
                      )
                    ) {
                      setError("Esta compra no existe o ya fue devuelta.")
                      return
                    }
                    const owner = data.customers.find(
                      (item) => item.id === purchase.customerId,
                    )
                    if (!owner || owner.points < purchase.points) {
                      setError(
                        "No hay saldo suficiente para revertir los puntos de esta compra en la demo.",
                      )
                      return
                    }
                    next.customers = data.customers.map((item) =>
                      item.id === purchase.customerId
                        ? {
                            ...item,
                            points: item.points - purchase.points,
                            spending: Math.max(
                              0,
                              item.spending - purchase.amount,
                            ),
                          }
                        : item,
                    )
                    next.transactions = [
                      {
                        ...purchase,
                        id: uid(),
                        type: "Devolución",
                        amount: -purchase.amount,
                        points: -purchase.points,
                        reason: "Reversión de una compra de ejemplo",
                        reference: purchase.id,
                        date: new Date().toISOString(),
                      },
                      ...data.transactions,
                    ]
                  }
                  if (commit(next)) setModal("")
                })
              }
            >
              {!["dispositivo", "devolucion"].includes(modal) && (
                <label>
                  {modal === "cliente" || modal === "equipo"
                    ? "Nombre completo"
                    : modal === "aviso"
                      ? "Título"
                      : "Nombre"}
                  <input name="name" required maxLength={100} />
                </label>
              )}
              {(modal === "cliente" || modal === "equipo") && (
                <label>
                  Teléfono obligatorio
                  <input
                    name="phone"
                    type="tel"
                    placeholder="10 dígitos · México"
                    required
                  />
                </label>
              )}
              {modal === "cliente" && (
                <>
                  <label>
                    Correo (opcional)
                    <input name="email" type="email" />
                  </label>
                  <label>
                    Cumpleaños (opcional)
                    <input
                      name="birthday"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </label>
                  <DemoNotice>
                    Alta interna de demo. El cliente tendrá que verificar su
                    teléfono y aceptar privacidad en el registro NFC; no se
                    marca su consentimiento sin permiso.
                  </DemoNotice>
                </>
              )}
              {modal === "recompensa" && (
                <label>
                  Costo en puntos
                  <input name="cost" type="number" min="1" step="1" required />
                </label>
              )}
              {modal === "aviso" && (
                <>
                  <label>
                    Evento
                    <select name="event">
                      {[
                        "Promoción",
                        "Puntos ganados",
                        "Recompensa disponible",
                        "Cambio de nivel",
                        "Puntos por vencer",
                      ].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mensaje y condiciones
                    <textarea name="message" required maxLength={300} />
                  </label>
                </>
              )}
              {modal === "sucursal" && (
                <label>
                  Dirección
                  <input name="address" />
                </label>
              )}
              {modal === "caja" && (
                <label>
                  Sucursal
                  <select name="branch">
                    {data.branches.map((branch) => (
                      <option value={branch.id} key={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {modal === "dispositivo" && (
                <>
                  <label>
                    Código de emparejamiento demo
                    <input
                      name="code"
                      inputMode="numeric"
                      required
                      placeholder="123456"
                    />
                  </label>
                  <label>
                    Caja
                    <select name="register">
                      {data.registers.map((register) => (
                        <option value={register.id} key={register.id}>
                          {register.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <DemoNotice>
                    Se simula un emparejamiento local. Los códigos de producción
                    serán temporales y validados por el servidor.
                  </DemoNotice>
                </>
              )}
              {modal === "equipo" && (
                <>
                  <label>
                    Rol
                    <select name="role">
                      <option>Gerente</option>
                      <option>Cajero</option>
                      <option>Dueño</option>
                    </select>
                  </label>
                  <label className="product-checkbox">
                    <input name="exclude" type="checkbox" />
                    Excluir este teléfono de acumular puntos
                  </label>
                  <DemoNotice>
                    No se envía invitación ni se crea acceso real. Los teléfonos
                    se marcan para antifraude.
                  </DemoNotice>
                </>
              )}
              {modal === "devolucion" && (
                <label>
                  Compra
                  <select name="purchase">
                    {data.transactions
                      .filter((item) => item.type === "Compra")
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {money(item.amount)} · {dateLabel(item.date)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit">Guardar en la demo</Button>
            </form>
          )}
        </Dialog>
      )}
    </>
  )
}

function Scanner({
  id,
  data,
  update,
}: {
  id: string
  data: Workspace
  update: (next: Workspace, feedback?: string) => boolean
}) {
  const [state, setState] = useState("espera")
  const [person, setPerson] = useState(data.customers[0]?.id || "")
  const [online, setOnline] = useState(true)
  const [scan, setScan] = useState<{
    token: string
    time: number
    used: boolean
  } | null>(null)
  const [result, setResult] = useState("")
  const [deviceId, setDeviceId] = useState(data.devices[0]?.id || "")
  const customer = data.customers.find((item) => item.id === person)
  const device = data.devices.find((item) => item.id === deviceId)
  const register = data.registers.find((item) => item.id === device?.registerId)
  const branch = data.branches.find((item) => item.id === register?.branchId)
  function identify() {
    if (!online) {
      setState("sin conexión")
      return
    }
    if (!customer || !device || !register || !branch) {
      setState("QR inválido")
      return
    }
    setScan({ token: uid(), time: Date.now(), used: false })
    setState("identificado")
    setResult("")
  }
  function redeem(rewardId?: string) {
    if (!online) {
      setState("sin conexión")
      return
    }
    if (!scan) {
      setResult("Presenta de nuevo el QR.")
      return
    }
    const result = applyDemoScan(data, {
      ...scan,
      customerId: person,
      deviceId,
      online,
      rewardId,
    })
    if (!result.next) {
      setResult(result.error || "No se ha registrado el escaneo.")
      return
    }
    if (update(result.next)) {
      setScan({ ...scan, used: true })
      setState("confirmación")
      setResult(result.message || "Actividad guardada en la demo.")
    }
  }
  return (
    <section className="panel scanner-panel">
      <div className="panel-title">
        <div>
          <h3>Escáner en caja</h3>
          <p>
            Ventana de 5 minutos. Un escaneo y un cobro se usan una sola vez.
          </p>
        </div>
        <label className="product-checkbox">
          <input
            type="checkbox"
            checked={online}
            onChange={(event) => {
              setOnline(event.target.checked)
              if (!event.target.checked) setState("sin conexión")
              else setState("espera")
            }}
          />
          Conexión demo
        </label>
      </div>
      <DemoNotice>
        Simulador del escáner: no usa cámara, no procesa pagos ni lee un QR
        real. El cajero no captura montos. El enlace identifica el negocio: {id}
        .
      </DemoNotice>
      <div
        className={`scanner-state ${
          state === "sin conexión" || state === "QR inválido"
            ? "scanner-error"
            : ""
        }`}
      >
        <Icon
          name={
            state === "confirmación"
              ? "check"
              : state === "espera"
                ? "grid"
                : state === "identificado"
                  ? "users"
                  : "close"
          }
          size={50}
        />
        <h2>
          {state === "espera"
            ? "Acerca tu tarjeta."
            : state === "identificado"
              ? customer?.name
              : state === "confirmación"
                ? "Todo listo."
                : state}
        </h2>
        <p role="status">
          {state === "espera"
            ? "Esperando el QR de tu pase de Apple Wallet."
            : state === "sin conexión"
              ? "No se registra el escaneo. Recupera la conexión antes de continuar."
              : state === "QR inválido"
                ? "Este QR no corresponde a un cliente válido de este negocio."
                : result ||
                  "Cliente identificado. Esperando confirmación del pago integrado."}
        </p>
      </div>
      <div className="owner-form-grid">
        <label>
          Cliente de muestra
          <select
            value={person}
            onChange={(event) => {
              setPerson(event.target.value)
              setState("espera")
              setScan(null)
            }}
          >
            {data.customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dispositivo emparejado
          <select
            value={deviceId}
            onChange={(event) => {
              setDeviceId(event.target.value)
              setScan(null)
              setState("espera")
            }}
          >
            {data.devices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="product-actions">
        <Button onClick={identify}>Simular QR válido</Button>
        <Button
          secondary
          onClick={() => {
            setScan(null)
            setState(online ? "QR inválido" : "sin conexión")
          }}
        >
          Probar QR inválido
        </Button>
        {state === "identificado" && (
          <Button onClick={() => redeem()}>
            {data.program.type === "Sellos"
              ? "Simular visita"
              : "Simular pago integrado"}
          </Button>
        )}
      </div>
      {state === "identificado" && (
        <div className="scanner-rewards">
          <h3>Canjear con el mismo QR</h3>
          {data.rewards.map((reward) => (
            <Button secondary key={reward.id} onClick={() => redeem(reward.id)}>
              {reward.name} · {reward.cost} puntos
            </Button>
          ))}
        </div>
      )}
      <p className="product-help">
        Trazabilidad: {branch?.name || "Sin sucursal"} /{" "}
        {register?.name || "Sin caja"} / {device?.name || "Sin dispositivo"}. La
        idempotencia y el antifraude de producción deberán verificarse en el
        servidor.
      </p>
    </section>
  )
}

function ConsumerRegistration() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "")
  const id = params.get("negocio") || pilotId,
    branchId = params.get("sucursal") || "principal"
  const [data, setData] = useState(() => loadWorkspace(id))
  const [step, setStep] = useState("registro")
  const [recover, setRecover] = useState(false)
  const [draft, setDraft] = useState<{
    name: string
    phone: string
    email: string
    birthday: string
    promotions: boolean
  } | null>(null)
  const [customer, setCustomer] = useState<Customer | undefined>(undefined)
  const [error, setError] = useState("")
  const [type, setType] = useState<CardType>("Sellos")
  const branch = data.branches.find((item) => item.id === branchId)
  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    const values = new FormData(event.currentTarget),
      phone = phoneId(String(values.get("phone")))
    if (phone.length !== 10) {
      setError("Introduce un teléfono mexicano de 10 dígitos.")
      return
    }
    const existing = data.customers.find(
      (item) => phoneId(item.phone) === phone,
    )
    if (recover && !existing) {
      setError(
        "No encontramos una cuenta con este teléfono en este negocio. Puedes registrarte.",
      )
      return
    }
    if (!recover && !String(values.get("name")).trim()) {
      setError("Introduce tu nombre.")
      return
    }
    setDraft({
      name: existing?.name || String(values.get("name")).trim(),
      phone,
      email: String(values.get("email") || ""),
      birthday: String(values.get("birthday") || ""),
      promotions: values.get("promotions") === "on",
    })
    setStep("código")
  }
  return (
    <div className="consumer-page">
      <div className="consumer-shell">
        <Logo />
        <span className="eyebrow">TU COMUNIDAD, SIEMPRE CERCA</span>
        <h1>
          {step === "registro"
            ? "Vuelve a disfrutar lo que te gusta."
            : step === "código"
              ? "Tu teléfono, tu tarjeta."
              : "Lo bueno ya está contigo."}
        </h1>
        <p>
          {data.name} · {branch?.name || "Sucursal desconocida"}
        </p>
        <DemoNotice>
          Prueba de registro NFC por sucursal. No se envían SMS ni se emiten
          pases de Apple Wallet reales.
        </DemoNotice>
        {!branch ? (
          <p className="form-error">
            Este enlace no corresponde a una sucursal de este negocio.
          </p>
        ) : step === "registro" ? (
          <>
            <div className="role-tabs">
              <button
                className={!recover ? "active" : ""}
                onClick={() => {
                  setRecover(false)
                  setError("")
                }}
              >
                Crear mi cuenta
              </button>
              <button
                className={recover ? "active" : ""}
                onClick={() => {
                  setRecover(true)
                  setError("")
                }}
              >
                Ya tengo cuenta
              </button>
            </div>
            <form onSubmit={register}>
              {!recover && (
                <label>
                  Nombre obligatorio
                  <input name="name" autoComplete="name" required />
                </label>
              )}
              <label>
                Teléfono obligatorio
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="10 dígitos · México"
                  required
                />
              </label>
              {!recover && (
                <>
                  <label>
                    Correo (opcional)
                    <input name="email" type="email" autoComplete="email" />
                  </label>
                  <label>
                    Cumpleaños (opcional)
                    <input
                      name="birthday"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </label>
                  <label className="product-checkbox">
                    <input name="promotions" type="checkbox" />
                    Quiero recibir promociones (opcional).
                  </label>
                </>
              )}
              <label className="product-checkbox">
                <input type="checkbox" required />
                Acepto el aviso de privacidad de demostración.{" "}
                <a href="#/legal">Consultar borrador</a>
              </label>
              <Button type="submit">
                {recover ? "Recuperar mi tarjeta" : "Continuar"}
              </Button>
            </form>
          </>
        ) : step === "código" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const values = new FormData(event.currentTarget)
              if (values.get("code") !== "123456") {
                setError("Código de muestra incorrecto. Usa 123456.")
                return
              }
              if (!draft) return
              const existing = data.customers.find(
                (item) => phoneId(item.phone) === draft.phone,
              )
              const person: Customer = existing
                ? { ...existing, privacy: true }
                : {
                    ...draft,
                    id: uid(),
                    points: Number(data.program.welcome || 0),
                    stamps: 0,
                    spending: 0,
                    tier: "Sin nivel configurado",
                    createdAt: new Date().toISOString(),
                    privacy: true,
                  }
              const next = {
                ...data,
                customers: existing
                  ? data.customers.map((item) =>
                      item.id === person.id ? person : item,
                    )
                  : [...data.customers, person],
                transactions:
                  !existing && person.points > 0
                    ? [
                        {
                          id: uid(),
                          customerId: person.id,
                          type: "Bono" as const,
                          points: person.points,
                          amount: 0,
                          reason: "Bono de bienvenida de demostración",
                          date: new Date().toISOString(),
                          branch: branch?.name || "Registro NFC",
                          register: "No aplica",
                          device: "Registro NFC demo",
                        },
                        ...data.transactions,
                      ]
                    : data.transactions,
              }
              try {
                saveWorkspace(id, next)
                setData(next)
                setCustomer(person)
                setStep("tarjeta")
                setError("")
              } catch {
                setError("No se ha podido guardar la cuenta de demo.")
              }
            }}
          >
            <p className="product-help">
              Código de demostración: <strong>123456</strong>. No se ha enviado
              ningún SMS a {draft?.phone}.
            </p>
            <label>
              Código de verificación demo
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
              />
            </label>
            <Button type="submit">Verificar en la demo</Button>
            <button
              type="button"
              className="text-link accent-link mt-4"
              onClick={() => setStep("registro")}
            >
              Cambiar teléfono
            </button>
          </form>
        ) : (
          <>
            <div className="product-actions">
              {types.map((item) => (
                <button
                  className={`product-chip ${type === item ? "active" : ""}`}
                  key={item}
                  onClick={() => setType(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <PassPreview data={data} type={type} customer={customer} />
            <Button
              onClick={() =>
                setError(
                  "Apple Wallet requiere backend, cuenta Apple Developer y certificado de pases. Aquí solo puedes ver la tarjeta de muestra.",
                )
              }
            >
              Agregar a Apple Wallet · vista demo
            </Button>
            <p className="product-help">
              No se descarga un archivo .pkpass ni se agrega una tarjeta real.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <a href="#/" className="text-link accent-link">
          Volver a LoyaLoop <Icon name="arrow" size={16} />
        </a>
      </div>
    </div>
  )
}

function ScannerPage() {
  return (
    <div className="scanner-page">
      <div className="scanner-page-header">
        <Logo />
        <a href="#/dashboard" className="text-link accent-link">
          Volver al negocio
        </a>
      </div>
      <ProductModules section="Escáner" />
    </div>
  )
}

function LegalPage() {
  return (
    <div className="consumer-page">
      <div className="consumer-shell legal-shell">
        <Logo />
        <h1>Privacidad y condiciones.</h1>
        <DemoNotice>
          Documentos pendientes de revisión por un abogado. Estos resúmenes de
          demo no son documentos legales aprobados y no habilitan un
          lanzamiento.
        </DemoNotice>
        {[
          "Aviso de privacidad para clientes finales",
          "Aviso y términos para negocios",
          "Contrato único con negocios",
          "Facturación y empresa emisora",
        ].map((title) => (
          <section className="panel" key={title}>
            <h3>{title}</h3>
            <p>
              Contenido definitivo pendiente. Los datos pertenecen al negocio;
              LoyaLoop los procesa por su cuenta. Deben definirse finalidades,
              derechos, conservación, tratamiento y condiciones del servicio
              antes de producción.
            </p>
          </section>
        ))}
        <a className="text-link accent-link" href="#/">
          Volver al sitio
        </a>
      </div>
    </div>
  )
}
