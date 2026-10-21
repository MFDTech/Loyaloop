import { useEffect, useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import { absoluteLink } from "../../lib/router"
import type { Branch, Register } from "../../lib/types"
import { MINUTE, relative } from "../../lib/util"
import Qr from "../../components/Qr"
import { Badge, Button, Card, Confirm, CopyButton, ErrorState, Field, Icon, IconButton, Loading, Modal, Notice, PageHeader, useToast } from "../../components/ui"

export default function Branches({ me }: { me: api.Me }) {
  const b = useAsync(api.bundle)
  const [branchForm, setBranchForm] = useState<Branch | "new" | null>(null)
  const [removeBranch, setRemoveBranch] = useState<Branch | null>(null)
  const [registerForm, setRegisterForm] = useState<{ branchId: string; register?: Register } | null>(null)
  const [removeRegister, setRemoveRegister] = useState<Register | null>(null)
  const [pairing, setPairing] = useState<Register | null>(null)
  const [tag, setTag] = useState<Branch | null>(null)
  const [unpair, setUnpair] = useState<{ id: string; name: string } | null>(null)
  const owner = me.role === "owner"
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={6} />
  const { branches, registers, devices } = b.data
  return (
    <>
      <PageHeader
        title="Sucursales y cajas"
        description="Cada sucursal tiene su etiqueta NFC para registrar clientes. Cada caja tiene su escáner vinculado."
        actions={
          owner && (
            <Button onClick={() => setBranchForm("new")}>
              <Icon name="plus" size={18} /> Nueva sucursal
            </Button>
          )
        }
      />
      {branches.map((branch) => {
        const own = registers.filter((r) => r.branchId === branch.id)
        return (
          <Card
            key={branch.id}
            title={branch.name}
            description={branch.address || "Sin dirección"}
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={() => setTag(branch)}>
                  <Icon name="nfc" size={16} /> Etiqueta NFC
                </Button>
                {owner && <IconButton icon="edit" label={`Editar ${branch.name}`} onClick={() => setBranchForm(branch)} />}
                {owner && branches.length > 1 && <IconButton icon="trash" label={`Eliminar ${branch.name}`} tone="danger" onClick={() => setRemoveBranch(branch)} />}
              </>
            }
          >
            <div className="ll-list">
              {own.map((register) => {
                const paired = devices.filter((d) => d.registerId === register.id)
                return (
                  <div key={register.id} className="ll-list-item" style={{ alignItems: "flex-start" }}>
                    <Icon name="store" size={20} />
                    <div>
                      <strong>{register.name}</strong>
                      {paired.length ? (
                        paired.map((d) => {
                          const online = Date.now() - new Date(d.lastSeenAt).getTime() < 10 * MINUTE
                          return (
                            <small key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <Badge tone={online ? "success" : "neutral"}>{online ? "En línea" : "Sin señal"}</Badge>
                              {d.name} · visto {relative(d.lastSeenAt)}
                              <button type="button" className="ll-link" style={{ fontSize: 14 }} onClick={() => setUnpair({ id: d.id, name: d.name })}>
                                Desvincular
                              </button>
                            </small>
                          )
                        })
                      ) : (
                        <small>Sin escáner vinculado</small>
                      )}
                    </div>
                    <div className="ll-row" style={{ flex: "none", gap: 4 }}>
                      <Button variant="secondary" size="sm" onClick={() => setPairing(register)}>
                        <Icon name="scan" size={16} /> Vincular escáner
                      </Button>
                      <IconButton icon="edit" label={`Renombrar ${register.name}`} onClick={() => setRegisterForm({ branchId: branch.id, register })} />
                      {own.length > 1 && <IconButton icon="trash" label={`Eliminar ${register.name}`} tone="danger" onClick={() => setRemoveRegister(register)} />}
                    </div>
                  </div>
                )
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRegisterForm({ branchId: branch.id })}>
              <Icon name="plus" size={16} /> Agregar caja
            </Button>
          </Card>
        )
      })}
      {branchForm && <BranchForm branch={branchForm === "new" ? null : branchForm} onClose={() => setBranchForm(null)} />}
      {registerForm && <RegisterForm {...registerForm} onClose={() => setRegisterForm(null)} />}
      {pairing && <PairingModal register={pairing} onClose={() => setPairing(null)} />}
      {tag && <TagModal branch={tag} onClose={() => setTag(null)} />}
      {removeBranch && (
        <RemoveDialog
          title={`¿Eliminar ${removeBranch.name}?`}
          body="Se eliminan también sus cajas y escáneres. Solo se puede si la sucursal no tiene actividad."
          action={() => api.deleteBranch(removeBranch.id)}
          done="Sucursal eliminada."
          onClose={() => setRemoveBranch(null)}
        />
      )}
      {removeRegister && (
        <RemoveDialog
          title={`¿Eliminar ${removeRegister.name}?`}
          body="Se desvinculan sus escáneres. Solo se puede si la caja no tiene actividad."
          action={() => api.deleteRegister(removeRegister.id)}
          done="Caja eliminada."
          onClose={() => setRemoveRegister(null)}
        />
      )}
      {unpair && (
        <RemoveDialog
          title={`¿Desvincular ${unpair.name}?`}
          body="El dispositivo dejará de registrar escaneos de inmediato. Para volver a usarlo, vincúlalo con un código nuevo."
          action={() => api.unpairDevice(unpair.id)}
          done="Escáner desvinculado."
          confirm="Desvincular"
          onClose={() => setUnpair(null)}
        />
      )}
    </>
  )
}

function RemoveDialog({ title, body, action, done, confirm = "Eliminar", onClose }: { title: string; body: string; action: () => Promise<unknown>; done: string; confirm?: string; onClose: () => void }) {
  const { run, pending, error } = useAction(action)
  const toast = useToast()
  return (
    <Confirm
      title={title}
      confirmLabel={confirm}
      tone="danger"
      pending={pending}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        const r = await run()
        if (r.ok) {
          toast(done)
          onClose()
        }
      }}
    >
      <p>{body}</p>
    </Confirm>
  )
}

