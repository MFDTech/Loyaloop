import { useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { PREVIEW } from "../../lib/preview"
import { absoluteLink, href, navigate } from "../../lib/router"
import type { AuditEntry, BusinessStatus, Provider } from "../../lib/types"
import { dateTime, formatPhone, int, isEmail, money, relative, roleLabel } from "../../lib/util"
import { PassPreview, sampleHolder } from "../../components/Pass"
import { Badge, Button, Card, Confirm, CopyButton, Empty, ErrorState, Field, Icon, Loading, Notice, PageHeader, SelectField, Tabs, useToast } from "../../components/ui"
import { statusLabel, statusTone } from "./Businesses"
import { monthlyAmount } from "../../lib/service"

const BILLING_LABEL = { pending: "esperando tarjeta", authorized: "activo", paused: "pausado", cancelled: "cancelado" } as const
import { SECTORS } from "./NewBusiness"
import { BrandEditor, NumberField, ProgramEditor, draftCard, type BrandDraft, type ProgramDraft } from "./ProgramEditor"

type AdminBundle = api.Bundle & { team: api.TeamMember[]; audit: AuditEntry[]; customerCount: number }
type Tab = "datos" | "tarjeta" | "cobro" | "pruebas" | "bitacora"

export default function BusinessDetail({ id }: { id: string }) {
  const b = useAsync(() => api.adminBundle(id), [id])
  const [tab, setTab] = useState<Tab>("datos")
  const enter = useAction(api.impersonate)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={5} />
  const data = b.data
  const business = data.business
  const tabs: { value: Tab; label: string }[] = [
    { value: "datos", label: "Datos y estado" },
    { value: "tarjeta", label: "Tarjeta y reglas" },
    { value: "cobro", label: "Cobro" },
    ...(PREVIEW ? [{ value: "pruebas" as Tab, label: "Pruebas" }] : []),
    { value: "bitacora", label: "Bitácora" },
  ]
  return (
    <>
      <PageHeader
        title={
          <span className="ll-row" style={{ gap: 12 }}>
            {business.name} <Badge tone={statusTone[business.status]}>{statusLabel[business.status]}</Badge>
          </span>
        }
        description={`${business.sector} · ${data.branches.length} ${data.branches.length === 1 ? "sucursal" : "sucursales"}`}
        actions={
          <>
            <a className="ll-btn ll-btn-ghost ll-btn-md" href={href("/admin/negocios")}>
              <Icon name="back" size={18} /> Negocios
            </a>
            <Button
              variant="dark"
              loading={enter.pending}
              onClick={async () => {
                const r = await enter.run(business.id)
                if (r.ok) navigate("/panel")
              }}
            >
              <Icon name="login" size={18} /> Entrar a la cuenta
            </Button>
          </>
        }
      />
      {enter.error && <Notice tone="error">{enter.error}</Notice>}
      <Tabs value={tab} tabs={tabs} onChange={setTab} />
      {tab === "datos" && <DataTab data={data} />}
      {tab === "tarjeta" && <CardTab data={data} />}
      {tab === "cobro" && <PaymentsTab data={data} />}
      {tab === "pruebas" && PREVIEW && <TestsTab data={data} />}
      {tab === "bitacora" && <AuditList entries={data.audit} />}
    </>
  )
}

function DataTab({ data }: { data: AdminBundle }) {
  const business = data.business
  const [form, setForm] = useState({
    name: business.name,
    sector: business.sector,
    contactName: business.contactName,
    email: business.email,
    phone: business.phone,
    legalName: business.legalName || "",
    legalAddress: business.legalAddress || "",
    privacyEmail: business.privacyEmail || "",
  })
  const [status, setStatus] = useState<BusinessStatus | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [price, setPrice] = useState(business.monthlyPrice ? String(business.monthlyPrice) : "")
  const save = useAction(api.adminUpdateBusiness)
  const toast = useToast()
  const set = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value })
  return (
    <div className="ll-split">
      <div className="ll-stack">
        <Card title="Datos del negocio">
          <form
            className="ll-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!isEmail(form.email)) return save.setError("El correo de contacto no es válido.")
              if (form.privacyEmail && !isEmail(form.privacyEmail)) return save.setError("El correo para privacidad no es válido.")
              const r = await save.run(business.id, form)
              if (r.ok) toast("Datos guardados.")
            }}
          >
            <div className="ll-grid-2">
              <Field label="Nombre comercial" value={form.name} onChange={(e) => set("name", e.target.value)} />
              <SelectField label="Giro" value={form.sector} onChange={(e) => set("sector", e.target.value)}>
                {[...new Set([form.sector, ...SECTORS])].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </SelectField>
            </div>
            <Field label="Persona de contacto" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            <div className="ll-grid-2">
              <Field label="Correo de contacto" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              <Field label="Teléfono" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <p className="ll-hint">Para el aviso de privacidad de su tarjeta: el negocio es el responsable de los datos de sus clientes.</p>
            <Field label="Razón social o nombre del responsable" value={form.legalName} placeholder={business.name} onChange={(e) => set("legalName", e.target.value)} />
            <Field label="Domicilio" value={form.legalAddress} placeholder="Si lo dejas vacío, se usa la dirección de la sucursal" onChange={(e) => set("legalAddress", e.target.value)} />
            <Field label="Correo para privacidad" type="email" value={form.privacyEmail} placeholder={business.email} onChange={(e) => set("privacyEmail", e.target.value)} />
            {save.error && <Notice tone="error">{save.error}</Notice>}
            <div className="ll-form-actions">
              <Button type="submit" loading={save.pending}>
                Guardar
              </Button>
            </div>
          </form>
        </Card>
        <Card title="Sucursales y enlaces de registro" description="Graba cada enlace en la etiqueta NFC de su sucursal." padded={false}>
          <ul className="ll-list" style={{ padding: "0 22px 12px" }}>
            {data.branches.map((br) => {
              const link = absoluteLink(`/r/${br.code}`)
              const registers = data.registers.filter((r) => r.branchId === br.id)
              return (
                <li key={br.id} className="ll-list-item">
                  <div style={{ minWidth: 0 }}>
                    <strong>{br.name}</strong>
                    <small>
                      {registers.length} {registers.length === 1 ? "caja" : "cajas"} · {data.devices.filter((d) => registers.some((r) => r.id === d.registerId)).length} escáneres
                    </small>
                    <code className="ll-mono ll-break">{link}</code>
                  </div>
                  <CopyButton text={link} label="Copiar enlace" />
                </li>
              )
            })}
          </ul>
        </Card>
      </div>
      <div className="ll-stack">
        <Card title="Plan">
          <div className="ll-stack">
            <p className="ll-hint">
              {business.plan === "starter"
                ? "Starter: una sucursal, tarjeta de sellos que el dueño edita solo, sin avisos ni promociones."
                : "Pro: terminal conectada, todos los tipos de tarjeta y sucursales adicionales ($250 cada una)."}{" "}
              Cobra <b>{money(monthlyAmount(business, data.branches.length))} al mes</b>
              {business.monthlyPrice ? " (precio acordado)" : ""}.
            </p>
            {business.billing ? (
              <p className="ll-hint">
                Pago automático: <b>{BILLING_LABEL[business.billing.status]}</b> · {business.billing.payerEmail}
                {business.billing.paidUntil ? ` · pagado hasta el ${new Date(business.billing.paidUntil).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}` : ""}
                {business.charges?.[0] ? ` · último cobro ${business.charges[0].status === "approved" ? "aprobado" : business.charges[0].status === "rejected" ? "rechazado" : "en proceso"}` : ""}
              </p>
            ) : (
              <p className="ll-hint">Sin pago automático: paga por transferencia o aún no lo activa desde su panel.</p>
            )}
            <form
              className="ll-row"
              style={{ alignItems: "flex-end" }}
              onSubmit={async (e) => {
                e.preventDefault()
                const value = price.trim() ? Number(price) : null
                const r = await save.run(business.id, { monthlyPrice: value })
                if (r.ok) toast(value ? "Precio acordado guardado." : "Vuelve al precio del plan.")
              }}
            >
              <Field label="Precio acordado al mes" type="number" min={0} placeholder="Precio del plan" value={price} onChange={(e) => setPrice(e.target.value)} hint="Vacío: el del plan. Si tiene pago automático, Mercado Pago cobra el nuevo monto desde el siguiente mes." />
              <Button type="submit" variant="secondary" size="sm" loading={save.pending}>
                Guardar precio
              </Button>
            </form>
            <div className="ll-row">
              <Button
                variant="secondary"
                size="sm"
                disabled={save.pending}
                onClick={async () => {
                  const r = await save.run(business.id, { plan: business.plan === "starter" ? "pro" : "starter" })
                  if (r.ok) toast(business.plan === "starter" ? "Ahora está en Pro." : "Ahora está en Starter.")
                }}
              >
                {business.plan === "starter" ? "Cambiar a Pro" : "Cambiar a Starter"}
              </Button>
            </div>
          </div>
        </Card>
        <Card title="Estado de la cuenta">
          <div className="ll-stack">
            <p className="ll-hint">
              {business.status === "paused"
                ? "La cuenta está pausada: el equipo no puede entrar, el registro está cerrado y los escáneres no suman."
                : business.status === "pending"
                  ? "Se dio de alta desde la página y espera activación: el dueño ya diseña su tarjeta, pero el registro y la caja están cerrados. Actívala cuando pague o dale una prueba."
                  : business.status === "trial"
                    ? business.trialEndsAt
                      ? `En prueba hasta el ${new Date(business.trialEndsAt).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}. Después se cierra el registro hasta que la actives.`
                      : "En prueba: todo funciona y aún no se cobra."
                    : "Activa: se cobra cada mes."}
            </p>
            <div className="ll-row">
              {[14, 30].map((days) => (
                <Button
                  key={days}
                  variant="secondary"
                  size="sm"
                  disabled={save.pending}
                  onClick={async () => {
                    const r = await save.run(business.id, { trialDays: days })
                    if (r.ok) toast(`Prueba de ${days} días activada.`)
                  }}
                >
                  Dar prueba de {days} días
                </Button>
              ))}
            </div>
            <div className="ll-row">
              {(["active", "paused"] as BusinessStatus[])
                .filter((s) => s !== business.status)
                .map((s) => (
                  <Button key={s} variant={s === "paused" ? "danger" : "secondary"} size="sm" onClick={() => setStatus(s)}>
                    {s === "active" ? "Activar" : s === "trial" ? "Pasar a prueba" : "Pausar"}
                  </Button>
                ))}
            </div>
          </div>
        </Card>
        <Card title="Equipo" padded={false}>
          <ul className="ll-list" style={{ padding: "0 22px 12px" }}>
            {data.team.map((u) => (
              <li key={u.id} className="ll-list-item">
                <div style={{ minWidth: 0 }}>
                  <strong>{u.name}</strong>
                  <small>
                    {roleLabel[u.role]} · {u.email}
                    {u.phone ? ` · ${formatPhone(u.phone)}` : ""}
                  </small>
                </div>
                {u.inviteToken ? <CopyButton text={absoluteLink(`/invitacion/${u.inviteToken}`)} label="Copiar invitación" /> : !u.active ? <Badge>Desactivado</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
        {!business.demo && (
          <Card title="Eliminar negocio" description="Para negocios de prueba o que ya no trabajan con LoyaLoop. No se puede deshacer.">
            <div className="ll-stack">
              <p className="ll-hint">
                Se borran su tarjeta, sus {int(data.customerCount)} {data.customerCount === 1 ? "cliente" : "clientes"} con todo su historial, sus sucursales, escáneres y equipo. Si solo quieres
                detenerlo un tiempo, mejor páusalo.
              </p>
              <div className="ll-row">
                <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
                  <Icon name="trash" size={16} /> Eliminar negocio
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
      {status && (
        <StatusConfirm businessId={business.id} name={business.name} status={status} onClose={() => setStatus(null)} />
      )}
      {deleting && <DeleteConfirm data={data} onClose={() => setDeleting(false)} />}
    </div>
  )
}

function DeleteConfirm({ data, onClose }: { data: AdminBundle; onClose: () => void }) {
  const { business, customerCount, branches, devices, team } = data
  const [typed, setTyped] = useState("")
  const { run, pending, error } = useAction(api.adminDeleteBusiness)
  const toast = useToast()
  const plain = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()
  const matches = plain(typed) === plain(business.name)
  const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`
  return (
    <Confirm
      title={`¿Eliminar ${business.name}?`}
      confirmLabel="Eliminar para siempre"
      tone="danger"
      pending={pending}
      error={error}
      disabled={!matches}
      onClose={onClose}
      onConfirm={async () => {
        const r = await run(business.id, typed)
        if (r.ok) {
          toast(`Se eliminó ${business.name}.`)
          navigate("/admin/negocios")
        }
      }}
    >
      <div className="ll-stack">
        <p>Esto no se puede deshacer. Se borran:</p>
        <ul className="ll-bullets">
          <li>{customerCount ? `${plural(customerCount, "cliente", "clientes")} con sus puntos, sellos, recompensas e historial.` : "Su tarjeta y reglas (aún no tiene clientes)."}</li>
          <li>
            {plural(branches.length, "sucursal", "sucursales")}
            {devices.length ? ` y ${plural(devices.length, "escáner", "escáneres")}, que quedan desvinculados` : ""}.
          </li>
          {team.length > 0 && <li>{team.length === 1 ? "1 persona del equipo: ya no podrá entrar." : `${int(team.length)} personas del equipo: ya no podrán entrar.`}</li>}
          <li>Su tarjeta: en Google Wallet aparece como vencida y en iPhone deja de actualizarse.</li>
        </ul>
        {customerCount > 0 && <p className="ll-hint">Si el dueño quiere su lista de clientes, entra a su cuenta y exporta el CSV antes de eliminar.</p>}
        <Field label={`Escribe «${business.name}» para confirmar`} value={typed} autoComplete="off" data-autofocus onChange={(e) => setTyped(e.target.value)} />
      </div>
    </Confirm>
  )
}

function StatusConfirm({ businessId, name, status, onClose }: { businessId: string; name: string; status: BusinessStatus; onClose: () => void }) {
  const { run, pending, error } = useAction(api.adminUpdateBusiness)
  const toast = useToast()
  return (
    <Confirm
      title={status === "paused" ? `¿Pausar ${name}?` : status === "active" ? `¿Activar ${name}?` : `¿Pasar ${name} a prueba?`}
      confirmLabel={status === "paused" ? "Pausar cuenta" : "Confirmar"}
      tone={status === "paused" ? "danger" : "primary"}
      pending={pending}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        const r = await run(businessId, { status })
        if (r.ok) {
          toast(`Estado cambiado a ${statusLabel[status].toLowerCase()}.`)
          onClose()
        }
      }}
    >
      {status === "paused"
        ? "El equipo no podrá entrar al panel, nadie podrá registrarse y los escáneres dejarán de sumar. Los datos se conservan."
        : status === "active"
          ? "A partir de hoy se cobrará por cada sucursal."
          : "Mientras esté en prueba no se cobra."}
    </Confirm>
  )
}

function CardTab({ data }: { data: AdminBundle }) {
  const { businessId: _ignored, ...current } = data.program
  const [program, setProgram] = useState<ProgramDraft>(current)
  const [brand, setBrand] = useState<BrandDraft>({ brand: data.business.brand, discreet: data.business.discreet, neutralName: data.business.neutralName, locationAlerts: data.business.locationAlerts, askPhone: !!data.business.askPhone })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const toast = useToast()
  const rewards = data.rewards.filter((r) => r.active)
  const card = draftCard(data.business.name, program, brand, rewards)
  const changedType = program.type !== data.program.type
  async function save() {
    setError("")
    if (program.type === "stamps" && !program.stampRewardId) return setError("Elige la recompensa que se gana al completar los sellos.")
    if (brand.discreet && !brand.neutralName.trim()) return setError("Escribe el nombre neutro para el modo discreto.")
    setSaving(true)
    try {
      await api.adminSaveProgram(data.business.id, program)
      await api.adminUpdateBusiness(data.business.id, brand)
      toast("Tarjeta guardada. Los pases se actualizan solos.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="ll-split">
      <div className="ll-stack">
        <Card title="Reglas">
          <ProgramEditor value={program} onChange={setProgram} rewards={rewards} />
        </Card>
        <Card title="Marca y privacidad">
          <BrandEditor value={brand} onChange={setBrand} name={data.business.name} stamps={program.type === "stamps"} />
        </Card>
        <Card title="Recompensas" description="El dueño y el gerente las editan desde su panel.">
          {rewards.length ? (
            <ul className="ll-list">
              {rewards.map((r) => (
                <li key={r.id} className="ll-list-item">
                  <strong>{r.name}</strong>
                  {program.type !== "stamps" && <span className="ll-muted">{int(r.cost)} puntos</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ll-hint">Aún no hay recompensas activas.</p>
          )}
        </Card>
        {changedType && <Notice tone="warning">Cambiar el tipo de tarjeta conserva los saldos actuales, pero los clientes verán su pase con las reglas nuevas.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="ll-form-actions ll-sticky-actions">
          <Button loading={saving} onClick={save}>
            Guardar tarjeta
          </Button>
        </div>
      </div>
      <Card title="Vista previa del pase" className="ll-sticky">
        <PassPreview card={card} holder={sampleHolder(card)} />
      </Card>
    </div>
  )
}

const PROVIDERS: { id: Provider; name: string; detail: string }[] = [
  { id: "mercadopago", name: "Mercado Pago Point", detail: "Cada cobro de la terminal llega con monto, propina y caja." },
  { id: "clip", name: "Clip", detail: "Mismo flujo con terminales Clip." },
]

function PaymentsTab({ data }: { data: AdminBundle }) {
  if (!PREVIEW)
    return (
      <div className="ll-stack">
        <MercadoPagoCard businessId={data.business.id} />
        <Card title="Clip" description="Para leer los cobros de las terminales Clip, Clip tiene que dar acceso a LoyaLoop como integrador.">
          <Badge>Próximamente</Badge>
        </Card>
      </div>
    )
  return <PreviewPayments data={data} />
}

const EVENT_TONE = { processed: "success", ignored: "neutral", error: "danger", received: "neutral" } as const
const shortTerminal = (id: string) => id.split("__").pop() || id

function MercadoPagoCard({ businessId }: { businessId: string }) {
  const mp = useAsync(() => api.adminMercadoPago(businessId), [businessId])
  const connect = useAction(api.adminConnectMercadoPago)
  const disconnect = useAction(api.adminDisconnectMercadoPago)
  const assign = useAction(api.adminAssignTerminal)
  const [token, setToken] = useState("")
  const [confirm, setConfirm] = useState(false)
  const toast = useToast()
  if (mp.error) return <ErrorState message={mp.error} retry={mp.reload} />
  if (!mp.data) return <Loading rows={3} />
  const m = mp.data
  const assigned = m.registers.filter((r) => r.terminalId).length
  return (
    <>
      <Card
        title="Mercado Pago Point"
        description="Cada cobro de la terminal llega solo a LoyaLoop y se junta con el escaneo del cliente en esa caja."
        actions={
          m.connected && (
            <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
              Desconectar
            </Button>
          )
        }
      >
        <div className="ll-stack">
          <div className="ll-row">
            <Badge tone={m.connected ? (m.lastError ? "danger" : "success") : "neutral"}>{m.connected ? (m.lastError ? "Con error" : "Conectado") : "Sin conectar"}</Badge>
            {m.connected && (
              <span className="ll-hint">
                {m.account} · {m.method === "oauth" ? "autorizado por el dueño" : "con Access Token"}
                {m.lastSyncAt ? ` · revisado ${relative(m.lastSyncAt)}` : ""}
              </span>
            )}
          </div>
          {m.problem && <Notice tone="warning">{m.problem}</Notice>}
          {m.lastError && <p className="ll-field-error">{m.lastError}</p>}
          {!m.connected && !m.problem && (
            <>
              {m.link ? (
                <div className="ll-stack">
                  <p>
                    <b>Opción recomendada:</b> manda este enlace al dueño por WhatsApp. Entra con su cuenta de Mercado Pago, autoriza a LoyaLoop y queda conectado; no tiene que copiar ninguna clave.
                  </p>
                  <div className="ll-code-box">
                    <code>{m.link}</code>
                    <CopyButton text={m.link} label="Copiar enlace" />
                  </div>
                  <p className="ll-hint">El enlace dura 7 días. Cuando el dueño termine, recarga esta página.</p>
                </div>
              ) : (
                <Notice tone="info">El enlace «Conectar con Mercado Pago» se activa cuando el servidor tenga la aplicación de LoyaLoop (MERCADOPAGO_CLIENT_ID y MERCADOPAGO_CLIENT_SECRET). Mientras, pega el Access Token.</Notice>
              )}
              <form
                className="ll-stack"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const r = await connect.run(businessId, token)
                  if (r.ok) {
                    setToken("")
                    toast(`Mercado Pago conectado (${r.value.account}).`)
                    mp.reload()
                  }
                }}
              >
                <Field
                  label={m.link ? "O pega su Access Token" : "Access Token del negocio"}
                  type="password"
                  autoComplete="off"
                  placeholder="APP_USR-…"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  error={connect.error}
                  hint="En Mercado Pago Developers, Tus integraciones › la aplicación del negocio › Credenciales de producción. Se guarda cifrado."
                />
                <div>
                  <Button type="submit" size="sm" loading={connect.pending} disabled={!token.trim()}>
                    Conectar
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </Card>

      {m.connected && (
        <Card
          title="Terminales"
          description={
            m.registers.length === 1
              ? "Con una sola caja, todos los cobros de esta cuenta van a esa caja. Asignar la terminal es opcional."
              : "Elige en qué caja está cada terminal: así cada cobro se junta con el escaneo de su caja."
          }
          padded={false}
        >
          {m.terminalsError ? (
            <div style={{ padding: 22 }}>
              <Notice tone="error">{m.terminalsError}</Notice>
            </div>
          ) : !m.terminals.length ? (
            <div style={{ padding: 22 }}>
              <p className="ll-hint">Esta cuenta no tiene terminales Point registradas. Si la terminal es nueva, vincúlala primero en la app de Mercado Pago.</p>
            </div>
          ) : (
            <div className="ll-table-wrap">
              <table className="ll-table is-responsive">
                <thead>
                  <tr>
                    <th>Terminal</th>
                    <th>Modo</th>
                    <th>Caja de LoyaLoop</th>
                  </tr>
                </thead>
                <tbody>
                  {m.terminals.map((t) => (
                    <tr key={t.id}>
                      <td className="ll-td-main">
                        <span className="ll-cell-main">{shortTerminal(t.id)}</span>
                      </td>
                      <td data-label="Modo">{t.mode === "PDV" ? "Integrado (PDV)" : t.mode === "STANDALONE" ? "Independiente" : t.mode || "—"}</td>
                      <td data-label="Caja">
                        <select
                          aria-label={`Caja de la terminal ${shortTerminal(t.id)}`}
                          value={t.registerId || ""}
                          disabled={assign.pending}
                          onChange={async (e) => {
                            const registerId = e.target.value
                            const previous = t.registerId
                            const r = registerId ? await assign.run(businessId, registerId, t.id) : previous ? await assign.run(businessId, previous, "") : { ok: true as const, value: undefined }
                            if (r.ok) {
                              toast(registerId ? "Terminal asignada." : "Terminal sin caja.")
                              mp.reload()
                            }
                          }}
                        >
                          <option value="">Sin asignar</option>
                          {m.registers.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.branch ? `${r.branch} · ${r.name}` : r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {assign.error && (
            <div style={{ padding: "0 22px 16px" }}>
              <p className="ll-field-error">{assign.error}</p>
            </div>
          )}
          {m.registers.length > 1 && m.terminals.length > 0 && assigned < m.registers.length && (
            <div style={{ padding: "0 22px 16px" }}>
              <p className="ll-hint">
                {assigned} de {m.registers.length} cajas tienen terminal.
              </p>
            </div>
          )}
        </Card>
      )}

      {(m.connected || m.events.length > 0) && (
        <Card title="Últimos cobros leídos" description="Cada cobro aprobado de la cuenta y qué hizo LoyaLoop con él. Sirve para revisar la primera prueba." padded={false}>
          {!m.events.length ? (
            <div style={{ padding: 22 }}>
              <p className="ll-hint">Todavía no llega ningún cobro. Haz uno de prueba en la terminal y recarga en unos segundos.</p>
            </div>
          ) : (
            <ul className="ll-list" style={{ padding: "0 22px 8px" }}>
              {m.events.map((e) => (
                <li key={e.externalId} className="ll-list-item">
                  <div>
                    <strong>
                      {money(e.amount)} · {dateTime(e.at)}
                    </strong>
                    <small>
                      Pago {e.externalId}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </small>
                  </div>
                  <Badge tone={EVENT_TONE[e.status]}>{e.status === "processed" ? "Leído" : e.status === "ignored" ? "Omitido" : e.status === "error" ? "Error" : "Leyendo"}</Badge>
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: "0 22px 16px" }}>
            <Button variant="secondary" size="sm" onClick={mp.reload}>
              Recargar
            </Button>
          </div>
        </Card>
      )}

      {confirm && (
        <Confirm
          title="¿Desconectar Mercado Pago?"
          confirmLabel="Desconectar"
          tone="danger"
          pending={disconnect.pending}
          error={disconnect.error}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            const r = await disconnect.run(businessId)
            if (r.ok) {
              toast("Mercado Pago desconectado.")
              setConfirm(false)
              mp.reload()
            }
          }}
        >
          Se borra la clave guardada y LoyaLoop deja de leer los cobros de sus terminales. Los puntos ya sumados se quedan.
        </Confirm>
      )}
    </>
  )
}

function PreviewPayments({ data }: { data: AdminBundle }) {
  const { run, pending, error } = useAction(api.adminSetIntegration)
  const [busy, setBusy] = useState<Provider | null>(null)
  const toast = useToast()
  return (
    <div className="ll-stack">
      <Notice tone="info">
        Cada caja de LoyaLoop se asocia con una terminal del negocio. {PREVIEW ? "En esta versión la conexión se marca a mano; con el servidor, el dueño autoriza a LoyaLoop desde su cuenta del proveedor." : "El dueño autoriza a LoyaLoop desde su cuenta del proveedor."}
      </Notice>
      <div className="ll-grid-2">
        {PROVIDERS.map((p) => {
          const row = data.integrations.find((i) => i.provider === p.id)
          const connected = row?.status === "connected"
          return (
            <Card key={p.id} title={p.name} description={p.detail}>
              <div className="ll-stack">
                <div className="ll-row">
                  <Badge tone={connected ? "success" : row?.status === "error" ? "danger" : "neutral"}>{connected ? "Conectado" : row?.status === "error" ? "Con error" : "Sin conectar"}</Badge>
                  {connected && row?.connectedAt && <span className="ll-hint">Desde {dateTime(row.connectedAt)}</span>}
                </div>
                {row?.lastError && <p className="ll-field-error">{row.lastError}</p>}
                <div>
                  <Button
                    variant={connected ? "secondary" : "primary"}
                    size="sm"
                    loading={pending && busy === p.id}
                    onClick={async () => {
                      setBusy(p.id)
                      const r = await run(data.business.id, p.id, connected ? "not_connected" : "connected")
                      if (r.ok) toast(connected ? `${p.name} desconectado.` : `${p.name} conectado.`)
                    }}
                  >
                    {connected ? "Desconectar" : "Marcar como conectado"}
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}

function TestsTab({ data }: { data: AdminBundle }) {
  const [registerId, setRegisterId] = useState(data.registers[0]?.id || "")
  const [amount, setAmount] = useState(450)
  const [tip, setTip] = useState(0)
  const [result, setResult] = useState<string>("")
  const { run, pending, error } = useAction(api.simulatePayment)
  const connected = data.integrations.some((i) => i.status === "connected")
  const branchName = (id: string) => data.branches.find((b) => b.id === id)?.name
  const device = data.devices.find((d) => d.registerId === registerId)
  const firstBranch = data.branches[0]
  return (
    <div className="ll-split">
      <Card title="Simular un cobro de la terminal" description="Hace lo mismo que el aviso de Mercado Pago cuando la caja cobra. Solo existe en esta versión de prueba.">
        {!connected ? (
          <Notice tone="warning">Conecta un sistema de cobro en la pestaña «Cobro» para simular pagos.</Notice>
        ) : (
          <form
            className="ll-form"
            onSubmit={async (e) => {
              e.preventDefault()
              setResult("")
              const r = await run(data.business.id, registerId, amount, tip)
              if (!r.ok) return
              const o = r.value
              setResult(
                o.kind === "matched"
                  ? `Se asignó a ${o.customerName}: ${o.tx.points ? `+${int(o.tx.points)} puntos` : `+${o.tx.stamps} sello`} (base ${money(o.tx.amount)}).`
                  : o.kind === "review"
                    ? "Había más de un escaneo o cobro en la misma caja: quedó en revisión para el gerente."
                    : "Nadie ha escaneado en esta caja. El cobro espera 5 minutos a que un cliente escanee su tarjeta.",
              )
            }}
          >
            <SelectField label="Caja" value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
              {data.registers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {branchName(r.branchId)}
                </option>
              ))}
            </SelectField>
            <div className="ll-grid-2">
              <NumberField label="Monto cobrado" hint="En pesos, con propina." value={amount} onChange={setAmount} />
              <NumberField label="Propina" hint="En pesos." value={tip} onChange={setTip} />
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            {result && <Notice tone="success">{result}</Notice>}
            <div className="ll-form-actions">
              <Button type="submit" loading={pending}>
                Enviar cobro
              </Button>
            </div>
          </form>
        )}
      </Card>
      <Card title="Cómo probar el flujo completo">
        <ol className="ll-ordered">
          <li>
            Abre el registro de la sucursal{" "}
            {firstBranch && (
              <a className="ll-link" href={href(`/r/${firstBranch.code}`)} target="_blank" rel="noreferrer">
                {firstBranch.name}
              </a>
            )}{" "}
            y crea una tarjeta de cliente, o usa la de un cliente existente.
          </li>
          <li>
            Abre{" "}
            <a className="ll-link" href={href("/caja")} target="_blank" rel="noreferrer">
              el escáner
            </a>{" "}
            en otra pestaña. {device ? "Esta caja ya tiene uno vinculado en este navegador si lo emparejaste." : "Vincúlalo con un código desde «Sucursales y cajas» dentro de la cuenta."}
          </li>
          <li>Escanea o escribe el código de la tarjeta (aparece debajo del QR).</li>
          <li>Vuelve aquí y envía un cobro a la misma caja antes de 5 minutos. El escáner confirma los puntos al instante.</li>
        </ol>
      </Card>
    </div>
  )
}

export function AuditList({ entries, showBusiness = false }: { entries: (AuditEntry & { business?: string })[]; showBusiness?: boolean }) {
  if (!entries.length) return <Empty icon="layers" title="Sin movimientos registrados" />
  return (
    <Card padded={false}>
      <div className="ll-table-wrap" style={{ borderTop: 0 }}>
        <table className="ll-table is-responsive">
          <thead>
            <tr>
              <th>Fecha</th>
              {showBusiness && <th>Negocio</th>}
              <th>Quién</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td data-label="Fecha" className="ll-nowrap">
                  {dateTime(e.createdAt)}
                </td>
                {showBusiness && <td data-label="Negocio">{e.business || "LoyaLoop"}</td>}
                <td data-label="Quién">
                  {e.actorName}
                  {e.impersonated && (
                    <small>
                      <Badge tone="info">Dentro de la cuenta</Badge>
                    </small>
                  )}
                </td>
                <td data-label="Acción" className="ll-td-main">
                  <span className="ll-cell-main">{e.action}</span>
                  {e.detail && <small>{e.detail}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
