import { useState } from "react"

/** Daily visits: one series, bars anchored to the baseline, hover tooltip, table for screen readers. */
export default function VisitsChart({ series, title }: { series: { day: string; visits: number }[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(4, ...series.map((s) => s.visits))
  const step = Math.ceil(max / 4)
  const top = step * 4
  const width = 640
  const height = 200
  const pad = { left: 32, right: 8, top: 10, bottom: 26 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const slot = plotW / series.length
  const barW = Math.max(2, Math.min(18, slot - 2))
  const label = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)
  const xLabels = new Set([0, Math.floor(series.length / 2), series.length - 1])
  const hovered = hover !== null ? series[hover] : null
  return (
    <figure className="ll-chart">
      <figcaption className="ll-sr">{title}</figcaption>
      <div className="ll-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. Máximo ${max} visitas en un día.`} onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => {
            const y = pad.top + plotH - (tick / top) * plotH
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="ll-chart-grid" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className="ll-chart-axis">
                  {tick}
                </text>
              </g>
            )
          })}
          {series.map((point, i) => {
            const h = (point.visits / top) * plotH
            const x = pad.left + i * slot + (slot - barW) / 2
            const y = pad.top + plotH - h
            const r = Math.min(4, barW / 2, h)
            return (
              <g key={point.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
                <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
                {point.visits > 0 && (
                  <path
                    d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                    className={`ll-chart-bar ${hover === i ? "is-hover" : ""}`}
                  />
                )}
                {xLabels.has(i) && (
                  <text x={pad.left + i * slot + slot / 2} y={height - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="ll-chart-axis">
                    {label(point.day)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {hovered && hover !== null && (
          <div className="ll-chart-tip" style={{ left: `${((pad.left + hover * slot + slot / 2) / width) * 100}%` }}>
            <b>{hovered.visits}</b> {hovered.visits === 1 ? "visita" : "visitas"}
            <span>{label(hovered.day)}</span>
          </div>
        )}
      </div>
      <table className="ll-sr">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Día</th>
            <th>Visitas</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.day}>
              <td>{label(p.day)}</td>
              <td>{p.visits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
