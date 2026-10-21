import { useMemo, useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync, type Async } from "../../lib/hooks"
import { href } from "../../lib/router"
import type { TransactionKind } from "../../lib/types"
import { dateTime, formatPhone, int, kindLabel, money, relative } from "../../lib/util"
import { Badge, Button, Card, Empty, ErrorState, Field, Icon, Loading, Notice, PageHeader, Pagination, SelectField, Tabs, useToast } from "../../components/ui"

const PAGE = 25

export default function Activity({ me, initialTab }: { me: api.Me; initialTab: "all" | "review" }) {
  const [tab, setTab] = useState<"all" | "review">(initialTab)
  const queue = useAsync(api.reviewQueue)
  return (
    <>
      <PageHeader title="Actividad" description="Compras, visitas, canjes, ajustes y devoluciones, con la caja y el dispositivo donde ocurrieron." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: "Movimientos" },
          { value: "review", label: "Por asignar", count: queue.data?.length },
        ]}
      />
      {tab === "all" ? <Movements me={me} /> : <Review queue={queue} />}
    </>
  )
}

function Movements({ me }: { me: api.Me }) {
  const bundle = useAsync(api.bundle)
  const [kind, setKind] = useState<TransactionKind | "">("")
  const [branchId, setBranchId] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const list = useAsync(() => api.activity({ kind, branchId, from, to, query }), [kind, branchId, from, to, query])
  const rows = list.data || []
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE, current * PAGE)
  const totals = useMemo(
    () => ({
      amount: rows.filter((r) => r.kind === "purchase" || r.kind === "refund").reduce((s, r) => s + r.amount, 0),
      points: rows.reduce((s, r) => s + r.points, 0),
    }),
    [rows],
  )
  const reset = () => setPage(1)
  return (
    <Card padded={false}>
      <div className="ll-toolbar" style={{ padding: "20px 22px" }}>
        <div className="ll-field ll-search">
          <label htmlFor="buscar-actividad">Buscar</label>
          <Icon name="search" size={18} />
          <input id="buscar-actividad" type="search" placeholder="Cliente o detalle" value={query} onChange={(e) => { setQuery(e.target.value); reset() }} />
        </div>
        <SelectField label="Tipo" value={kind} onChange={(e) => { setKind(e.target.value as TransactionKind | ""); reset() }}>
          <option value="">Todos</option>
          {(Object.keys(kindLabel) as TransactionKind[]).map((k) => (
            <option key={k} value={k}>
              {kindLabel[k]}
            </option>
          ))}
        </SelectField>
        {(bundle.data?.branches.length || 0) > 1 && (
          <SelectField label="Sucursal" value={branchId} onChange={(e) => { setBranchId(e.target.value); reset() }}>
            <option value="">Todas</option>
            {bundle.data!.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
        )}
        <Field label="Desde" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); reset() }} />
        <Field label="Hasta" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); reset() }} />
      </div>
      {list.error ? (
        <div style={{ padding: 22 }}>
          <ErrorState message={list.error} retry={list.reload} />
        </div>
      ) : !list.data ? (
        <div style={{ padding: 22 }}>
          <Loading rows={6} />
        </div>
      ) : !rows.length ? (
        <Empty icon="activity" title="No hay movimientos con estos filtros" action={<Button variant="secondary" onClick={() => { setKind(""); setBranchId(""); setFrom(""); setTo(""); setQuery("") }}>Quitar filtros</Button>} />
      ) : (
        <>
          <p className="ll-table-foot" style={{ paddingTop: 0 }}>
            {int(rows.length)} movimientos · ventas netas {money(totals.amount)}
            {bundle.data?.program.type !== "stamps" && ` · ${int(totals.points)} puntos netos`}
          </p>
          <div className="ll-table-wrap">
            <table className="ll-table is-responsive">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Movimiento</th>
                  <th className="num">Monto sin propina</th>
                  <th className="num">Puntos</th>
                  <th className="num">Sellos</th>
                  <th>Caja y dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <td className="ll-td-main">
                      <a className="ll-cell-main" href={href(`/panel/clientes/${t.customerId}`)}>
                        {t.customerName}
                      </a>
                      <small>{dateTime(t.createdAt)}</small>
                    </td>
                    <td data-label="Movimiento">
                      {kindLabel[t.kind]} {t.refunded && <Badge>Devuelta</Badge>}
                      <small>
                        {t.reason}
                        {t.actorName ? ` · ${t.actorName}` : ""}
                      </small>
                    </td>
                    <td className="num" data-label="Monto">
                      {t.amount ? money(t.amount) : "—"}
                    </td>
                    <td className="num" data-label="Puntos">
                      {t.points ? <span className={t.points > 0 ? "ll-positive" : "ll-negative"}>{`${t.points > 0 ? "+" : ""}${int(t.points)}`}</span> : "—"}
                    </td>
                    <td className="num" data-label="Sellos">
                      {t.stamps ? <span className={t.stamps > 0 ? "ll-positive" : "ll-negative"}>{`${t.stamps > 0 ? "+" : ""}${t.stamps}`}</span> : "—"}
                    </td>
                    <td data-label="Dónde">
                      {t.branchName || "—"}
                      {(t.registerName || t.deviceName) && <small>{[t.registerName, t.deviceName].filter(Boolean).join(" · ")}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={current} pages={pages} onChange={setPage} total={rows.length} label="movimientos" />
        </>
      )}
      {me.role !== "cashier" && (
        <div style={{ padding: "0 22px 22px" }}>
          <p className="ll-hint">Las compras llegan solas desde el sistema de cobro. Para devolver una compra, ábrela desde la ficha del cliente.</p>
        </div>
      )}
    </Card>
  )
}

