# Anti-Scroll / Reclaim

A mobile-first installable web app for turning recovered screen time into TimeCoins.

## Run

The app is dependency-free and includes interactive reclaim-time and daily-challenge controls.

## Run locally

From this folder, start a local server so the service worker can enable offline mode:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser. On a phone, open the same address while connected to the same network, then use **Add to Home Screen** to install it.

## Run the API

Node.js 22.5 or newer is required for the built-in SQLite driver. Install dependencies, create a local environment file, and set a development session secret:

```bash
npm install
cp .env.example .env
```

Edit `.env` and set `SESSION_SECRET` to a random value with at least 32 characters, then start the API:

```bash
npm start
```

The API and mobile web app are served from `http://localhost:3000`. Check the API with `curl http://localhost:3000/api/health`.

The API provides account registration/login, HTTP-only session cookies, and authenticated progress storage in SQLite. Instagram is deliberately disabled until official Meta OAuth credentials and an approved redirect URI are configured on the server. Never put those credentials in frontend files or collect an Instagram password.

## Checks

```bash
npm run check
```
