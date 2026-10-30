import { NOTICE_EVENTS } from "../../lib/notices"
import { STAMP_ICON_OPTIONS } from "../../lib/stampIcons"
import { useEffect, useState, type ChangeEvent } from "react"
import type { PublicCard } from "../../lib/api"
import type { Brand, CardType, Program, Tier } from "../../lib/types"
import { cardTypeHelp, cardTypeLabel, inkFor, uid } from "../../lib/util"
import { Button, Check, Field, Icon, IconButton, Notice, Segmented, SelectField } from "../../components/ui"

export type ProgramDraft = Omit<Program, "businessId">

export function blankProgram(): ProgramDraft {
  return {
    type: "points",
    pointsPerPeso: 0.1,
    minPurchase: 0,
    stampMinPurchase: 0,
    stampGoal: 8,
    expirationMonths: 12,
    tiers: [],
    tierDowngrade: true,
    welcomeBonus: 0,
    birthdayBonus: 0,
    dailyLimit: 0,
    suspiciousFactor: 3,
    notify: { pointsEarned: true, rewardAvailable: true, tierChange: true, pointsExpiring: true },
  }
}

const defaultTiers = (): Tier[] => [
  { id: uid("t_"), name: "Clásico", threshold: 0, multiplier: 1 },
  { id: uid("t_"), name: "Plata", threshold: 6000, multiplier: 1.25 },
  { id: uid("t_"), name: "Oro", threshold: 15000, multiplier: 1.5 },
]

/** Number input that keeps what the person types (e.g. "1.") until it parses. */
export function NumberField({ label, value, onChange, hint, min = 0, step, suffix, optional }: { label: string; value: number; onChange: (value: number) => void; hint?: string; min?: number; step?: number; suffix?: string; optional?: boolean }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    if (Number(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Field
      label={suffix ? `${label} (${suffix})` : label}
      hint={hint}
      optional={optional}
      type="number"
      inputMode={step && step < 1 ? "decimal" : "numeric"}
      min={min}
      step={step || 1}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value !== "" && Number.isFinite(n)) onChange(n)
      }}
      onBlur={() => {
        if (text === "" || !Number.isFinite(Number(text))) {
          setText(String(value))
        }
      }}
    />
  )
}

const TYPES: CardType[] = ["points", "stamps", "rewards", "tiers"]

