import { useEffect, useState } from "react"
import * as api from "../lib/api"
import { DEMO_CODE } from "../lib/seed"
import { inkFor } from "../lib/util"
import { Button, Loading, Notice, asset } from "../components/ui"
import { Done } from "./Registration"

const KEY = "ll_demo_card"

function remembered(): string {
  try {
    return localStorage.getItem(KEY) || ""
  } catch {
    return ""
  }
}

/** #/demo: a LoyaLoop card for prospects, ready for the Wallet with no form. */
export default function DemoCard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.demoCard>> | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError("")
    api
      .demoCard(remembered())
      .then((r) => {
        if (!alive) return
        setData(r)
        try {
          localStorage.setItem(KEY, r.holder.token)
        } catch {
          /* private mode: a new card next time */
        }
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [attempt])

  const color = data?.card.brand.color || "#8A2E12"
  const { ink } = inkFor(color)
  return (
    <div className="ll-reg" style={{ ["--reg-color" as string]: color, ["--reg-ink" as string]: ink }}>
      <header className="ll-reg-hero">
        <div className="ll-reg-logo">
          <img src={asset("/brand/loyaloop-symbol.svg")} alt="" />
        </div>
        <h1>Tu tarjeta LoyaLoop</h1>
        <p>Tarjeta de demostración</p>
      </header>
      <main className="ll-reg-body">
        <div className="ll-reg-card">
          {error ? (
            <div className="ll-stack" style={{ gap: 14 }}>
              <Notice tone="error">{error}</Notice>
              <Button onClick={() => setAttempt((n) => n + 1)}>Intentar otra vez</Button>
            </div>
          ) : data ? (
            <Done card={data.card} holder={data.holder} links={data.links} code={DEMO_CODE} />
          ) : (
            <Loading />
          )}
        </div>
        <footer className="ll-reg-foot">
          <a className="ll-link" href="#/" style={{ fontSize: 14 }}>
            Conoce LoyaLoop
          </a>
        </footer>
      </main>
    </div>
  )
}
