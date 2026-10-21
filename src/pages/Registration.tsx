import { useEffect, useState, type FormEvent } from "react"
import * as api from "../lib/api"
import { useAction, useAsync } from "../lib/hooks"
import { PREVIEW } from "../lib/preview"
import { absoluteLink, href } from "../lib/router"
import { formatPhone, inkFor, int, normalizePhone } from "../lib/util"
import { ApplePass, GooglePass } from "../components/Pass"
import Qr from "../components/Qr"
import { Button, Check, Field, Icon, Loading, Notice, SelectField, asset } from "../components/ui"

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

type Step = "form" | "recover" | "code" | "done"

function platform(): "apple" | "google" | "desktop" {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "apple"
  if (/Android/.test(ua)) return "google"
  return "desktop"
}

function perks(card: api.PublicCard): string[] {
  const later = !card.askPhone
  const p = card.program
  const list: string[] = []
  if (card.type === "stamps") list.push(`Junta ${p.stampGoal} sellos${p.stampMinPurchase ? ` en compras desde ${`$${int(p.stampMinPurchase)}`}` : ""} y obtén ${card.rewards[0]?.name.toLowerCase() || "tu recompensa"}.`)
  else list.push(`Gana ${int(p.pointsPerPeso * 100)} puntos por cada $100${p.minPurchase ? ` en compras desde ${`$${int(p.minPurchase)}`}` : ""}.`)
  if (card.type === "tiers" && p.tiers.length > 1) list.push(`Sube a ${p.tiers.slice(1).map((t) => t.name).join(" y ")} y multiplica tus puntos.`)
  if (card.type !== "stamps" && card.rewards.length) list.push(`Cámbialos por ${card.rewards.slice(0, 2).map((r) => r.name.toLowerCase()).join(" o ")}${card.rewards.length > 2 ? " y más" : ""}.`)
  if (p.welcomeBonus)
    list.push(
      card.type === "stamps"
        ? `${later ? "En tu primera visita recibes" : "Empiezas con"} ${p.welcomeBonus} ${p.welcomeBonus === 1 ? "sello" : "sellos"} de regalo.`
        : `Recibes ${int(p.welcomeBonus)} puntos de bienvenida${later ? " en tu primera compra" : ""}.`,
    )
  if (p.birthdayBonus) list.push("Un regalo en tu cumpleaños.")
  list.push("Vive en la Wallet de tu celular. No descargas ninguna app.")
  return list
}

