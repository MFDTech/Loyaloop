import { useState, type FormEvent, type ReactNode } from "react"
import * as api from "../lib/api"
import { useAction, useAsync } from "../lib/hooks"
import { PREVIEW } from "../lib/preview"
import { href, navigate } from "../lib/router"
import { TEST_ACCOUNTS } from "../lib/seed"
import { roleLabel } from "../lib/util"
import { Button, CopyButton, ErrorState, Field, Icon, Loading, Logo, Notice } from "../components/ui"

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ll-auth">
      <aside className="ll-auth-story">
        <Logo light />
        <div>
          <h1>Tu programa de lealtad, en un solo lugar.</h1>
          <p>Consulta a tus clientes, sus visitas y sus recompensas. Los puntos se suman solos cuando pagan.</p>
          <ul>
            <li>
              <Icon name="check" size={18} /> Tarjetas en Apple Wallet y Google Wallet
            </li>
            <li>
              <Icon name="check" size={18} /> Puntos automáticos al cobrar, sin captura en caja
            </li>
            <li>
              <Icon name="check" size={18} /> Cada movimiento queda registrado
            </li>
          </ul>
        </div>
        <small>¿Necesitas ayuda? Escríbenos a hola@loyaloop.mx</small>
      </aside>
      <main className="ll-auth-main">
        <div className="ll-auth-top">
          <span className="ll-auth-logo-mobile">
            <Logo size={150} />
          </span>
          <a className="ll-link" href={href("/")}>
            Volver al sitio
          </a>
        </div>
        {children}
      </main>
    </div>
  )
}

function homeFor(me: api.Me) {
  if (me.role === "admin") return "/admin"
  if (me.role === "cashier") return "/panel/caja"
  return "/panel"
}

export function Login({ next }: { next: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const { run, pending, error } = useAction(api.login)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = await run(email, password)
    if (!result.ok) return
    const me = result.value
    const target = next && ((me.role === "admin" && next.startsWith("/admin")) || (me.role !== "admin" && next.startsWith("/panel"))) ? next : homeFor(me)
    navigate(target)
  }
  return (
    <AuthLayout>
      <form className="ll-auth-form" onSubmit={submit} noValidate>
        <div>
          <h2>Inicia sesión</h2>
          <p>Entra con el correo con el que te dieron de alta.</p>
        </div>
        <Field label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" block loading={pending}>
          Entrar <Icon name="arrow" size={18} />
        </Button>
        <a className="ll-link" href={href("/recuperar")} style={{ justifySelf: "center" }}>
          ¿Olvidaste tu contraseña?
        </a>
        {PREVIEW && (
          <div className="ll-test-accounts">
            <p>
              <span className="ll-preview-tag">Prueba</span> Cuentas de ejemplo para recorrer cada rol:
            </p>
            {TEST_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email)
                  setPassword(account.password)
                }}
              >
                {account.label}
                <span>{account.email}</span>
              </button>
            ))}
          </div>
        )}
      </form>
    </AuthLayout>
  )
}

export function RecoverPassword() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState<{ previewLink?: string } | null>(null)
  const { run, pending, error } = useAction(api.requestPasswordReset)
  return (
    <AuthLayout>
      <form
        className="ll-auth-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const result = await run(email)
          if (result.ok) setSent(result.value)
        }}
        noValidate
      >
        <div>
          <h2>Recupera tu acceso</h2>
          <p>Te mandamos un enlace para crear una contraseña nueva.</p>
        </div>
        {sent ? (
          <>
            <Notice tone="success" title="Revisa tu correo">
              Si {email} tiene una cuenta, recibirás el enlace en unos minutos. Vence en una hora.
            </Notice>
            {PREVIEW && sent.previewLink && (
              <Notice tone="info" title="Modo de prueba">
                Todavía no se envían correos. Usa este enlace: <a className="ll-link" href={sent.previewLink}>Crear contraseña nueva</a>
              </Notice>
            )}
            <a className="ll-link" href={href("/login")}>
              Volver a iniciar sesión
            </a>
          </>
        ) : (
          <>
            <Field label="Correo electrónico" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" size="lg" block loading={pending}>
              Enviar enlace
            </Button>
            <a className="ll-link" href={href("/login")} style={{ justifySelf: "center" }}>
              Volver a iniciar sesión
            </a>
          </>
        )}
      </form>
    </AuthLayout>
  )
}

