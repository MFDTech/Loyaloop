import { useCallback, useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import * as api from "../lib/api"
import { useAsync, useOnline } from "../lib/hooks"
import { href, navigate } from "../lib/router"
import { int } from "../lib/util"
import { Button, Confirm, Field, Icon, Loading, Notice, Symbol } from "../components/ui"

type View =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "scan"; scan: api.KioskScan }
  | { kind: "redeemed"; scan: api.KioskScan; name: string }
  | { kind: "error"; message: string }

const CAMERA_KEY = "loyaloop-kiosk-camera"

export default function Kiosk({ code = "" }: { code?: string }) {
  const info = useAsync(() => (api.deviceToken() ? api.kiosk() : Promise.resolve(null)))
  const [keep, setKeep] = useState(false)
  const pairingCode = /^\d{6}$/.test(code) ? code : ""
  const unpaired = !api.deviceToken() || /vinculado/.test(info.error)
  if (unpaired) return <Pairing initialCode={pairingCode} />
  // Opened with a new register's link on a device that is already a scanner.
  if (pairingCode && !keep && info.data) return <SwitchRegister info={info.data} code={pairingCode} onKeep={() => (setKeep(true), navigate("/caja", { replace: true }))} />
  if (info.error)
    return (
      <div className="ll-kiosk">
        <div className="ll-kiosk-stage">
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-error">
              <Icon name="alert" size={48} />
            </span>
            <h1>El escáner no está disponible</h1>
            <p className="lead">{info.error}</p>
            <Button size="lg" onClick={info.reload}>
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    )
  if (!info.data) return <Loading />
  return <Scanner info={info.data} />
}

