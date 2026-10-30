import { useEffect, useState } from "react"
import * as api from "../../lib/api"
import { useAction } from "../../lib/hooks"
import { href, navigate } from "../../lib/router"
import type { Provider } from "../../lib/types"
import { cardTypeLabel, isEmail, money, normalizePhone } from "../../lib/util"
import { InviteLinkNotice } from "../Auth"
import { PassPreview, sampleHolder } from "../../components/Pass"
import { Button, Card, Field, Icon, IconButton, Notice, PageHeader, SelectField } from "../../components/ui"
import { BrandEditor, NumberField, ProgramEditor, blankProgram, draftCard, type BrandDraft, type ProgramDraft } from "./ProgramEditor"

export const SECTORS = ["Cafetería", "Restaurante", "Bar", "Panadería", "Hotel o motel", "Salón o estética", "Estudio de pilates o barre", "Gimnasio o estudio", "Tienda", "Otro"]

const STEPS = ["Negocio", "Sucursales", "Tarjeta", "Marca", "Cobro y alta"] as const

interface RewardDraft {
  name: string
  cost: number
  description: string
}

/** Giro of a prospect as the business form names it. */
function sectorOf(prospectSector: string) {
  if (/pilates|barre/i.test(prospectSector)) return "Estudio de pilates o barre"
  if (/yoga|gimnasio|box/i.test(prospectSector)) return "Gimnasio o estudio"
  if (/barber|estétic/i.test(prospectSector)) return "Salón o estética"
  return SECTORS.find((s) => s.toLowerCase() === prospectSector.toLowerCase()) || "Otro"
}

