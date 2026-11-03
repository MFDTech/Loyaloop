import { useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { navigate } from "../../lib/router"
import { Button, Card, ErrorState, Icon, Loading, Notice, PageHeader } from "../../components/ui"

export default function CashierHome({ me }: { me: api.Me }) {
  const b = useAsync(api.bundle)
  const kiosk = useAsync(() => (api.deviceToken() ? api.kiosk() : Promise.resolve(null)))
  const [changing, setChanging] = useState(false)
  // A device paired to another business is not this cashier's scanner.
  const ownKiosk = kiosk.data && kiosk.data.businessId === me.business?.id ? kiosk.data : null
  const otherBusiness = !!kiosk.data && !ownKiosk
  const [registerId, setRegisterId] = useState("")
  const pair = useAction(async (id: string) => {
    const { code } = await api.createPairingCode(id)
    const register = b.data!.registers.find((r) => r.id === id)!
    await api.pairDevice(code, `Escáner de ${register.name}`)
  })
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading />
  const registers = b.data.registers.filter((r) => !me.user.branchId || r.branchId === me.user.branchId)
  const branchName = (id: string) => b.data!.branches.find((x) => x.id === id)?.name
  return (
    <>
      <PageHeader title={`Hola, ${me.user.name.split(" ")[0]}`} description="Desde aquí abres el escáner de tu caja." />
      {ownKiosk && !changing ? (
        <Card title="Este dispositivo ya es un escáner" description={`${ownKiosk.registerName} · ${ownKiosk.branchName}`}>
          <div className="ll-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Button size="lg" onClick={() => navigate("/caja")}>
              <Icon name="scan" size={20} /> Abrir escáner
            </Button>
            {registers.length > 1 && (
              <Button size="lg" variant="secondary" onClick={() => setChanging(true)}>
                Cambiar de caja
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card title={changing ? "Cambiar de caja" : "Usar este dispositivo como escáner"} description="Elige tu caja. El dispositivo quedará vinculado hasta que un gerente lo desvincule.">
          <div className="ll-stack">
            {kiosk.error && <Notice tone="warning">{kiosk.error}</Notice>}
            {otherBusiness && <Notice tone="warning">Este dispositivo era el escáner de otro negocio. Al vincularlo a tu caja deja de funcionar para ese negocio.</Notice>}
            <div className="ll-list">
              {registers.map((r) => (
                <label key={r.id} className="ll-check" style={{ padding: "10px 0" }}>
                  <input type="radio" name="caja" checked={registerId === r.id} onChange={() => setRegisterId(r.id)} />
                  <span className="ll-check-box" style={{ borderRadius: "50%" }} aria-hidden>
                    <Icon name="check" size={14} />
                  </span>
                  <span className="ll-check-text">
                    {r.name}
                    <small>{branchName(r.branchId)}</small>
                  </span>
                </label>
              ))}
            </div>
            {pair.error && <Notice tone="error">{pair.error}</Notice>}
            <div>
              <Button
                size="lg"
                disabled={!registerId}
                loading={pair.pending}
                onClick={async () => {
                  const r = await pair.run(registerId)
                  if (r.ok) navigate("/caja")
                }}
              >
                Vincular y abrir escáner
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card title="Cómo funciona en caja">
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10, fontSize: 16, lineHeight: 1.5 }}>
          <li>El cliente muestra el QR de su tarjeta en el escáner, antes o después de pagar.</li>
          <li>Cobras como siempre en tu terminal. No capturas montos en LoyaLoop.</li>
          <li>El escáner confirma los puntos o sellos en cuanto llega el cobro.</li>
          <li>Si el cliente quiere canjear, elige su recompensa en la misma pantalla.</li>
        </ol>
      </Card>
    </>
  )
}
