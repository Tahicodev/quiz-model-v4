# Security Guide — Quiz Model v3

This document explains how security works in this version of the app: what was hardened, what the login **reset** button does, and what you should configure for a safe **LAN** deployment.

This is a **LAN-first quiz tool** (browser + `localStorage` + Node/Socket.IO). It is **not** designed as a public internet service without additional hardening.

---

## Two separate locks (do not mix them up)

| Layer               | What it protects                                                        | Who enforces it                           |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| **Dashboard login** | Opening `admin.html` and using the admin UI                             | **Your browser only** (`localStorage`)    |
| **Admin Secret**    | Realtime powers: push exam, sync users, device data, game admin actions | **The Node server** (`QUIZ_ADMIN_SECRET`) |

```text
┌─────────────────────────────────────┐     ┌──────────────────────────────┐
│  Your admin PC (browser)            │     │  Node server (LAN)           │
│                                     │     │                              │
│  Dashboard login (admin/password)   │     │  QUIZ_ADMIN_SECRET           │
│         ↓                           │     │         ↓                    │
│  "Reset password" on login screen   │     │  Socket.IO validates secret  │
│  (localStorage on THIS PC only)     │     │         ↓                    │
│                                     │     │  Push exam, sync users,      │
│  Admin Secret field in Settings     │────▶│  games, device requests      │
└─────────────────────────────────────┘     └──────────────────────────────┘
```

The security pass mainly hardened the **server** layer. The **reset on the login screen** only fixes the **dashboard** layer on **that one machine**.

---

## What “Reset password” on the login screen does (and does not do)

When you use **Reset password** on the admin login modal (after unlocking):

- You must first enter the **recovery code** (set in Settings; first install uses the code documented in this file only).
- Then the reset form appears for 15 minutes in that browser tab.
- Reset updates users in **this browser’s `localStorage`** on this computer.
- It does **not** change `QUIZ_ADMIN_SECRET`.
- Anyone who knows the recovery unlock password and can open `admin.html` on that PC can reset the dashboard password.

**In short:** it is a **LAN recovery tool** (spare key on your admin machine), not proof of identity like a bank login.

**Dashboard login ≠ server security.** A strong dashboard password still does not replace the Admin Secret for network control.

---

## What is secured in this version (server-enforced)

These protections are applied **on the server**, not by trusting the browser alone:

### 1. Admin realtime actions require the Admin Secret

**Before:** any device on the LAN could send `identify` with `role: 'admin'` and call `admin:pushSession`, `admin:syncUsers`, etc.

**Now:** admin sockets must send the same secret as `QUIZ_ADMIN_SECRET` (or the secret printed in the server console on first boot).

Relevant files: `server-security.js`, `server.js`, `realtime-settings.js`.

### 2. Password hashes are not synced to student devices

User sync strips `passwordHash` (and `password`) before broadcast.

Relevant files: `server-security.js`, `auth.js`, `realtime-settings.js`.

### 3. Game impersonation and admin game commands are restricted

- `game:join` binds a socket to a `userId`.
- Player actions (`game:answer`, `game:ready`, etc.) must match that binding.
- Destructive/admin game events (`game:deleteAll`, `game:start`, etc.) require an authenticated admin socket.

Relevant file: `game-server.js`.

### 4. Sensitive server files are not served over HTTP

Static hosting blocks paths such as `.git`, `server.js`, `package.json`, `node_modules`, etc.

Relevant files: `server-security.js`, `server.js`.

### 5. XSS mitigations (client)

- Safe image URLs in quiz UI (`sanitizeImageUrl`).
- Escaped error text and filenames where patched.
- CSS color sanitization for category badges.
- Security headers (CSP, `X-Content-Type-Options`, etc.) on HTTP responses.

Relevant files: `utils.js`, `script.js`, `student-workspace.js`, `rag.js`, `questions-management.js`.

---

## What is not fully secured (honest limits)

| Risk                                                            | Still applies?                                 |
| --------------------------------------------------------------- | ---------------------------------------------- |
| Someone on your admin PC uses the login recovery panel          | Yes — local/physical access                    |
| Someone bypasses UI via browser devtools / `localStorage` edits | Yes — no server-side user database             |
| Default `admin` / `admin123` on fresh install                   | Yes — **change immediately** after first login |
| App exposed on the public internet without TLS + strong auth    | **Not** appropriate                            |
| Recovery panel visible on login for convenience                 | Trade-off: availability over strict lockdown   |

---

## Files and inputs that matter

### Server

