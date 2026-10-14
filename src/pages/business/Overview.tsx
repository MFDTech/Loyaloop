import { useState } from "react"
import * as api from "../../lib/api"
import { useAsync } from "../../lib/hooks"
import { href } from "../../lib/router"
import { int, kindLabel, money, relative } from "../../lib/util"
import VisitsChart from "../../components/VisitsChart"
import { Badge, Card, Empty, ErrorState, Loading, Notice, PageHeader, Stat } from "../../components/ui"

const change = (current: number, previous: number) => (previous > 0 ? (current - previous) / previous : NaN)

export default function Overview({ me }: { me: api.Me }) {
  const [days, setDays] = useState(30)
  const [branchId, setBranchId] = useState("")
  const bundle = useAsync(api.bundle)
  const m = useAsync(() => api.metrics({ days, branchId: branchId || undefined }), [days, branchId])
  const recent = useAsync(() => api.activity({ branchId: branchId || undefined }), [branchId])
  const flags = useAsync(api.suspicious)
  const period = days === 7 ? "vs. 7 días previos" : days === 30 ? "vs. 30 días previos" : "vs. 90 días previos"
  const data = m.data
  return (
    <>
      <PageHeader
        eyebrow={me.business?.name}
        title="Resumen"
        description="Cómo va tu programa de lealtad."
        actions={
          <>
            {(bundle.data?.branches.length || 0) > 1 && (
              <select aria-label="Sucursal" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Todas las sucursales</option>
                {bundle.data!.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <select aria-label="Periodo" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </>
        }
      />
      {data && data.reviewCount > 0 && (
        <Notice tone="warning" title={`${data.reviewCount} ${data.reviewCount === 1 ? "cobro espera" : "cobros esperan"} que lo asignes`}>
          Dos clientes escanearon en la misma caja casi al mismo tiempo, así que el sistema no los asignó solo.{" "}
          <a className="ll-link" href={href("/panel/actividad?tab=revision")}>
            Resolver ahora
          </a>
        </Notice>
      )}
      {m.error ? (
        <ErrorState message={m.error} retry={m.reload} />
      ) : !data ? (
        <Loading rows={4} />
      ) : (
        <div className="ll-stats" aria-busy={m.loading}>
          <Stat label="Clientes nuevos" icon="user" value={int(data.newCustomers)} trend={{ value: change(data.newCustomers, data.previous.newCustomers), label: period }} />
          <Stat label="Clientes activos" icon="users" value={int(data.activeCustomers)} trend={{ value: change(data.activeCustomers, data.previous.activeCustomers), label: period }} />
          <Stat label="Visitas" icon="activity" value={int(data.visits)} trend={{ value: change(data.visits, data.previous.visits), label: period }} />
          {data.usesPoints ? (
            <Stat label="Gasto promedio" icon="wallet" value={money(data.avgTicket)} trend={{ value: change(data.avgTicket, data.previous.avgTicket), label: period }} />
          ) : (
            <Stat label="Clientes que regresan" icon="refresh" value={`${Math.round(data.returnRate * 100)} %`} detail="Con 2 o más visitas en el periodo" />
          )}
          {data.usesPoints && <Stat label="Puntos emitidos" icon="star" value={int(data.pointsIssued)} detail="Compras, bonos y ajustes" />}
          {data.usesPoints && <Stat label="Puntos canjeados" icon="gift" value={int(data.pointsRedeemed)} detail="Usados en recompensas" />}
          <Stat label="Recompensas canjeadas" icon="gift" value={int(data.rewardsRedeemed)} detail="En caja, con su QR" />
          {data.usesPoints && <Stat label="Clientes que regresan" icon="refresh" value={`${Math.round(data.returnRate * 100)} %`} detail="Con 2 o más visitas en el periodo" />}
          {!data.usesPoints && <Stat label="Clientes en total" icon="users" value={int(data.totalCustomers)} detail="Con tarjeta en este negocio" />}
        </div>
      )}
      <div className="ll-split">
        <Card title="Visitas por día" description={`Compras y visitas registradas en los últimos ${days} días.`}>
          {data ? data.visits ? <VisitsChart series={data.series} title={`Visitas por día, últimos ${days} días`} /> : <Empty icon="activity" title="Sin visitas en este periodo">Cuando tus clientes escaneen su tarjeta, aparecerán aquí.</Empty> : <Loading />}
        </Card>
        <Card
          title="Actividad reciente"
          actions={
            <a className="ll-link" href={href("/panel/actividad")}>
              Ver todo
            </a>
          }
        >
          {recent.data ? (
            recent.data.length ? (
              <div className="ll-list">
                {recent.data.slice(0, 6).map((t) => (
                  <a key={t.id} className="ll-list-item" href={href(`/panel/clientes/${t.customerId}`)}>
                    <div>
                      <strong>{t.customerName}</strong>
                      <small>
                        {kindLabel[t.kind]} · {relative(t.createdAt)}
                        {t.branchName ? ` · ${t.branchName}` : ""}
                      </small>
                    </div>
                    {t.points !== 0 ? (
                      <span className={t.points > 0 ? "ll-positive" : "ll-negative"}>
                        {t.points > 0 ? "+" : ""}
                        {int(t.points)} pts
                      </span>
                    ) : t.stamps !== 0 ? (
                      <span className={t.stamps > 0 ? "ll-positive" : "ll-negative"}>
                        {t.stamps > 0 ? "+" : ""}
                        {t.stamps} sello
                      </span>
                    ) : (
                      <Badge>{kindLabel[t.kind]}</Badge>
                    )}
                  </a>
                ))}
              </div>
            ) : (
              <Empty icon="activity" title="Todavía no hay actividad" />
            )
          ) : (
            <Loading />
          )}
        </Card>
      </div>
      {flags.data && flags.data.length > 0 && (
        <Card title="Tarjetas para revisar" description="Acumulan muchas más visitas que el promedio en 30 días. Es una señal para revisar, no una conclusión.">
          <div className="ll-list">
            {flags.data.map((f) => (
              <a key={f.id} className="ll-list-item" href={href(`/panel/clientes/${f.id}`)}>
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {f.count} visitas en 30 días · el promedio es {f.average.toFixed(1)}
                  </small>
                </div>
                <Badge tone="warning">Revisar</Badge>
              </a>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
