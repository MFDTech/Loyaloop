// Stamp marks, shared by the pass preview in the app and the Apple Wallet
// strip drawn on the server. Paths use a 24 × 24 box.

export type StampIcon = "check" | "star" | "heart" | "coffee" | "logo"

export const STAMP_ICON_OPTIONS: { value: StampIcon; label: string }[] = [
  { value: "check", label: "Palomita" },
  { value: "star", label: "Estrella" },
  { value: "heart", label: "Corazón" },
  { value: "coffee", label: "Café" },
  { value: "logo", label: "Logo" },
]

export interface Glyph {
  paths: string[]
  /** Filled shape (true) or a 2 px line (false). */
  fill: boolean
}

export const GLYPHS: Record<Exclude<StampIcon, "logo"> | "gift", Glyph> = {
  check: { paths: ["M5 12.5l4.5 4.5L19 7.5"], fill: false },
  star: { paths: ["M12 3.2l2.7 5.5 6 .9-4.35 4.2 1.03 6L12 16.95 6.62 19.8l1.03-6L3.3 9.6l6-.9z"], fill: true },
  heart: { paths: ["M12 20.3S3.6 15.2 3.6 9.3A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 8.4 2.2c0 5.9-8.4 11-8.4 11z"], fill: true },
  coffee: { paths: ["M5 9.5h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z", "M16 10.5h1.6a2.4 2.4 0 0 1 0 4.8H16", "M8.5 3.8v2.4M12 3.8v2.4"], fill: false },
  gift: { paths: ["M4.5 11.5h15v8h-15z", "M3.5 8h17v3.5h-17z", "M12 8v11.5", "M12 8C10.6 5 7.5 4.6 7.5 6.4 7.5 8 10 8 12 8c2 0 4.5 0 4.5-1.6C16.5 4.6 13.4 5 12 8z"], fill: false },
}

/** The icon actually drawn: «logo» falls back to the check mark without a usable logo. */
export function stampGlyph(icon: StampIcon | undefined, hasLogo: boolean): Exclude<StampIcon, "logo"> | "logo" {
  if (icon === "logo") return hasLogo ? "logo" : "check"
  return icon && icon in GLYPHS ? icon : "check"
}

/** Layout of the stamps in a box: rows, columns and circle size, with margins so nothing touches the edges. */
export function stampLayout(goal: number, width: number, height: number) {
  const total = Math.max(1, Math.min(goal, 20))
  const rows = total <= 5 ? 1 : 2
  const perRow = Math.ceil(total / rows)
  const padX = width * 0.06
  const padY = height * 0.14
  const gap = Math.min(width, height) * 0.08
  const size = Math.min((width - 2 * padX - gap * (perRow - 1)) / perRow, (height - 2 * padY - gap * (rows - 1)) / rows, height * 0.42)
  const rowWidth = perRow * size + (perRow - 1) * gap
  const blockHeight = rows * size + (rows - 1) * gap
  const cells = Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / perRow)
    const inRow = row === rows - 1 ? total - perRow * (rows - 1) : perRow
    // Last row centered when it has fewer stamps.
    const offset = (width - (inRow * size + (inRow - 1) * gap)) / 2
    return { cx: offset + (i - row * perRow) * (size + gap) + size / 2, cy: (height - blockHeight) / 2 + row * (size + gap) + size / 2 }
  })
  return { total, size, cells, rowWidth }
}

/** Apple Wallet store-card strip size in points (Apple scales anything else and crops the sides). */
export const STRIP = { width: 375, height: 144 }

export interface StampStyle {
  /** Strip background; null when the stamps go over the business's own strip image. */
  background: string | null
  /** Ring and filled-stamp color. */
  ink: string
  /** Mark inside a filled stamp. */
  mark: string
  glyph: ReturnType<typeof stampGlyph>
  /** PNG data URI of the logo, for the «logo» stamp. */
  logo?: string
}

function glyphSvg(name: keyof typeof GLYPHS, cx: number, cy: number, size: number, color: string, opacity = 1) {
  const g = GLYPHS[name]
  const k = size / 24
  const paint = g.fill ? `fill="${color}"` : `fill="none" stroke="${color}" stroke-width="${2.2}" stroke-linecap="round" stroke-linejoin="round"`
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})" opacity="${opacity}" ${paint}>${g.paths.map((d) => `<path d="${d}"/>`).join("")}</g>`
}

/** SVG of the stamp strip at `scale` × the strip size. */
export function stampStripSvg(count: number, goal: number, style: StampStyle, scale: number) {
  const width = STRIP.width * scale
  const height = STRIP.height * scale
  const { size, cells, total } = stampLayout(goal, width, height)
  const r = size / 2
  const line = Math.max(2, size * 0.055)
  let out = style.background ? `<rect width="100%" height="100%" fill="${style.background.replace(/[^#\w(),.% -]/g, "")}"/>` : ""
  cells.forEach(({ cx, cy }, i) => {
    const earned = i < count
    // Over the business's own image (no background): a soft shade behind each stamp keeps it readable without darkening the picture.
    if (!style.background) out += `<circle cx="${cx}" cy="${cy}" r="${r + line * 1.5}" fill="#000000" fill-opacity="0.22"/>`
    if (earned && style.glyph === "logo" && style.logo) {
      out += `<clipPath id="c${i}"><circle cx="${cx}" cy="${cy}" r="${r - line}"/></clipPath>`
      out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF"/>`
      out += `<image href="${style.logo}" x="${cx - r * 0.72}" y="${cy - r * 0.72}" width="${r * 1.44}" height="${r * 1.44}" preserveAspectRatio="xMidYMid meet" clip-path="url(#c${i})"/>`
      out += `<circle cx="${cx}" cy="${cy}" r="${r - line / 2}" fill="none" stroke="${style.ink}" stroke-width="${line}"/>`
    } else if (earned) {
      out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${style.ink}"/>`
      out += glyphSvg(style.glyph === "logo" ? "check" : style.glyph, cx, cy, size * 0.56, style.mark)
    } else {
      out += `<circle cx="${cx}" cy="${cy}" r="${r - line / 2}" fill="${style.ink}" fill-opacity="0.1" stroke="${style.ink}" stroke-opacity="0.55" stroke-width="${line}"/>`
      if (i === total - 1) out += glyphSvg("gift", cx, cy, size * 0.5, style.ink, 0.75)
    }
  })
  return (`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">${out}</svg>`)
}

