import { Logo } from "../components/ui"
import { PREVIEW } from "../lib/preview"

export default function Legal() {
  return (
    <div style={{ background: "var(--ll-bg)", minHeight: "100vh" }}>
      <header className="ll-legal-head">
        <Logo size={140} />
      </header>
      <article className="ll-legal">
        {PREVIEW && <p className="ll-preview-tag" style={{ width: "max-content" }}>Borrador pendiente de revisión legal</p>}
        <h1>Aviso de privacidad y términos</h1>
        <p>
          LoyaLoop ofrece a los negocios tarjetas de lealtad digitales para Apple Wallet y Google Wallet. Este aviso explica qué datos se usan, para qué y cómo
          puedes ejercer tus derechos.
        </p>

        <h2>Quién es responsable de tus datos</h2>
        <p>
          Cuando te registras en la tarjeta de un negocio, ese negocio es el responsable de tus datos personales. LoyaLoop los trata por cuenta del negocio
          (encargado), solo para operar el programa de lealtad.
        </p>

        <h2>Qué datos usamos</h2>
        <ul>
          <li>Tu nombre o un apodo, para tu tarjeta.</li>
          <li>Tu celular, solo si el negocio lo pide, para confirmar que el número es tuyo.</li>
          <li>Correo (para mandarte tu tarjeta si la pierdes) y fecha de cumpleaños (día y mes), solo si los das.</li>
          <li>Tus compras en el negocio: fecha, sucursal, monto sin propina, puntos o sellos y canjes.</li>
        </ul>
        <p>No recibimos datos de tu tarjeta bancaria. El código QR de tu pase es un identificador aleatorio y no contiene datos personales.</p>

        <h2>Para qué los usamos</h2>
        <ul>
          <li>Sumar y canjear tus puntos, sellos y recompensas.</li>
          <li>Actualizar tu pase y enviarte avisos sobre tu saldo, recompensas, nivel, vencimientos y cumpleaños.</li>
          <li>Promociones del negocio en tu tarjeta, solo si las aceptaste al registrarte.</li>
          <li>Prevenir el uso indebido de las tarjetas.</li>
        </ul>
        <p>No vendemos tus datos ni los compartimos con otros negocios.</p>

        <h2>Tus derechos</h2>
        <p>
          Puedes pedir acceso, corrección, cancelación u oposición al uso de tus datos (derechos ARCO), o borrar tu tarjeta, escribiendo al negocio o a
          privacidad@loyaloop.mx. Respondemos en un máximo de 20 días hábiles. Si eliminas el pase de tu Wallet, tu tarjeta sigue existiendo hasta que pidas
          borrarla.
        </p>

        <h2>Para los negocios</h2>
        <ul>
          <li>El servicio se cobra mensualmente por sucursal activa.</li>
          <li>Los datos de los clientes pertenecen al negocio. Si cancela, puede descargarlos antes de que se eliminen.</li>
          <li>La configuración de la tarjeta y sus reglas la hace LoyaLoop a petición del negocio.</li>
        </ul>

        <h2>Cambios</h2>
        <p>Si este aviso cambia, lo publicaremos en esta página con su fecha de actualización.</p>
        <p className="ll-hint">
          <a className="ll-link" href="#/">
            Volver al inicio
          </a>
        </p>
      </article>
    </div>
  )
}
