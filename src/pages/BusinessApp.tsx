import { useEffect } from "react"
import * as api from "../lib/api"
import { useAsync } from "../lib/hooks"
import { navigate, type Route } from "../lib/router"
import Shell, { type NavItem } from "../components/Shell"
import { ErrorState, Loading, Notice } from "../components/ui"
import { DAY } from "../lib/util"
import Overview from "./business/Overview"
import Customers from "./business/Customers"
import CustomerDetail from "./business/CustomerDetail"
import Activity from "./business/Activity"
import CardView from "./business/CardView"
import Rewards from "./business/Rewards"
import Notifications from "./business/Notifications"
import Branches from "./business/Branches"
import Integrations from "./business/Integrations"
import Team from "./business/Team"
import Settings from "./business/Settings"
import CashierHome from "./business/CashierHome"
import NotFound from "./NotFound"

export default function BusinessApp({ route }: { route: Route }) {
  const session = useAsync(api.me)
  const review = useAsync(async () => {
    const me = await api.me()
    if (!me || me.role === "cashier" || me.role === "admin") return 0
    return (await api.reviewQueue()).length
  })
  const me = session.data
  const section = route.parts[1] || ""

  useEffect(() => {
    if (session.loading && !me) return
    if (!me) navigate(`/login?next=${encodeURIComponent(route.path)}`, { replace: true })
    else if (me.role === "admin") navigate("/admin", { replace: true })
    else if (me.role === "cashier" && !["caja", "cuenta"].includes(section)) navigate("/panel/caja", { replace: true })
  }, [me, session.loading, section, route.path])

  if (!me) return session.error ? <ErrorState message={session.error} retry={session.reload} /> : <Loading />
  if (me.role === "admin" || (me.role === "cashier" && !["caja", "cuenta"].includes(section))) return <Loading />

  const isCashier = me.role === "cashier"
  const nav: NavItem[] = isCashier
    ? [
        { path: "/panel/caja", label: "Caja", icon: "scan" },
        { path: "/panel/cuenta", label: "Mi cuenta", icon: "user" },
      ]
    : [
        { path: "/panel", label: "Resumen", icon: "grid" },
        { path: "/panel/clientes", label: "Clientes", icon: "users" },
        { path: "/panel/actividad", label: "Actividad", icon: "activity", badge: review.data || 0 },
        { path: "/panel/tarjeta", label: "Tarjeta y reglas", icon: "card" },
        { path: "/panel/recompensas", label: "Recompensas", icon: "gift" },
        { path: "/panel/avisos", label: "Avisos", icon: "bell" },
        { path: "/panel/sucursales", label: "Sucursales y cajas", icon: "store" },
        { path: "/panel/integraciones", label: "Integraciones", icon: "link" },
        { path: "/panel/equipo", label: "Equipo", icon: "users" },
        { path: "/panel/cuenta", label: "Configuración", icon: "settings" },
      ]

  let page
  switch (section) {
    case "":
      page = <Overview me={me} />
      break
    case "clientes":
      page = route.parts[2] ? <CustomerDetail id={route.parts[2]} me={me} /> : <Customers me={me} />
      break
    case "actividad":
      page = <Activity me={me} initialTab={route.query.get("tab") === "revision" ? "review" : "all"} />
      break
    case "tarjeta":
      page = <CardView />
      break
    case "recompensas":
      page = <Rewards />
      break
    case "avisos":
      page = <Notifications />
      break
    case "sucursales":
      page = <Branches me={me} />
      break
    case "integraciones":
      page = <Integrations />
      break
    case "equipo":
      page = <Team me={me} />
      break
    case "cuenta":
      page = <Settings me={me} />
      break
    case "caja":
      page = <CashierHome me={me} />
      break
    default:
      return <NotFound />
  }

  return (
    <Shell
      me={me}
      nav={nav}
      current={route.path}
      workspace={{
        name: me.business?.name || "Negocio",
        detail: me.business?.status === "trial" ? "Periodo de prueba" : me.business?.status === "paused" ? "Cuenta pausada" : "Panel del negocio",
        icon: "store",
      }}
    >
      {me.role !== "cashier" && <TrialBanner business={me.business} />}
      {page}
    </Shell>
  )
}

/** Self-serve trial: days left, and how to keep the card once it ends. */
function TrialBanner({ business }: { business?: api.Me["business"] }) {
  if (!business?.selfServe || business.status !== "trial" || !business.trialEndsAt) return null
  const left = Math.ceil((new Date(business.trialEndsAt).getTime() - Date.now()) / DAY)
  return (
    <div style={{ marginBottom: 20 }}>
      <Notice tone={left > 3 ? "info" : "warning"} title={left > 0 ? `Prueba gratis: te ${left === 1 ? "queda 1 día" : `quedan ${left} días`}` : "Tu prueba gratis terminó"}>
        {left > 0
          ? "Para seguir con el plan Starter ($390 al mes) escríbenos a hola@loyaloop.com.mx y te mandamos los datos de pago."
          : "Tu tarjeta deja de aceptar clientes nuevos 3 días después de que termina la prueba. Escríbenos a hola@loyaloop.com.mx para activarla ($390 al mes)."}
      </Notice>
    </div>
  )
}
