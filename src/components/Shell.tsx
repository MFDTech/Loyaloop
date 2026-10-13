import { useEffect, useState, type ReactNode } from "react"
import * as api from "../lib/api"
import type { Me } from "../lib/api"
import { href, navigate } from "../lib/router"
import { initials, roleLabel } from "../lib/util"
import { Icon, Logo, type IconName } from "./ui"

export interface NavItem {
  path: string
  label: string
  icon: IconName
  badge?: number
}

export default function Shell({ me, nav, current, workspace, children }: { me: Me; nav: NavItem[]; current: string; workspace: { name: string; detail: string; icon: IconName }; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [current])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])
  const active =
    nav.find((item) => current === item.path) ||
    nav.filter((item) => current.startsWith(item.path + "/")).sort((a, b) => b.path.length - a.path.length)[0] ||
    nav[0]
  return (
    <div className={`ll-shell ${open ? "is-open" : ""}`}>
      {me.impersonating && (
        <div className="ll-impersonation" role="status">
          <Icon name="eye" size={18} />
          <span>
            Estás dentro de la cuenta de <b>{me.business?.name}</b>. Cada cambio queda registrado a tu nombre.
          </span>
          <button
            type="button"
            onClick={async () => {
              const id = me.business?.id
              await api.stopImpersonating()
              navigate(id ? `/admin/negocios/${id}` : "/admin")
            }}
          >
            Volver a mi panel
          </button>
        </div>
      )}
      <aside className="ll-sidebar" aria-label="Menú principal">
        <div className="ll-sidebar-logo">
          <Logo to={href(nav[0].path)} size={150} />
        </div>
        <div className="ll-workspace">
          <span className="ll-workspace-icon">
            {me.business?.brand.logo ? <img src={me.business.brand.logo} alt="" /> : <Icon name={workspace.icon} size={18} />}
          </span>
          <span>
            <strong>{workspace.name}</strong>
            <small>{workspace.detail}</small>
          </span>
        </div>
        <nav className="ll-nav">
          {nav.map((item) => (
            <a key={item.path} href={href(item.path)} className={item === active ? "is-active" : ""} aria-current={item === active ? "page" : undefined}>
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {!!item.badge && <span className="ll-nav-badge">{item.badge}</span>}
            </a>
          ))}
        </nav>
        <div className="ll-sidebar-user">
          <span className="ll-avatar">{initials(me.user.name)}</span>
          <span>
            <strong>{me.user.name}</strong>
            <small>{me.impersonating ? "Administrador LoyaLoop" : roleLabel[me.role]}</small>
          </span>
          <button
            type="button"
            className="ll-icon-btn"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={async () => {
              await api.logout()
              navigate("/login")
            }}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <button type="button" className="ll-scrim" aria-label="Cerrar menú" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
      <div className="ll-main">
        <header className="ll-topbar">
          <button type="button" className="ll-menu-btn" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon name="menu" size={22} />
          </button>
          <span className="ll-crumb">
            <span className="ll-crumb-root">{workspace.name}</span>
            <Icon name="chevron" size={14} />
            <strong>{active.label}</strong>
          </span>
        </header>
        <main className="ll-content" id="contenido">
          {children}
        </main>
      </div>
    </div>
  )
}
