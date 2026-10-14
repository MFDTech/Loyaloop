import { useMemo, useState } from "react"
import * as api from "../../lib/api"
import { useAsync } from "../../lib/hooks"
import { href, navigate } from "../../lib/router"
import type { BusinessStatus } from "../../lib/types"
import { cardTypeLabel, inkFor, int, plural } from "../../lib/util"
import { Badge, Button, Card, Empty, ErrorState, Icon, Loading, Notice, PageHeader, SelectField, Stat } from "../../components/ui"

export const statusLabel: Record<BusinessStatus, string> = { active: "Activo", trial: "En prueba", paused: "Pausado" }
export const statusTone = { active: "success", trial: "info", paused: "warning" } as const

export function BusinessesTable({ rows }: { rows: api.BusinessRow[] }) {
  if (!rows.length) return <Empty icon="store" title="No hay negocios con estos filtros" />
  return (
    <div className="ll-table-wrap" style={{ borderTop: 0 }}>
      <table className="ll-table is-responsive is-clickable">
        <thead>
          <tr>
            <th>Negocio</th>
            <th>Estado</th>
            <th>Tarjeta</th>
            <th>Sucursales</th>
            <th>Clientes</th>
            <th>Movimientos 30 días</th>
            <th>Cobro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} onClick={() => navigate(`/admin/negocios/${b.id}`)}>
              <td className="ll-td-main">
                <div className="ll-person">
                  <span className="ll-avatar" style={{ background: b.brand.color, color: inkFor(b.brand.color).ink }}>
                    {b.brand.logo ? <img src={b.brand.logo} alt="" /> : <Icon name="store" size={16} />}
                  </span>
                  <div>
                    <a className="ll-cell-main" href={href(`/admin/negocios/${b.id}`)} onClick={(e) => e.stopPropagation()}>
                      {b.name}
                    </a>
                    <small>{b.sector}</small>
                  </div>
                </div>
              </td>
              <td data-label="Estado">
                <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge>
              </td>
              <td data-label="Tarjeta">{cardTypeLabel[b.cardType]}</td>
              <td data-label="Sucursales">{int(b.branches)}</td>
              <td data-label="Clientes">{int(b.customers)}</td>
              <td data-label="Movimientos 30 días">{int(b.transactions30d)}</td>
              <td data-label="Cobro">{b.integration === "Sin conectar" ? <span className="ll-muted">Sin conectar</span> : b.integration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminHome() {
  const metrics = useAsync(api.adminMetrics)
  const list = useAsync(api.adminBusinesses)
  if (metrics.error) return <ErrorState message={metrics.error} retry={metrics.reload} />
  if (!metrics.data) return <Loading rows={5} />
  const m = metrics.data
  return (
    <>
      <PageHeader
        title="Inicio"
        description="Todos los negocios de LoyaLoop en un vistazo."
        actions={
          <Button onClick={() => navigate("/admin/negocios/nuevo")}>
            <Icon name="plus" size={18} /> Nuevo negocio
          </Button>
        }
      />
      {m.integrationErrors.map((e) => (
        <Notice key={e.business + e.provider} tone="error" title={`${e.business}: la integración falló`}>
          {e.message}
        </Notice>
      ))}
      {m.newLeads > 0 && (
        <Notice tone="info" title={`${plural(m.newLeads, "solicitud nueva", "solicitudes nuevas")} de llamada`}>
          <a className="ll-link" href={href("/admin/solicitudes")}>
            Ver solicitudes
          </a>
        </Notice>
      )}
      <div className="ll-stats">
        <Stat label="Negocios" icon="store" value={int(m.businesses)} detail={`${m.active} ${m.active === 1 ? "activo" : "activos"} · ${m.trial} en prueba · ${m.paused} ${m.paused === 1 ? "pausado" : "pausados"}`} />
        <Stat label="Sucursales" icon="building" value={int(m.branches)} detail="Base del cobro mensual" />
        <Stat label="Clientes con tarjeta" icon="users" value={int(m.customers)} />
        <Stat label="Movimientos" icon="activity" value={int(m.transactions30d)} detail={m.inReview ? `${m.inReview} cobros en revisión` : "Últimos 30 días"} />
      </div>
      <Card title="Negocios" padded={false} actions={<a className="ll-link" href={href("/admin/negocios")}>Ver todos</a>}>
        {list.error ? <ErrorState message={list.error} retry={list.reload} /> : !list.data ? <Loading /> : <BusinessesTable rows={list.data} />}
      </Card>
    </>
  )
}

export default function Businesses() {
  const list = useAsync(api.adminBusinesses)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"" | BusinessStatus>("")
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list.data || []).filter((b) => (!status || b.status === status) && (!q || `${b.name} ${b.sector} ${b.owner || ""}`.toLowerCase().includes(q)))
  }, [list.data, query, status])
  return (
    <>
      <PageHeader
        title="Negocios"
        description="Da de alta negocios, configura su tarjeta y entra a su cuenta para ayudarlos."
        actions={
          <Button onClick={() => navigate("/admin/negocios/nuevo")}>
            <Icon name="plus" size={18} /> Nuevo negocio
          </Button>
        }
      />
      <Card padded={false}>
        <div className="ll-toolbar" style={{ padding: "20px 22px" }}>
          <div className="ll-field ll-search">
            <label htmlFor="buscar-negocios">Buscar</label>
            <Icon name="search" size={18} />
            <input id="buscar-negocios" type="search" placeholder="Nombre, giro o correo" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value as "" | BusinessStatus)}>
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="trial">En prueba</option>
            <option value="paused">Pausados</option>
          </SelectField>
        </div>
        {list.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={list.error} retry={list.reload} />
          </div>
        ) : !list.data ? (
          <div style={{ padding: 22 }}>
            <Loading />
          </div>
        ) : (
          <BusinessesTable rows={rows} />
        )}
      </Card>
    </>
  )
}