function Review({ queue }: { queue: Async<api.ReviewItem[]> }) {
  if (queue.error) return <ErrorState message={queue.error} retry={queue.reload} />
  if (!queue.data) return <Loading />
  if (!queue.data.length)
    return (
      <Card>
        <Empty icon="check" title="No hay cobros por asignar">
          Cuando dos clientes escanean en la misma caja dentro de 5 minutos, el cobro llega aquí para que elijas a quién le corresponde.
        </Empty>
      </Card>
    )
  return (
    <div className="ll-stack">
      <Notice tone="info">Elige a quién corresponde cada cobro. Si no lo sabes, descártalo: nadie recibe puntos por él.</Notice>
      {queue.data.map((item) => (
        <ReviewCard key={item.payment.id} item={item} />
      ))}
    </div>
  )
}

function ReviewCard({ item }: { item: api.ReviewItem }) {
  const [choice, setChoice] = useState("")
  const { run, pending, error } = useAction(api.resolveReview)
  const toast = useToast()
  const base = item.payment.amount - item.payment.tip
  return (
    <Card
      title={`Cobro de ${money(item.payment.amount)}${item.payment.tip ? ` (propina ${money(item.payment.tip)})` : ""}`}
      description={`${item.registerName} · ${dateTime(item.payment.createdAt)} · ${item.payment.provider === "mercadopago" ? "Mercado Pago" : "Clip"} ${item.payment.externalId} · base para puntos ${money(base)}`}
    >
      <fieldset className="ll-fieldset">
        <legend className="ll-sr">¿A quién corresponde?</legend>
        {item.candidates.map((c) => (
          <label key={c.scan.id} className="ll-check">
            <input type="radio" name={`r-${item.payment.id}`} value={c.scan.id} checked={choice === c.scan.id} onChange={() => setChoice(c.scan.id)} />
            <span className="ll-check-box" aria-hidden style={{ borderRadius: "50%" }}>
              <Icon name="check" size={14} />
            </span>
            <span className="ll-check-text">
              {c.customerName}
              <small>
                {c.phone ? `${formatPhone(c.phone)} · ` : ""}escaneó {relative(c.scan.createdAt)}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="ll-form-actions">
        <Button
          variant="secondary"
          loading={pending && !choice}
          onClick={async () => {
            const r = await run(item.payment.id, null)
            if (r.ok) toast("Cobro descartado.", "info")
          }}
        >
          Descartar
        </Button>
        <Button
          disabled={!choice}
          loading={pending && !!choice}
          onClick={async () => {
            const r = await run(item.payment.id, choice)
            if (r.ok) toast("Cobro asignado. Los puntos ya están en su tarjeta.")
          }}
        >
          Asignar cobro
        </Button>
      </div>
    </Card>
  )
}
