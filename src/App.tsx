import { useEffect } from "react"
import { ToastProvider, Loading } from "./components/ui"
import { navigate, useRoute } from "./lib/router"
import Landing from "./pages/Landing"
import { AcceptInvite, Login, RecoverPassword, ResetPassword } from "./pages/Auth"
import BusinessApp from "./pages/BusinessApp"
import AdminApp from "./pages/AdminApp"
import Registration from "./pages/Registration"
import Kiosk from "./pages/Kiosk"
import Legal from "./pages/Legal"
import NotFound from "./pages/NotFound"

/** Old Figma Make routes keep working for anyone with a saved link. */
const legacy: Record<string, string> = {
  "/dashboard": "/panel",
  "/owner": "/admin",
  "/escaner": "/caja",
  "/signup": "/login",
  "/registro": "/",
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to])
  return <Loading />
}

function Router() {
  const route = useRoute()
  const [first, second] = route.parts
  if (legacy[route.path]) return <Redirect to={legacy[route.path]} />
  switch (first) {
    case undefined:
      return <Landing />
    case "login":
      return <Login next={route.query.get("next") || ""} />
    case "recuperar":
      return <RecoverPassword />
    case "restablecer":
      return <ResetPassword token={second || ""} />
    case "invitacion":
      return <AcceptInvite token={second || ""} />
    case "r":
      return <Registration code={second || ""} />
    case "caja":
      return <Kiosk />
    case "legal":
      return <Legal />
    case "panel":
      return <BusinessApp route={route} />
    case "admin":
      return <AdminApp route={route} />
    default:
      return <NotFound />
  }
}

export default function App() {
  return (
    <ToastProvider>
      <Router />
    </ToastProvider>
  )
}
