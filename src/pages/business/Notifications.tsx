import * as api from "../../lib/api"
import { PREVIEW } from "../../lib/preview"
import { useAsync } from "../../lib/hooks"
import { relative } from "../../lib/util"
import { Badge, Card, Empty, ErrorState, Icon, Loading, Notice, PageHeader } from "../../components/ui"

const EVENTS = [
  { key: "pointsEarned", title: "Puntos ganados", example: "Ganaste 85 puntos. Saldo: 420." },
  { key: "rewardAvailable", title: "Recompensa disponible", example: "Ya puedes canjear Hora extra." },
  { key: "tierChange", title: "Cambio de nivel", example: "Ahora eres nivel Plata." },
  { key: "pointsExpiring", title: "Puntos por vencer", example: "Tus 420 puntos vencen en menos de 30 días." },
] as const

export default function Notifications() {
  const b = useAsync(api.bundle)
  const log = useAsync(api.notices)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={5} />
  const { program, business } = b.data
  const name = business.discreet ? business.neutralName : business.name
  return (
    <>
      <PageHeader title="Avisos" description="Tus clientes reciben estos avisos en la pantalla de bloqueo cuando su tarjeta cambia. Son automáticos: no se mandan promociones." />
      <div className="ll-split">
        <Card title="Qué avisa la tarjeta">
          <div className="ll-list">
            {EVENTS.map((event) => {
              const on = program.notify[event.key]
              const applies = program.type === "tiers" || event.key !== "tierChange"
              const pointsOnly = event.key === "pointsEarned" || event.key === "pointsExpiring"
              const relevant = applies && !(pointsOnly && program.type === "stamps")
              return (
                <div key={event.key} className="ll-list-item">
                  <Icon name="bell" size={18} />
                  <div>
                    <strong>{event.title}</strong>
                    <small>Ejemplo: “{event.example}”</small>
                  </div>
                  <Badge tone={on && relevant ? "success" : "neutral"}>{!relevant ? "No aplica" : on ? "Activo" : "Apagado"}</Badge>
                </div>
              )
            })}
          </div>
          <p className="ll-hint" style={{ marginTop: 12 }}>
            Para encender o apagar un aviso, escríbenos. Los avisos usan el nombre “{name}”.
          </p>
        </Card>
        <Card title="Así se ve en el teléfono">
          <div className="ll-lock-preview">
            <span className="ll-lock-time">9:41</span>
            <div className="ll-lock-note">
              <span className="ll-lock-icon" style={{ background: business.brand.color }}>
                <Icon name="wallet" size={16} />
              </span>
              <div>
                <b>{name}</b>
                <p>Ganaste 85 puntos. Saldo: 420.</p>
              </div>
              <small>ahora</small>
            </div>
          </div>
        </Card>
      </div>
      <Card title="Últimos avisos enviados" padded={false}>
        {log.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={log.error} retry={log.reload} />
          </div>
        ) : !log.data ? (
          <div style={{ padding: 22 }}>
            <Loading />
          </div>
        ) : !log.data.length ? (
          <Empty icon="bell" title="Todavía no se ha enviado ningún aviso">
            Aparecerán aquí cuando un cliente gane puntos, complete su tarjeta o cambie de nivel.
          </Empty>
        ) : (
          <div className="ll-table-wrap">
            <table className="ll-table is-responsive">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Aviso</th>
                  <th>Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {log.data.slice(0, 50).map((n) => (
                  <tr key={n.id}>
                    <td className="ll-td-main">
                      <a className="ll-cell-main" href={`#/panel/clientes/${n.customerId}`}>
                        {n.customerName}
                      </a>
                    </td>
                    <td data-label="Aviso">{n.message}</td>
                    <td data-label="Cuándo">{relative(n.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {PREVIEW && <Notice tone="info">En esta versión de prueba los avisos se registran aquí, pero todavía no llegan a los teléfonos. Llegarán cuando se conecte el servidor de pases.</Notice>}
    </>
  )
}
