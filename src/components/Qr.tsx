import QRCode from "qrcode"
import { useEffect, useState } from "react"

/** Real, scannable QR code rendered as SVG. */
/** Line printed under customer-facing QR codes (hidden in discreet mode). */
export const POWERED_BY = "Powered by LoyaLoop"

export default function Qr({ value, size = 160, label, powered = false }: { value: string; size?: number; label: string; powered?: boolean }) {
  const [svg, setSvg] = useState("")
  useEffect(() => {
    let alive = true
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#191613", light: "#FFFFFF" } })
      .then((markup) => alive && setSvg(markup))
      .catch(() => alive && setSvg(""))
    return () => {
      alive = false
    }
  }, [value])
  const code = <span className="ll-qr" role="img" aria-label={label} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
  if (!powered) return code
  return (
    <span className="ll-qr-powered">
      {code}
      <small>{POWERED_BY}</small>
    </span>
  )
}
