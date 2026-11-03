// Maintenance commands:
//   node server/dist/cli.js migrate
//   node server/dist/cli.js create-admin <correo> <nombre>   (ADMIN_PASSWORD opcional)
//   node server/dist/cli.js seed-demo                        (solo en una base vacía)
import { randomBytes } from "node:crypto"
import { createSeed } from "../../src/lib/seed"
import { isEmail, uid } from "../../src/lib/util"
import { createPool, migrate } from "./db"
import { hashPassword } from "./passwords"
import { createPgStore, importAll } from "./pgStore"

const [command, ...args] = process.argv.slice(2)
const url = process.env.DATABASE_URL
if (!url) {
  console.error("Falta DATABASE_URL.")
  process.exit(1)
}
const pool = createPool(url)

try {
  await migrate(pool)
  if (command === "migrate") {
    console.log("Base de datos al día.")
  } else if (command === "create-admin") {
    const [email, ...nameParts] = args
    if (!email || !isEmail(email)) throw new Error("Uso: create-admin <correo> <nombre>")
    const store = createPgStore(pool)
    if (await store.emailTaken(email)) throw new Error("Ya existe una cuenta con ese correo.")
    const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url")
    const user = { id: uid("u_"), name: nameParts.join(" ") || "Administrador", email: email.toLowerCase(), password: await hashPassword(password), role: "admin" as const, excludedFromEarning: false, active: true, createdAt: new Date().toISOString() }
    await store.write("global", (db) => void db.users.push(user))
    console.log(`Administrador creado: ${user.email}`)
    if (!process.env.ADMIN_PASSWORD) console.log(`Contraseña temporal: ${password}  (cámbiala al entrar, en «Mi cuenta»)`)
  } else if (command === "seed-demo") {
    const { rows } = await pool.query("select count(*)::int as n from businesses")
    if (rows[0].n > 0) throw new Error("La base ya tiene negocios. seed-demo solo corre en una base vacía.")
    const db = createSeed()
    for (const u of db.users) u.password = await hashPassword(u.password)
    await importAll(pool, db)
    console.log("Datos de ejemplo cargados (cuentas *.test con las contraseñas de la vista previa).")
  } else {
    console.log("Comandos: migrate · create-admin <correo> <nombre> · seed-demo")
  }
} catch (error) {
  console.error((error as Error).message)
  process.exitCode = 1
} finally {
  await pool.end()
}
