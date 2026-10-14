import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"

const BASE = import.meta.env.BASE_URL || "./"
export const asset = (path: string) => `${BASE}${path.replace(/^\//, "")}`

// ---------------------------------------------------------------- icons

const paths = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  back: <path d="M20 12H4M10 6l-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />,
  coffee: <path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM17 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3M2 22h18" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  chart: <path d="M4 3v17h17M8 15l4-5 4 2 5-7" />,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 0 1 16 0v1" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  settings: <><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>,
  logout: <path d="M9 3H4v18h5M9 12h12m-4-4 4 4-4 4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  store: <><path d="M3 9 5 4h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" /><path d="M5 13v7h14v-7M10 20v-5h4v5" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 8h-5a3 3 0 0 0 0 6h5Z" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16Zm9-13 4 4" />,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 21h16" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="13" r="4" /></>,
  wifiOff: <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5M12 20h.01" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></>,
  building: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20" /><path d="M8 7h4M8 11h4M8 15h4" /></>,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  layers: <><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  nfc: <><path d="M6 8.3a6 6 0 0 1 0 7.4M9.5 6a10 10 0 0 1 0 12M13 4a14 14 0 0 1 0 16" /><path d="M17 3a18 18 0 0 1 0 18" /></>,
  play: <path d="M7 4v16l13-8Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z" />,
  login: <path d="M15 3h5v18h-5M3 12h12m-4-4 4 4-4 4" />,
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 20, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {paths[name]}
    </svg>
  )
}

export function Logo({ light = false, to = "#/", size }: { light?: boolean; to?: string; size?: number }) {
  return (
    <a href={to} className={`logo ${light ? "logo-light" : ""}`} aria-label="LoyaLoop, ir al inicio">
      <img src={asset("brand/loyaloop-logo.svg")} alt="LoyaLoop" className="brand-logo" style={size ? { width: size, minWidth: 0 } : undefined} />
    </a>
  )
}

export function Symbol({ size = 28 }: { size?: number }) {
  return <img src={asset("brand/loyaloop-symbol.svg")} alt="" width={size} height={size} style={{ width: size, height: "auto" }} />
}

// ---------------------------------------------------------------- buttons

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  children: ReactNode
  secondary?: boolean
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark"
  size?: "md" | "sm" | "lg"
  loading?: boolean
  block?: boolean
  onClick?: () => void
}

export function Button({ children, secondary, variant, size = "md", loading, block, className = "", type = "button", disabled, onClick, ...rest }: ButtonProps) {
  const v = variant || (secondary ? "secondary" : "primary")
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`button ll-btn ll-btn-${v} ll-btn-${size} ${block ? "ll-btn-block" : ""} ${v === "secondary" ? "button-secondary" : ""} ${className}`}
      {...rest}
    >
      {loading && <span className="ll-spinner" aria-hidden />}
      {children}
    </button>
  )
}

export function IconButton({ icon, label, onClick, tone = "default", disabled }: { icon: IconName; label: string; onClick: () => void; tone?: "default" | "danger"; disabled?: boolean }) {
  return (
    <button type="button" className={`ll-icon-btn ${tone === "danger" ? "is-danger" : ""}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <Icon name={icon} size={18} />
    </button>
  )
}

// ---------------------------------------------------------------- form fields

interface FieldShell {
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
}

export function Field({ label, hint, error, optional, className = "", ...input }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={`ll-field ${className}`}>
      <label htmlFor={input.id || id}>
        {label}
        {optional && <span className="ll-optional"> (opcional)</span>}
      </label>
      <input id={input.id || id} aria-invalid={!!error || undefined} aria-describedby={hint || error ? `${id}-help` : undefined} {...input} />
      {(error || hint) && (
        <p id={`${id}-help`} className={error ? "ll-field-error" : "ll-field-hint"}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export function SelectField({ label, hint, error, optional, children, className = "", ...select }: FieldShell & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId()
  return (
    <div className={`ll-field ${className}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="ll-optional"> (opcional)</span>}
      </label>
      <select id={id} {...select}>
        {children}
      </select>
      {(error || hint) && <p className={error ? "ll-field-error" : "ll-field-hint"}>{error || hint}</p>}
    </div>
  )
}

