import * as api from "../lib/api"
import { useAsync } from "../lib/hooks"
import { absoluteLink } from "../lib/router"
import { inkFor } from "../lib/util"
import Qr from "../components/Qr"
import { Button, ErrorState, Loading } from "../components/ui"
import { draftCard } from "./admin/ProgramEditor"
import type { PublicCard } from "../lib/api"

/** The public card, or, for its own owner while the account is not active yet, the card as designed. */
async function posterCard(code: string): Promise<PublicCard> {
  try {
    return (await api.registration(code)).card
  } catch (error) {
    const bundle = await api.bundle().catch(() => undefined)
    if (!bundle?.branches.some((b) => b.code.toUpperCase() === code.toUpperCase())) throw error
    const { businessId: _b, ...program } = bundle.program
    const { business } = bundle
    return draftCard(business.name, program, { brand: business.brand, discreet: business.discreet, neutralName: business.neutralName, locationAlerts: false, askPhone: false }, bundle.rewards.filter((r) => r.active))
  }
}

/** #/letrero/<código>: printable counter sign with the branch's registration QR. */
export default function Poster({ code }: { code: string }) {
  const info = useAsync(() => posterCard(code), [code])
  if (info.error) return <ErrorState message={info.error} />
  if (!info.data) return <Loading rows={4} />
  const card = info.data
  const { ink } = inkFor(card.brand.color)
  const reward = card.type === "stamps" ? card.rewards[0]?.name : undefined
  return (
    <div className="ll-poster-page">
      <div className="ll-poster-actions">
        <Button onClick={() => window.print()}>Imprimir letrero</Button>
        <span className="ll-hint">Tamaño media carta (15 × 21 cm). Imprímelo al 100%.</span>
      </div>
      <article className="ll-poster" style={{ ["--poster-color" as string]: card.brand.color, ["--poster-ink" as string]: ink }}>
        <header>
          {card.brand.logo && !card.discreet && <img src={card.brand.logo} alt="" />}
          <h1>{card.businessName}</h1>
          <p>Programa de lealtad</p>
        </header>
        <div className="ll-poster-qr">
          <Qr value={absoluteLink(`/r/${code}`)} size={220} label={`Código para unirse al programa de ${card.businessName}`} />
        </div>
        <h2>Escanea y únete</h2>
        <ol>
          <li>Abre la cámara de tu celular y apunta al código.</li>
          <li>Escribe tu nombre o un apodo.</li>
          <li>Guárdala en tu Wallet y muéstrala en la caja.</li>
        </ol>
        {card.type === "stamps" && (
          <p className="ll-poster-perk">
            Junta {card.program.stampGoal} sellos{reward ? ` y llévate ${reward.toLowerCase()}` : " y llévate tu recompensa"}.
          </p>
        )}
        <footer>Sin apps · Apple Wallet y Google Wallet</footer>
      </article>
    </div>
  )
}
