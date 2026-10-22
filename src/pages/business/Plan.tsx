import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api";
import { useAction, useAsync } from "../../lib/hooks";
import { date, isEmail, money } from "../../lib/util";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Icon,
  Loading,
  Modal,
  Notice,
  PageHeader,
} from "../../components/ui";

type Plan = Awaited<ReturnType<typeof api.billing>>;

const STATUS: Record<
  string,
  { label: string; tone: "success" | "warning" | "info" | "neutral" }
> = {
  active: { label: "Activa", tone: "success" },
  trial: { label: "En prueba", tone: "info" },
  pending: { label: "Por activar", tone: "warning" },
  paused: { label: "Pausada", tone: "warning" },
};

/** #/panel/plan: the owner's plan, the automatic monthly charge and its history. */
export default function PlanPage({ returning }: { returning: boolean }) {
  const plan = useAsync(api.billing);
  const refreshed = useRef(false);
  const [checking, setChecking] = useState(returning);

  // Back from Mercado Pago, or waiting for the card: read the subscription again.
  useEffect(() => {
    if (refreshed.current || !plan.data) return;
    if (!returning && plan.data.billing?.status !== "pending") return;
    refreshed.current = true;
    setChecking(true);
    api
      .refreshBilling()
      .catch(() => undefined)
      .finally(() => {
        setChecking(false);
        plan.reload();
      });
  }, [plan.data, returning, plan]);

  if (plan.error)
    return <ErrorState message={plan.error} retry={plan.reload} />;
  if (!plan.data) return <Loading rows={4} />;
  const p = plan.data;
  const status = STATUS[p.status] || STATUS.active;
  return (
    <>
      <PageHeader
        title="Plan y pagos"
        description={
          p.available
            ? "Tu plan, tu pago automático con Mercado Pago y los cobros de cada mes."
            : "Tu plan y cómo pagarlo."
        }
      />
      {checking && (
        <Notice tone="info">Revisando tu pago con Mercado Pago…</Notice>
      )}
      <div className="ll-split">
        <div className="ll-stack">
          <Card title="Tu plan">
            <div className="ll-plan-summary">
              <div>
                <span className="ll-plan-name">
                  {p.plan === "starter" ? "Starter" : "Pro"}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              <strong>
                {money(p.amount)} <span>al mes</span>
              </strong>
              <p className="ll-hint">
                {p.custom
                  ? "Precio acordado con LoyaLoop."
                  : p.plan === "starter"
                    ? "Tarjeta de sellos, 1 sucursal y clientes ilimitados."
                    : `Puntos automáticos desde tu terminal, ${p.branches === 1 ? "1 sucursal" : `${p.branches} sucursales (cada adicional $250)`} y clientes ilimitados.`}
              </p>
            </div>
          </Card>
          <Payment plan={p} onChange={plan.reload} />
        </div>
        {p.available && (
          <Card title="Cobros">
            {p.charges.length ? (
              <ul className="ll-list">
                {p.charges.map((c) => (
                  <li
                    key={c.id}
                    className="ll-list-item"
                    style={{ justifyContent: "space-between" }}
                  >
                    <div>
                      <strong>{money(c.amount)}</strong>
                      <small style={{ display: "block" }} className="ll-hint">
                        {date(c.at)}
                      </small>
                    </div>
                    <Badge
                      tone={
                        c.status === "approved"
                          ? "success"
                          : c.status === "rejected"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {c.status === "approved"
                        ? "Pagado"
                        : c.status === "rejected"
                          ? "Rechazado"
                          : "En proceso"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ll-hint">
                {p.billing?.lastChargeAt
                  ? `Último cobro: ${date(p.billing.lastChargeAt)}.`
                  : "Aún no hay cobros."}
              </p>
            )}
            <p className="ll-hint" style={{ marginTop: 12 }}>
              Mercado Pago te manda el comprobante de cada cobro por correo.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function Payment({ plan, onChange }: { plan: Plan; onChange: () => void }) {
  const billing = plan.billing;
  const [email, setEmail] = useState(billing?.payerEmail || plan.ownerEmail);
  const [confirm, setConfirm] = useState(false);
  const start = useAction(api.startSubscription);
  const cancel = useAction(api.cancelSubscription);

  if (!plan.available) {
    const subject = encodeURIComponent(
      `Pago de mi plan ${plan.plan === "starter" ? "Starter" : "Pro"}`,
    );
    return (
      <Card title="Cómo pagar">
        <div className="ll-stack">
          <p className="ll-hint">
            Por ahora el pago es por transferencia. Escríbenos y te mandamos los
            datos;{" "}
            {plan.status === "active"
              ? "tu plan sigue igual cada mes"
              : "activamos tu tarjeta en cuanto lo recibamos"}
            .
          </p>
          <div className="ll-row">
            <a
              className="button ll-btn ll-btn-primary ll-btn-md"
              href={`mailto:hola@loyaloop.com.mx?subject=${subject}`}
            >
              <Icon name="mail" size={16} /> Consultar cómo pagar
            </a>
          </div>
          <p className="ll-hint">hola@loyaloop.com.mx</p>
        </div>
      </Card>
    );
  }

  if (billing?.status === "authorized")
    return (
      <Card title="Pago automático">
        <div className="ll-stack">
          <Notice tone="success" icon="check" title="Activo">
            Se cobran {money(billing.amount)} cada mes a la tarjeta que
            registraste en Mercado Pago ({billing.payerEmail}).
            {billing.nextChargeAt
              ? ` Próximo cobro: ${date(billing.nextChargeAt)}.`
              : ""}
          </Notice>
          <p className="ll-hint">
            Para cambiar de tarjeta, entra a tu cuenta de Mercado Pago, en
            «Suscripciones».
          </p>
          <div className="ll-row">
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              Cancelar pago automático
            </Button>
          </div>
        </div>
        {confirm && (
          <Modal
            title="¿Cancelar tu pago automático?"
            description={
              billing.paidUntil
                ? `Ya no se cobrará el siguiente mes. Tu tarjeta de lealtad sigue funcionando hasta el ${date(billing.paidUntil)}.`
                : "Ya no se cobrará el siguiente mes."
            }
            onClose={() => setConfirm(false)}
            size="sm"
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirm(false)}>
                  Volver
                </Button>
                <Button
                  variant="danger"
                  loading={cancel.pending}
                  onClick={async () => {
                    const r = await cancel.run();
                    if (r.ok) {
                      setConfirm(false);
                      onChange();
                    }
                  }}
                >
                  Cancelar pago
                </Button>
              </>
            }
          >
            {cancel.error && <p className="ll-field-error">{cancel.error}</p>}
          </Modal>
        )}
      </Card>
    );

  const covered =
    billing?.paidUntil && new Date(billing.paidUntil).getTime() > Date.now();
  return (
    <Card title="Pago automático">
      <form
        className="ll-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!isEmail(email))
            return start.setError(
              "Escribe el correo de tu cuenta de Mercado Pago.",
            );
          const r = await start.run(email.trim());
          if (r.ok) window.location.href = r.value.url;
        }}
      >
        {billing?.status === "cancelled" && (
          <Notice tone="info">
            Cancelaste tu pago automático.
            {covered
              ? ` Tu tarjeta funciona hasta el ${date(billing.paidUntil!)}.`
              : ""}
          </Notice>
        )}
        {billing?.status === "pending" && (
          <Notice tone="warning">
            Aún no terminas el pago en Mercado Pago. Vuelve a intentarlo cuando
            quieras.
          </Notice>
        )}
        <p className="ll-hint">
          Pagas con tarjeta de crédito o débito desde Mercado Pago. Se cobran{" "}
          <b>{money(plan.amount)}</b> hoy y después cada mes, el mismo día. Lo
          cancelas cuando quieras.
        </p>
        <Field
          label="Correo de tu cuenta de Mercado Pago"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint="Debe ser el correo con el que entras a Mercado Pago."
          error={start.error || undefined}
        />
        <div className="ll-row">
          <Button type="submit" loading={start.pending}>
            {billing?.status === "cancelled" || plan.status === "active"
              ? "Activar pago automático"
              : "Pagar y activar mi tarjeta"}{" "}
            <Icon name="external" size={16} />
          </Button>
        </div>
      </form>
    </Card>
  );
}
