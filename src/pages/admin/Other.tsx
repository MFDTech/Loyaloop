import { useMemo, useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { PREVIEW } from "../../lib/preview"
import { navigate } from "../../lib/router"
import { date, dateTime, formatPhone } from "../../lib/util"
import { Badge, Button, Card, Confirm, Empty, ErrorState, Loading, PageHeader, Tabs, useToast } from "../../components/ui"
import { Password } from "../business/Settings"
import { AuditList } from "./BusinessDetail"

export function Leads() {
  const list = useAsync(api.leads)
  const [tab, setTab] = useState<"new" | "contacted">("new")
  const mark = useAction(api.markLead)
  const toast = useToast()
  const rows = (list.data || []).filter((l) => l.status === tab)
  return (
    <>
      <PageHeader title="Solicitudes" description="Negocios que pidieron una llamada desde la página principal." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "new", label: "Por contactar", count: (list.data || []).filter((l) => l.status === "new").length },
          { value: "contacted", label: "Contactadas" },
        ]}
      />
      {list.error ? (
        <ErrorState message={list.error} retry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : !rows.length ? (
        <Card>
          <Empty icon="mail" title={tab === "new" ? "No hay solicitudes pendientes" : "Aún no has marcado solicitudes"} />
        </Card>
      ) : (
        <div className="ll-stack">
          {rows.map((l) => (
            <Card
              key={l.id}
              title={l.company}
              description={`${l.name} · pidió ${date(l.preferredDate + "T12:00:00")}, ${l.preferredTime}`}
              actions={
                <Button
                  size="sm"
                  variant={l.status === "new" ? "primary" : "secondary"}
                  loading={mark.pending}
                  onClick={async () => {
                    const r = await mark.run(l.id, l.status === "new" ? "contacted" : "new")
                    if (r.ok) toast(l.status === "new" ? "Marcada como contactada." : "Regresó a por contactar.")
                  }}
                >
                  {l.status === "new" ? "Marcar contactada" : "Volver a pendiente"}
                </Button>
              }
            >
              <dl className="ll-dl">
                <div>
                  <dt>Correo</dt>
                  <dd>
                    <a className="ll-link" href={`mailto:${l.email}`}>
                      {l.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Teléfono</dt>
                  <dd>{l.phone ? <a className="ll-link" href={`tel:${l.phone}`}>{formatPhone(l.phone) || l.phone}</a> : "—"}</dd>
                </div>
                <div>
                  <dt>Sucursales</dt>
                  <dd>{l.branches || "—"}</dd>
                </div>
                <div>
                  <dt>Recibida</dt>
                  <dd>{dateTime(l.createdAt)}</dd>
                </div>
                {l.notes && (
                  <div>
                    <dt>Mensaje</dt>
                    <dd>{l.notes}</dd>
                  </div>
                )}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

export function Audit() {
  const list = useAsync(api.adminAudit)
  const [query, setQuery] = useState("")
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list.data || []).filter((e) => !q || `${e.business || ""} ${e.actorName} ${e.action} ${e.detail}`.toLowerCase().includes(q))
  }, [list.data, query])
  return (
    <>
      <PageHeader title="Bitácora" description="Cada cambio importante, incluido lo que haces dentro de la cuenta de un negocio." />
      <div className="ll-toolbar">
        <div className="ll-field ll-search">
          <label htmlFor="buscar-bitacora">Buscar</label>
          <input id="buscar-bitacora" type="search" placeholder="Negocio, persona o acción" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {list.error ? <ErrorState message={list.error} retry={list.reload} /> : !list.data ? <Loading /> : <AuditList entries={rows} showBusiness />}
    </>
  )
}

export function AdminAccount({ me }: { me: api.Me }) {
  const [reset, setReset] = useState(false)
  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="ll-split">
        <Password />
        <div className="ll-stack">
          <Card title="Tu cuenta">
            <dl className="ll-dl">
              <div>
                <dt>Nombre</dt>
                <dd>{me.user.name}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{me.user.email}</dd>
              </div>
              <div>
                <dt>Rol</dt>
                <dd>
                  <Badge tone="brand">Administrador LoyaLoop</Badge>
                </dd>
              </div>
            </dl>
          </Card>
          {PREVIEW && (
            <Card title="Datos de prueba" description="Los datos viven en este navegador hasta que se conecte el servidor.">
              <Button variant="danger" onClick={() => setReset(true)}>
                Restablecer datos de ejemplo
              </Button>
            </Card>
          )}
        </div>
      </div>
      {reset && (
        <Confirm
          title="¿Restablecer los datos de ejemplo?"
          confirmLabel="Restablecer"
          tone="danger"
          onClose={() => setReset(false)}
          onConfirm={() => {
            api.resetData()
            navigate("/login")
          }}
        >
          Se borran los negocios, clientes y movimientos que creaste en este navegador, y se cierra tu sesión.
        </Confirm>
      )}
    </>
  )
}
