import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

// Fetches the public key from Supabase's JWKS endpoint and caches it.
// Supports both ECC P-256 (ES256) and the legacy HS256 shared secret.
const SUPABASE_URL = process.env.SUPABASE_URL ?? `https://exohyxmvlrvnprriyeet.supabase.co`

const client = jwksClient({
  jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
})

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('JWT missing kid'), undefined)
    return
  }
  client.getSigningKey(header.kid, (err, key) => {
    callback(err, key?.getPublicKey())
  })
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing auth token' })
    return
  }

  const token = authHeader.slice(7)

  // Try JWKS (ES256 / new keys) first; fall back to legacy HS256 shared secret.
  jwt.verify(token, getKey, { algorithms: ['ES256', 'RS256'] }, (err, decoded) => {
    if (!err && decoded) {
      req.userId = (decoded as { sub: string }).sub
      next()
      return
    }

    // Fall back to legacy HS256 shared secret if configured
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      res.status(401).json({ error: 'Invalid auth token' })
      return
    }

    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as { sub: string }
      req.userId = payload.sub
      next()
    } catch {
      res.status(401).json({ error: 'Invalid auth token' })
    }
  })
}
