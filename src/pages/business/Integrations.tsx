import * as api from "../../lib/api"
import { useAsync } from "../../lib/hooks"
import { date } from "../../lib/util"
import { Badge, Card, ErrorState, Icon, Loading, Notice, PageHeader } from "../../components/ui"

const PROVIDERS = {
  mercadopago: { name: "Mercado Pago Point", detail: "Terminales de Mercado Pago. Cada cobro llega con su monto y propina." },
  clip: { name: "Clip", detail: "Terminales Clip. Disponible después de Mercado Pago." },
} as const

export default function Integrations() {
  const b = useAsync(api.bundle)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={4} />
  const connected = b.data.integrations.find((i) => i.status === "connected")
  return (
    <>
      <PageHeader title="Integraciones" description="Con tu sistema de cobro conectado, los puntos se suman solos al pagar. El cajero no captura montos." />
      {!connected && (
        <Notice tone={b.data.program.type === "stamps" ? "info" : "warning"} title="Tu sistema de cobro aún no está conectado">
          {b.data.program.type === "stamps"
            ? "Mientras tanto, tu tarjeta suma un sello por visita cada vez que el cliente escanea su QR."
            : "Sin la conexión, el escáner no puede saber cuánto pagó el cliente. LoyaLoop la conecta contigo durante el alta."}
        </Notice>
      )}
      <div className="ll-grid-2">
        {b.data.integrations.map((i) => {
          const info = PROVIDERS[i.provider]
          return (
            <Card key={i.provider} title={info.name} description={info.detail}>
              <div className="ll-row">
                <Badge tone={i.status === "connected" ? "success" : i.status === "error" ? "danger" : "neutral"}>
                  {i.status === "connected" ? "Conectado" : i.status === "error" ? "Con error" : "Sin conectar"}
                </Badge>
                {i.connectedAt && i.status === "connected" && <span className="ll-hint">Desde el {date(i.connectedAt)}</span>}
              </div>
              {i.lastError && <p className="ll-field-error" style={{ marginTop: 10 }}>{i.lastError}</p>}
            </Card>
          )
        })}
        <Card title="Apple Wallet y Google Wallet" description="LoyaLoop emite y actualiza los pases de tus clientes. No necesitas cuentas propias.">
          <div className="ll-row">
            <Badge tone="info">
              <Icon name="wallet" size={14} /> Administrado por LoyaLoop
            </Badge>
          </div>
        </Card>
        <Card title="Puntos de venta de restaurante" description="Parrot y Soft Restaurant, para cubrir también pagos en efectivo.">
          <Badge>Próximamente</Badge>
        </Card>
      </div>
      <p className="ll-hint">¿Usas otro sistema de cobro? Escríbenos a hola@loyaloop.mx.</p>
    </>
  )
}
