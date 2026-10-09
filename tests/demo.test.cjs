const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { beforeEach, test } = require("node:test")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

const cache = new Map()
function loadSource(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
  const resolve = (request) => {
    if (!request.startsWith(".")) return require(request)
    const source = path.resolve(path.dirname(file), request)
    const match = [source, `${source}.ts`, `${source}.tsx`].find((candidate) =>
      fs.existsSync(candidate),
    )
    if (!match) throw new Error(`Missing source: ${request}`)
    return loadSource(match)
  }
  new Function("require", "module", "exports", javascript)(
    resolve,
    module,
    module.exports,
  )
  return module.exports
}
let storage
beforeEach(() => {
  storage = new Map()
  global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  global.window = { location: { hash: "#/dashboard" } }
})
const model = loadSource("src/components/demo-model.ts")
const App = loadSource("src/App.tsx").default
const ProductModules = loadSource("src/components/ProductModules.tsx").default

test("all eight public app routes render without a browser or connected service", () => {
  for (const route of [
    "#/",
    "#/login",
    "#/signup",
    "#/owner",
    "#/dashboard",
    "#/registro",
    "#/escaner",
    "#/legal",
  ]) {
    window.location.hash = route
    const html = renderToStaticMarkup(React.createElement(App))
    assert.ok(html.includes("LoyaLoop"), route)
    assert.ok(html.includes("/brand/loyaloop-logo.svg"), route)
  }
})
test("landing has the call request form and no free-trial language", () => {
  window.location.hash = "#/"
  const html = renderToStaticMarkup(React.createElement(App))
  assert.ok(html.includes("Agenda una llamada"))
  assert.ok(html.includes("Solicitar llamada"))
  assert.ok(html.includes('id="agenda"'))
  assert.ok(!/prueba gratis|prueba gratuita|14 días/i.test(html))
  assert.ok(!html.includes("social-proof"))
  assert.ok(!html.includes("hero-assurance"))
})
test("all required business modules and the central administrator controls render", () => {
  for (const section of [
    "Resumen",
    "Clientes",
    "Actividad",
    "Tarjetas de fidelidad",
    "Recompensas",
    "Notificaciones",
    "Sucursales y cajas",
    "Integraciones",
    "Equipo",
    "Configuración",
    "Escáner",
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(ProductModules, { section }),
    )
    assert.ok(
      html.includes("Demostración") || html.includes("demostración"),
      section,
    )
  }
  const admin = renderToStaticMarkup(
    React.createElement(ProductModules, {
      section: "Tarjetas y reglas",
      admin: true,
    }),
  )
  assert.ok(admin.includes("Guardar reglas demo"))
  const business = renderToStaticMarkup(
    React.createElement(ProductModules, { section: "Tarjetas de fidelidad" }),
  )
  assert.ok(!business.includes("Guardar reglas demo"))
  assert.ok(business.includes("Frente") && business.includes("Reverso"))
})
test("all four pass types have a front and back selector", () => {
  for (const type of ["Puntos", "Sellos", "Recompensas", "Niveles"]) {
    const workspace = model.seedWorkspace()
    workspace.program.type = type
    model.saveWorkspace(model.pilotId, workspace)
    const html = renderToStaticMarkup(
      React.createElement(ProductModules, { section: "Tarjetas de fidelidad" }),
    )
    assert.ok(html.includes(type))
    assert.ok(html.includes("Frente") && html.includes("Reverso"))
    assert.ok(html.includes("QR DE MUESTRA"))
  }
})
test("new demo workspaces stay separate and do not overwrite legacy customer data", () => {
  storage.set("ember-customers", '[{"name":"Dato anterior"}]')
  const first = model.seedWorkspace("Negocio A")
  const second = model.seedWorkspace("Negocio B")
  first.customers[0].points = 999
  model.saveWorkspace("a", first)
  model.saveWorkspace("b", second)
  assert.equal(model.loadWorkspace("a").customers[0].points, 999)
  assert.equal(model.loadWorkspace("b").customers[0].points, 420)
  assert.equal(storage.get("ember-customers"), '[{"name":"Dato anterior"}]')
})
test("global demo metrics aggregate saved workspaces only", () => {
  const workspace = model.seedWorkspace()
  workspace.errors.push({
    id: "error",
    provider: "Clip",
    message: "Ejemplo",
    date: new Date().toISOString(),
  })
  model.saveWorkspace("a", workspace)
  assert.deepEqual(model.demoGlobalMetrics(), {
    passes: 2,
    transactions: 1,
    errors: 1,
  })
  assert.equal(model.phoneId("+52 55 5000 0001"), "5550000001")
  assert.ok(model.money(100).includes("100"))
})
function scanFixture() {
  const data = model.seedWorkspace()
  data.program.type = "Puntos"
  data.program.rate = "0.123"
  const scan = {
    token: "scan-example",
    time: Date.now(),
    used: false,
    customerId: data.customers[0].id,
    deviceId: data.devices[0].id,
    online: true,
  }
  return { data, scan }
}
test("sample integrated purchase rounds points down and preserves its audit fields", () => {
  const { data, scan } = scanFixture()
  const result = model.applyDemoScan(data, scan)
  assert.equal(result.next.transactions[0].points, 24)
  assert.equal(result.next.customers[0].points, 444)
  for (const field of ["branch", "register", "device", "date"])
    assert.ok(result.next.transactions[0][field])
  assert.ok(model.applyDemoScan(result.next, scan).error)
})
test("used, expired, future, offline, invalid and unpaired scans never create activity", () => {
  const { data, scan } = scanFixture()
  for (const change of [
    { used: true },
    { time: Date.now() - 300001 },
    { time: Date.now() + 60000 },
    { online: false },
    { customerId: "invalid" },
    { deviceId: "unpaired" },
  ]) {
    const result = model.applyDemoScan(data, { ...scan, ...change })
    assert.ok(result.error)
    assert.ok(!result.next)
  }
})
test("daily limits, excluded employees, undefined rates and minimum spend are respected", () => {
  const { data, scan } = scanFixture()
  data.program.dailyLimit = "1"
  assert.ok(model.applyDemoScan(data, scan).error)
  data.program.dailyLimit = ""
  data.team.push({
    id: "employee",
    name: "Empleado demo",
    phone: data.customers[0].phone,
    role: "Cajero",
    excluded: true,
  })
  assert.ok(model.applyDemoScan(data, scan).error)
  data.team = []
  data.program.rate = ""
  assert.ok(model.applyDemoScan(data, scan).error)
  data.program.rate = "1"
  data.program.minimum = "201"
  assert.equal(model.applyDemoScan(data, scan).next.transactions[0].points, 0)
})
test("stamp completion grants a local reward, resets the card and allows one earned redemption", () => {
  const { data, scan } = scanFixture()
  data.program.type = "Sellos"
  data.program.stampGoal = "6"
  data.program.stampReward = data.rewards[0].id
  const completed = model.applyDemoScan(data, scan).next
  assert.equal(completed.customers[0].stamps, 0)
  assert.deepEqual(completed.customers[0].earnedRewards, [data.rewards[0].id])
  const redeemed = model.applyDemoScan(completed, {
    ...scan,
    token: "second-scan",
    rewardId: data.rewards[0].id,
  }).next
  assert.deepEqual(redeemed.customers[0].earnedRewards, [])
  assert.equal(redeemed.transactions[0].type, "Canje")
  assert.equal(redeemed.transactions[0].points, 0)
})
test("point redemptions cannot create negative balances", () => {
  const { data, scan } = scanFixture()
  data.customers[0].points = 10
  const result = model.applyDemoScan(data, {
    ...scan,
    rewardId: data.rewards[0].id,
  })
  assert.ok(result.error)
  assert.ok(!result.next)
})
test("invalid local storage is not silently overwritten", () => {
  for (const raw of ["{invalid", "[]", "null", "42"]) {
    storage.set(model.DEMO_KEY, raw)
    assert.throws(() => model.saveWorkspace("a", model.seedWorkspace()))
    assert.equal(storage.get(model.DEMO_KEY), raw)
  }
})
test("CSV download preserves escaping and neutralizes spreadsheet formulas", async () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalDocument = global.document
  let blob,
    clicked = false
  const anchor = {
    click() {
      clicked = true
    },
  }
  try {
    URL.createObjectURL = (value) => {
      blob = value
      return "blob:demo"
    }
    URL.revokeObjectURL = () => {}
    global.document = {
      createElement() {
        return anchor
      },
    }
    const customer = {
      ...model.seedWorkspace().customers[0],
      name: '=SUM(1,2)"',
    }
    model.downloadCustomers([customer])
    const csv = await blob.text()
    assert.ok(csv.includes('"\'=SUM(1,2)"""'))
    assert.ok(clicked)
    assert.equal(anchor.download, "clientes-loyaloop-demo.csv")
  } finally {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    if (originalDocument === undefined) delete global.document
    else global.document = originalDocument
  }
})
