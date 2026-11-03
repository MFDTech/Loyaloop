import { useEffect } from "react"
import { ToastProvider, Loading } from "./components/ui"
import { navigate, useRoute } from "./lib/router"
import Landing from "./pages/Landing"
import { AcceptInvite, Login, RecoverPassword, ResetPassword, Signup } from "./pages/Auth"
import BusinessApp from "./pages/BusinessApp"
import AdminApp from "./pages/AdminApp"
import Registration from "./pages/Registration"
import DemoCard from "./pages/DemoCard"
import Poster from "./pages/Poster"
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
    case "empezar":
      return <Signup />
    case "login":
      return <Login next={route.query.get("next") || ""} />
    case "recuperar":
      return <RecoverPassword />
    case "restablecer":
      return <ResetPassword token={second || ""} />
    case "invitacion":
      return <AcceptInvite token={second || ""} />
    case "letrero":
      return <Poster code={second || ""} />
    case "demo":
      return <DemoCard />
    case "r":
      return <Registration code={second || ""} cardToken={route.parts[2] === "tarjeta" ? route.parts[3] || "" : ""} />
    case "caja":
      return <Kiosk code={second || ""} />
    case "legal":
      return <Legal code={second || ""} />
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
