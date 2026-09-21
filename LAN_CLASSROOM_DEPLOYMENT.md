# Quiz App — LAN Classroom Setup (20 Devices)

Your app can run on **one Windows computer/server** and be used by **20 PCs or smartphones** connected to the same Wi-Fi LAN.

Students do **not** need to install anything. They only need a browser and the server's LAN address, for example:

```
http://192.168.1.25:3000
```

They must **not use `localhost` on their own devices**.

---

## Why it should work

Your application is suitable for this setup because:

- The main server listens on all network interfaces: `0.0.0.0:3000`
  - `src/backend/server.js:347-352`
- The frontend uses relative API and Socket.IO URLs, so it follows the IP address entered by the student
  - `src/backend/server.js:216-219`
- REST and Socket.IO CORS allow private/LAN origins
  - `src/backend/server.js:58-81`
  - `src/backend/realtime/socket.server.js:31-46`
- Socket.IO supports polling and WebSocket connections, which works with most phones
  - `src/frontend/infrastructure/socket.client.js:40-50`
- The pages have mobile viewport and responsive styling
  - `index.html:5`
  - `admin.html:5`
  - `student-workspace.html:5`
- The configured school capacity is 100 students, while a game allows up to 30 players, so 20 students fits
  - `prisma/schema.prisma:22`
  - `src/frontend/services/GameService.js:143-150`
- There is no application-level limit preventing 20 devices.

---

## Installation on the server computer

### 1. Install Node.js

Install **Node.js 20 or newer**. The project also contains a `package-lock.json`, so `npm ci` is the correct installation command.

### 2. Open PowerShell in the project

```powershell
cd "D:\Work\MyProjects\quiz-model-v4"
```

### 3. Install dependencies

```powershell
npm ci
```

### 4. Prepare Prisma

```powershell
npx prisma generate
npx prisma migrate deploy
```

If this is a completely new database and you intentionally want the seed data, run:

```powershell
npx prisma db seed
```

> Do **not** run the seed command on an existing database unless you want to modify its data.

### 5. Start the application

Use the main application entry point through `npm start`:

```powershell
npm start
```

The server should listen on port **3000**.

For development with watching/reloading, you can use:

```powershell
npm run dev
```

> The root `server.js` appears to be a legacy server; use `npm start` instead.

---

## Find the server's Wi-Fi IP address

On the Windows server, run:

```powershell
ipconfig
```

Look for the IPv4 address of the Wi-Fi or Ethernet adapter, such as:

```
192.168.1.25
```

Then students should open:

```
http://192.168.1.25:3000
```

You can also use this PowerShell command to list usable IPv4 addresses:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.AddressState -eq 'Preferred' -and
    $_.IPAddress -notmatch '^(127\.|169\.254\.)'
  } |
  Select-Object InterfaceAlias, IPAddress, PrefixLength
```

---

## Allow access through Windows Firewall

Run **PowerShell as Administrator** on the server:

```powershell
New-NetFirewallRule `
  -DisplayName "Quiz App TCP 3000" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 3000 `
  -Profile Private
```

If the Wi-Fi network is classified as **Public**, either change the network profile to Private or use:

```powershell
New-NetFirewallRule `
  -DisplayName "Quiz App TCP 3000" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 3000 `
  -Profile Any
```

---

## Router/Wi-Fi requirements

Make sure the Wi-Fi router or access point has:

- **Client isolation / AP isolation disabled**
- All devices connected to the same LAN
- TCP port 3000 allowed between devices
- The server computer prevented from sleeping during the class

> If client isolation is enabled, phones and computers may connect to Wi-Fi but still be unable to reach the server.

---

## Smartphone usage

Students can use:

- Android Chrome
- iPhone Safari
- Any modern mobile browser

They simply enter:

```
http://<server-ip>:3000
```

For convenience, you can create a **QR code** containing that URL so students can scan it with their phones.

**No student device installation is required.**

---

## Important issues to fix or be aware of

### 1. Production mode over plain HTTP may break login refresh

Your current `.env` uses:

```
NODE_ENV=development
```

That allows the current HTTP LAN setup to work.

However, in **production mode**, the refresh cookie is marked `Secure`, so browsers will not send it over plain HTTP:

```
src/backend/routes/auth.routes.js:45-51
```

For a proper production LAN deployment, use **HTTPS or a reverse proxy with HTTPS**. For a temporary classroom setup, the current development configuration works over HTTP.

### 2. Database path is inconsistent

The current `.env` uses:

```
DATABASE_URL="file:./dev.db"
```

But the installer writes:

```
DATABASE_URL="file:./prisma/dev.db"
```

Your repository also currently has a **modified `prisma/dev.db`** file. Do not overwrite or delete it accidentally. **Before reinstalling, back up the database.**

### 3. Some frontend libraries are loaded from CDNs

The legacy pages load some resources from external CDN URLs, for example:

```
index.html:94
admin.html:122
student-workspace.html:105-106
```

Therefore:

- LAN access works when the network has internet access.
- A completely offline Wi-Fi network may load parts of the app but break Socket.IO or some UI functionality.
- For a fully offline classroom, those dependencies should eventually be hosted locally.

### 4. `.env.example` is outdated

The example environment file does not fully match the current backend configuration. Keep the real `.env` file and do not regenerate it blindly.

---

## Recommended classroom setup

Use one computer as the server:

```
Teacher/server PC:
D:\Work\MyProjects\quiz-model-v4
npm start
http://192.168.1.25:3000
```

Students use:

```
http://192.168.1.25:3000
```

This should comfortably support **20 students** for normal quiz usage, assuming the Wi-Fi router is reasonably stable.

---

_I checked the code only; I did not modify any files._