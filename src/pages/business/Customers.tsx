import { useMemo, useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { navigate } from "../../lib/router"
import { date, downloadText, formatPhone, initials, int, relative } from "../../lib/util"
import { Badge, Button, Card, Empty, ErrorState, Field, Icon, Loading, PageHeader, Pagination, SelectField, useToast } from "../../components/ui"

const PAGE = 20

export default function Customers({ me }: { me: api.Me }) {
  const list = useAsync(api.customers)
  const bundle = useAsync(api.bundle)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("recent")
  const [tier, setTier] = useState("")
  const [page, setPage] = useState(1)
  const toast = useToast()
  const exporter = useAction(api.exportCustomersCsv)
  const program = bundle.data?.program
  const stamps = program?.type === "stamps"

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, "")
    const filtered = (list.data || []).filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.includes(digits))) &&
        (!tier || c.tierId === tier),
    )
    const sorters: Record<string, (a: api.CustomerRow, b: api.CustomerRow) => number> = {
      recent: (a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt),
      new: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.name.localeCompare(b.name, "es"),
      balance: (a, b) => (stamps ? b.stamps - a.stamps : b.points - a.points),
      visits: (a, b) => b.visits - a.visits,
    }
    return filtered.sort(sorters[sort])
  }, [list.data, query, sort, tier, stamps])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE, current * PAGE)

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cada cliente se registra solo al tocar la etiqueta NFC de tu sucursal y verificar su celular."
        actions={
          me.role === "owner" && (
            <Button
              variant="secondary"
              loading={exporter.pending}
              onClick={async () => {
                const result = await exporter.run()
                if (result.ok) {
                  downloadText(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, result.value)
                  toast("Descargamos el archivo con tus clientes.")
                }
              }}
            >
              <Icon name="download" size={18} /> Exportar CSV
            </Button>
          )
        }
      />
      {exporter.error && <ErrorState message={exporter.error} />}
      <Card padded={false}>
        <div className="ll-toolbar" style={{ padding: "20px 22px" }}>
          <div className="ll-field ll-search">
            <label htmlFor="buscar-clientes">Buscar</label>
            <Icon name="search" size={18} />
            <input
              id="buscar-clientes"
              type="search"
              placeholder="Nombre, celular o correo"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
            />
          </div>
          {program?.type === "tiers" && (
            <SelectField label="Nivel" value={tier} onChange={(e) => { setTier(e.target.value); setPage(1) }}>
              <option value="">Todos</option>
              {program.tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Actividad más reciente</option>
            <option value="new">Altas más recientes</option>
            <option value="name">Nombre</option>
            <option value="balance">{stamps ? "Más sellos" : "Más puntos"}</option>
            <option value="visits">Más visitas</option>
          </SelectField>
        </div>
        {list.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={list.error} retry={list.reload} />
          </div>
        ) : !list.data ? (
          <div style={{ padding: 22 }}>
            <Loading rows={5} />
          </div>
        ) : !rows.length ? (
          <Empty icon="users" title={list.data.length ? "Nadie coincide con tu búsqueda" : "Aún no tienes clientes"}>
            {list.data.length ? "Prueba con otro nombre o con los últimos dígitos del celular." : "Coloca la etiqueta NFC en el mostrador para que tus clientes se registren."}
          </Empty>
        ) : (
          <>
            <div className="ll-table-wrap">
              <table className="ll-table is-responsive">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num">{stamps ? "Sellos" : "Puntos"}</th>
                    {program?.type === "tiers" && <th>Nivel</th>}
                    <th className="num">Visitas</th>
                    <th>Última actividad</th>
                    <th>Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id} className="is-clickable" onClick={() => navigate(`/panel/clientes/${c.id}`)}>
                      <td className="ll-td-main">
                        <div className="ll-person">
                          <span className="ll-avatar">{initials(c.name)}</span>
                          <div>
                            <a className="ll-cell-main" href={`#/panel/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}>
                              {c.name}
                            </a>
                            <small>
                              {formatPhone(c.phone)}
                              {c.employee && " · empleado"}
                            </small>
                          </div>
                          {c.earnedRewards.length > 0 && <Badge tone="brand">{c.earnedRewards.length} por canjear</Badge>}
                        </div>
                      </td>
                      <td className="num" data-label={stamps ? "Sellos" : "Puntos"}>
                        {stamps ? `${c.stamps} / ${program?.stampGoal}` : int(c.points)}
                      </td>
                      {program?.type === "tiers" && <td data-label="Nivel">{c.tierName || "—"}</td>}
                      <td className="num" data-label="Visitas">
                        {int(c.visits)}
                      </td>
                      <td data-label="Última actividad">{relative(c.lastActivityAt)}</td>
                      <td data-label="Alta">{date(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={current} pages={pages} onChange={setPage} total={rows.length} label={rows.length === 1 ? "cliente" : "clientes"} />
          </>
        )}
      </Card>
    </>
  )
}
