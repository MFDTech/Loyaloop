import { useState, type FormEvent, type ReactNode } from "react"
import * as api from "../lib/api"
import { useAction, useAsync } from "../lib/hooks"
import { PREVIEW } from "../lib/preview"
import { href, navigate } from "../lib/router"
import { TEST_ACCOUNTS } from "../lib/seed"
import { roleLabel } from "../lib/util"
import { Button, Check, CopyButton, ErrorState, Field, Icon, Loading, Logo, Notice, SelectField } from "../components/ui"

const LOGIN_STORY = {
  title: "Tu programa de lealtad, en un solo lugar.",
  text: "Consulta a tus clientes, sus visitas y sus recompensas. Los puntos se suman solos cuando pagan.",
  points: ["Tarjetas en Apple Wallet y Google Wallet", "Puntos automáticos al cobrar, sin captura en caja", "Cada movimiento queda registrado"],
}

const SIGNUP_STORY = {
  title: "Que tus clientes vuelvan, desde hoy.",
  text: "Una tarjeta de sellos con tu marca en el celular de tus clientes. Sin apps y sin tarjetas de cartón que se pierden.",
  points: ["Lista en 5 minutos, la configuras tú", "Apple Wallet y Google Wallet", "Imprime tu QR y ponlo en el mostrador", "$390 al mes, sin plazo forzoso"],
}

function AuthLayout({ children, story = LOGIN_STORY }: { children: ReactNode; story?: typeof LOGIN_STORY }) {
  return (
    <div className="ll-auth">
      <aside className="ll-auth-story">
        <Logo light />
        <div>
          <h1>{story.title}</h1>
          <p>{story.text}</p>
          <ul>
            {story.points.map((point) => (
              <li key={point}>
                <Icon name="check" size={18} /> {point}
              </li>
            ))}
          </ul>
        </div>
        <small>¿Necesitas ayuda? Escríbenos a hola@loyaloop.com.mx</small>
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
        <p className="ll-hint" style={{ textAlign: "center" }}>
          ¿Aún no tienes cuenta?{" "}
          <a className="ll-link" href={`${href("/")}?s=agenda`}>
            Agenda una llamada
          </a>
        </p>
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

const SIGNUP_SECTORS = ["Cafetería", "Restaurante", "Bar", "Panadería", "Salón o estética", "Barbería", "Gimnasio o estudio", "Tienda", "Hotel o motel", "Otro"]

/** #/empezar: Starter plan, set up by the owner; LoyaLoop activates it once paid. */
export function Signup() {
  const [form, setForm] = useState({ ownerName: "", businessName: "", sector: "", email: "", password: "", phone: "", terms: false })
  const [localError, setLocalError] = useState("")
  const { run, pending, error } = useAction(api.signupBusiness)
  const set = (key: keyof typeof form, value: string | boolean) => setForm({ ...form, [key]: value })
  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError("")
    if (form.password.length < 8) return setLocalError("La contraseña necesita al menos 8 caracteres.")
    if (!form.terms) return setLocalError("Para crear tu cuenta necesitas aceptar los términos y el aviso de privacidad.")
    const result = await run(form)
    if (result.ok) navigate("/panel")
  }
  return (
    <AuthLayout story={SIGNUP_STORY}>
      <form className="ll-auth-form" onSubmit={submit} noValidate>
        <div>
          <h2>Crea tu tarjeta de lealtad</h2>
          <p>Plan Starter, $390 al mes. Crea tu cuenta y diseña tu tarjeta de sellos; la activamos en cuanto recibamos tu pago.</p>
        </div>
        <Field label="Tu nombre" autoComplete="name" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} required />
        <Field label="Nombre de tu negocio" autoComplete="organization" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} hint="Así aparece en la tarjeta de tus clientes." required />
        <SelectField label="Giro" value={form.sector} onChange={(e) => set("sector", e.target.value)}>
          <option value="">Elige uno</option>
          {SIGNUP_SECTORS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </SelectField>
        <Field label="Correo electrónico" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        <Field label="Contraseña" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} hint="Al menos 8 caracteres." required />
        <Field label="WhatsApp (opcional)" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} hint="Por si necesitas ayuda para arrancar." />
        <Check
          label={
            <>
              Acepto los{" "}
              <a className="ll-link" href={href("/legal")} target="_blank" rel="noreferrer" style={{ fontSize: "inherit" }}>
                términos y el aviso de privacidad
              </a>
            </>
          }
          checked={form.terms}
          onChange={(v) => set("terms", v)}
        />
        {(localError || error) && <Notice tone="error">{localError || error}</Notice>}
        <Button type="submit" size="lg" block loading={pending}>
          Crear mi cuenta <Icon name="arrow" size={18} />
        </Button>
        <p className="ll-hint" style={{ textAlign: "center" }}>
          ¿Ya tienes cuenta?{" "}
          <a className="ll-link" href={href("/login")}>
            Inicia sesión
          </a>
        </p>
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
            {sent.previewLink && (
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
