import { useState } from "react"
import type { CardHolder, PublicCard } from "../lib/api"
import { backFields } from "../lib/passText"
import { stampGlyph, stampStripSvg } from "../lib/stampIcons"
import { cardTypeLabel, inkFor, int } from "../lib/util"
import Qr, { POWERED_BY } from "./Qr"
import { Icon, Segmented } from "./ui"

export interface PassData {
  card: PublicCard
  holder: CardHolder
}

export function sampleHolder(card: PublicCard): CardHolder {
  return {
    name: "Nombre del cliente",
    token: "LL-EJEM-PL0S",
    points: card.type === "stamps" ? 0 : 420,
    stamps: Math.min(5, Math.max(card.program.stampGoal - 1, 1)),
    tierName: card.program.tiers[1]?.name || card.program.tiers[0]?.name,
    earnedRewards: [],
    memberSince: new Date().toISOString(),
  }
}

/** Stamp strip: the same drawing the server puts on the Apple Wallet pass. */
function Stamps({ card, count, overStrip = false }: { card: PublicCard; count: number; overStrip?: boolean }) {
  const { ink } = inkFor(card.brand.color)
  const color = /^#[\da-f]{6}$/i.test(card.brand.color) ? card.brand.color : "#8A2E12"
  const logo = card.discreet ? undefined : card.brand.logo
  const glyph = stampGlyph(card.brand.stampIcon, !!logo)
  const svg = stampStripSvg(count, card.program.stampGoal, { background: overStrip ? null : color, ink: overStrip ? "#FFFFFF" : ink, mark: color, glyph, logo }, 2)
  return <img className="ll-pass-stamps" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`${count} de ${card.program.stampGoal} sellos`} />
}

export function ApplePass({ card, holder, back = false }: PassData & { back?: boolean }) {
  const { ink } = inkFor(card.brand.color)
  const label = ink === "#FFFFFF" ? "rgba(255,255,255,.72)" : "rgba(25,22,19,.68)"
  const stamps = card.type === "stamps"
  const header = stamps
    ? { label: "SELLOS", value: `${holder.stamps}/${card.program.stampGoal}` }
    : { label: "PUNTOS", value: int(holder.points) }
  return (
    <div className="ll-pass ll-pass-apple" style={{ background: card.brand.color, color: ink }} aria-label={`Vista previa del pase de Apple Wallet de ${card.businessName}`}>
      {!back ? (
        <>
          <div className="ll-pass-top">
            <span className="ll-pass-logo">
              {card.brand.logo ? <img src={card.brand.logo} alt="" /> : <Icon name="store" size={20} />}
              <b>{card.businessName}</b>
            </span>
            <span className="ll-pass-field ll-pass-header-field">
              <small style={{ color: label }}>{header.label}</small>
              {header.value}
            </span>
          </div>
          <div
            className={`ll-pass-strip ${stamps ? "has-stamps" : ""}`}
            style={card.brand.strip ? { backgroundImage: `url(${card.brand.strip})` } : undefined}
          >
            {stamps ? (
              <Stamps card={card} count={holder.stamps} overStrip={!!card.brand.strip} />
            ) : (
              <span className="ll-pass-primary">
                <small style={{ color: label }}>{card.type === "tiers" ? "NIVEL" : "SALDO"}</small>
                {card.type === "tiers" ? holder.tierName || card.program.tiers[0]?.name || "—" : `${int(holder.points)} pts`}
              </span>
            )}
          </div>
          <div className="ll-pass-fields">
            <span className="ll-pass-field">
              <small style={{ color: label }}>NOMBRE</small>
              {holder.name}
            </span>
            {holder.earnedRewards.length > 0 ? (
              <span className="ll-pass-field">
                <small style={{ color: label }}>POR CANJEAR</small>
                {holder.earnedRewards.length}
              </span>
            ) : card.type === "tiers" ? (
              <span className="ll-pass-field">
                <small style={{ color: label }}>PUNTOS</small>
                {int(holder.points)}
              </span>
            ) : (
              <span className="ll-pass-field">
                <small style={{ color: label }}>TARJETA</small>
                {cardTypeLabel[card.type]}
              </span>
            )}
          </div>
          <div className="ll-pass-barcode">
            <Qr value={holder.token} size={118} label={`Código de la tarjeta ${holder.token}`} />
            <small>{card.discreet ? holder.token : `${holder.token} · ${POWERED_BY}`}</small>
          </div>
        </>
      ) : (
        <dl className="ll-pass-back">
          {backFields(card).map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function GooglePass({ card, holder }: PassData) {
  const { ink } = inkFor(card.brand.color)
  const stamps = card.type === "stamps"
  return (
    <div className="ll-pass ll-pass-google" style={{ background: card.brand.color, color: ink }} aria-label={`Vista previa del pase de Google Wallet de ${card.businessName}`}>
      <div className="ll-gpass-head">
        <span className="ll-gpass-logo">{card.brand.logo ? <img src={card.brand.logo} alt="" /> : <Icon name="store" size={18} />}</span>
        <span>{card.businessName}</span>
      </div>
      <p className="ll-gpass-title">{stamps ? "Tarjeta de sellos" : card.type === "tiers" ? `Nivel ${holder.tierName || card.program.tiers[0]?.name || ""}` : "Programa de lealtad"}</p>
      <div className="ll-gpass-row">
        <span>
          <small>{stamps ? "Sellos" : "Puntos"}</small>
          <b>{stamps ? `${holder.stamps} de ${card.program.stampGoal}` : int(holder.points)}</b>
        </span>
        <span>
          <small>Miembro</small>
          <b>{holder.name.split(" ")[0]}</b>
        </span>
      </div>
      <div className="ll-gpass-barcode">
        <Qr value={holder.token} size={124} label={`Código de la tarjeta ${holder.token}`} />
        <small>{card.discreet ? holder.token : `${holder.token} · ${POWERED_BY}`}</small>
      </div>
      {stamps && (
        <div className="ll-gpass-hero">
          <Stamps card={card} count={holder.stamps} />
        </div>
      )}
    </div>
  )
}

/** Apple and Google side by side choice, with front and back for Apple. */
export function PassPreview({ card, holder, note = true }: PassData & { note?: boolean }) {
  const [wallet, setWallet] = useState<"apple" | "google">("apple")
  const [side, setSide] = useState<"front" | "back">("front")
  return (
    <div className="ll-pass-preview">
      <div className="ll-pass-controls">
        <Segmented
          label="Wallet"
          value={wallet}
          onChange={setWallet}
          options={[
            { value: "apple", label: "Apple Wallet" },
            { value: "google", label: "Google Wallet" },
          ]}
        />
        {wallet === "apple" && (
          <Segmented
            label="Lado del pase"
            value={side}
            onChange={setSide}
            options={[
              { value: "front", label: "Frente" },
              { value: "back", label: "Reverso" },
            ]}
          />
        )}
      </div>
      {wallet === "apple" ? <ApplePass card={card} holder={holder} back={side === "back"} /> : <GooglePass card={card} holder={holder} />}
      {note && <p className="ll-hint">Vista previa. Apple y Google dibujan el pase final con estos mismos datos y colores.</p>}
    </div>
  )
}
