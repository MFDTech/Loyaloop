import { useMemo, useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { href, navigate } from "../../lib/router"
import type { Prospect, ProspectStage } from "../../lib/types"
import { dateTime, formatPhone, relative } from "../../lib/util"
import { Badge, Button, Card, Confirm, Empty, ErrorState, Field, Icon, Loading, Modal, Notice, PageHeader, SelectField, Tabs, TextArea, useToast } from "../../components/ui"

export const STAGE_LABEL: Record<ProspectStage, string> = { to_visit: "Por visitar", visited: "Visitado", demo: "Demo hecha", trial: "Periodo gratis", won: "Cliente", lost: "No por ahora" }
const STAGE_TONE = { to_visit: "neutral", visited: "info", demo: "brand", trial: "warning", won: "success", lost: "neutral" } as const
const STAGES = Object.keys(STAGE_LABEL) as ProspectStage[]
const SECTORS = ["Pilates", "Barre", "Yoga", "Gimnasio o box", "Cafetería", "Restaurante", "Barbería", "Estética", "Otro"]
const SEARCHES = ["estudio de pilates", "estudio de barre", "estudio de yoga", "cafetería", "barbería"]

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
/** A follow-up is due on its date, except for prospects already won («No por ahora» can carry a date to try again). */
const due = (p: Prospect) => p.stage !== "won" && !!p.nextDate && p.nextDate <= today()
const shortDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
const whatsapp = (phone: string) => `https://wa.me/52${phone}`

/** #/admin/prospectos: LoyaLoop's own sales list. */
export default function Prospects() {
  const list = useAsync(api.prospects)
  const [stage, setStage] = useState<"all" | "due" | ProspectStage>("all")
  const [query, setQuery] = useState("")
  const [sector, setSector] = useState("")
  const [editing, setEditing] = useState<Prospect | "new" | null>(null)
  const all = list.data || []
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((p) => (stage === "all" ? true : stage === "due" ? due(p) : p.stage === stage))
      .filter((p) => !sector || p.sector === sector)
      .filter((p) => !q || `${p.name} ${p.zone} ${p.contactName} ${p.address} ${p.instagram}`.toLowerCase().includes(q))
      .sort((a, b) => (due(a) === due(b) ? (a.nextDate || "9999").localeCompare(b.nextDate || "9999") || b.updatedAt.localeCompare(a.updatedAt) : due(a) ? -1 : 1))
  }, [all, stage, sector, query])
  const dueCount = all.filter(due).length
  const sectors = [...new Set(all.map((p) => p.sector).filter(Boolean))].sort()
  const current = editing && editing !== "new" ? all.find((p) => p.id === editing.id) || editing : editing

  return (
    <>
      <PageHeader
        title="Prospectos"
        description="Los negocios que quieres convertir en clientes: quién es, en qué etapa va y qué sigue."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Icon name="plus" size={18} /> Agregar prospecto
          </Button>
        }
      />
      {dueCount > 0 && stage !== "due" && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warning" title={dueCount === 1 ? "Tienes 1 seguimiento para hoy" : `Tienes ${dueCount} seguimientos para hoy`}>
            <button type="button" className="ll-link" onClick={() => setStage("due")}>
              Ver los de hoy
            </button>
          </Notice>
        </div>
      )}
      <MapsSearch />
      <Tabs
        value={stage}
        onChange={setStage}
        tabs={[
          { value: "all", label: "Todos", count: all.length },
          { value: "due", label: "Para hoy", count: dueCount },
          ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], count: all.filter((p) => p.stage === s).length })),
        ]}
      />
      <Card padded={false}>
        <div className="ll-toolbar" style={{ padding: "20px 22px" }}>
          <div className="ll-field ll-search">
            <label htmlFor="buscar-prospectos">Buscar</label>
            <Icon name="search" size={18} />
            <input id="buscar-prospectos" type="search" placeholder="Nombre, zona, contacto o Instagram" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <SelectField label="Giro" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Todos</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
        </div>
        {list.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={list.error} retry={list.reload} />
          </div>
        ) : !list.data ? (
          <div style={{ padding: 22 }}>
            <Loading />
          </div>
        ) : !rows.length ? (
          <Empty icon="search" title={all.length ? "Ningún prospecto con estos filtros" : "Aún no tienes prospectos"} action={!all.length ? <Button onClick={() => setEditing("new")}>Agregar el primero</Button> : undefined}>
            {!all.length && "Busca estudios en Google Maps con el buscador de arriba y agrégalos aquí."}
          </Empty>
        ) : (
          <div className="ll-table-wrap" style={{ borderTop: 0 }}>
            <table className="ll-table is-responsive is-clickable">
              <thead>
                <tr>
                  <th>Negocio</th>
                  <th>Contacto</th>
                  <th>Etapa</th>
                  <th>Siguiente paso</th>
                  <th>Último movimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setEditing(p)}>
                    <td className="ll-td-main">
                      <button type="button" className="ll-cell-main ll-link-plain" onClick={(e) => (e.stopPropagation(), setEditing(p))}>
                        {p.name}
                      </button>
                      <small>{[p.sector, p.zone].filter(Boolean).join(" · ") || "—"}</small>
                    </td>
                    <td data-label="Contacto">
                      {p.contactName || (p.phone ? "" : "—")}
                      {p.phone && (
                        <small style={{ display: "block" }}>
                          <a className="ll-link" href={whatsapp(p.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            {formatPhone(p.phone)}
                          </a>
                        </small>
                      )}
                    </td>
                    <td data-label="Etapa">
                      <Badge tone={STAGE_TONE[p.stage]}>{STAGE_LABEL[p.stage]}</Badge>
                    </td>
                    <td data-label="Siguiente paso">
                      {p.nextStep || (p.nextDate ? "" : <span className="ll-muted">—</span>)}
                      {p.nextDate && (
                        <small style={{ display: "block" }} className={due(p) ? "ll-due" : "ll-muted"}>
                          {due(p) ? (p.nextDate < today() ? `Vencido · ${shortDate(p.nextDate)}` : "Hoy") : shortDate(p.nextDate)}
                        </small>
                      )}
                    </td>
                    <td data-label="Último movimiento">
                      <span className="ll-muted">{p.log[0]?.text ? `${p.log[0].text.slice(0, 60)}${p.log[0].text.length > 60 ? "…" : ""}` : "Sin notas"}</span>
                      <small style={{ display: "block" }} className="ll-muted">
                        {relative(p.updatedAt)}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {current && <ProspectModal prospect={current === "new" ? null : current} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Opens Google Maps with the search, to find businesses to add. */
function MapsSearch() {
  const [what, setWhat] = useState(SEARCHES[0])
  const [where, setWhere] = useState("Tlalpan, CDMX")
  const url = `https://www.google.com/maps/search/${encodeURIComponent(`${what} ${where}`.trim())}`
  return (
    <Card title="Buscar negocios" description="Abre Google Maps con la búsqueda; agrega aquí los que te interesen." className="ll-maps-search">
      <div className="ll-toolbar">
        <SelectField label="Qué" value={what} onChange={(e) => setWhat(e.target.value)}>
          {SEARCHES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </SelectField>
        <Field label="Dónde" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Colonia o alcaldía" />
        <a className="button ll-btn ll-btn-secondary ll-btn-md button-secondary ll-maps-go" href={url} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> Buscar en Google Maps
        </a>
      </div>
    </Card>
  )
}

type Draft = Omit<Prospect, "id" | "log" | "createdAt" | "updatedAt" | "businessId">

function blank(): Draft {
  return { name: "", sector: "Pilates", zone: "", address: "", contactName: "", phone: "", email: "", instagram: "", link: "", stage: "to_visit", nextStep: "", nextDate: "", notes: "" }
}

function ProspectModal({ prospect, onClose }: { prospect: Prospect | null; onClose: () => void }) {
  const [form, setForm] = useState<Draft>(() => {
    if (!prospect) return blank()
    const { id: _i, log: _l, createdAt: _c, updatedAt: _u, businessId: _b, ...rest } = prospect
    return rest
  })
  const [note, setNote] = useState("")
  const [removing, setRemoving] = useState(false)
  const save = useAction(api.saveProspect)
  const addNote = useAction(api.addProspectNote)
  const remove = useAction(api.deleteProspect)
  const toast = useToast()
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setForm({ ...form, [key]: value })
  const maps = form.link || (form.name ? `https://www.google.com/maps/search/${encodeURIComponent(`${form.name} ${form.address || form.zone}`)}` : "")

  const details = (
    <>
      <div className="ll-grid-2">
        <Field label="Nombre del negocio" value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
        <SelectField label="Giro" value={SECTORS.includes(form.sector) ? form.sector : "Otro"} onChange={(e) => set("sector", e.target.value)}>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        <Field label="Zona" optional placeholder="Colonia o alcaldía" value={form.zone} maxLength={80} onChange={(e) => set("zone", e.target.value)} />
        <Field label="Dirección" optional value={form.address} maxLength={200} onChange={(e) => set("address", e.target.value)} />
        <Field label="Dueño o encargado" optional value={form.contactName} maxLength={80} onChange={(e) => set("contactName", e.target.value)} />
        <Field label="WhatsApp" optional type="tel" inputMode="tel" placeholder="10 dígitos" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        <Field label="Correo" optional type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <Field label="Instagram" optional placeholder="@estudio" value={form.instagram} maxLength={60} onChange={(e) => set("instagram", e.target.value)} />
      </div>
      <Field label="Enlace de Google Maps o sitio" optional type="url" placeholder="https://" value={form.link} onChange={(e) => set("link", e.target.value)} />
      <TextArea label="Notas" optional hint="Lo que sabes del negocio: cuántos alumnos, qué app usan, quién decide." value={form.notes} maxLength={2000} rows={3} onChange={(e) => set("notes", e.target.value)} />
    </>
  )
  const followUp = (
    <>
      <div className="ll-grid-2">
        <SelectField label="Etapa" value={form.stage} onChange={(e) => set("stage", e.target.value as ProspectStage)}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <Field label="Fecha del siguiente paso" optional type="date" value={form.nextDate} onChange={(e) => set("nextDate", e.target.value)} />
      </div>
      <Field label="Siguiente paso" optional placeholder="Ej. Regresar el jueves a las 5 con la demo" value={form.nextStep} maxLength={200} onChange={(e) => set("nextStep", e.target.value)} />
    </>
  )

  async function submit() {
    const r = await save.run({ ...form, id: prospect?.id, note: !prospect ? note : undefined })
    if (r.ok) {
      toast(prospect ? "Prospecto guardado." : "Prospecto agregado.")
      onClose()
    }
  }

  return (
    <Modal
      title={prospect ? prospect.name : "Nuevo prospecto"}
      description={prospect ? `Agregado ${relative(prospect.createdAt)}` : "Lo que sepas ahora; lo demás lo completas después de la visita."}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {prospect && (
            <Button variant="ghost" onClick={() => setRemoving(true)}>
              Eliminar
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.pending}>
            {prospect ? "Guardar" : "Agregar"}
          </Button>
        </>
      }
    >
      <div className="ll-stack">
        {prospect && (
          <div className="ll-row ll-prospect-actions">
            {form.phone && (
              <a className="ll-chip-link" href={whatsapp(form.phone)} target="_blank" rel="noreferrer">
                <Icon name="phone" size={15} /> WhatsApp
              </a>
            )}
            {form.instagram && (
              <a className="ll-chip-link" href={`https://instagram.com/${form.instagram}`} target="_blank" rel="noreferrer">
                <Icon name="external" size={15} /> Instagram
              </a>
            )}
            {maps && (
              <a className="ll-chip-link" href={maps} target="_blank" rel="noreferrer">
                <Icon name="globe" size={15} /> Mapa
              </a>
            )}
            {prospect.businessId ? (
              <a className="ll-chip-link" href={href(`/admin/negocios/${prospect.businessId}`)}>
                <Icon name="store" size={15} /> Ver su negocio en LoyaLoop
              </a>
            ) : (
              <button type="button" className="ll-chip-link" onClick={() => navigate(`/admin/negocios/nuevo?prospecto=${prospect.id}`)}>
                <Icon name="plus" size={15} /> Dar de alta como negocio
              </button>
            )}
          </div>
        )}
        {prospect ? (
          <>
            {followUp}
            <section className="ll-prospect-log" aria-label="Historial">
              <h3>Historial</h3>
              <form
                className="ll-note-row"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const r = await addNote.run(prospect.id, note)
                  if (r.ok) setNote("")
                }}
              >
                <Field label="Agregar nota" placeholder="Visita, llamada o mensaje" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                <Button type="submit" variant="secondary" loading={addNote.pending} disabled={!note.trim()}>
                  Agregar
                </Button>
              </form>
              {addNote.error && <p className="ll-field-error">{addNote.error}</p>}
              {prospect.log.length ? (
                <ol>
                  {prospect.log.map((l, i) => (
                    <li key={`${l.at}-${i}`}>
                      <span>{l.text}</span>
                      <small>
                        {dateTime(l.at)} · {l.by}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ll-hint">Aún no hay notas.</p>
              )}
            </section>
            <section className="ll-prospect-log" aria-label="Datos del negocio">
              <h3>Datos del negocio</h3>
              {details}
            </section>
          </>
        ) : (
          <>
            {details}
            {followUp}
            <TextArea label="Qué pasó hoy" optional placeholder="Ej. Pasé y hablé con la recepcionista; la dueña viene los martes." value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        {save.error && <Notice tone="error">{save.error}</Notice>}
      </div>
      {removing && prospect && (
        <Confirm
          title={`¿Eliminar ${prospect.name}?`}
          confirmLabel="Eliminar"
          tone="danger"
          pending={remove.pending}
          error={remove.error}
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            const r = await remove.run(prospect.id)
            if (r.ok) {
              toast("Prospecto eliminado.")
              onClose()
            }
          }}
        >
          Se borra con su historial. Si solo no le interesa por ahora, mejor cambia la etapa a «No por ahora».
        </Confirm>
      )}
    </Modal>
  )
}
