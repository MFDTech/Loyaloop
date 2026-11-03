import { useState } from "react"
import * as api from "../../lib/api"
import { useAction } from "../../lib/hooks"
import { href } from "../../lib/router"
import { BrandEditor, ProgramEditor, draftCard, type BrandDraft, type ProgramDraft } from "../admin/ProgramEditor"
import { cardFromBundle } from "../../lib/card"
import { useAsync } from "../../lib/hooks"
import { sampleHolder, PassPreview } from "../../components/Pass"
import { cardTypeHelp, cardTypeLabel, int, money } from "../../lib/util"
import { Badge, Button, Card, ErrorState, Loading, Notice, PageHeader, useToast } from "../../components/ui"

/** Starter plan: the owner designs the card and its rules. */
function StarterEditor({ bundle }: { bundle: api.Bundle }) {
  const { businessId: _b, ...initialProgram } = bundle.program
  const [program, setProgram] = useState<ProgramDraft>({ ...initialProgram, type: "stamps" })
  const [brand, setBrand] = useState<BrandDraft>({ brand: bundle.business.brand, discreet: bundle.business.discreet, neutralName: bundle.business.neutralName, locationAlerts: false, askPhone: false })
  const save = useAction(api.saveCard)
  const toast = useToast()
  const rewards = bundle.rewards.filter((r) => r.active)
  const card = draftCard(bundle.business.name, program, brand, rewards)
  return (
    <>
      <PageHeader title="Tu tarjeta" description="Ponle tu logo y tus colores, y decide cuántos sellos se necesitan para la recompensa." />
      <div className="ll-split">
        <div className="ll-stack">
          <Card title="Diseño">
            <BrandEditor value={brand} onChange={setBrand} name={bundle.business.name} stamps starter />
          </Card>
          <Card title="Reglas">
            <ProgramEditor value={program} onChange={setProgram} rewards={rewards} starter />
            <p className="ll-hint" style={{ marginTop: 12 }}>
              Para cambiar el nombre de la recompensa entra a{" "}
              <a className="ll-link" href={href("/panel/recompensas")}>
                Recompensas
              </a>
              .
            </p>
          </Card>
          {save.error && <Notice tone="error">{save.error}</Notice>}
          <div className="ll-form-actions">
            <Button
              loading={save.pending}
              onClick={async () => {
                const r = await save.run({ program, brand: { brand: brand.brand, discreet: brand.discreet, neutralName: brand.neutralName } })
                if (r.ok) toast("Tarjeta guardada. Los pases de tus clientes se actualizan solos.")
              }}
            >
              Guardar tarjeta
            </Button>
          </div>
        </div>
        <div className="ll-sticky">
          <Card title="Así se ve en la Wallet">
            <PassPreview card={card} holder={sampleHolder(card)} />
          </Card>
        </div>
      </div>
    </>
  )
}

export default function CardView() {
  const b = useAsync(api.bundle)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={6} />
  if (b.data.business.plan === "starter") return <StarterEditor bundle={b.data} />
  const { program, business, rewards } = b.data
  const card = cardFromBundle(b.data)
  const points = program.type !== "stamps"
  const stampReward = rewards.find((r) => r.id === program.stampRewardId)
  const rows: [string, string][] = [
    ["Tipo de tarjeta", `${cardTypeLabel[program.type]}. ${cardTypeHelp[program.type]}`],
    ...(points
      ? ([
          ["Puntos por compra", `${int(program.pointsPerPeso * 100)} puntos por cada $100 pagados, sin propina y redondeando hacia abajo`],
          ["Compra mínima", program.minPurchase ? money(program.minPurchase) : "Sin mínimo"],
          ["Vigencia de los puntos", program.expirationMonths ? `Vencen tras ${program.expirationMonths} meses sin actividad` : "No vencen"],
        ] as [string, string][])
      : ([
          ["Qué cuenta como sello", program.stampMinPurchase ? `Una compra desde ${money(program.stampMinPurchase)}` : "Cada visita"],
          ["Sellos para la recompensa", `${program.stampGoal}`],
          ["Recompensa al completar", stampReward?.name || "Sin definir"],
        ] as [string, string][])),
    ["Bono de bienvenida", program.welcomeBonus ? `${program.welcomeBonus} ${points ? "puntos" : "sello(s)"}` : "No"],
    ["Bono de cumpleaños", program.birthdayBonus ? (points ? `${program.birthdayBonus} puntos` : "1 sello") : "No"],
    ["Límite por cliente", program.dailyLimit ? `${program.dailyLimit} compras con beneficio al día` : "Sin límite"],
    ["Modo discreto", business.discreet ? `Sí. El pase dice "${business.neutralName}" y no hay avisos por ubicación` : "No"],
    ["Avisos por ubicación", business.discreet ? "Desactivados por el modo discreto" : business.locationAlerts ? "Sí, cerca de tus sucursales" : "No"],
  ]
  return (
    <>
      <PageHeader title="Tarjeta y reglas" description="Así funciona tu programa y así lo ven tus clientes en su Wallet." />
      <Notice tone="info">Por ahora las reglas las configura LoyaLoop por ti. Si quieres cambiar algo, escríbenos a hola@loyaloop.com.mx.</Notice>
      <div className="ll-split">
        <div className="ll-stack">
          <Card title="Reglas de tu programa">
            <dl className="ll-dl">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {program.type === "tiers" && (
            <Card title="Niveles" description="Se calculan con el gasto de los últimos 12 meses.">
              <dl className="ll-dl">
                {program.tiers.map((t) => (
                  <div key={t.id}>
                    <dt>
                      <Badge tone="brand">{t.name}</Badge>
                    </dt>
                    <dd>
                      Desde {money(t.threshold)} · puntos ×{t.multiplier}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="ll-hint" style={{ marginTop: 12 }}>
                {program.tierDowngrade ? "Si el gasto baja, el cliente puede bajar de nivel." : "Los clientes nunca bajan de nivel."}
              </p>
            </Card>
          )}
        </div>
        <Card title="Vista del pase">
          <PassPreview card={card} holder={sampleHolder(card)} />
        </Card>
      </div>
    </>
  )
}