export default function Registration({ code, cardToken = "" }: { code: string; cardToken?: string }) {
  const info = useAsync(() => api.registration(code), [code])
  const [step, setStep] = useState<Step>("form")
  const [form, setForm] = useState({ name: "", phone: "", email: "", day: "", month: "", promotions: false, privacy: false })
  const [sms, setSms] = useState("")
  const [channel, setChannel] = useState<api.CodeChannel | "preview">("sms")
  const [preview, setPreview] = useState("")
  const [existing, setExisting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [result, setResult] = useState<{ card: api.PublicCard; holder: api.CardHolder; created: boolean; links: api.WalletLinks } | null>(null)
  const [localError, setLocalError] = useState("")
  const send = useAction(api.sendCode)
  const create = useAction(api.createCard)
  const mail = useAction(api.sendCardLink)
  const [mailed, setMailed] = useState<{ previewLink?: string } | null>(null)
  const opened = useAsync(() => (cardToken ? api.openCardLink(code, cardToken) : Promise.resolve(null)), [code, cardToken])
  const confirm = useAction(async (mode: "new" | "recover") => {
    const birthday = form.day && form.month ? `${form.month.padStart(2, "0")}-${form.day.padStart(2, "0")}` : ""
    return mode === "recover"
      ? api.recoverCard(code, form.phone, sms)
      : api.completeRegistration(code, { name: form.name, phone: form.phone, email: form.email, birthday, promotions: form.promotions, privacy: form.privacy }, sms)
  })
  const [mode, setMode] = useState<"new" | "recover">("new")

  // Link from the recovery email: show the card right away.
  useEffect(() => {
    if (opened.data) {
      setResult(opened.data)
      setStep("done")
    }
  }, [opened.data])

  useEffect(() => {
    if (!cooldown) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (info.error)
    return (
      <div className="ll-reg">
        <div className="ll-reg-body" style={{ marginTop: 0, paddingTop: 48 }}>
          <div className="ll-reg-card">
            <h2>Este enlace no está disponible</h2>
            <p>{info.error}</p>
            <p className="ll-hint">Pide ayuda en la caja: ahí pueden darte el enlace correcto.</p>
          </div>
          <RegFoot code="" />
        </div>
      </div>
    )
  if (!info.data)
    return (
      <div className="ll-reg">
        <div className="ll-reg-body" style={{ marginTop: 0, paddingTop: 48 }}>
          <Loading />
        </div>
      </div>
    )

  const card = result?.card || info.data.card
  const askPhone = info.data.card.askPhone
  const { ink } = inkFor(card.brand.color)
  const set = (key: keyof typeof form, value: string | boolean) => setForm({ ...form, [key]: value })

  async function request(e: FormEvent | null, nextMode: "new" | "recover") {
    e?.preventDefault()
    setLocalError("")
    if (nextMode === "new") {
      if (!form.name.trim()) return setLocalError(askPhone ? "Escribe tu nombre." : "Escribe tu nombre o cómo te decimos.")
      if (!form.privacy) return setLocalError("Para crear tu tarjeta necesitas aceptar el aviso de privacidad.")
      if (!!form.day !== !!form.month) return setLocalError("Completa el día y el mes de tu cumpleaños, o deja ambos vacíos.")
    }
    if (!askPhone) {
      if (nextMode === "recover") {
        const r = await mail.run(code, form.email)
        if (r.ok) setMailed(r.value)
        return
      }
      const birthday = form.day && form.month ? `${form.month.padStart(2, "0")}-${form.day.padStart(2, "0")}` : ""
      const r = await create.run(code, { name: form.name, email: form.email, birthday, promotions: form.promotions, privacy: form.privacy })
      if (r.ok) {
        setResult(r.value)
        setStep("done")
        window.scrollTo(0, 0)
      }
      return
    }
    if (normalizePhone(form.phone).length !== 10) return setLocalError("Escribe tu celular a 10 dígitos.")
    const r = await send.run(code, form.phone, nextMode)
    if (!r.ok) return
    setMode(nextMode)
    setPreview(r.value.previewCode)
    setChannel(r.value.channel)
    setExisting(r.value.existing)
    setSms("")
    setCooldown(30)
    setStep("code")
  }

  return (
    <div className="ll-reg" style={{ ["--reg-color" as string]: card.brand.color, ["--reg-ink" as string]: ink }}>
      <header className="ll-reg-hero">
        <div className="ll-reg-logo">{card.brand.logo ? <img src={card.brand.logo} alt="" /> : <Icon name="card" size={30} />}</div>
        <h1>{step === "done" ? (result?.created ? "¡Tu tarjeta está lista!" : "Aquí está tu tarjeta") : card.businessName}</h1>
        <p>{step === "done" ? card.businessName : info.data.branchName ? `Programa de lealtad · ${info.data.branchName}` : "Programa de lealtad"}</p>
      </header>
      <main className="ll-reg-body">
        <div className="ll-reg-card">
          {cardToken && opened.error && step !== "done" && (
            <div style={{ marginBottom: 16 }}>
              <Notice tone="error">{opened.error}</Notice>
            </div>
          )}
          {step === "form" && (
            <form className="ll-form" onSubmit={(e) => request(e, "new")} noValidate>
              <div>
                <h2>Crea tu tarjeta</h2>
                <ul className="ll-list" style={{ marginTop: 12 }}>
                  {perks(card).map((p) => (
                    <li key={p} className="ll-perk">
                      <Icon name="check" size={18} /> {p}
                    </li>
                  ))}
                </ul>
              </div>
              {askPhone ? (
                <>
                  <Field label="Nombre" autoComplete="given-name" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
                  <Field label="Celular" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10 dígitos" value={form.phone} onChange={(e) => set("phone", e.target.value)} hint="Te enviamos un código para confirmar que es tuyo." />
                  <Field label="Correo" optional type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </>
              ) : (
                <>
                  <Field label="¿Cómo te llamamos?" autoComplete="given-name" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} hint="Así aparece en tu tarjeta. Puede ser solo tu nombre o un apodo." />
                  <Field label="Correo" optional type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} hint="Solo para mandarte tu tarjeta si algún día la pierdes." />
                </>
              )}
              {!!card.program.birthdayBonus && (
                <fieldset className="ll-fieldset">
                  <legend style={{ fontSize: 14, fontFamily: "inherit" }}>
                    Cumpleaños <span className="ll-optional">(opcional, para tu regalo)</span>
                  </legend>
                  <div className="ll-grid-2">
                    <SelectField label="Día" value={form.day} onChange={(e) => set("day", e.target.value)}>
                      <option value="">—</option>
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i} value={String(i + 1)}>
                          {i + 1}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField label="Mes" value={form.month} onChange={(e) => set("month", e.target.value)}>
                      <option value="">—</option>
                      {MONTHS.map((m, i) => (
                        <option key={m} value={String(i + 1)}>
                          {m}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </fieldset>
              )}
              {!card.discreet && <Check label="Quiero recibir notificaciones de promociones" checked={form.promotions} onChange={(v) => set("promotions", v)} />}
              <Check
                label={
                  <>
                    Acepto el{" "}
                    <a className="ll-link" href={href(`/legal/${code}`)} target="_blank" rel="noreferrer" style={{ fontSize: "inherit" }}>
                      aviso de privacidad
                    </a>
                  </>
                }
                checked={form.privacy}
                onChange={(v) => set("privacy", v)}
              />
              {(localError || send.error || create.error) && <Notice tone="error">{localError || send.error || create.error}</Notice>}
              <Button type="submit" size="lg" block loading={send.pending || create.pending}>
                {askPhone ? "Continuar" : "Crear mi tarjeta"}
              </Button>
              <p className="ll-hint" style={{ textAlign: "center" }}>
                ¿Ya tienes tarjeta?{" "}
                <button type="button" className="ll-link" onClick={() => (setLocalError(""), send.setError(""), setStep("recover"))}>
                  Recupérala
                </button>
              </p>
            </form>
          )}

          {step === "recover" && !askPhone && (
            <form className="ll-form" onSubmit={(e) => request(e, "recover")} noValidate>
              <div>
                <h2>¿Ya tienes tarjeta?</h2>
                <p className="ll-reg-lead">Si cambiaste de celular, tu tarjeta aparece sola en tu Wallet al entrar con la misma cuenta de Apple o Google.</p>
                <p className="ll-reg-lead">Si nos diste tu correo al registrarte, te mandamos un enlace para abrirla.</p>
              </div>
              {mailed ? (
                <Notice tone="success" title="Revisa tu correo">
                  Si hay una tarjeta con ese correo, te llegará un enlace en unos minutos.
                  {mailed.previewLink && (
                    <>
                      {" "}
                      Versión de prueba:{" "}
                      <a className="ll-link" href={mailed.previewLink}>
                        abrir el enlace
                      </a>
                      .
                    </>
                  )}
                </Notice>
              ) : (
                <>
                  <Field label="Correo" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  {mail.error && <Notice tone="error">{mail.error}</Notice>}
                  <Button type="submit" size="lg" block loading={mail.pending}>
                    Mandarme el enlace
                  </Button>
                </>
              )}
              <Button variant="ghost" block onClick={() => (setMailed(null), mail.setError(""), setStep("form"))}>
                Crear una tarjeta nueva
              </Button>
            </form>
          )}

          {step === "recover" && askPhone && (
            <form className="ll-form" onSubmit={(e) => request(e, "recover")} noValidate>
              <div>
                <h2>Recupera tu tarjeta</h2>
                <p className="ll-reg-lead">Escribe el celular con el que te registraste y te enviamos un código.</p>
              </div>
              <Field label="Celular" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10 dígitos" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              {(localError || send.error) && <Notice tone="error">{localError || send.error}</Notice>}
              <Button type="submit" size="lg" block loading={send.pending}>
                Enviar código
              </Button>
              <Button variant="ghost" block onClick={() => (setLocalError(""), send.setError(""), setStep("form"))}>
                Crear una tarjeta nueva
              </Button>
            </form>
          )}

          {step === "code" && (
            <form
              className="ll-form"
              onSubmit={async (e) => {
                e.preventDefault()
                if (sms.replace(/\D/g, "").length !== 6) return confirm.setError("Escribe los 6 dígitos del código.")
                const r = await confirm.run(mode)
                if (r.ok) {
                  setResult(r.value)
                  setStep("done")
                  window.scrollTo(0, 0)
                }
              }}
            >
              <div>
                <h2>Escribe el código</h2>
                <p className="ll-reg-lead">
                  {channel === "whatsapp" ? "Lo enviamos por WhatsApp" : "Lo enviamos por SMS"} al {formatPhone(normalizePhone(form.phone))}.
                  {existing && mode === "new" && " Ya tienes una tarjeta con este celular: al confirmar te la mostramos."}
                </p>
              </div>
              {preview && (
                <Notice tone="info" title="Versión de prueba">
                  Aún no se envían códigos. Tu código es <b className="ll-mono">{preview}</b>.
                </Notice>
              )}
              <Field
                label="Código de 6 dígitos"
                className="ll-code-field"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={sms}
                onChange={(e) => setSms(e.target.value.replace(/\D/g, ""))}
                data-autofocus
              />
              {confirm.error && <Notice tone="error">{confirm.error}</Notice>}
              <Button type="submit" size="lg" block loading={confirm.pending}>
                {mode === "recover" ? "Ver mi tarjeta" : "Crear mi tarjeta"}
              </Button>
              <div className="ll-row" style={{ justifyContent: "space-between" }}>
                <button type="button" className="ll-link" onClick={() => (confirm.setError(""), setStep(mode === "recover" ? "recover" : "form"))}>
                  Cambiar celular
                </button>
                <button type="button" className="ll-link" disabled={cooldown > 0 || send.pending} onClick={() => request(null, mode)}>
                  {cooldown > 0 ? `Reenviar en ${cooldown} s` : "Reenviar código"}
                </button>
              </div>
              {send.error && <Notice tone="error">{send.error}</Notice>}
            </form>
          )}

          {step === "done" && result && <Done card={result.card} holder={result.holder} links={result.links} code={code} />}
        </div>
        <RegFoot code={code} discreet={card.discreet} />
      </main>
    </div>
  )
}

function Done({ card, holder, links, code }: { card: api.PublicCard; holder: api.CardHolder; links: api.WalletLinks; code: string }) {
  const [device] = useState(platform)
  const [clicked, setClicked] = useState<"" | "apple" | "google">("")
  const showApple = device !== "google"
  const showGoogle = device !== "apple"
  const button = (wallet: "apple" | "google") => {
    const label = wallet === "apple" ? "Agregar a Apple Wallet" : "Agregar a Google Wallet"
    const className = `ll-wallet-btn ${wallet === "google" ? "is-google" : ""}`
    const url = links[wallet]
    return url ? (
      <a key={wallet} className={className} href={url} target={wallet === "google" ? "_blank" : undefined} rel="noreferrer">
        <Icon name="wallet" size={22} /> {label}
      </a>
    ) : (
      <button key={wallet} type="button" className={className} onClick={() => setClicked(wallet)}>
        <Icon name="wallet" size={22} /> {label}
      </button>
    )
  }
  return (
    <div className="ll-stack" style={{ gap: 18 }}>
      <p className="ll-reg-lead">
        Hola, {holder.name.split(" ")[0]}. Guárdala en tu Wallet y muéstrala en la caja cada vez que pagues.
      </p>
      <div className="ll-stack" style={{ gap: 10 }}>
        {showApple && button("apple")}
        {showGoogle && button("google")}
      </div>
      {clicked && (
        <Notice tone="info">
          {PREVIEW
            ? `En esta versión de prueba el pase aún no se descarga: falta conectar ${clicked === "apple" ? "Apple" : "Google"} Wallet. Mientras tanto, la caja puede escanear el código de abajo.`
            : `Muy pronto podrás guardarla en ${clicked === "apple" ? "Apple" : "Google"} Wallet. Mientras tanto, toma una captura de este código y muéstralo en la caja.`}
        </Notice>
      )}
      <div className="ll-reg-pass">{device === "google" ? <GooglePass card={card} holder={holder} /> : <ApplePass card={card} holder={holder} />}</div>
      {device === "desktop" && (
        <div className="ll-reg-desktop">
          <Qr value={absoluteLink(`/r/${code}`)} size={120} label="Código para abrir este registro en tu celular" />
          <p className="ll-hint">¿Estás en una computadora? Escanea este código con tu celular, toca «Recupérala» {card.askPhone ? "y guárdala en tu Wallet." : "y pide el enlace a tu correo."}</p>
        </div>
      )}
    </div>
  )
}

function RegFoot({ code, discreet = false }: { code: string; discreet?: boolean }) {
  return (
    <footer className="ll-reg-foot">
      {!discreet && <img src={asset("/brand/loyaloop-logo.svg")} alt="LoyaLoop" height={20} />}
      <span>
        <a className="ll-link" href={href(code ? `/legal/${code}` : "/legal")} style={{ fontSize: 14 }}>
          Aviso de privacidad
        </a>
      </span>
    </footer>
  )
}
