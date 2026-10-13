import QRCode from "qrcode"
import { useEffect, useState } from "react"

/** Real, scannable QR code rendered as SVG. */
export default function Qr({ value, size = 160, label }: { value: string; size?: number; label: string }) {
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
  return <span className="ll-qr" role="img" aria-label={label} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