export function ProgramEditor({ value, onChange, rewards, starter = false }: { value: ProgramDraft; onChange: (next: ProgramDraft) => void; rewards: { id: string; name: string }[] | null; starter?: boolean }) {
  const set = <K extends keyof ProgramDraft>(key: K, v: ProgramDraft[K]) => onChange({ ...value, [key]: v })
  const points = value.type !== "stamps"
  const setTier = (index: number, patch: Partial<Tier>) => set("tiers", value.tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  return (
    <div className="ll-stack">
      {starter && <Notice tone="info">En el plan Starter la tarjeta es de sellos: un sello por visita. Puntos, niveles, conexión con tu terminal, avisos y promociones están en Pro.</Notice>}
      {!starter && (
      <fieldset className="ll-fieldset">
        <legend>Tipo de tarjeta</legend>
        <div className="ll-type-grid">
          {TYPES.map((type) => (
            <label key={type} className={`ll-type-option ${value.type === type ? "is-active" : ""}`}>
              <input
                type="radio"
                name="card-type"
                checked={value.type === type}
                onChange={() => onChange({ ...value, type, tiers: type === "tiers" && !value.tiers.length ? defaultTiers() : value.tiers })}
              />
              <strong>{cardTypeLabel[type]}</strong>
              <span>{cardTypeHelp[type]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      )}

      {points ? (
        <div className="ll-grid-3">
          <NumberField label="Puntos por cada $100" value={Math.round(value.pointsPerPeso * 100 * 100) / 100} step={0.5} onChange={(n) => set("pointsPerPeso", n / 100)} hint="Sin contar la propina." />
          <NumberField label="Compra mínima" value={value.minPurchase} onChange={(n) => set("minPurchase", n)} hint="En pesos. 0 = cualquier monto." />
          <NumberField label="Vencimiento" value={value.expirationMonths} onChange={(n) => set("expirationMonths", Math.round(n))} hint="Meses sin actividad. 0 = no vencen." />
        </div>
      ) : (
        <div className="ll-grid-3">
          <NumberField label="Sellos para completar" value={value.stampGoal} min={2} onChange={(n) => set("stampGoal", Math.round(n))} />
          {!starter && <NumberField label="Compra mínima" value={value.stampMinPurchase} onChange={(n) => set("stampMinPurchase", n)} hint="En pesos, por sello. 0 = cualquier monto." />}
          {rewards ? (
            <SelectField label="Recompensa al completar" value={value.stampRewardId || ""} onChange={(e) => set("stampRewardId", e.target.value || undefined)} hint={rewards.length ? undefined : "Primero crea una recompensa."}>
              <option value="">Elige una recompensa</option>
              {rewards.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <p className="ll-hint" style={{ alignSelf: "end" }}>
              La recompensa al completar es la primera de la lista de recompensas.
            </p>
          )}
        </div>
      )}

      {value.type === "tiers" && (
        <fieldset className="ll-fieldset">
          <legend>Niveles</legend>
          <p className="ll-hint">El nivel depende del gasto de los últimos 12 meses. El primero debe empezar en $0.</p>
          {value.tiers.map((tier, i) => (
            <div className="ll-tier-row" key={tier.id}>
              <Field label="Nombre" value={tier.name} maxLength={24} onChange={(e) => setTier(i, { name: e.target.value })} />
              <NumberField label="Gasto desde" value={tier.threshold} onChange={(n) => setTier(i, { threshold: n })} />
              <NumberField label="Multiplicador" value={tier.multiplier} min={1} step={0.05} onChange={(n) => setTier(i, { multiplier: n })} />
              <IconButton icon="trash" tone="danger" label={`Quitar el nivel ${tier.name}`} disabled={value.tiers.length <= 1} onClick={() => set("tiers", value.tiers.filter((_, x) => x !== i))} />
            </div>
          ))}
          <div className="ll-row">
            <Button variant="secondary" size="sm" onClick={() => set("tiers", [...value.tiers, { id: uid("t_"), name: "", threshold: (value.tiers.at(-1)?.threshold || 0) + 5000, multiplier: 1 }])}>
              <Icon name="plus" size={16} /> Agregar nivel
            </Button>
          </div>
          <Check label="Bajar de nivel si el gasto de 12 meses ya no alcanza" checked={value.tierDowngrade} onChange={(v) => set("tierDowngrade", v)} />
        </fieldset>
      )}

      <fieldset className="ll-fieldset">
        <legend>Bonos y protección</legend>
        <div className="ll-grid-3">
          <NumberField label="Bienvenida" value={value.welcomeBonus} onChange={(n) => set("welcomeBonus", Math.round(n))} hint={`${points ? "Puntos" : "Sellos"} de regalo. 0 = sin bono.`} />
          <NumberField label="Cumpleaños" value={value.birthdayBonus} onChange={(n) => set("birthdayBonus", Math.round(n))} hint={points ? "Puntos, una vez al año. 0 = sin bono." : "Cualquier número da 1 sello al año. 0 = sin bono."} />
          <NumberField label="Límite diario" value={value.dailyLimit} onChange={(n) => set("dailyLimit", Math.round(n))} hint="Compras que suman por cliente al día. 0 = sin límite." />
        </div>
        <NumberField label="Alerta de tarjeta sospechosa" value={value.suspiciousFactor} onChange={(n) => set("suspiciousFactor", n)} hint="Avisa cuando una tarjeta compra más de estas veces el promedio en 30 días. 0 = apagada." />
      </fieldset>

      {!starter && (
        <fieldset className="ll-fieldset">
          <legend>Avisos automáticos en la Wallet</legend>
          {NOTICE_EVENTS.filter((e) => e.applies(value.type)).map((e) => (
            <Check key={e.key} label={e.title} hint={e.when} checked={value.notify[e.key] ?? e.defaultOn} onChange={(v) => set("notify", { ...value.notify, [e.key]: v })} />
          ))}
          <p className="ll-field-hint">El dueño también los enciende y cambia sus textos en «Avisos» de su panel.</p>
        </fieldset>
      )}
    </div>
  )
}

export interface BrandDraft {
  brand: Brand
  discreet: boolean
  neutralName: string
  locationAlerts: boolean
  askPhone: boolean
}

const MAX_IMAGE = 400 * 1024

function readImage(e: ChangeEvent<HTMLInputElement>, done: (dataUrl: string) => void, fail: (message: string) => void) {
  const file = e.target.files?.[0]
  e.target.value = ""
  if (!file) return
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return fail("Usa una imagen PNG, JPG, WebP o SVG.")
  if (file.size > MAX_IMAGE) return fail("La imagen pesa más de 400 KB. Redúcela e inténtalo otra vez.")
  const reader = new FileReader()
  reader.onload = () => done(String(reader.result))
  reader.onerror = () => fail("No se pudo leer la imagen.")
  reader.readAsDataURL(file)
}

export function BrandEditor({ value, onChange, name, stamps = false, starter = false }: { value: BrandDraft; onChange: (next: BrandDraft) => void; name: string; stamps?: boolean; starter?: boolean }) {
  const [error, setError] = useState("")
  const setBrand = (patch: Partial<Brand>) => onChange({ ...value, brand: { ...value.brand, ...patch } })
  const contrast = inkFor(value.brand.color).contrast
  const validColor = /^#[\da-f]{6}$/i.test(value.brand.color)
  return (
    <div className="ll-stack">
      <div className="ll-grid-2">
        <div className="ll-field">
          <label htmlFor="brand-color">Color de la tarjeta</label>
          <div className="ll-color">
            <input type="color" aria-label="Elegir color" value={validColor ? value.brand.color : "#8A2E12"} onChange={(e) => setBrand({ color: e.target.value.toUpperCase() })} />
            <input id="brand-color" value={value.brand.color} maxLength={7} onChange={(e) => setBrand({ color: e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}` })} />
          </div>
          {!validColor ? (
            <p className="ll-field-error">Escribe un color como #8A2E12.</p>
          ) : (
            contrast < 4.5 && <p className="ll-field-hint">El texto del pase se leerá con poco contraste. Elige un tono más oscuro o más claro.</p>
          )}
        </div>
        <div className="ll-field">
          <span className="ll-label">Logo</span>
          <div className="ll-upload">
            {value.brand.logo && <img src={value.brand.logo} alt={`Logo de ${name}`} />}
            <label className="ll-btn ll-btn-secondary ll-btn-sm">
              <Icon name="download" size={16} /> {value.brand.logo ? "Cambiar" : "Subir logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => readImage(e, (logo) => (setError(""), setBrand({ logo })), setError)} />
            </label>
            {value.brand.logo && (
              <Button variant="ghost" size="sm" onClick={() => setBrand({ logo: undefined })}>
                Quitar
              </Button>
            )}
          </div>
          <p className="ll-field-hint">Cuadrado, fondo transparente. Máximo 400 KB.</p>
        </div>
      </div>
      <div className="ll-field">
        <span className="ll-label">Imagen de franja</span>
        <div className="ll-upload">
          {value.brand.strip && <img src={value.brand.strip} alt="Franja del pase" style={{ maxWidth: 220 }} />}
          <label className="ll-btn ll-btn-secondary ll-btn-sm">
            <Icon name="download" size={16} /> {value.brand.strip ? "Cambiar" : "Subir franja"}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => readImage(e, (strip) => (setError(""), setBrand({ strip })), setError)} />
          </label>
          {value.brand.strip && (
            <Button variant="ghost" size="sm" onClick={() => setBrand({ strip: undefined })}>
              Quitar
            </Button>
          )}
        </div>
        <p className="ll-field-hint">Opcional. Proporción 3:1 (por ejemplo 1125 × 369 px). En tarjetas de sellos se dibujan los sellos encima.</p>
      </div>
      {stamps && (
        <div className="ll-field">
          <span className="ll-label">Ícono de los sellos</span>
          <Segmented label="Ícono de los sellos" value={value.brand.stampIcon || "check"} options={STAMP_ICON_OPTIONS} onChange={(stampIcon) => setBrand({ stampIcon })} />
          <p className="ll-field-hint">
            {value.brand.stampIcon === "logo" && (!value.brand.logo || value.discreet)
              ? "Sin logo (o en modo discreto) los sellos llevan una palomita."
              : "Se dibuja dentro de cada sello ganado. El último sello muestra un regalo."}
          </p>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Check
        label="Modo discreto"
        hint="El pase y la página de registro muestran un nombre neutro, sin el nombre del negocio, y no hay avisos por ubicación."
        checked={value.discreet}
        onChange={(discreet) => onChange({ ...value, discreet, locationAlerts: discreet ? false : value.locationAlerts })}
      />
      {value.discreet && <Field label="Nombre neutro" value={value.neutralName} maxLength={40} onChange={(e) => onChange({ ...value, neutralName: e.target.value })} hint="Así se verá en la Wallet del cliente." />}
      {!starter && (
      <Check
        label="Pedir celular al registrarse"
        hint="Apagado: el cliente solo escribe su nombre (o un apodo) y su tarjeta sale al instante; el bono de bienvenida llega en su primera compra o visita. Encendido: confirma su celular con un código."
        checked={value.askPhone}
        onChange={(askPhone) => onChange({ ...value, askPhone })}
      />
      )}
      {!starter && <Check label="Aviso al llegar a la sucursal" hint="La Wallet muestra la tarjeta en la pantalla bloqueada cerca de la sucursal. Necesita la ubicación de cada sucursal (Sucursales y cajas)." checked={value.locationAlerts} disabled={value.discreet} onChange={(locationAlerts) => onChange({ ...value, locationAlerts })} />}
    </div>
  )
}

/** Public view of a draft, to preview the pass before saving. */
export function draftCard(name: string, program: ProgramDraft, brand: BrandDraft, rewards: { id?: string; name: string; cost: number; description: string }[]): PublicCard {
  return {
    businessName: brand.discreet ? brand.neutralName || "Mi tarjeta de beneficios" : name || "Tu negocio",
    askPhone: brand.askPhone,
    demo: false,
    discreet: brand.discreet,
    promotions: !brand.discreet,
    brand: brand.brand,
    type: program.type,
    program: {
      pointsPerPeso: program.pointsPerPeso,
      minPurchase: program.minPurchase,
      stampGoal: Math.max(2, program.stampGoal),
      stampMinPurchase: program.stampMinPurchase,
      expirationMonths: program.expirationMonths,
      tiers: program.tiers,
      welcomeBonus: program.welcomeBonus,
      birthdayBonus: program.birthdayBonus,
    },
    rewards: rewards.filter((r) => r.name.trim()).map((r, i) => ({ id: r.id || String(i), name: r.name, cost: r.cost, description: r.description })),
    contact: { email: "", phone: "" },
  }
}
