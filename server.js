import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const webOrigin = process.env.WEB_ORIGIN || `http://localhost:${port}`;
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to at least 32 characters.');
}

const database = new DatabaseSync(path.join(__dirname, 'reclaim.sqlite'));
database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reclaimed INTEGER NOT NULL DEFAULT 0 CHECK (reclaimed BETWEEN 0 AND 60),
    coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
    challenge_minutes INTEGER NOT NULL DEFAULT 0 CHECK (challenge_minutes BETWEEN 0 AND 20),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT,
    access_token TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
  );
`);

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: webOrigin, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

function issueSession(userId) {
  return jwt.sign({ sub: String(userId), type: 'session' }, sessionSecret, { expiresIn: '7d' });
}

function setSessionCookie(response, token) {
  response.cookie('reclaim_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function requireAuth(request, response, next) {
  const token = request.cookies.reclaim_session;
  if (!token) return response.status(401).json({ error: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, sessionSecret);
    if (payload.type !== 'session') throw new Error('Invalid token type');
    request.userId = Number(payload.sub);
    return next();
  } catch {
    return response.status(401).json({ error: 'Session expired or invalid.' });
  }
}

function rejectUnexpectedOrigin(request, response, next) {
  const origin = request.get('origin');
  if (origin && origin !== webOrigin) return response.status(403).json({ error: 'Origin not allowed.' });
  return next();
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
});
const progressSchema = z.object({
  reclaimed: z.number().int().min(0).max(60),
  coins: z.number().int().min(0).max(1_000_000),
  challengeMinutes: z.number().int().min(0).max(20)
}).strict();

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

app.post('/api/auth/register', authLimiter, rejectUnexpectedOrigin, async (request, response, next) => {
  try {
    const { email, password } = credentialsSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(password, 12);
    database.exec('BEGIN');
    try {
      const result = database.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), passwordHash);
      database.prepare('INSERT INTO progress (user_id, reclaimed, coins, challenge_minutes) VALUES (?, 42, 184, 12)').run(result.lastInsertRowid);
      database.exec('COMMIT');
      const userId = Number(result.lastInsertRowid);
      setSessionCookie(response, issueSession(userId));
      return response.status(201).json({ user: { id: userId, email: email.toLowerCase() } });
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'An account with that email already exists.' });
    return next(error);
  }
});

app.post('/api/auth/login', authLimiter, rejectUnexpectedOrigin, async (request, response, next) => {
  try {
    const { email, password } = credentialsSchema.parse(request.body);
    const user = database.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email.toLowerCase());
    const valid = user && await bcrypt.compare(password, user.password_hash);
    if (!valid) return response.status(401).json({ error: 'Email or password is incorrect.' });
    setSessionCookie(response, issueSession(user.id));
    return response.json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', rejectUnexpectedOrigin, (request, response) => {
  response.clearCookie('reclaim_session', { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
  return response.status(204).end();
});

app.get('/api/auth/me', requireAuth, (request, response) => {
  const user = database.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(request.userId);
  if (!user) return response.status(401).json({ error: 'Account not found.' });
  return response.json({ user });
});

app.get('/api/progress', requireAuth, (request, response) => {
  const userProgress = database.prepare('SELECT reclaimed, coins, challenge_minutes AS challengeMinutes, updated_at AS updatedAt FROM progress WHERE user_id = ?').get(request.userId);
  return response.json({ progress: userProgress });
});

app.put('/api/progress', requireAuth, rejectUnexpectedOrigin, (request, response, next) => {
  try {
    const values = progressSchema.parse(request.body);
    database.prepare(`UPDATE progress SET reclaimed = ?, coins = ?, challenge_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(values.reclaimed, values.coins, values.challengeMinutes, request.userId);
    return response.json({ progress: values });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/integrations/instagram/start', requireAuth, (_request, response) => {
  const { INSTAGRAM_CLIENT_ID: clientId, INSTAGRAM_REDIRECT_URI: redirectUri, INSTAGRAM_AUTHORIZE_URL: authorizeUrl } = process.env;
  if (!clientId || !redirectUri || !authorizeUrl) {
    return response.status(503).json({ error: 'Instagram integration is not configured on the server.' });
  }
  const state = jwt.sign({ sub: String(_request.userId), type: 'instagram_oauth', nonce: crypto.randomUUID() }, sessionSecret, { expiresIn: '10m' });
  response.cookie('instagram_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 10 * 60 * 1000, path: '/api/integrations/instagram' });
  const url = new URL(authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'user_profile,user_media');
  url.searchParams.set('state', state);
  return response.json({ authorizationUrl: url.toString() });
});

app.get('/api/integrations/instagram/callback', async (request, response) => {
  const { code, state } = request.query;
  const savedState = request.cookies.instagram_oauth_state;
  if (!code || !state || !savedState || state !== savedState) return response.status(400).send('Invalid Instagram authorization state.');
  try {
    const payload = jwt.verify(String(state), sessionSecret);
    if (payload.type !== 'instagram_oauth') throw new Error('Invalid OAuth state');
    response.clearCookie('instagram_oauth_state', { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/api/integrations/instagram' });
    return response.status(501).send('Instagram authorization received. Token exchange is intentionally pending provider approval and server configuration.');
  } catch {
    return response.status(400).send('Instagram authorization expired or invalid.');
  }
});

app.use(express.static(__dirname));
app.use((error, _request, response, _next) => {
  if (error instanceof z.ZodError) return response.status(400).json({ error: 'Invalid request data.', details: error.flatten().fieldErrors });
  console.error(error);
  return response.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => console.log(`Reclaim API listening on http://localhost:${port}`));
