import { useEffect, useState } from "react"

/** Hash routing works on any static host and inside the preview. */
export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/"
  const [path, search = ""] = raw.split("?")
  const clean = path.startsWith("/") ? path : `/${path}`
  return { path: clean, parts: clean.split("/").filter(Boolean), query: new URLSearchParams(search) }
}

export function currentRoute(): Route {
  return parse(typeof window === "undefined" ? "" : window.location.hash)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const update = () => setRoute(currentRoute())
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])
  return route
}

export function navigate(path: string, options: { replace?: boolean; keepScroll?: boolean } = {}) {
  const target = `#${path.startsWith("/") ? path : `/${path}`}`
  if (options.replace) window.location.replace(target)
  else window.location.hash = target
  if (!options.keepScroll) window.scrollTo(0, 0)
}

export function href(path: string): string {
  return `#${path.startsWith("/") ? path : `/${path}`}`
}

/** Absolute link to share (NFC tags, invitations). */
export function absoluteLink(hashPath: string): string {
  const base = window.location.href.split("#")[0]
  return `${base}${hashPath.startsWith("#") ? hashPath : href(hashPath)}`
}
