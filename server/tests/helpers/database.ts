import { execFileSync } from 'node:child_process'

/** The real Prisma CLI, run against `url` when given (tests that need a database of their own). */
export const prismaCli = (args: string[], options: { url?: string; input?: string } = {}) =>
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    input: options.input,
    stdio: 'pipe',
    env: { ...process.env, ...(options.url ? { DATABASE_URL: options.url } : {}) },
  })

/** DATABASE_URL with only the database name changed. */
export const databaseUrl = (name: string) => {
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${name}`
  return url.toString()
}

export const dropDatabase = (name: string) =>
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], {
    input: `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
  })

/** A fresh, fully migrated database. DROP and CREATE DATABASE refuse to share a script, so each is its own call. */
export const createMigratedDatabase = (name: string) => {
  dropDatabase(name)
  prismaCli(['db', 'execute', '--url', databaseUrl('postgres'), '--stdin'], { input: `CREATE DATABASE "${name}"` })
  prismaCli(['migrate', 'deploy'], { url: databaseUrl(name) })
  return databaseUrl(name)
}
