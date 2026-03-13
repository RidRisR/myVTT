// server/middleware.ts — Express middleware for room DB injection and role checking
import type { Request, Response, NextFunction } from 'express'
import type Database from 'better-sqlite3'
import { getRoomDb } from './db'

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      roomDb?: Database.Database
      roomId?: string
      userId?: string
      role?: 'GM' | 'PL'
    }
  }
}

/**
 * Middleware factory: injects `req.roomDb` and `req.roomId` for routes with :roomId param.
 * Also validates room ID format.
 */
export function withRoom(dataDir: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roomId = req.params.roomId
    if (!roomId || !/^[a-zA-Z0-9_-]{1,64}$/.test(roomId)) {
      res.status(400).json({ error: 'Invalid room ID' })
      return
    }
    try {
      req.roomDb = getRoomDb(dataDir, roomId)
      req.roomId = roomId
      next()
    } catch (err) {
      res.status(500).json({ error: 'Failed to open room database' })
    }
  }
}

/**
 * Middleware: requires role from socket auth data.
 * For now, reads from query params (TODO: JWT after doc 53 identity system).
 */
export function withRole(req: Request, res: Response, next: NextFunction): void {
  // TODO: [S1] Replace with JWT-based role extraction (see doc 53)
  // For now, role can be passed via query or header
  const role = (req.headers['x-myvtt-role'] as string) || (req.query.role as string)
  if (role === 'GM' || role === 'PL') {
    req.role = role
  }
  next()
}
