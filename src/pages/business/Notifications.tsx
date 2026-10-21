import { useEffect, useMemo, useRef, useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import {
  DEFAULT_MISS_YOU_DAYS,
  MAX_NOTICE,
  MAX_PROMOTIONS_PER_DAY,
  NOTICE_EVENTS,
  NOTICE_VARS,
  PROMOTION_VARS,
  audienceLabel,
  noticeEnabled,
  renderNotice,
  sampleVars,
  type Audience,
  type AutomaticEvent,
  type NoticeVar,
} from "../../lib/notices"
import { PREVIEW } from "../../lib/preview"
import type { Program } from "../../lib/types"
import { dateTime, int, relative } from "../../lib/util"
import { Badge, Button, Card, Check, Confirm, Empty, ErrorState, Icon, Loading, Notice, PageHeader, Segmented, SelectField, useToast } from "../../components/ui"
import { NumberField } from "../admin/ProgramEditor"

const EVENT_LABEL: Record<api.NoticeEvent, string> = {
  ...(Object.fromEntries(NOTICE_EVENTS.map((e) => [e.key, e.title])) as Record<AutomaticEvent, string>),
  promotion: "Promoción",
}

/** Lock screen mock-up: business name and the message, as the phone shows it. */
function LockPreview({ name, color, logo, message }: { name: string; color: string; logo?: string; message: string }) {
  return (
    <div className="ll-lock-preview" aria-label="Vista previa en la pantalla de bloqueo">
      <span className="ll-lock-time">9:41</span>
      <div className="ll-lock-note">
        <span className="ll-lock-icon" style={{ background: color }}>
          {logo ? <img src={logo} alt="" /> : <Icon name="wallet" size={16} />}
        </span>
        <div>
          <b>{name}</b>
          <p style={{ margin: 0 }}>{message || "Escribe el mensaje para verlo aquí."}</p>
        </div>
      </div>
    </div>
  )
}

/** Text box with buttons that insert {variables} where the cursor is. */
function TemplateField({ id, value, placeholder, vars, onChange, onFocus }: { id: string; value: string; placeholder: string; vars: NoticeVar[]; onChange: (v: string) => void; onFocus?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const insert = (name: NoticeVar) => {
    const el = ref.current
    const token = `{${name}}`
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const base = value || placeholder
    const next = value ? base.slice(0, start) + token + base.slice(end) : `${base} ${token}`
    onChange(next.slice(0, MAX_NOTICE))
    requestAnimationFrame(() => {
      el?.focus()
      const pos = value ? start + token.length : next.length
      el?.setSelectionRange(pos, pos)
    })
  }
  return (
    <div className="ll-template">
      <textarea ref={ref} id={id} rows={2} maxLength={MAX_NOTICE} value={value} placeholder={placeholder} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />
      <div className="ll-template-foot">
        <div className="ll-chips" role="group" aria-label="Insertar dato">
          {vars.map((v) => (
            <button key={v} type="button" className="ll-chip" title={NOTICE_VARS[v].label} onClick={() => insert(v)}>
              {`{${v}}`}
            </button>
          ))}
        </div>
        <small className={(value || placeholder).length > MAX_NOTICE - 15 ? "is-warn" : ""}>
          {(value || placeholder).length}/{MAX_NOTICE}
        </small>
      </div>
    </div>
  )
}

export default function Notifications() {
  const b = useAsync(api.bundle)
  const log = useAsync(api.notices)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={5} />
  return (
    <>
      <PageHeader title="Avisos" description="Mensajes que tus clientes reciben en la pantalla de bloqueo a través de su tarjeta en la Wallet." />
      <AutomaticNotices bundle={b.data} onSaved={() => (b.reload(), log.reload())} />
      <Promotions bundle={b.data} onSent={log.reload} />
      <Card title="Últimos avisos enviados" padded={false}>
        {log.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={log.error} retry={log.reload} />
          </div>
        ) : !log.data ? (
          <div style={{ padding: 22 }}>
            <Loading />
          </div>
        ) : !log.data.length ? (
          <Empty icon="bell" title="Todavía no se ha enviado ningún aviso">
            Aparecerán aquí cuando un cliente gane puntos o sellos, complete su tarjeta o le mandes una promoción.
          </Empty>
        ) : (
          <div className="ll-table-wrap">
            <table className="ll-table is-responsive">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Mensaje</th>
                  <th>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {log.data.slice(0, 50).map((n) => (
                  <tr key={n.id}>
                    <td className="ll-td-main">
                      <a className="ll-cell-main" href={`#/panel/clientes/${n.customerId}`}>
                        {n.customerName}
                      </a>
                    </td>
                    <td data-label="Tipo">{EVENT_LABEL[n.event] || n.event}</td>
                    <td data-label="Mensaje">{n.message}</td>
                    <td data-label="Cuándo">{relative(n.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {PREVIEW && <Notice tone="info">En esta versión de prueba los avisos se registran aquí, pero no llegan a los teléfonos.</Notice>}
    </>
  )
}

// ---------------------------------------------------------------- automatic

function AutomaticNotices({ bundle, onSaved }: { bundle: api.Bundle; onSaved: () => void }) {
  const { program, business } = bundle
  const name = business.discreet ? business.neutralName : business.name
  const logo = business.discreet ? undefined : business.brand.logo
  const events = NOTICE_EVENTS.filter((e) => e.applies(program.type))
  const initial = () => ({
    notify: Object.fromEntries(events.map((e) => [e.key, noticeEnabled(program, e.key)])) as Program["notify"],
    messages: { ...(program.messages || {}) } as NonNullable<Program["messages"]>,
    missYouDays: program.missYouDays || DEFAULT_MISS_YOU_DAYS,
  })
  const [draft, setDraft] = useState(initial)
  const [focused, setFocused] = useState<AutomaticEvent>(events[0]?.key || "welcome")
  const save = useAction(api.saveNotices)
  const toast = useToast()
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial())
  const vars = useMemo(() => ({ ...sampleVars(name), meta: String(program.stampGoal || 8), regalo: program.birthdayBonus > 0 ? (program.type === "stamps" ? "un sello" : `${int(program.birthdayBonus)} puntos`) : "" }), [name, program])
  const textOf = (key: AutomaticEvent) => draft.messages[key] || NOTICE_EVENTS.find((e) => e.key === key)!.defaultText(program)
  return (
    <div className="ll-split">
      <Card title="Avisos automáticos" description="Enciende los que quieras y escribe tu propio texto. Los datos entre llaves se llenan con los de cada cliente.">
        <div className="ll-stack" style={{ gap: 4 }}>
          {events.map((e) => {
            const on = draft.notify[e.key] ?? e.defaultOn
            return (
              <div key={e.key} className={`ll-notice-row ${on ? "" : "is-off"}`}>
                <Check label={e.title} hint={e.when} checked={on} onChange={(v) => (setDraft({ ...draft, notify: { ...draft.notify, [e.key]: v } }), setFocused(e.key))} />
                {on && (
                  <div className="ll-notice-edit">
                    <TemplateField
                      id={`notice-${e.key}`}
                      value={draft.messages[e.key] || e.defaultText(program)}
                      placeholder={e.defaultText(program)}
                      vars={e.vars}
                      onFocus={() => setFocused(e.key)}
                      onChange={(v) => (setDraft({ ...draft, messages: { ...draft.messages, [e.key]: v } }), setFocused(e.key))}
                    />
                    <p className="ll-field-hint">
                      Así se verá: «{renderNotice(textOf(e.key), vars)}»
                      {draft.messages[e.key] && draft.messages[e.key] !== e.defaultText(program) && (
                        <>
                          {" · "}
                          <button type="button" className="ll-link" style={{ fontSize: 14 }} onClick={() => setDraft({ ...draft, messages: { ...draft.messages, [e.key]: "" } })}>
                            Usar el texto sugerido
                          </button>
                        </>
                      )}
                    </p>
                    {e.key === "missYou" && (
                      <NumberField label="Enviar después de" suffix="días sin venir" value={draft.missYouDays} onChange={(n) => setDraft({ ...draft, missYouDays: Math.round(n) })} hint="Entre 7 y 365. Se envía una vez; si regresa, vuelve a contar." />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {save.error && <Notice tone="error">{save.error}</Notice>}
        <div className="ll-row" style={{ marginTop: 16 }}>
          <Button
            disabled={!dirty}
            loading={save.pending}
            onClick={async () => {
              const r = await save.run({ notify: draft.notify, messages: draft.messages, missYouDays: draft.missYouDays })
              if (r.ok) {
                toast("Avisos guardados.")
                onSaved()
              }
            }}
          >
            Guardar avisos
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(initial())}>
              Descartar cambios
            </Button>
          )}
        </div>
      </Card>
      <Card title="Así se ve en el teléfono" description={EVENT_LABEL[focused]}>
        <LockPreview name={name} color={business.brand.color} logo={logo} message={renderNotice(textOf(focused), vars)} />
        <p className="ll-hint" style={{ marginTop: 12 }}>
          En iPhone aparece en la pantalla de bloqueo y en el reverso del pase. En Android llega como notificación de Google Wallet.
        </p>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- promotions

type AudienceKind = Audience["kind"]

function localInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Promotions({ bundle, onSent }: { bundle: api.Bundle; onSent: () => void }) {
  const { program, business } = bundle
  const name = business.discreet ? business.neutralName : business.name
  const logo = business.discreet ? undefined : business.brand.logo
  const list = useAsync(api.campaigns)
  const toast = useToast()
  const [message, setMessage] = useState("")
  const [kind, setKind] = useState<AudienceKind>("all")
  const [tierId, setTierId] = useState(program.tiers[0]?.id || "")
  const [days, setDays] = useState(30)
  const [when, setWhen] = useState<"now" | "later">("now")
  const [sendAt, setSendAt] = useState(() => localInput(new Date(Date.now() + 24 * 3600_000)))
  const [confirming, setConfirming] = useState(false)
  const [reach, setReach] = useState<{ count: number; optedOut: number } | null>(null)
  const create = useAction(api.createCampaign)
  const cancel = useAction(api.cancelCampaign)
  const audience: Audience = kind === "tier" ? { kind, tierId } : kind === "inactive" || kind === "recent" ? { kind, days } : { kind: "all" }
  const audienceKey = JSON.stringify(audience)
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      api
        .campaignAudience(audience)
        .then((r) => live && setReach(r))
        .catch(() => live && setReach(null))
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey])
  const preview = renderNotice(message, { ...sampleVars(name), nivel: program.tiers[0]?.name || "" })
  const tierName = (id: string) => program.tiers.find((t) => t.id === id)?.name
  const options: { value: AudienceKind; label: string }[] = [
    { value: "all", label: "Todos" },
    ...(program.type === "tiers" ? [{ value: "tier" as const, label: "Por nivel" }] : []),
    { value: "inactive", label: "Sin venir" },
    { value: "recent", label: "Vinieron hace poco" },
  ]
  const submit = async () => {
    const r = await create.run({ message, audience, sendAt: when === "later" ? new Date(sendAt).toISOString() : undefined })
    setConfirming(false)
    if (!r.ok) return
    toast(when === "later" ? "Promoción programada." : `Promoción enviada a ${int(r.value.recipients || 0)} clientes.`)
    setMessage("")
    list.reload()
    onSent()
  }
  return (
    <>
      <div className="ll-split">
        <Card title="Enviar una promoción" description={`Solo llega a clientes que aceptaron recibir promociones. Hasta ${MAX_PROMOTIONS_PER_DAY} por día, para no cansar a tus clientes.`}>
          <div className="ll-stack">
            <div className="ll-field">
              <label htmlFor="promo-message">Mensaje</label>
              <TemplateField id="promo-message" value={message} placeholder="{nombre}, hoy tienes 2x1 en café. ¡Te esperamos!" vars={PROMOTION_VARS} onChange={setMessage} />
            </div>
            <div className="ll-field">
              <span className="ll-label">¿A quién?</span>
              <Segmented label="A quién se envía" value={kind} options={options} onChange={setKind} />
            </div>
            {kind === "tier" && (
              <SelectField label="Nivel" value={tierId} onChange={(e) => setTierId(e.target.value)}>
                {program.tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            )}
            {(kind === "inactive" || kind === "recent") && (
              <NumberField label={kind === "inactive" ? "Sin venir en al menos" : "Vinieron en los últimos"} suffix="días" value={days} onChange={(n) => setDays(Math.max(1, Math.round(n)))} />
            )}
            {reach && (
              <p className="ll-field-hint" style={{ margin: 0 }}>
                Llegará a <b>{int(reach.count)}</b> {reach.count === 1 ? "cliente" : "clientes"}
                {reach.optedOut > 0 ? ` (${int(reach.optedOut)} más no aceptaron promociones).` : "."}
              </p>
            )}
            <div className="ll-field">
              <span className="ll-label">¿Cuándo?</span>
              <Segmented
                label="Cuándo se envía"
                value={when}
                options={[
                  { value: "now", label: "Ahora" },
                  { value: "later", label: "Programar" },
                ]}
                onChange={setWhen}
              />
            </div>
            {when === "later" && (
              <div className="ll-field">
                <label htmlFor="promo-at">Fecha y hora</label>
                <input id="promo-at" type="datetime-local" value={sendAt} min={localInput(new Date())} onChange={(e) => setSendAt(e.target.value)} />
              </div>
            )}
            {create.error && <Notice tone="error">{create.error}</Notice>}
            <div>
              <Button disabled={!message.trim() || !reach?.count} onClick={() => setConfirming(true)}>
                <Icon name="bell" size={18} /> {when === "later" ? "Programar promoción" : "Enviar promoción"}
              </Button>
            </div>
          </div>
        </Card>
        <Card title="Vista previa" description="Con los datos de un cliente de ejemplo.">
          <LockPreview name={name} color={business.brand.color} logo={logo} message={preview} />
        </Card>
      </div>
      <Card title="Promociones" padded={false}>
        {list.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={list.error} retry={list.reload} />
          </div>
        ) : !list.data ? (
          <div style={{ padding: 22 }}>
            <Loading />
          </div>
        ) : !list.data.length ? (
          <Empty icon="bell" title="Aún no hay promociones">
            Las que envíes o programes aparecerán aquí.
          </Empty>
        ) : (
          <div className="ll-table-wrap">
            <table className="ll-table is-responsive">
              <thead>
                <tr>
                  <th>Mensaje</th>
                  <th>Para</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id}>
                    <td className="ll-td-main">{c.message}</td>
                    <td data-label="Para">{audienceLabel(c.audience, c.audience.kind === "tier" ? tierName(c.audience.tierId) : undefined)}</td>
                    <td data-label="Fecha">{dateTime(c.sentAt || c.sendAt)}</td>
                    <td data-label="Estado">
                      {c.status === "sent" ? (
                        <Badge tone="success">Enviada · {int(c.recipients || 0)}</Badge>
                      ) : c.status === "scheduled" ? (
                        <Badge tone="info">Programada</Badge>
                      ) : (
                        <Badge>Cancelada</Badge>
                      )}
                    </td>
                    <td>
                      {c.status === "scheduled" && (
                        <Button variant="ghost" size="sm" loading={cancel.pending} onClick={async () => (await cancel.run(c.id)).ok && (toast("Promoción cancelada."), list.reload())}>
                          Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cancel.error && (
          <div style={{ padding: "0 22px 22px" }}>
            <Notice tone="error">{cancel.error}</Notice>
          </div>
        )}
      </Card>
      {confirming && (
        <Confirm
          title={when === "later" ? "¿Programar esta promoción?" : "¿Enviar esta promoción ahora?"}
          confirmLabel={when === "later" ? "Programar" : "Enviar"}
          pending={create.pending}
          onClose={() => setConfirming(false)}
          onConfirm={submit}
        >
          «{preview}» llegará a {int(reach?.count || 0)} {reach?.count === 1 ? "cliente" : "clientes"}
          {when === "later" ? ` el ${dateTime(new Date(sendAt).toISOString())}` : ""}. No se puede deshacer una vez enviada.
        </Confirm>
      )}
    </>
  )
}