| File                 | Role                                                            |
| -------------------- | --------------------------------------------------------------- |
| `server.js`          | HTTP static host, Socket.IO relay                               |
| `server-security.js` | Admin secret auth, headers, static filtering, user sanitization |
| `game-server.js`     | Live game authority                                             |
| `package.json`       | Dependencies (`express`, `socket.io`)                           |

**Environment variables:**

| Variable            | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `QUIZ_ADMIN_SECRET` | Secret required for admin Socket.IO role                                 |
| `QUIZ_CORS_ORIGIN`  | Optional comma-separated allowed origins (default: same-origin behavior) |
| `PORT`              | HTTP listen port (default `3000`)                                        |

### Client (browser)

| File                   | Sensitive data / behavior                                           |
| ---------------------- | ------------------------------------------------------------------- |
| `auth.js`              | Users, sessions, password hashes (local), recovery UI               |
| `realtime-settings.js` | Admin socket, user sync, device management                          |
| `settings.js`          | Server host + admin secret persistence                              |
| `utils.js`             | `sanitizeImageUrl`, `sanitizeCssColor`, `buildAdminIdentifyPayload` |

### User-controlled inputs (validate and trust carefully)

- JSON import/export (settings, backups)
- Question text and images (stored in `localStorage`, shown to students)
- RAG uploads (`rag.js`) — client-side only
- AI API keys (`quizAIConfig` in `localStorage`) — protect with strong passwords and XSS fixes

---

## Setup checklist (recommended LAN deployment)

1. **Sign in** to `admin.html` and change the `admin` password from `admin123` to a strong password.
2. **Set Admin Secret** in **Settings → LAN Realtime → Admin Secret**.
3. **Start the server** with the same secret:
   ```bash
   QUIZ_ADMIN_SECRET='your-long-random-string' npm start
   ```
4. **Do not share** the Admin Secret; treat it like a network admin password.
5. **Run only on a trusted LAN** — do not port-forward port 3000 to the internet without TLS and proper authentication.
6. **Lock the admin computer** (OS account, classroom policy). Recovery is only as safe as physical access to that machine.

### If you are locked out of the dashboard (no console needed)

1. Open `admin.html` and hard-refresh (`Ctrl+F5`).
2. Expand **“Locked out? Reset password here”** on the login modal.
3. Expand **“Locked out? Contact your administrator”** — only the **recovery code** field is shown (the reset form stays hidden).
4. Enter your **recovery code** and click **Verify recovery code**.
5. After verification, set username + new password and click **Reset password**.
6. Sign in with the new password and change it again under **Users** if needed.
7. In **Settings → LAN Realtime**, set a new **Recovery code** (stored hashed, never shown in the UI); Settings auto-saves it.
8. Re-enter the **Admin Secret** in Settings to match the server.

**First-time recovery code (before you change it in Settings):** `QuizAdminRecovery2024` — documented here only, not shown in the login page.

**UI security rules:**

- The reset form is hidden with CSS (`display: none !important`) until the recovery code is verified.
- No default passwords appear in placeholders or buttons on the login screen.
- The recovery code is stored as a **hash** in `quizSettings` after Settings auto-saves (plain text is not kept).

---

## Who can do what (summary)

| Attacker                                         | Without Admin Secret    | Without your admin PC    | Without dashboard password             |
| ------------------------------------------------ | ----------------------- | ------------------------ | -------------------------------------- |
| Push exam / sync users / read devices via socket | Blocked                 | —                        | —                                      |
| Cheat in live games as another student           | Harder (socket binding) | —                        | —                                      |
| Open admin UI                                    | —                       | —                        | Blocked (unless they reset on your PC) |
| Reset dashboard password                         | —                       | Possible on your machine | —                                      |

**You are mainly secured against casual abuse on the LAN** (fake admin socket, password hash leak, game spoofing).

**You are not secured against someone with full access to your admin computer** — same as any local-first admin tool.

---

## Optional hardening (future)

If you need the recovery panel to be stricter:

- Hide recovery unless a URL flag is present (e.g. `admin.html?recovery=1`).
- Require a separate recovery code stored in server env.
- Remove recovery in production builds.
- Add a real backend with server-side login (sessions/JWT) instead of browser-only auth.

---

## Quick reference

| Question                                | Answer                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Does reset password secure the network? | **No** — only local dashboard access on this browser.                     |
| What secures the network?               | **`QUIZ_ADMIN_SECRET`** on the server + matching value in admin Settings. |
| Is `admin123` safe?                     | **No** for production — change after first login.                         |
| Safe on public internet?                | **No** — LAN/trusted network only with current architecture.              |

---

_Last updated: security audit and hardening pass (server auth, sync sanitization, game binding, XSS patches, login recovery UI)._