export default function NewBusiness({ prospectId }: { prospectId?: string }) {
  const [step, setStep] = useState(0)
  const [problem, setProblem] = useState("")
  const [info, setInfo] = useState({ name: "", sector: SECTORS[0], contactName: "", email: "", phone: "", status: "pending" as "pending" | "trial" | "active", plan: "pro" as "starter" | "pro", ownerName: "", ownerEmail: "" })
  const [branches, setBranches] = useState([{ name: "", address: "" }])
  const [program, setProgram] = useState<ProgramDraft>(blankProgram())
  const [rewards, setRewards] = useState<RewardDraft[]>([{ name: "", cost: 500, description: "" }])
  const [brand, setBrand] = useState<BrandDraft>({ brand: { color: "#8A2E12" }, discreet: false, neutralName: "", locationAlerts: true, askPhone: false })
  const [provider, setProvider] = useState<"" | Provider>("")
  const [created, setCreated] = useState<{ id: string; inviteLink: string; emailed: boolean } | null>(null)
  const create = useAction(api.createBusiness)

  // Coming from a prospect: start with what is already known about it.
  useEffect(() => {
    if (!prospectId) return
    api
      .prospects()
      .then((list) => {
        const p = list.find((x) => x.id === prospectId)
        if (!p) return
        setInfo((i) => ({ ...i, name: p.name, sector: sectorOf(p.sector), contactName: p.contactName, email: p.email, phone: p.phone, ownerName: p.contactName, ownerEmail: p.email, plan: /pilates|barre|yoga/i.test(p.sector) ? "pro" : /caf/i.test(p.sector) ? "starter" : i.plan }))
        if (/pilates|barre|yoga|caf/i.test(p.sector)) setProgram((prog) => ({ ...prog, type: "stamps", stampMinPurchase: 0, tiers: [], dailyLimit: prog.dailyLimit || 1 }))
        if (p.address || p.zone) setBranches([{ name: p.zone || "Principal", address: p.address }])
      })
      .catch(() => undefined)
  }, [prospectId])

  const card = draftCard(info.name, program, brand, rewards)
  const setInfoField = (key: keyof typeof info, value: string) => setInfo({ ...info, [key]: value })

  function check(index: number): string {
    if (index === 0) {
      if (!info.name.trim()) return "Escribe el nombre del negocio."
      if (!isEmail(info.email)) return "Escribe un correo de contacto válido."
      if (info.phone && normalizePhone(info.phone).length !== 10) return "El teléfono debe tener 10 dígitos."
      if (!isEmail(info.ownerEmail)) return "Escribe el correo del dueño: ahí llega su invitación."
    }
    if (index === 1 && branches.some((b) => !b.name.trim())) return "Cada sucursal necesita un nombre."
    if (index === 1 && info.plan === "starter" && branches.length > 1) return "El plan Starter incluye 1 sucursal. Quita las demás o elige Pro."
    if (index === 2) {
      if (program.type === "stamps" && !rewards[0]?.name.trim()) return "Escribe la recompensa que se gana al completar los sellos."
      if (program.type === "tiers" && program.tiers.some((t) => !t.name.trim())) return "Cada nivel necesita un nombre."
    }
    if (index === 3 && !/^#[\da-f]{6}$/i.test(brand.brand.color)) return "Elige un color válido para la tarjeta."
    return ""
  }

  function next() {
    const message = check(step)
    setProblem(message)
    if (!message) {
      setStep(step + 1)
      window.scrollTo(0, 0)
    }
  }

  async function submit() {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const message = check(i)
      if (message) {
        setStep(i)
        setProblem(message)
        return
      }
    }
    const r = await create.run({
      ...info,
      branches,
      program: { ...program, stampRewardId: undefined },
      rewards: rewards.filter((x) => x.name.trim()),
      stampRewardIndex: program.type === "stamps" ? 0 : undefined,
      brand: brand.brand,
      discreet: brand.discreet,
      neutralName: brand.neutralName,
      locationAlerts: brand.locationAlerts,
      askPhone: brand.askPhone,
      provider: provider || undefined,
      prospectId: prospectId || undefined,
    })
    if (r.ok) {
      setCreated(r.value)
      window.scrollTo(0, 0)
    }
  }

  if (created)
    return (
      <>
        <PageHeader title="Negocio dado de alta" description={`${info.name} ya tiene su tarjeta configurada.`} />
        <Card title="Siguiente paso: invita al dueño">
          <div className="ll-stack">
            <InviteLinkNotice link={created.inviteLink} email={info.ownerEmail} emailed={created.emailed} />
            <ul className="ll-list">
              <li className="ll-perk">
                <Icon name="nfc" size={18} /> Graba el enlace de registro de cada sucursal en su etiqueta NFC desde la ficha del negocio.
              </li>
              <li className="ll-perk">
                <Icon name="scan" size={18} /> Vincula la tablet o el escáner de cada caja desde «Sucursales y cajas».
              </li>
              {!provider && program.type !== "stamps" && (
                <li className="ll-perk">
                  <Icon name="alert" size={18} /> Conecta su sistema de cobro: sin él la tarjeta de puntos no puede sumar.
                </li>
              )}
            </ul>
            <div className="ll-row">
              <Button onClick={() => navigate(`/admin/negocios/${created.id}`)}>Ver el negocio</Button>
              <Button variant="secondary" onClick={() => navigate("/admin/negocios")}>
                Volver a negocios
              </Button>
            </div>
          </div>
        </Card>
      </>
    )

  return (
    <>
      <PageHeader
        title="Nuevo negocio"
        description="Configura todo una vez; el dueño solo crea su contraseña."
        actions={
          <a className="ll-btn ll-btn-ghost ll-btn-md" href={href("/admin/negocios")}>
            <Icon name="back" size={18} /> Negocios
          </a>
        }
      />
      <ol className="ll-steps" aria-label="Pasos">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? "is-done" : i === step ? "is-current" : ""} aria-current={i === step ? "step" : undefined}>
            {i < step ? (
              <button type="button" className="ll-link" style={{ fontSize: 14 }} onClick={() => (setProblem(""), setStep(i))}>
                {label}
              </button>
            ) : (
              label
            )}
          </li>
        ))}
      </ol>
      <div className={step >= 2 ? "ll-split" : ""}>
        <Card>
          <form
            className="ll-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (step < STEPS.length - 1) next()
              else submit()
            }}
          >
            {step === 0 && (
              <>
                <div className="ll-grid-2">
                  <Field label="Nombre comercial" value={info.name} maxLength={60} onChange={(e) => setInfoField("name", e.target.value)} />
                  <SelectField label="Giro" value={info.sector} onChange={(e) => setInfoField("sector", e.target.value)}>
                    {SECTORS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </SelectField>
                </div>
                <div className="ll-grid-2">
                  <Field label="Persona de contacto" value={info.contactName} onChange={(e) => setInfoField("contactName", e.target.value)} />
                  <Field label="Teléfono" optional type="tel" inputMode="tel" placeholder="10 dígitos" value={info.phone} onChange={(e) => setInfoField("phone", e.target.value)} />
                </div>
                <Field label="Correo de contacto" type="email" value={info.email} onChange={(e) => setInfoField("email", e.target.value)} hint="Aparece en el reverso de la tarjeta." />
                <fieldset className="ll-fieldset">
                  <legend>Cuenta del dueño</legend>
                  <div className="ll-grid-2">
                    <Field label="Nombre" value={info.ownerName} onChange={(e) => setInfoField("ownerName", e.target.value)} />
                    <Field label="Correo" type="email" value={info.ownerEmail} onChange={(e) => setInfoField("ownerEmail", e.target.value)} hint="Recibe la invitación al panel." />
                  </div>
                </fieldset>
                <div className="ll-grid-2">
                  <SelectField
                    label="Plan"
                    value={info.plan}
                    onChange={(e) => {
                      const plan = e.target.value as "starter" | "pro"
                      setInfo({ ...info, plan })
                      if (plan === "starter") setProgram({ ...program, type: "stamps", stampMinPurchase: 0, tiers: [], dailyLimit: program.dailyLimit || 1 })
                    }}
                  >
                    <option value="pro">Pro ($990 al mes)</option>
                    <option value="starter">Starter ($390 al mes)</option>
                  </SelectField>
                  <SelectField label="Estado inicial" value={info.status} onChange={(e) => setInfoField("status", e.target.value)}>
                    <option value="pending">Por activar (espera su pago)</option>
                    <option value="trial">Periodo gratis (sin cobro)</option>
                    <option value="active">Activo (ya pagó)</option>
                  </SelectField>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <p className="ll-hint">Cada sucursal recibe su propio enlace de registro para la etiqueta NFC y una primera caja. Puedes agregar más cajas después.</p>
                {branches.map((b, i) => (
                  <div key={i} className="ll-branch-row">
                    <Field label={`Sucursal ${i + 1}`} placeholder="Ej. Roma Norte" value={b.name} onChange={(e) => setBranches(branches.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <Field label="Dirección" optional value={b.address} onChange={(e) => setBranches(branches.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} />
                    <IconButton icon="trash" tone="danger" label={`Quitar la sucursal ${i + 1}`} disabled={branches.length === 1} onClick={() => setBranches(branches.filter((_, j) => j !== i))} />
                  </div>
                ))}
                {info.plan === "starter" ? (
                  <p className="ll-hint">El plan Starter incluye 1 sucursal.</p>
                ) : (
                  <div>
                    <Button variant="secondary" size="sm" onClick={() => setBranches([...branches, { name: "", address: "" }])}>
                      <Icon name="plus" size={16} /> Agregar sucursal
                    </Button>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <ProgramEditor value={program} onChange={setProgram} rewards={null} starter={info.plan === "starter"} />
                <fieldset className="ll-fieldset">
                  <legend>{program.type === "stamps" ? "Recompensa al completar la tarjeta" : "Recompensas"}</legend>
                  {program.type !== "stamps" && <p className="ll-hint">El cliente las canjea con sus puntos en la caja. El dueño puede editarlas después.</p>}
                  {rewards.map((r, i) => (
                    <div key={i} className="ll-branch-row">
                      <Field label="Nombre" placeholder="Ej. Café americano gratis" value={r.name} onChange={(e) => setRewards(rewards.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      {program.type !== "stamps" ? (
                        <NumberField label="Costo en puntos" value={r.cost} min={1} onChange={(n) => setRewards(rewards.map((x, j) => (j === i ? { ...x, cost: Math.round(n) } : x)))} />
                      ) : (
                        <span />
                      )}
                      <IconButton icon="trash" tone="danger" label={`Quitar la recompensa ${i + 1}`} disabled={rewards.length === 1} onClick={() => setRewards(rewards.filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  {program.type !== "stamps" && (
                    <div>
                      <Button variant="secondary" size="sm" onClick={() => setRewards([...rewards, { name: "", cost: 1000, description: "" }])}>
                        <Icon name="plus" size={16} /> Agregar recompensa
                      </Button>
                    </div>
                  )}
                </fieldset>
              </>
            )}

            {step === 3 && <BrandEditor value={brand} onChange={setBrand} name={info.name} stamps={program.type === "stamps"} />}

            {step === 4 && (
              <>
                <SelectField label="Sistema de cobro" value={provider} onChange={(e) => setProvider(e.target.value as "" | Provider)} hint="Con el cobro conectado, los puntos se suman solos al pagar.">
                  <option value="">Lo conecto después</option>
                  <option value="mercadopago">Mercado Pago Point</option>
                  <option value="clip">Clip</option>
                </SelectField>
                {!provider && program.type !== "stamps" && (
                  <Notice tone="warning">Hasta conectar el cobro, esta tarjeta de {cardTypeLabel[program.type].toLowerCase()} no podrá sumar en caja.</Notice>
                )}
                {!provider && program.type === "stamps" && <Notice tone="info">Sin cobro conectado, la tarjeta suma un sello por visita cada vez que el cliente escanea.</Notice>}
                <dl className="ll-dl">
                  <div>
                    <dt>Negocio</dt>
                    <dd>
                      {info.name} · {info.sector}
                    </dd>
                  </div>
                  <div>
                    <dt>Dueño</dt>
                    <dd>{info.ownerEmail}</dd>
                  </div>
                  <div>
                    <dt>Sucursales</dt>
                    <dd>{branches.map((b) => b.name).join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Tarjeta</dt>
                    <dd>
                      {cardTypeLabel[program.type]}
                      {program.type === "stamps"
                        ? ` · ${program.stampGoal} sellos`
                        : ` · ${program.pointsPerPeso * 100} puntos por cada $100${program.minPurchase ? ` desde ${money(program.minPurchase)}` : ""}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Plan</dt>
                    <dd>{info.plan === "starter" ? "Starter" : "Pro"}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>{info.status === "pending" ? "Por activar" : info.status === "trial" ? "Periodo gratis" : "Activo"}</dd>
                  </div>
                </dl>
              </>
            )}

            {(problem || create.error) && <Notice tone="error">{problem || create.error}</Notice>}
            <div className="ll-form-actions">
              {step > 0 && (
                <Button variant="secondary" onClick={() => (setProblem(""), setStep(step - 1))}>
                  Atrás
                </Button>
              )}
              <Button type="submit" loading={create.pending}>
                {step < STEPS.length - 1 ? "Continuar" : "Dar de alta"}
              </Button>
            </div>
          </form>
        </Card>
        {step >= 2 && (
          <Card title="Así se verá el pase">
            <PassPreview card={card} holder={sampleHolder(card)} />
          </Card>
        )}
      </div>
    </>
  )
}
