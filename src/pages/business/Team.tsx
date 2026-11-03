import { useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import type { Role } from "../../lib/types"
import { formatPhone, initials, roleLabel } from "../../lib/util"
import { InviteLinkNotice } from "../Auth"
import { Badge, Button, Card, Check, Empty, ErrorState, Field, Icon, IconButton, Loading, Modal, Notice, PageHeader, SelectField, useToast } from "../../components/ui"

const PERMISSIONS: [string, boolean, boolean, boolean][] = [
  ["Ver resumen, clientes y actividad", true, true, false],
  ["Ajustar saldos y registrar devoluciones", true, true, false],
  ["Asignar cobros en revisión", true, true, false],
  ["Recompensas, cajas y escáneres", true, true, false],
  ["Sucursales, equipo y exportar clientes", true, false, false],
  ["Usar el escáner de caja", true, true, true],
]

export default function Team({ me }: { me: api.Me }) {
  const list = useAsync(api.team)
  const b = useAsync(api.bundle)
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<api.TeamMember | null>(null)
  const owner = me.role === "owner"
  return (
    <>
      <PageHeader
        title="Equipo"
        description="Quién entra al panel y con qué permisos. Los teléfonos del equipo pueden excluirse de acumular puntos."
        actions={
          owner && (
            <Button onClick={() => setInviting(true)}>
              <Icon name="plus" size={18} /> Invitar persona
            </Button>
          )
        }
      />
      <Card padded={false}>
        {list.error ? (
          <div style={{ padding: 22 }}>
            <ErrorState message={list.error} retry={list.reload} />
          </div>
        ) : !list.data ? (
          <div style={{ padding: 22 }}>
            <Loading />
          </div>
        ) : !list.data.length ? (
          <Empty icon="users" title="Aún no hay nadie en tu equipo" />
        ) : (
          <div className="ll-table-wrap" style={{ borderTop: 0 }}>
            <table className="ll-table is-responsive">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Celular</th>
                  <th>Acumula puntos</th>
                  <th>Estado</th>
                  {owner && <th aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody>
                {list.data.map((u) => (
                  <tr key={u.id}>
                    <td className="ll-td-main">
                      <div className="ll-person">
                        <span className="ll-avatar">{initials(u.name)}</span>
                        <div>
                          <span className="ll-cell-main">
                            {u.name}
                            {u.id === me.user.id && " (tú)"}
                          </span>
                          <small>{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Rol">
                      {roleLabel[u.role]}
                      {u.branchId && <small>{b.data?.branches.find((x) => x.id === u.branchId)?.name}</small>}
                    </td>
                    <td data-label="Celular">{u.phone ? formatPhone(u.phone) : "—"}</td>
                    <td data-label="Acumula puntos">{u.phone ? (u.excludedFromEarning ? <Badge tone="warning">Excluido</Badge> : <Badge>Sí, como cliente</Badge>) : "—"}</td>
                    <td data-label="Estado">{!u.active ? <Badge>Desactivado</Badge> : u.inviteToken ? <Badge tone="info">Invitación pendiente</Badge> : <Badge tone="success">Activo</Badge>}</td>
                    {owner && (
                      <td data-label="">
                        <IconButton icon="edit" label={`Editar a ${u.name}`} onClick={() => setEditing(u)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Qué puede hacer cada rol" padded={false}>
        <div className="ll-table-wrap">
          <table className="ll-table">
            <thead>
              <tr>
                <th>Permiso</th>
                <th>Dueño</th>
                <th>Gerente</th>
                <th>Cajero</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(([label, ...roles]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {roles.map((on, i) => (
                    <td key={i} aria-label={on ? "Sí" : "No"}>
                      {on ? <Icon name="check" size={18} className="ll-positive" /> : <span className="ll-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ll-table-foot">La configuración de la tarjeta y sus reglas la hace LoyaLoop.</p>
      </Card>
      {inviting && <InviteModal branches={b.data?.branches || []} onClose={() => setInviting(false)} />}
      {editing && <EditModal member={editing} me={me} branches={b.data?.branches || []} onClose={() => setEditing(null)} />}
    </>
  )
}

function InviteModal({ branches, onClose }: { branches: { id: string; name: string }[]; onClose: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("cashier")
  const [phone, setPhone] = useState("")
  const [excluded, setExcluded] = useState(true)
  const [branchId, setBranchId] = useState("")
  const [link, setLink] = useState("")
  const [emailed, setEmailed] = useState(true)
  const { run, pending, error } = useAction(api.inviteMember)
  return (
    <Modal
      title="Invitar a una persona"
      description="Recibirá un enlace para crear su contraseña."
      onClose={onClose}
      footer={
        link ? (
          <Button onClick={onClose}>Listo</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="invite-form" loading={pending}>
              Crear invitación
            </Button>
          </>
        )
      }
    >
      {link ? (
        <InviteLinkNotice link={link} email={email} emailed={emailed} />
      ) : (
        <form
          id="invite-form"
          className="ll-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await run({ name, email, role, phone, excluded, branchId })
            if (r.ok) {
              setLink(r.value.link)
              setEmailed(r.value.emailed)
            }
          }}
        >
          <Field label="Nombre" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Field label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="ll-grid-2">
            <SelectField label="Rol" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="cashier">Cajero</option>
              <option value="manager">Gerente</option>
              <option value="owner">Dueño</option>
            </SelectField>
            {branches.length > 1 && (
              <SelectField label="Sucursal" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Todas</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
          <Field label="Celular" optional type="tel" inputMode="tel" placeholder="10 dígitos" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Sirve para reconocer su tarjeta si también es cliente." />
          <Check label="No acumula puntos con su propia tarjeta" hint="Recomendado para quien cobra." checked={excluded} onChange={setExcluded} disabled={!phone} />
          {error && <Notice tone="error">{error}</Notice>}
        </form>
      )}
    </Modal>
  )
}

function EditModal({ member, me, branches, onClose }: { member: api.TeamMember; me: api.Me; branches: { id: string; name: string }[]; onClose: () => void }) {
  const [role, setRole] = useState<Role>(member.role)
  const [phone, setPhone] = useState(member.phone || "")
  const [excluded, setExcluded] = useState(member.excludedFromEarning)
  const [active, setActive] = useState(member.active)
  const [branchId, setBranchId] = useState(member.branchId || "")
  const { run, pending, error } = useAction(api.updateMember)
  const toast = useToast()
  const self = member.id === me.user.id
  return (
    <Modal
      title={member.name}
      description={member.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="member-form" loading={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="member-form"
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await run(member.id, { role, phone, excluded, active, branchId })
          if (r.ok) {
            toast("Cambios guardados.")
            onClose()
          }
        }}
      >
        <div className="ll-grid-2">
          <SelectField label="Rol" value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)} hint={self ? "No puedes cambiar tu propio rol." : undefined}>
            <option value="cashier">Cajero</option>
            <option value="manager">Gerente</option>
            <option value="owner">Dueño</option>
          </SelectField>
          {branches.length > 1 && (
            <SelectField label="Sucursal" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Todas</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        <Field label="Celular" optional type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Check label="No acumula puntos con su propia tarjeta" checked={excluded} onChange={setExcluded} disabled={!phone} />
        <Check label="Cuenta activa" hint="Si la desactivas, ya no podrá entrar al panel." checked={active} onChange={setActive} disabled={self} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  )
}
