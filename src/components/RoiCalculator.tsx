import { useId, useState, type ReactNode } from "react"
import { Button, Icon } from "./ui"

type Kind = "cafe" | "beauty" | "motel" | "store"
type PlanId = "starter" | "pro" | "proGestion"

/** Plan prices (MXN per month for one branch), as the landing shows them. */
export const PLANS: Record<PlanId, { name: string; price: number; pitch: string }> = {
  starter: { name: "Starter", price: 390, pitch: "Un sello por visita. La configuras tú en minutos." },
  pro: { name: "Pro", price: 990, pitch: "Puntos que se suman solos desde tu terminal de cobro." },
  proGestion: { name: "Pro + gestión", price: 1980, pitch: "Modo discreto, terminal conectada y nosotros llevamos tus promociones." },
}

const KINDS: Record<Kind, { label: string; clients: number; ticket: number }> = {
  cafe: { label: "Café o restaurante", clients: 600, ticket: 120 },
  beauty: { label: "Estética o barbería", clients: 250, ticket: 350 },
  motel: { label: "Motel u hotel", clients: 800, ticket: 650 },
  store: { label: "Tienda u otro", clients: 400, ticket: 300 },
}

const money = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`

function planFor(kind: Kind, ticket: number): PlanId {
  if (kind === "motel") return "proGestion"
  return ticket < 200 ? "starter" : "pro"
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; format: (n: number) => string; hint?: ReactNode; onChange: (n: number) => void }) {
  const id = useId()
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100
  return (
    <div className="ll-calc-field">
      <label htmlFor={id}>
        <span>{props.label}</span>
        <output htmlFor={id}>{props.format(props.value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        style={{ ["--fill" as string]: `${fill}%` }}
        aria-valuetext={props.format(props.value)}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.hint && <small>{props.hint}</small>}
    </div>
  )
}

/** Landing calculator: how much a few extra visits are worth, in pesos. */
export default function RoiCalculator({ onCall, onStart }: { onCall: () => void; onStart: () => void }) {
  const [kind, setKind] = useState<Kind>("cafe")
  const [clients, setClients] = useState(KINDS.cafe.clients)
  const [ticket, setTicket] = useState(KINDS.cafe.ticket)
  const [rate, setRate] = useState(8)

  const extraVisits = Math.round((clients * rate) / 100)
  const extraSales = extraVisits * ticket
  const plan = PLANS[planFor(kind, ticket)]
  const visitsToPay = Math.max(1, Math.ceil(plan.price / ticket))
  const roi = extraSales / plan.price

  function pick(next: Kind) {
    setKind(next)
    setClients(KINDS[next].clients)
    setTicket(KINDS[next].ticket)
  }

  return (
    <div className="ll-calc">
      <div className="ll-calc-inputs">
        <div className="ll-calc-kinds" role="radiogroup" aria-label="Tipo de negocio">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-active" : ""} onClick={() => pick(k)}>
              {KINDS[k].label}
            </button>
          ))}
        </div>
        <Slider label="Clientes distintos al mes" value={clients} min={50} max={3000} step={50} format={(n) => n.toLocaleString("es-MX")} onChange={setClients} />
        <Slider label="Ticket promedio" value={ticket} min={50} max={2000} step={10} format={(n) => `${money(n)} MXN`} onChange={setTicket} />
        <Slider
          label="Clientes que vuelven una vez más al mes"
          value={rate}
          min={2}
          max={20}
          step={1}
          format={(n) => `${n}%`}
          hint="Una estimación prudente está entre 5% y 10%."
          onChange={setRate}
        />
      </div>
      <div className="ll-calc-result" aria-live="polite">
        <span className="ll-calc-kicker">VENTAS EXTRA ESTIMADAS</span>
        <strong className="ll-calc-big">{money(extraSales)}</strong>
        <span className="ll-calc-unit">MXN al mes · {extraVisits.toLocaleString("es-MX")} visitas extra</span>
        <div className="ll-calc-plan">
          <span className="ll-calc-kicker">PLAN SUGERIDO</span>
          <b>{plan.name}</b>
          <p>{plan.pitch}</p>
          <p>
            {money(plan.price)} al mes. Se paga con <b>{visitsToPay === 1 ? "1 visita extra" : `${visitsToPay} visitas extra`}</b> al mes
            {roi >= 1 ? ` · retorno ×${roi.toFixed(1)}` : ""}.
          </p>
        </div>
        {planFor(kind, ticket) === "starter" ? (
          <Button onClick={onStart}>
            Empieza gratis 14 días <Icon name="arrow" size={16} />
          </Button>
        ) : (
          <Button onClick={onCall}>
            Agenda una llamada <Icon name="arrow" size={16} />
          </Button>
        )}
        <small className="ll-calc-note">Estimación orientativa con tus números. No incluye el costo de las recompensas que regales; el resultado depende de tu negocio y de cómo promuevas el programa.</small>
      </div>
    </div>
  )
}
