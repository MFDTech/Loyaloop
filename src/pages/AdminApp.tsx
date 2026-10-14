import { useEffect } from "react"
import * as api from "../lib/api"
import { useAsync } from "../lib/hooks"
import { navigate, type Route } from "../lib/router"
import Shell, { type NavItem } from "../components/Shell"
import { ErrorState, Loading } from "../components/ui"
import Businesses, { AdminHome } from "./admin/Businesses"
import NewBusiness from "./admin/NewBusiness"
import BusinessDetail from "./admin/BusinessDetail"
import { AdminAccount, Audit, Leads } from "./admin/Other"
import NotFound from "./NotFound"

export default function AdminApp({ route }: { route: Route }) {
  const session = useAsync(api.me)
  const leads = useAsync(async () => {
    const me = await api.me()
    if (me?.user.role !== "admin" || me.impersonating) return 0
    return (await api.leads()).filter((l) => l.status === "new").length
  })
  const me = session.data
  const section = route.parts[1] || ""

  useEffect(() => {
    if (session.loading && !me) return
    if (!me) navigate(`/login?next=${encodeURIComponent(route.path)}`, { replace: true })
    else if (me.user.role !== "admin") navigate("/panel", { replace: true })
    // Coming back to /admin from inside a business account ends the visit.
    else if (me.impersonating) api.stopImpersonating()
  }, [me, session.loading, route.path])

  if (!me) return session.error ? <ErrorState message={session.error} retry={session.reload} /> : <Loading />
  if (me.user.role !== "admin" || me.impersonating) return <Loading />

  const nav: NavItem[] = [
    { path: "/admin", label: "Inicio", icon: "grid" },
    { path: "/admin/negocios", label: "Negocios", icon: "store" },
    { path: "/admin/solicitudes", label: "Solicitudes", icon: "mail", badge: leads.data || 0 },
    { path: "/admin/bitacora", label: "Bitácora", icon: "layers" },
    { path: "/admin/cuenta", label: "Mi cuenta", icon: "settings" },
  ]

  let page
  switch (section) {
    case "":
      page = <AdminHome />
      break
    case "negocios":
      page = route.parts[2] === "nuevo" ? <NewBusiness /> : route.parts[2] ? <BusinessDetail id={route.parts[2]} /> : <Businesses />
      break
    case "solicitudes":
      page = <Leads />
      break
    case "bitacora":
      page = <Audit />
      break
    case "cuenta":
      page = <AdminAccount me={me} />
      break
    default:
      return <NotFound />
  }

  return (
    <Shell me={me} nav={nav} current={route.path} workspace={{ name: "LoyaLoop", detail: "Administración", icon: "shield" }}>
      {page}
    </Shell>
  )
}