function SwitchRegister({ info, code, onKeep }: { info: api.KioskInfo; code: string; onKeep: () => void }) {
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  return (
    <div className="ll-kiosk">
      <div className="ll-kiosk-stage">
        <div className="ll-kiosk-panel" style={{ maxWidth: 560 }}>
          <span className="ll-kiosk-icon">
            <Icon name="link" size={46} />
          </span>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>¿Cambiar este escáner de caja?</h1>
          <p className="lead">
            Ahora es el escáner de <b>{info.registerName}</b>
            {info.branchName ? ` (${info.branchName})` : ""} de <b>{info.businessName}</b>. Si lo cambias, deja de funcionar para esa caja.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="ll-stack" style={{ width: "100%" }}>
            <Button
              size="lg"
              block
              loading={pending}
              onClick={async () => {
                setError("")
                setPending(true)
                try {
                  await api.pairDevice(code, "")
                  navigate("/caja", { replace: true })
                } catch (e) {
                  setError((e as Error).message)
                } finally {
                  setPending(false)
                }
              }}
            >
              Vincular a la caja nueva
            </Button>
            <Button size="lg" block variant="secondary" onClick={onKeep}>
              Seguir como {info.registerName}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Pairing({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  return (
    <div className="ll-kiosk">
      <header className="ll-kiosk-head">
        <div className="ll-kiosk-brand">
          <Symbol size={36} />
          <span>
            <strong>Escáner de caja</strong>
            <small>LoyaLoop</small>
          </span>
        </div>
      </header>
      <div className="ll-kiosk-stage">
        <form
          className="ll-kiosk-panel"
          style={{ maxWidth: 520 }}
          onSubmit={async (e) => {
            e.preventDefault()
            setError("")
            if (code.length !== 6) return setError("El código tiene 6 dígitos.")
            setPending(true)
            try {
              await api.pairDevice(code, name)
              if (initialCode) navigate("/caja", { replace: true })
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setPending(false)
            }
          }}
        >
          <span className="ll-kiosk-icon">
            <Icon name="link" size={46} />
          </span>
          <h1 style={{ fontSize: "clamp(30px, 4.4vw, 44px)" }}>Vincula este dispositivo a una caja</h1>
          <p className="lead">
            {initialCode
              ? "El código ya está escrito. Ponle un nombre si quieres y toca «Vincular»."
              : "En el panel, entra a «Sucursales y cajas», elige la caja y toca «Vincular escáner». Escribe aquí el código que aparece."}
          </p>
          <div className="ll-stack" style={{ width: "100%", textAlign: "left" }}>
            <Field label="Código de vinculación" className="ll-code-field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <Field label="Nombre del dispositivo" optional placeholder="Ej. Tablet de recepción" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" size="lg" block loading={pending}>
              Vincular
            </Button>
          </div>
          <p className="ll-hint">
            ¿Eres cajero?{" "}
            <a className="ll-link" href={href("/panel/caja")} style={{ fontSize: 14 }}>
              Entra con tu cuenta
            </a>{" "}
            y vincula sin código.
          </p>
        </form>
      </div>
    </div>
  )
}

function Scanner({ info }: { info: api.KioskInfo }) {
  const online = useOnline()
  const [view, setView] = useState<View>({ kind: "idle" })
  const [manual, setManual] = useState("")
  const [camera, setCamera] = useState(() => {
    try {
      return localStorage.getItem(CAMERA_KEY) === "1"
    } catch {
      return false
    }
  })
  const [redeeming, setRedeeming] = useState<api.KioskScan["rewards"][number] | null>(null)
  const [redeemError, setRedeemError] = useState("")
  const [redeemPending, setRedeemPending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [now, setNow] = useState(Date.now())
  const viewRef = useRef(view)
  viewRef.current = view

  const submit = useCallback(async (raw: string) => {
    const value = raw.trim()
    if (!value || viewRef.current.kind === "busy") return
    setView({ kind: "busy" })
    try {
      const scan = await api.kioskScan(value)
      setNow(Date.now())
      setView({ kind: "scan", scan })
    } catch (e) {
      setView({ kind: "error", message: (e as Error).message })
    }
  }, [])

  // External 2D scanners type the code and press Enter (keyboard wedge).
  useEffect(() => {
    let buffer = ""
    let last = 0
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("input, textarea, select, [role=dialog]")) return
      const t = Date.now()
      if (t - last > 120) buffer = ""
      last = t
      if (e.key === "Enter") {
        if (buffer.length >= 6) submit(buffer)
        buffer = ""
      } else if (e.key.length === 1) buffer += e.key
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [submit])

  // While a scan waits for its payment: poll and also react to changes from other tabs.
  const scanId = view.kind === "scan" ? view.scan.scanId : ""
  const status = view.kind === "scan" ? view.scan.status : ""
  useEffect(() => {
    if (!scanId || status !== "pending") return
    const check = async () => {
      try {
        const scan = await api.kioskScanStatus(scanId)
        if (viewRef.current.kind === "scan" && viewRef.current.scan.scanId === scanId) setView({ kind: "scan", scan })
      } catch (e) {
        setView({ kind: "error", message: (e as Error).message })
      }
    }
    const timer = setInterval(check, 1500)
    const unsubscribe = api.subscribe(check)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [scanId, status])

  // Clock for the countdown.
  useEffect(() => {
    if (view.kind !== "scan") return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [view.kind])

  // Finished screens go back to the start by themselves.
  useEffect(() => {
    const done =
      view.kind === "error" ||
      view.kind === "redeemed" ||
      (view.kind === "scan" && ["matched", "visit", "review", "expired"].includes(view.scan.status))
    if (!done || redeeming) return
    const t = setTimeout(() => setView({ kind: "idle" }), view.kind === "scan" && view.scan.rewards.some((r) => r.affordable) && view.scan.status !== "review" ? 20000 : 9000)
    return () => clearTimeout(t)
  }, [view, redeeming])

  const remaining = view.kind === "scan" ? Math.min(300000, Math.max(0, new Date(view.scan.expiresAt).getTime() - now)) : 0
  const s = view.kind === "scan" ? view.scan : null
  const unit = info.type === "stamps" ? "sellos" : "puntos"
  const balance = s ? (info.type === "stamps" ? `${s.stamps} de ${s.stampGoal} sellos` : `${int(s.points)} puntos`) : ""
  const rewards = s && ["pending", "matched", "visit"].includes(s.status) && remaining > 0 && s.rewards.some((r) => r.affordable) ? s.rewards : []

  return (
    <div className="ll-kiosk">
      {!online && (
        <div className="ll-offline-bar" role="alert">
          <Icon name="wifiOff" size={18} /> Sin conexión. Los escaneos no se registran hasta que vuelva internet.
        </div>
      )}
      <header className="ll-kiosk-head">
        <div className="ll-kiosk-brand">
          <span className="ll-kiosk-logo" style={{ background: info.brand.color, color: "#fff" }}>
            {info.brand.logo ? <img src={info.brand.logo} alt="" /> : <Icon name="store" size={22} />}
          </span>
          <span>
            <strong>{info.businessName}</strong>
            <small>
              {info.registerName}
              {info.branchName && ` · ${info.branchName}`}
            </small>
          </span>
        </div>
        <span className={`ll-kiosk-status ${online ? "" : "is-off"}`}>{online ? "En línea" : "Sin conexión"}</span>
      </header>

      <main className="ll-kiosk-stage" aria-live="polite">
        {view.kind === "idle" && (
          <div className="ll-kiosk-panel">
            <h1>Escanea tu tarjeta</h1>
            <p className="lead">
              {info.integrated
                ? `Acerca el QR de tu Wallet antes o después de pagar. Tus ${unit} se suman solos.`
                : "Acerca el QR de tu Wallet para sumar el sello de tu visita."}
            </p>
            {camera ? (
              <Camera onCode={submit} onError={() => setCamera(false)} />
            ) : (
              <span className="ll-kiosk-icon">
                <Icon name="qr" size={54} />
              </span>
            )}
            <form
              className="ll-kiosk-type"
              onSubmit={(e) => {
                e.preventDefault()
                submit(manual)
                setManual("")
              }}
            >
              <input className="ll-input" aria-label="Código de la tarjeta" placeholder="LL-XXXX-XXXX" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
              <Button type="submit" variant="dark" disabled={!manual.trim()}>
                Enviar
              </Button>
            </form>
            <Button
              variant="secondary"
              onClick={() => {
                const next = !camera
                setCamera(next)
                try {
                  localStorage.setItem(CAMERA_KEY, next ? "1" : "0")
                } catch {
                  /* only a preference */
                }
              }}
            >
              <Icon name="camera" size={18} /> {camera ? "Apagar cámara" : "Usar la cámara"}
            </Button>
          </div>
        )}

        {view.kind === "busy" && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-wait">
              <Icon name="refresh" size={46} />
            </span>
            <h1>Un momento…</h1>
          </div>
        )}

        {s && s.status === "pending" && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-wait">
              <Icon name="clock" size={48} />
            </span>
            <h1>Hola, {s.firstName}</h1>
            <p className="lead">{remaining > 0 ? "Ya puedes pagar en la terminal. Aquí verás tus puntos en cuanto se apruebe el cobro." : "Pasaron 5 minutos sin un cobro. Vuelve a escanear tu tarjeta al pagar."}</p>
            <div className="ll-kiosk-meter" role="progressbar" aria-label="Tiempo para pagar" aria-valuemin={0} aria-valuemax={300} aria-valuenow={Math.round(remaining / 1000)}>
              <span style={{ width: `${(remaining / 300000) * 100}%` }} />
            </div>
            <p className="ll-hint">
              Quedan {Math.floor(remaining / 60000)}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")} · Saldo actual: {balance}
              {s.tierName && ` · Nivel ${s.tierName}`}
            </p>
          </div>
        )}

        {s && (s.status === "matched" || s.status === "visit") && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-success">
              <Icon name="check" size={52} />
            </span>
            <div className="ll-kiosk-big">
              {s.earned && s.earned.points > 0 ? `+${int(s.earned.points)}` : s.earned && s.earned.stamps > 0 ? `+${s.earned.stamps}` : "✓"}
            </div>
            <h1>{s.earned && (s.earned.points > 0 || s.earned.stamps > 0) ? `¡Listo, ${s.firstName}!` : `Gracias, ${s.firstName}`}</h1>
            <p className="lead">
              {s.earned && s.earned.points > 0
                ? `Sumaste ${int(s.earned.points)} puntos. Ahora tienes ${int(s.points)}.`
                : s.earned && s.earned.stamps > 0
                  ? `Sumaste un sello. Llevas ${s.stamps} de ${s.stampGoal}.`
                  : "Esta compra no suma, pero tu tarjeta quedó registrada."}
            </p>
          </div>
        )}

        {s && s.status === "review" && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-wait">
              <Icon name="shield" size={48} />
            </span>
            <h1>Estamos confirmando tu compra</h1>
            <p className="lead">Hubo varios cobros al mismo tiempo en esta caja. El gerente asignará tus {unit} en unos minutos.</p>
          </div>
        )}

        {s && s.status === "expired" && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-error">
              <Icon name="clock" size={48} />
            </span>
            <h1>Se acabó el tiempo</h1>
            <p className="lead">Pasaron 5 minutos sin un cobro en esta caja. Vuelve a escanear tu tarjeta al pagar.</p>
          </div>
        )}

        {view.kind === "redeemed" && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-success">
              <Icon name="gift" size={50} />
            </span>
            <h1>¡Disfruta tu {view.name.toLowerCase()}!</h1>
            <p className="lead">Canje registrado. Entrégale su recompensa a {view.scan.firstName}.</p>
            {info.type !== "stamps" && <p className="ll-hint">Saldo restante: {int(view.scan.points)} puntos</p>}
          </div>
        )}

        {view.kind === "error" && (
          <div className="ll-kiosk-panel">
            <span className="ll-kiosk-icon is-error">
              <Icon name="alert" size={48} />
            </span>
            <h1>No se registró</h1>
            <p className="lead">{view.message}</p>
          </div>
        )}

        {rewards.length > 0 && view.kind === "scan" && (
          <section className="ll-kiosk-rewards" aria-label="Recompensas">
            <h2 className="ll-kiosk-subtitle">¿Quieres canjear algo hoy?</h2>
            {rewards.map((r) => (
              <button key={r.kind + r.id} type="button" disabled={!r.affordable} onClick={() => (setRedeemError(""), setRedeeming(r))}>
                {r.name}
                <span>{r.kind === "earned" ? "Ganada" : r.affordable ? `${int(r.cost)} puntos` : `Te faltan ${int(r.cost - (s?.points || 0))}`}</span>
              </button>
            ))}
          </section>
        )}

        {view.kind !== "idle" && view.kind !== "busy" && (
          <Button size="lg" variant={view.kind === "scan" && view.scan.status === "pending" && remaining > 0 ? "secondary" : "primary"} onClick={() => setView({ kind: "idle" })} style={{ marginTop: 20 }}>
            {view.kind === "scan" && view.scan.status === "pending" && remaining > 0 ? "Cancelar" : "Listo"}
          </Button>
        )}
      </main>

      <footer className="ll-kiosk-foot">
        <span>
          {info.deviceName} · {info.integrated ? "Cobro conectado" : "Suma por visita"}
        </span>
        <button type="button" className="ll-link" style={{ fontSize: 14 }} onClick={() => setLeaving(true)}>
          Desvincular este dispositivo
        </button>
      </footer>

      {redeeming && view.kind === "scan" && (
        <Confirm
          title={`¿Canjear ${redeeming.name}?`}
          confirmLabel="Canjear"
          pending={redeemPending}
          error={redeemError}
          onClose={() => setRedeeming(null)}
          onConfirm={async () => {
            setRedeemPending(true)
            setRedeemError("")
            try {
              const r = await api.kioskRedeem(view.scan.scanId, redeeming.id, redeeming.kind)
              setView({ kind: "redeemed", scan: r, name: redeeming.name })
              setRedeeming(null)
            } catch (e) {
              setRedeemError((e as Error).message)
            } finally {
              setRedeemPending(false)
            }
          }}
        >
          {redeeming.kind === "earned" ? "Se usará la recompensa que ganaste." : `Se descontarán ${int(redeeming.cost)} puntos de la tarjeta de ${view.scan.firstName}.`}
        </Confirm>
      )}
      {leaving && (
        <Confirm
          title="¿Desvincular este dispositivo?"
          confirmLabel="Desvincular"
          tone="danger"
          onClose={() => setLeaving(false)}
          onConfirm={async () => {
            // Also removed on the server, so the panel no longer lists it.
            await api.kioskUnpair().catch(() => undefined)
            api.forgetDevice()
            setLeaving(false)
          }}
        >
          Este dispositivo dejará de ser el escáner de {info.registerName}. Para volver a usarlo necesitarás un código nuevo del panel.
        </Confirm>
      )}
    </div>
  )
}

