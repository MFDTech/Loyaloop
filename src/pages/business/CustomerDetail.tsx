import { useState } from "react"
import * as api from "../../lib/api"
import { cardFromBundle } from "../../lib/card"
import { useAction, useAsync } from "../../lib/hooks"
import { href } from "../../lib/router"
import { birthdayLabel, date, dateTime, formatPhone, int, kindLabel, money, relative } from "../../lib/util"
import { PassPreview } from "../../components/Pass"
import { Badge, Button, Card, Confirm, Empty, ErrorState, Field, Icon, Loading, Modal, Notice, PageHeader, Stat, TextArea, useToast } from "../../components/ui"

export default function CustomerDetail({ id, me }: { id: string; me: api.Me }) {
  const detail = useAsync(() => api.customer(id), [id])
  const bundle = useAsync(api.bundle)
  const [adjusting, setAdjusting] = useState(false)
  const [refunding, setRefunding] = useState<api.ActivityRow | null>(null)
  const activity = useAsync(() => api.activity({}), [])
  const canManage = me.role === "owner" || me.role === "manager"
  const back = (
    <a className="ll-link" href={href("/panel/clientes")} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <Icon name="back" size={16} /> Clientes
    </a>
  )
  if (detail.error) return <>{back}<ErrorState message={detail.error} retry={detail.reload} /></>
  if (!detail.data || !bundle.data) return <Loading rows={6} />
  const { customer, notices, spending12m, nextTier } = detail.data
  const program = bundle.data.program
  const stamps = program.type === "stamps"
  const rows = (activity.data || []).filter((t) => t.customerId === id)
  const card = cardFromBundle(bundle.data)
  const holder: api.CardHolder = {
    name: customer.name,
    token: customer.token,
    points: customer.points,
    stamps: customer.stamps,
    tierName: customer.tierName,
    earnedRewards: customer.earnedRewards.map((e) => ({ id: e.id, name: bundle.data!.rewards.find((r) => r.id === e.rewardId)?.name || "Recompensa" })),
    memberSince: customer.createdAt,
  }
  return (
    <>
      {back}
      <PageHeader
        title={customer.name}
        description={
          <span className="ll-row" style={{ gap: 8 }}>
            {customer.tierName && <Badge tone="brand">Nivel {customer.tierName}</Badge>}
            {customer.employee && <Badge tone="warning">Teléfono de empleado</Badge>}
            <Badge tone={customer.promotionsOptIn ? "success" : "neutral"}>{customer.promotionsOptIn ? "Acepta promociones" : "Sin promociones"}</Badge>
            <span className="ll-muted">Cliente desde {date(customer.createdAt)}</span>
          </span>
        }
        actions={
          canManage && (
            <Button variant="secondary" onClick={() => setAdjusting(true)}>
              <Icon name="edit" size={18} /> Ajustar saldo
            </Button>
          )
        }
      />
      <div className="ll-stats">
        <Stat label={stamps ? "Sellos" : "Puntos"} icon={stamps ? "check" : "star"} value={stamps ? `${customer.stamps} / ${program.stampGoal}` : int(customer.points)} detail={customer.earnedRewards.length ? `${customer.earnedRewards.length} recompensa(s) por canjear` : "Saldo actual"} />
        <Stat label="Visitas" icon="activity" value={int(customer.visits)} detail={`Última: ${relative(customer.lastActivityAt)}`} />
        <Stat label="Gasto en 12 meses" icon="wallet" value={money(spending12m)} detail="Sin propinas ni devoluciones" />
        {program.type === "tiers" ? (
          <Stat label="Siguiente nivel" icon="layers" value={nextTier ? nextTier.name : "Nivel máximo"} detail={nextTier ? `Le faltan ${money(nextTier.missing)}` : "Ya está en el nivel más alto"} />
        ) : (
          <Stat label="Avisos enviados" icon="bell" value={int(notices.length)} detail="Notificaciones del pase" />
        )}
      </div>
      <div className="ll-split">
        <Card title="Historial" description="Cada movimiento con su sucursal, caja y dispositivo." padded={false}>
          {!activity.data ? (
            <div style={{ padding: 22 }}>
              <Loading />
            </div>
          ) : !rows.length ? (
            <Empty icon="activity" title="Sin movimientos todavía" />
          ) : (
            <div className="ll-table-wrap">
              <table className="ll-table is-responsive">
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th className="num">Monto</th>
                    <th className="num">{stamps ? "Sellos" : "Puntos"}</th>
                    <th>Dónde</th>
                    {canManage && <th aria-label="Acciones" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className="ll-td-main">
                        <span className="ll-cell-main">{kindLabel[t.kind]}</span>
                        <small>
                          {dateTime(t.createdAt)} · {t.reason}
                          {t.actorName ? ` · por ${t.actorName}` : ""}
                        </small>
                      </td>
                      <td className="num" data-label="Monto">
                        {t.amount ? money(t.amount) : "—"}
                      </td>
                      <td className="num" data-label={stamps ? "Sellos" : "Puntos"}>
                        <Delta value={stamps ? t.stamps : t.points} />
                      </td>
                      <td data-label="Dónde">
                        {t.branchName || "—"}
                        {(t.registerName || t.deviceName) && <small>{[t.registerName, t.deviceName].filter(Boolean).join(" · ")}</small>}
                      </td>
                      {canManage && (
                        <td data-label="">
                          {t.kind === "purchase" && !t.refunded && (
                            <Button variant="ghost" size="sm" onClick={() => setRefunding(t)}>
                              Devolver
                            </Button>
                          )}
                          {t.refunded && <Badge>Devuelta</Badge>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="ll-stack">
          <Card title="Su tarjeta">
            <PassPreview card={card} holder={holder} note={false} />
          </Card>
          <Card title="Datos de contacto">
            <dl className="ll-dl">
              <div>
                <dt>Celular</dt>
                <dd>{customer.phone ? formatPhone(customer.phone) : "No lo dio"}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{customer.email || "No lo dio"}</dd>
              </div>
              <div>
                <dt>Cumpleaños</dt>
                <dd>{birthdayLabel(customer.birthday) || "No lo dio"}</dd>
              </div>
              <div>
                <dt>Se registró en</dt>
                <dd>{bundle.data.branches.find((b) => b.id === customer.branchId)?.name || "—"}</dd>
              </div>
              <div>
                <dt>Aviso de privacidad</dt>
                <dd>Aceptado el {date(customer.privacyAcceptedAt)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Avisos en su Wallet" description="Lo que su teléfono le mostró en la pantalla de bloqueo.">
            {notices.length ? (
              <div className="ll-list">
                {notices.slice(0, 8).map((n) => (
                  <div key={n.id} className="ll-list-item">
                    <Icon name="bell" size={18} />
                    <div>
                      <strong>{n.message}</strong>
                      <small>{relative(n.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ll-hint">Todavía no ha recibido avisos.</p>
            )}
          </Card>
        </div>
      </div>
      {adjusting && <AdjustModal customer={customer} stamps={stamps} onClose={() => setAdjusting(false)} />}
      {refunding && <RefundDialog tx={refunding} onClose={() => setRefunding(null)} />}
    </>
  )
}

function Delta({ value }: { value: number }) {
  if (!value) return <span className="ll-muted">0</span>
  return <span className={value > 0 ? "ll-positive" : "ll-negative"}>{`${value > 0 ? "+" : ""}${int(value)}`}</span>
}

function AdjustModal({ customer, stamps, onClose }: { customer: api.CustomerRow; stamps: boolean; onClose: () => void }) {
  const [direction, setDirection] = useState<"add" | "remove">("add")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const { run, pending, error } = useAction(api.adjustBalance)
  const toast = useToast()
  const value = Number(amount)
  const delta = direction === "add" ? value : -value
  return (
    <Modal
      title="Ajustar saldo"
      description={`${customer.name} tiene ${stamps ? `${customer.stamps} sellos` : `${int(customer.points)} puntos`}. El ajuste queda en el historial con tu nombre y el motivo.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={pending} disabled={!Number.isInteger(value) || value <= 0 || !reason.trim()} type="submit" form="adjust-form">
            Guardar ajuste
          </Button>
        </>
      }
    >
      <form
        id="adjust-form"
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const result = await run(customer.id, stamps ? { points: 0, stamps: delta } : { points: delta, stamps: 0 }, reason)
          if (result.ok) {
            toast("Ajuste guardado.")
            onClose()
          }
        }}
      >
        <div className="ll-segmented" role="radiogroup" aria-label="Tipo de ajuste">
          <button type="button" role="radio" aria-checked={direction === "add"} className={direction === "add" ? "is-active" : ""} onClick={() => setDirection("add")}>
            Sumar
          </button>
          <button type="button" role="radio" aria-checked={direction === "remove"} className={direction === "remove" ? "is-active" : ""} onClick={() => setDirection("remove")}>
            Restar
          </button>
        </div>
        <Field label={stamps ? "Sellos" : "Puntos"} type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextArea label="Motivo" hint="Obligatorio. Por ejemplo: compra que no se registró por falla de internet." value={reason} maxLength={240} onChange={(e) => setReason(e.target.value)} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  )
}

function RefundDialog({ tx, onClose }: { tx: api.ActivityRow; onClose: () => void }) {
  const [reason, setReason] = useState("")
  const { run, pending, error } = useAction(api.refundPurchase)
  const toast = useToast()
  return (
    <Confirm
      title="Registrar devolución"
      confirmLabel="Registrar devolución"
      tone="danger"
      pending={pending}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        const result = await run(tx.id, reason)
        if (result.ok) {
          toast("Devolución registrada.")
          onClose()
        }
      }}
    >
      <p>
        Se restarán {tx.points ? `${int(tx.points)} puntos` : tx.stamps ? `${tx.stamps} sello` : "los beneficios"} de la compra de {money(tx.amount)} del {dateTime(tx.createdAt)}. Si ya los usó, el saldo queda en cero.
      </p>
      <TextArea label="Motivo" optional value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
    </Confirm>
  )
}
