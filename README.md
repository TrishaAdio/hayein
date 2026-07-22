# Telegram Bot Description Changer

A small web app to change the **description** of your Telegram bots (the "What can this bot do?" text shown in an empty chat). Enter a username to keep your bots saved, add bots by token, then edit / save / remove the description. Language is locked to `en`.

## Features

- **Username accounts** — enter a username to see the bots you saved before.
- **Multiple bots** — add bots by token; each is validated via the Telegram API.
- **Edit name, bio & description** — three fields with live counters (`64` name, `120` bio, `512` description). Only changed fields are sent to Telegram, so `setMyName` isn't called needlessly.
- **Clear description** — one-click reset of the description for the `en` locale.
- **Polished UI** — animated background, view transitions, success/error feedback, reduced-motion support.
- **Zero dependencies** — pure Node.js (`http` + built-in `fetch`).

## Run

```bash
node server.js
# → http://localhost:4000
```

Requires Node.js 18+. Set a different port with `PORT=5000 node server.js`.

## How it works

- The backend serves the static UI from `public/` and proxies a few Telegram Bot API calls.
- Bot tokens are stored **server-side only** in `data/store.json`, keyed by username, and referenced by bot id. Tokens are never sent to the browser.
- All description calls use `language_code=en`.

## Security note

Accounts are keyed by username with **no password**, so anyone who enters the same username can see those saved bots. This is fine for a personal / self-hosted setup. If you expose it publicly, add a PIN or password per username first.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/login` | Create/open a username, list its bots |
| POST | `/api/add-bot` | Validate a token and save it under the username |
| POST | `/api/select` | Load a saved bot's name, bio & description |
| POST | `/api/save` | Update name / bio / description (only changed fields, `en`) |
| POST | `/api/remove` | Clear the description (`en`) |
| POST | `/api/delete-bot` | Forget a saved bot (does not affect the bot on Telegram) |
