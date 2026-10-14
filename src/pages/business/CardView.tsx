import * as api from "../../lib/api"
import { cardFromBundle } from "../../lib/card"
import { useAsync } from "../../lib/hooks"
import { sampleHolder, PassPreview } from "../../components/Pass"
import { cardTypeHelp, cardTypeLabel, int, money } from "../../lib/util"
import { Badge, Card, ErrorState, Loading, Notice, PageHeader } from "../../components/ui"

export default function CardView() {
  const b = useAsync(api.bundle)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={6} />
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
      <Notice tone="info">Por ahora las reglas las configura LoyaLoop por ti. Si quieres cambiar algo, escríbenos a hola@loyaloop.mx.</Notice>
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