function PasswordForm({ title, intro, cta, onSubmit, pending, error }: { title: string; intro: ReactNode; cta: string; onSubmit: (password: string) => void; pending: boolean; error: string }) {
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [local, setLocal] = useState("")
  return (
    <form
      className="ll-auth-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (password.length < 8) return setLocal("Usa al menos 8 caracteres.")
        if (password !== repeat) return setLocal("Las contraseñas no coinciden.")
        setLocal("")
        onSubmit(password)
      }}
      noValidate
    >
      <div>
        <h2>{title}</h2>
        <p>{intro}</p>
      </div>
      <Field label="Contraseña nueva" type="password" autoComplete="new-password" hint="Al menos 8 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label="Repite la contraseña" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      {(local || error) && <Notice tone="error">{local || error}</Notice>}
      <Button type="submit" size="lg" block loading={pending}>
        {cta}
      </Button>
    </form>
  )
}

export function ResetPassword({ token }: { token: string }) {
  const { run, pending, error } = useAction(api.resetPassword)
  const [done, setDone] = useState(false)
  return (
    <AuthLayout>
      {done ? (
        <div className="ll-auth-form">
          <Notice tone="success" title="Listo">
            Tu contraseña cambió. Ya puedes iniciar sesión.
          </Notice>
          <Button onClick={() => navigate("/login")}>Iniciar sesión</Button>
        </div>
      ) : (
        <PasswordForm
          title="Crea una contraseña nueva"
          intro="Elige una que no uses en otros sitios."
          cta="Guardar contraseña"
          pending={pending}
          error={error}
          onSubmit={async (password) => {
            const result = await run(token, password)
            if (result.ok) setDone(true)
          }}
        />
      )}
    </AuthLayout>
  )
}

export function AcceptInvite({ token }: { token: string }) {
  const invite = useAsync(() => api.invitation(token), [token])
  const { run, pending, error } = useAction(api.acceptInvitation)
  return (
    <AuthLayout>
      {invite.loading && !invite.data ? (
        <div className="ll-auth-form">
          <Loading />
        </div>
      ) : invite.error ? (
        <div className="ll-auth-form">
          <ErrorState message={invite.error} />
          <a className="ll-link" href={href("/login")}>
            Ir a iniciar sesión
          </a>
        </div>
      ) : (
        <PasswordForm
          title={`Hola, ${invite.data!.name.split(" ")[0]}`}
          intro={
            <>
              Te invitaron a <b>{invite.data!.business}</b> como {roleLabel[invite.data!.role].toLowerCase()}. Crea tu contraseña para entrar con {invite.data!.email}.
            </>
          }
          cta="Crear contraseña y entrar"
          pending={pending}
          error={error}
          onSubmit={async (password) => {
            const result = await run(token, password)
            if (result.ok) navigate(homeFor(result.value))
          }}
        />
      )}
    </AuthLayout>
  )
}

export function InviteLinkNotice({ link, email }: { link: string; email: string }) {
  const full = `${window.location.href.split("#")[0]}${link}`
  return (
    <Notice tone="success" title="Invitación lista">
      <p style={{ marginBottom: 10 }}>
        {PREVIEW
          ? `Cuando el servidor esté conectado se enviará por correo a ${email}. Por ahora, comparte este enlace:`
          : `Enviamos la invitación a ${email}. También puedes compartir este enlace:`}
      </p>
      <div className="ll-code-box">
        <code>{full}</code>
        <CopyButton text={full} />
      </div>
    </Notice>
  )
}
