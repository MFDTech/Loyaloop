import { Button, Empty, Logo } from "../components/ui"
import { navigate } from "../lib/router"

export default function NotFound({ message = "Esta página no existe o el enlace cambió." }: { message?: string }) {
  return (
    <div className="ll-reg">
      <div style={{ padding: 24 }}>
        <Logo />
      </div>
      <div className="ll-reg-body" style={{ marginTop: 40 }}>
        <div className="ll-reg-card">
          <Empty icon="search" title="No encontramos esta página" action={<Button onClick={() => navigate("/")}>Ir al inicio</Button>}>
            {message}
          </Empty>
        </div>
      </div>
    </div>
  )
}