export function TextArea({ label, hint, error, optional, className = "", ...area }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className={`ll-field ${className}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="ll-optional"> (opcional)</span>}
      </label>
      <textarea id={id} {...area} />
      {(error || hint) && <p className={error ? "ll-field-error" : "ll-field-hint"}>{error || hint}</p>}
    </div>
  )
}

export function Check({ label, hint, checked, onChange, disabled, name, required }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; name?: string; required?: boolean }) {
  return (
    <label className={`ll-check ${disabled ? "is-disabled" : ""}`}>
      <input type="checkbox" name={name} checked={checked} disabled={disabled} required={required} onChange={(e) => onChange(e.target.checked)} />
      <span className="ll-check-box" aria-hidden>
        <Icon name="check" size={14} />
      </span>
      <span className="ll-check-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="ll-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- feedback

export function Notice({ tone = "info", title, children, icon }: { tone?: "info" | "warning" | "error" | "success"; title?: string; children?: ReactNode; icon?: IconName }) {
  const fallback: Record<string, IconName> = { info: "info", warning: "alert", error: "alert", success: "check" }
  return (
    <div className={`ll-notice ll-notice-${tone}`} role={tone === "error" ? "alert" : undefined}>
      <Icon name={icon || fallback[tone]} size={20} />
      <div>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon = "search", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ll-empty">
      <span className="ll-empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = "Cargando…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="ll-loading" role="status" aria-live="polite">
      <span className="ll-sr">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="ll-skeleton" style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  )
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="ll-error-state" role="alert">
      <Icon name="alert" size={24} />
      <div>
        <strong>No pudimos cargar esta información.</strong>
        <p>{message}</p>
      </div>
      {retry && (
        <Button variant="secondary" size="sm" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "brand" | "info"; children: ReactNode }) {
  return <span className={`ll-badge ll-badge-${tone}`}>{children}</span>
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number
  message: string
  tone: "success" | "error" | "info"
}
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ll-toasts" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ll-toast ll-toast-${toast.tone}`}>
            <Icon name={toast.tone === "error" ? "alert" : toast.tone === "info" ? "info" : "check"} size={18} />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------- dialogs

export function Modal({ title, description, children, onClose, size = "md", footer }: { title: string; description?: ReactNode; children: ReactNode; onClose: () => void; size?: "sm" | "md" | "lg"; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') || [])
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") || focusables().find((el) => el.tagName !== "BUTTON" || !el.classList.contains("ll-modal-close"))
    first?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current()
      if (event.key !== "Tab") return
      const items = focusables()
      if (!items.length) return
      const firstItem = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
      previous?.focus({ preventScroll: true })
    }
  }, [])
  return (
    <div className="ll-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`ll-modal ll-modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ll-modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="ll-modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="ll-modal-body">{children}</div>
        {footer && <footer className="ll-modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Confirm({ title, children, confirmLabel, tone = "primary", onConfirm, onClose, pending, error }: { title: string; children: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; onConfirm: () => void; onClose: () => void; pending?: boolean; error?: string }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={pending} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ll-confirm-body">{children}</div>
      {error && <p className="ll-field-error">{error}</p>}
    </Modal>
  )
}

// ---------------------------------------------------------------- layout helpers

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ll-page-header">
      <div>
        {eyebrow && <span className="ll-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ll-page-actions">{actions}</div>}
    </div>
  )
}

export function Card({ title, description, actions, children, className = "", padded = true }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`ll-card ${padded ? "" : "ll-card-flush"} ${className}`}>
      {(title || actions) && (
        <header className="ll-card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="ll-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, detail, icon, trend }: { label: string; value: ReactNode; detail?: ReactNode; icon?: IconName; trend?: { value: number; label: string } }) {
  return (
    <article className="ll-stat">
      <div className="ll-stat-top">
        <span>{label}</span>
        {icon && (
          <span className="ll-stat-icon">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <strong>{value}</strong>
      {trend && Number.isFinite(trend.value) ? (
        <small className={trend.value >= 0 ? "is-up" : "is-down"}>
          <span>
            {trend.value >= 0 ? "↑" : "↓"} {Math.abs(Math.round(trend.value * 100))} %
          </span>{" "}
          {trend.label}
        </small>
      ) : (
        detail && <small>{detail}</small>
      )}
    </article>
  )
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: string; count?: number }[]; onChange: (value: T) => void }) {
  return (
    <div className="ll-tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.value} type="button" role="tab" aria-selected={value === tab.value} className={value === tab.value ? "is-active" : ""} onClick={() => onChange(tab.value)}>
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && <span className="ll-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Pagination({ page, pages, onChange, total, label }: { page: number; pages: number; onChange: (page: number) => void; total: number; label: string }) {
  if (pages <= 1) return <p className="ll-table-foot">{total} {label}</p>
  return (
    <div className="ll-pagination">
      <p className="ll-table-foot">
        {total} {label} · página {page} de {pages}
      </p>
      <div>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  )
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  const toast = useToast()
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        } catch {
          toast("No se pudo copiar. Selecciona el texto y cópialo.", "error")
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={16} />
      {done ? "Copiado" : label}
    </Button>
  )
}

export default Button
