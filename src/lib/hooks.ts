import { useCallback, useEffect, useRef, useState } from "react"
import { subscribe } from "./api"

export interface Async<T> {
  data: T | undefined
  error: string
  loading: boolean
  reload: () => void
}

/**
 * Loads data through the API and reloads whenever the data changes
 * (in this tab or another one).
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const loader = useRef(load)
  loader.current = load
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
  useEffect(() => {
    let alive = true
    setLoading(true)
    loader
      .current()
      .then((value) => {
        if (!alive) return
        setData(value)
        setError("")
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, loading, reload }
}

export type Result<R> = { ok: true; value: R } | { ok: false; error: string }

/** Runs an action and tracks its pending and error state. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const run = useCallback(
    async (...args: A): Promise<Result<R>> => {
      setPending(true)
      setError("")
      try {
        return { ok: true, value: await action(...args) }
      } catch (e) {
        const message = (e as Error).message
        setError(message)
        return { ok: false, error: message }
      } finally {
        setPending(false)
      }
    },
    [action],
  )
  return { run, pending, error, setError }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])
  return online
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatch(list.matches)
    list.addEventListener("change", update)
    return () => list.removeEventListener("change", update)
  }, [query])
  return match
}