function BranchForm({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const [name, setName] = useState(branch?.name || "")
  const [address, setAddress] = useState(branch?.address || "")
  const { run, pending, error } = useAction(api.saveBranch)
  const toast = useToast()
  return (
    <Modal
      title={branch ? "Editar sucursal" : "Nueva sucursal"}
      description={branch ? undefined : "Se crea con una caja. Cuenta para tu plan, que se cobra por sucursal."}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="branch-form" loading={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="branch-form"
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await run({ id: branch?.id, name, address })
          if (r.ok) {
            toast(branch ? "Sucursal actualizada." : "Sucursal creada.")
            onClose()
          }
        }}
      >
        <Field label="Nombre" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo: Condesa" />
        <Field label="Dirección" optional value={address} maxLength={140} onChange={(e) => setAddress(e.target.value)} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  )
}

function RegisterForm({ branchId, register, onClose }: { branchId: string; register?: Register; onClose: () => void }) {
  const [name, setName] = useState(register?.name || "")
  const { run, pending, error } = useAction(api.saveRegister)
  const toast = useToast()
  return (
    <Modal
      title={register ? "Renombrar caja" : "Nueva caja"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="register-form" loading={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="register-form"
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await run({ id: register?.id, name, branchId })
          if (r.ok) {
            toast(register ? "Caja actualizada." : "Caja creada.")
            onClose()
          }
        }}
      >
        <Field label="Nombre" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo: Caja 2" />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  )
}

export function PairingModal({ register, onClose }: { register: Register; onClose: () => void }) {
  const { run, pending, error } = useAction(api.createPairingCode)
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [left, setLeft] = useState(0)
  useEffect(() => {
    run(register.id).then((r) => r.ok && setCode(r.value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register.id])
  useEffect(() => {
    if (!code) return
    const tick = () => setLeft(Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [code])
  // The link carries the code: each register gets its own, and it only works once.
  const link = code ? absoluteLink(`/caja/${code.code}`) : ""
  return (
    <Modal title={`Vincular escáner a ${register.name}`} onClose={onClose} footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="ll-stack">
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          En la tablet o computadora de <b>{register.name}</b>, escanea este código con la cámara o abre el enlace. Si ese dispositivo era el escáner de otra caja, queda cambiado a esta.
        </p>
        {pending && !code ? (
          <Loading rows={2} />
        ) : code ? (
          <>
            <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
              <Qr value={link} size={168} label={`Enlace para vincular ${register.name}`} />
            </div>
            <div className="ll-code-box">
              <code>{link}</code>
              <CopyButton text={link} />
            </div>
            <p className="ll-hint" style={{ textAlign: "center", margin: 0 }}>
              O abre {absoluteLink("/caja")} y escribe el código
            </p>
            <div className="ll-big-code" aria-live="polite">{code.code}</div>
          </>
        ) : null}
        {code && (
          <p className="ll-hint" style={{ textAlign: "center" }}>
            {left > 0 ? `Vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "El código venció."}{" "}
            <button type="button" className="ll-link" style={{ fontSize: 14 }} onClick={() => run(register.id).then((r) => r.ok && setCode(r.value))}>
              Generar otro
            </button>
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <p className="ll-hint">Funciona con la cámara del dispositivo o con un lector 2D conectado por USB o Bluetooth, que lea pantallas de celular.</p>
      </div>
    </Modal>
  )
}

function TagModal({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const link = absoluteLink(`/r/${branch.code}`)
  return (
    <Modal title={`Etiqueta NFC de ${branch.name}`} description="Graba este enlace en la etiqueta NFC del mostrador. Al acercar el celular, el cliente abre su registro." onClose={onClose} footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="ll-stack">
        <div className="ll-code-box">
          <code>{link}</code>
          <CopyButton text={link} />
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 15, lineHeight: 1.5 }}>
          <li>Instala en tu celular una app para escribir NFC, como NFC Tools.</li>
          <li>Elige escribir un registro de tipo URL y pega el enlace.</li>
          <li>Acerca la etiqueta y prueba tocándola con otro celular.</li>
        </ol>
        <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
          <Qr value={link} size={180} label={`Código QR para registrarse en ${branch.name}`} />
          <p className="ll-hint" style={{ textAlign: "center" }}>
            Imprime también este QR junto a la etiqueta, para los celulares sin NFC.
          </p>
        </div>
        <a className="ll-link" href={`#/letrero/${branch.code}`} target="_blank" rel="noreferrer">
          Imprimir letrero con QR para el mostrador
        </a>
        <a className="ll-link" href={`#/r/${branch.code}`} target="_blank" rel="noreferrer">
          Abrir el registro de esta sucursal
        </a>
      </div>
    </Modal>
  )
}
