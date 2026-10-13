import { useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { href } from "../../lib/router"
import { formatPhone, plural, roleLabel } from "../../lib/util"
import { Button, Card, ErrorState, Field, Loading, Notice, PageHeader, useToast } from "../../components/ui"

export default function Settings({ me }: { me: api.Me }) {
  const b = useAsync(() => (me.role === "cashier" ? Promise.resolve(null) : api.bundle()))
  return (
    <>
      <PageHeader title={me.role === "cashier" ? "Mi cuenta" : "Configuración"} />
      <div className="ll-split">
        <div className="ll-stack">
          {me.role !== "cashier" && (b.error ? <ErrorState message={b.error} retry={b.reload} /> : !b.data ? <Loading /> : <Contact bundle={b.data} me={me} />)}
          <Password />
        </div>
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
                <dd>{roleLabel[me.role]}</dd>
              </div>
            </dl>
          </Card>
          {b.data && (
            <Card title="Plan">
              <dl className="ll-dl">
                <div>
                  <dt>Cobro</dt>
                  <dd>Por sucursal</dd>
                </div>
                <div>
                  <dt>Sucursales activas</dt>
                  <dd>{plural(b.data.branches.length, "sucursal", "sucursales")}</dd>
                </div>
                <div>
                  <dt>Facturación</dt>
                  <dd>Mensual, la envía LoyaLoop</dd>
                </div>
              </dl>
            </Card>
          )}
          <Card title="Tus datos">
            <p className="ll-hint">
              Los datos de tus clientes son de tu negocio; LoyaLoop los procesa por tu cuenta. Si cancelas, puedes descargarlos antes de que se borren.{" "}
              <a className="ll-link" href={href("/legal")} style={{ fontSize: 14 }}>
                Privacidad y términos
              </a>
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}

function Contact({ bundle, me }: { bundle: api.Bundle; me: api.Me }) {
  const [contactName, setContactName] = useState(bundle.business.contactName)
  const [email, setEmail] = useState(bundle.business.email)
  const [phone, setPhone] = useState(bundle.business.phone)
  const { run, pending, error } = useAction(api.updateBusinessContact)
  const toast = useToast()
  const owner = me.role === "owner"
  return (
    <Card title="Datos del negocio" description="Aparecen en el reverso de la tarjeta de tus clientes.">
      {owner ? (
        <form
          className="ll-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await run({ contactName, email, phone })
            if (r.ok) toast("Datos guardados.")
          }}
        >
          <Field label="Nombre comercial" value={bundle.business.name} disabled hint="Para cambiarlo, escribe a LoyaLoop." />
          <Field label="Persona de contacto" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <div className="ll-grid-2">
            <Field label="Correo de contacto" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Teléfono" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="ll-form-actions">
            <Button type="submit" loading={pending}>
              Guardar
            </Button>
          </div>
        </form>
      ) : (
        <dl className="ll-dl">
          <div>
            <dt>Nombre</dt>
            <dd>{bundle.business.name}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{bundle.business.email}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{formatPhone(bundle.business.phone) || "—"}</dd>
          </div>
        </dl>
      )}
    </Card>
  )
}

export function Password() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [local, setLocal] = useState("")
  const { run, pending, error } = useAction(api.changePassword)
  const toast = useToast()
  return (
    <Card title="Contraseña">
      <form
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (next !== repeat) return setLocal("Las contraseñas nuevas no coinciden.")
          setLocal("")
          const r = await run(current, next)
          if (r.ok) {
            toast("Contraseña actualizada.")
            setCurrent("")
            setNext("")
            setRepeat("")
          }
        }}
      >
        <Field label="Contraseña actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <div className="ll-grid-2">
          <Field label="Nueva" type="password" autoComplete="new-password" hint="Al menos 8 caracteres." value={next} onChange={(e) => setNext(e.target.value)} />
          <Field label="Repite la nueva" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        {(local || error) && <Notice tone="error">{local || error}</Notice>}
        <div className="ll-form-actions">
          <Button type="submit" variant="secondary" loading={pending} disabled={!current || !next}>
            Cambiar contraseña
          </Button>
        </div>
      </form>
    </Card>
  )
}
