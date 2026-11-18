import { PrismaClient } from '@prisma/client'

// Prisma singleton. In dev we cache on globalThis to avoid exhausting the
// SQLite connection pool when Next.js hot-reloads the module.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
