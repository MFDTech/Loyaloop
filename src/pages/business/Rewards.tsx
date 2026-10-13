import { useState } from "react"
import * as api from "../../lib/api"
import { useAction, useAsync } from "../../lib/hooks"
import type { Reward } from "../../lib/types"
import { int } from "../../lib/util"
import { Badge, Button, Card, Check, Confirm, Empty, ErrorState, Field, Icon, IconButton, Loading, Modal, Notice, PageHeader, TextArea, useToast } from "../../components/ui"

export default function Rewards() {
  const b = useAsync(api.bundle)
  const [editing, setEditing] = useState<Reward | "new" | null>(null)
  const [removing, setRemoving] = useState<Reward | null>(null)
  if (b.error) return <ErrorState message={b.error} retry={b.reload} />
  if (!b.data) return <Loading rows={5} />
  const { rewards, program } = b.data
  const points = program.type !== "stamps"
  return (
    <>
      <PageHeader
        title="Recompensas"
        description={points ? "Lo que tus clientes pueden canjear con sus puntos. Se canjean en caja escaneando el mismo QR." : "Lo que tus clientes reciben al completar su tarjeta de sellos."}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Icon name="plus" size={18} /> Nueva recompensa
          </Button>
        }
      />
      {!rewards.length ? (
        <Card>
          <Empty icon="gift" title="Aún no tienes recompensas" action={<Button onClick={() => setEditing("new")}>Crear la primera</Button>}>
            {points ? "Define qué pueden canjear tus clientes y cuántos puntos cuesta." : "Define qué recibe el cliente al completar sus sellos."}
          </Empty>
        </Card>
      ) : (
        <div className="ll-grid-3">
          {rewards.map((r) => (
            <Card
              key={r.id}
              title={r.name}
              description={r.description || undefined}
              actions={
                <>
                  <IconButton icon="edit" label={`Editar ${r.name}`} onClick={() => setEditing(r)} />
                  <IconButton icon="trash" label={`Eliminar ${r.name}`} tone="danger" onClick={() => setRemoving(r)} />
                </>
              }
            >
              <div className="ll-row">
                {points ? <Badge tone="brand">{int(r.cost)} puntos</Badge> : program.stampRewardId === r.id ? <Badge tone="brand">Al completar {program.stampGoal} sellos</Badge> : <Badge>Sin asignar a la tarjeta</Badge>}
                <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Disponible" : "Pausada"}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <RewardForm reward={editing === "new" ? null : editing} points={points} onClose={() => setEditing(null)} />}
      {removing && <RemoveReward reward={removing} onClose={() => setRemoving(null)} />}
    </>
  )
}

function RewardForm({ reward, points, onClose }: { reward: Reward | null; points: boolean; onClose: () => void }) {
  const [name, setName] = useState(reward?.name || "")
  const [description, setDescription] = useState(reward?.description || "")
  const [cost, setCost] = useState(reward ? String(reward.cost) : "")
  const [active, setActive] = useState(reward?.active ?? true)
  const { run, pending, error } = useAction(api.saveReward)
  const toast = useToast()
  return (
    <Modal
      title={reward ? "Editar recompensa" : "Nueva recompensa"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reward-form" loading={pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="reward-form"
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const r = await run({ id: reward?.id, name, description, cost: points ? Number(cost) : 0, active })
          if (r.ok) {
            toast(reward ? "Recompensa actualizada." : "Recompensa creada.")
            onClose()
          }
        }}
      >
        <Field label="Nombre" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo: Hora extra" />
        <TextArea label="Condiciones" optional hint="Lo verá el cliente en el reverso de su tarjeta." value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} />
        {points && <Field label="Costo en puntos" type="number" inputMode="numeric" min={1} step={1} value={cost} onChange={(e) => setCost(e.target.value)} />}
        <Check label="Disponible para canjear" hint="Puedes pausarla sin borrarla." checked={active} onChange={setActive} />
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  )
}

function RemoveReward({ reward, onClose }: { reward: Reward; onClose: () => void }) {
  const { run, pending, error } = useAction(api.deleteReward)
  const toast = useToast()
  return (
    <Confirm
      title={`¿Eliminar ${reward.name}?`}
      confirmLabel="Eliminar"
      tone="danger"
      pending={pending}
      error={error}
      onClose={onClose}
      onConfirm={async () => {
        const r = await run(reward.id)
        if (r.ok) {
          toast("Recompensa eliminada.")
          onClose()
        }
      }}
    >
      <p>Los canjes que ya se hicieron se conservan en el historial.</p>
    </Confirm>
  )
}
