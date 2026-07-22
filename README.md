# Telegram Bot Description Changer

A small web app to change the **name, bio, and description** of your Telegram bots. Enter a username to keep your bots saved, add bots by token, then edit / save / remove them. Changes apply to the **default locale** — the "normal" values shown to all users, regardless of their Telegram language.

## Features

- **Username accounts** — enter a username to see the bots you saved before.
- **Multiple bots** — add bots by token; each is validated via the Telegram API.
- **Edit name, bio & description** — three fields with live counters (`64` name, `120` bio, `512` description). Only changed fields are sent to Telegram, so `setMyName` isn't called needlessly.
- **Clear description** — one-click reset of the default description.
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
- All calls use the default locale (empty `language_code`), so they affect the values every user sees. To target a specific language instead, set `LANG_CODE` in `server.js`.

## Security note

Accounts are keyed by username with **no password**, so anyone who enters the same username can see those saved bots. This is fine for a personal / self-hosted setup. If you expose it publicly, add a PIN or password per username first.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/login` | Create/open a username, list its bots |
| POST | `/api/add-bot` | Validate a token and save it under the username |
| POST | `/api/select` | Load a saved bot's name, bio & description |
| POST | `/api/save` | Update name / bio / description (only changed fields, default locale) |
| POST | `/api/remove` | Clear the description (default locale) |
| POST | `/api/delete-bot` | Forget a saved bot (does not affect the bot on Telegram) |