function Camera({ onCode, onError }: { onCode: (code: string) => void; onError: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [problem, setProblem] = useState("")
  const handler = useRef(onCode)
  handler.current = onCode
  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    let lastRead = 0
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    const tick = () => {
      if (stopped) return
      const v = video.current
      const t = performance.now()
      if (v && ctx && v.readyState >= 2 && t - lastRead > 180) {
        lastRead = t
        const w = 480
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360
        canvas.width = w
        canvas.height = h
        ctx.drawImage(v, 0, 0, w, h)
        const result = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })
        if (result?.data) {
          stopped = true
          handler.current(result.data)
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem("Este navegador no permite usar la cámara. Usa un lector externo o escribe el código.")
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((track) => track.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          video.current.play().catch(() => undefined)
        }
        frame = requestAnimationFrame(tick)
      })
      .catch(() => setProblem("No se pudo abrir la cámara. Revisa el permiso del navegador o usa un lector externo."))
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  if (problem)
    return (
      <div className="ll-stack" style={{ width: "min(420px, 100%)" }}>
        <Notice tone="warning">{problem}</Notice>
        <Button variant="secondary" onClick={onError}>
          Entendido
        </Button>
      </div>
    )
  return (
    <div className="ll-kiosk-video">
      <video ref={video} muted playsInline aria-label="Cámara para leer el QR" />
    </div>
  )
}
