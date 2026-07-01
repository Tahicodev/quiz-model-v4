# Realtime Server UI - Visual Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUIZ APP SYSTEM                             │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                       ADMIN DASHBOARD                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  Settings Modal                            │  │
│  │  ┌──────┬──────┬─────────┬──────┬──────────────────────┐   │  │
│  │  │ Gen  │Theme │ Content │ Data │ ⭐ REALTIME (NEW)  │   │  │
│  │  └──────┴──────┴─────────┴──────┴──────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  🔧 Server Configuration Panel                       │   │  │
│  │  │  ├─ Server Host Input: http://localhost:3000         │   │  │
│  │  │  ├─ Test Connection Button                           │   │  │
│  │  │  ├─ Status: 🟢 Connected / 🔴 Disconnected          │   │  │
│  │  │  └─ Enable Realtime Sync: ☑️                         │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  📱 Connected Devices Panel (5 devices)              │   │  │
│  │  │  ├─ Device 1: iPhone [192.168.1.101]               │   │  │
│  │  │  │  Status: online | Last: 2:45 PM                 │   │  │
│  │  │  │  [Request] [Download]                            │   │  │
│  │  │  │                                                  │   │  │
│  │  │  ├─ Device 2: iPad [192.168.1.102]                │   │  │
│  │  │  │  Status: online | Last: 2:44 PM                 │   │  │
│  │  │  │  [Request] [Download]                            │   │  │
│  │  │  │                                                  │   │  │
│  │  │  ├─ Device 3: Laptop [192.168.1.103]              │   │  │
│  │  │  │  Status: disconnected | Last: 1:30 PM           │   │  │
│  │  │  │  [Request] [Download]                            │   │  │
│  │  │  │                                                  │   │  │
│  │  │  [Refresh Devices] [Sync All Devices] ➜ Download   │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │  ⚙️ Sync Options Panel                               │   │  │
│  │  │  ├─ ☑️ Auto-Sync Results                             │   │  │
│  │  │  ├─ ☑️ Broadcast Updates                             │   │  │
│  │  │  └─ Sync Interval: 5 seconds                        │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                              │  │
│  │  [Save Changes] [Cancel]                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  🔌 Socket.IO Client (realtime-settings.js)                     │
└──────────────────────────────────────────────────────────────────┘
         │                                           │
         │ Socket.IO Events                          │
         ├─ identify { role: 'admin' }               │
         ├─ clients:update [...]                     │
         └─ admin:requestClientData                  │
         │                                           │
         ▼                                           ▼

    ┌────────────────────────────────────────────┐
    │   LAN REALTIME SERVER (Express + Socket.IO) │
    │   http://localhost:3000                     │
    │                                              │
    │  In-Memory Client Registry:                 │
    │  {                                           │
    │    "socket-id-1": {                         │
    │      socketId: "socket-id-1",               │
    │      ip: "192.168.1.101",                   │
    │      deviceId: "device-xxx",                │
    │      name: "iPhone",                        │
    │      status: "online",                      │
    │      lastSeen: 1234567890,                  │
    │      data: { quizResults, settings, ... }   │
    │    },                                        │
    │    "socket-id-2": { ... },                  │
    │    "socket-id-3": { ... }                   │
    │  }                                           │
    │                                              │
    │  Broadcast: broadcastClients()              │
    └────────────────────────────────────────────┘
         │                                    │
         │ Socket.IO Events                   │
         ├─ register { deviceId, name, data } │
         ├─ heartbeat                         │
         ├─ localStorageUpdate { ... }        │
         └─ requestLocalStorage               │
         │                                    │
         ▼                                    ▼

    ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
    │   CLIENT DEVICE 1  │  │   CLIENT DEVICE 2  │  │   CLIENT DEVICE 3  │
    │                    │  │                    │  │                    │
    │ Quiz App (HTML)    │  │ Quiz App (HTML)    │  │ Quiz App (HTML)    │
    │ realtime-client.js │  │ realtime-client.js │  │ realtime-client.js │
    │                    │  │                    │  │                    │
    │ localStorage: {    │  │ localStorage: {    │  │ localStorage: {    │
    │  quizResults: [...] │  │  quizResults: [...] │  │  quizResults: [...] │
    │  quizExams: [...] │  │  quizExams: [...] │  │  quizExams: [...] │
    │  settings: {...}  │  │  settings: {...}  │  │  settings: {...}  │
    │ }                 │  │ }                 │  │ }                 │
    │                    │  │                    │  │                    │
    │ Heartbeat: 5s      │  │ Heartbeat: 5s      │  │ Heartbeat: 5s      │
    └────────────────────┘  └────────────────────┘  └────────────────────┘
```

## Data Flow Diagram

```
USER ACTION                    CODE FLOW                      RESULT
────────────────────────────────────────────────────────────────────────

[Click "Enable Realtime"]  ──→ realtimeEnabled = true      Server Config
         │                                                   Stored in
         ├─→ connectToRealtimeServer()                      localStorage
         │    ├─→ io(serverHost)
         │    ├─→ socket.on('connect')
         │    ├─→ socket.emit('identify', {role: 'admin'})
         │    └─→ startConnectionMonitor()
         │
         └─→ updateRealtimeStatus('connected')  ──→ 🟢 Status Update

[Click "Test Connection"]  ──→ testRealtimeConnection()
         │                    ├─→ Create test socket
         │                    ├─→ 5s timeout
         │                    └─→ Toast message
         │
         └─→ Shows: "Connected to server" / "Connection failed"

[Devices Connect]          ──→ Server receives:
         │                    socket.on('register', payload)
         │                    socket.on('heartbeat')
         │                    socket.on('localStorageUpdate')
         │
         └─→ broadcastClients() ──→ Admin receives clients:update

[Admin View Devices]       ──→ renderConnectedDevices()
         │                    ├─→ Create device HTML
         │                    ├─→ Show status indicator
         │                    └─→ Attach event handlers
         │
         └─→ Device List Updated in UI

[Click "Request Data"]     ──→ socket.emit('admin:requestClientData')
         │                    ├─→ Server routes to device
         │                    └─→ Device sends localStorageUpdate
         │
         └─→ Admin receives latest device data

[Click "Sync All"]         ──→ mergeAllDevices()
         │                    ├─→ Collect all device data
         │                    ├─→ Merge quiz results
         │                    ├─→ Deduplicate entries
         │                    ├─→ Update localStorage
         │                    └─→ Create backup JSON
         │
         └─→ Download merged data, show success message

[Disconnect Realtime]      ──→ realtimeEnabled = false
         │                    ├─→ socket.disconnect()
         │                    ├─→ stopConnectionMonitor()
         │                    └─→ Clear device list
         │
         └─→ 🔴 Status: Disconnected
```

## Component Interaction Map

```
┌────────────────────────────────────────────────────────────┐
│               admin.html (UI Elements)                      │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  setting-serverHost ──┐                                     │
│  setting-realtimeEnabled ──┐                                │
│  setting-autoSync ────────┐│                                │
│  setting-broadcastUpdates┐│├──┐                             │
│  setting-realtimeSyncInterval││├────→ settings.js          │
│                         │││  │  Save to localStorage        │
│  realtime-connection-status││ │  Load from localStorage     │
│  realtime-devices-list ──┘│ │  Apply settings              │
│  realtime-status-indicator │ │                              │
│              │             │ │                              │
│              └─────────────┼─┼────────────────────────────┐ │
│                            │ │                            │ │
└────────────────────────────┼─┼────────────────────────────┼─┘
                             │ │                            │
                             ▼ ▼                            │
           ┌──────────────────────────────────────┐          │
           │   realtime-settings.js (Handler)    │          │
           │  ┌────────────────────────────────┐ │          │
           │  │  setupRealtimeUI()             │ │  ◀───────┘
           │  │  connectToRealtimeServer()     │ │
           │  │  disconnectFromRealtimeServer()│ │
           │  │  renderConnectedDevices()      │ │
           │  │  updateRealtimeStatus()        │ │
           │  │  startConnectionMonitor()      │ │
           │  └────────────────────────────────┘ │
           │                                      │
           │  window.testRealtimeConnection()    │
           │  window.refreshRealtimeDevices()    │
           │  window.requestDeviceData()         │
           │  window.downloadDeviceData()        │
           │  window.mergeAllDevices()           │
           └──────────────────────────────────────┘
                            │
                            │ Socket.IO
                            │
                            ▼
           ┌──────────────────────────────────────┐
           │    Socket.IO Client                  │
           │  (Built into realtime-settings.js)  │
           │                                      │
           │  Events sent:                        │
           │  ├─ identify                        │
           │  ├─ admin:requestClientData         │
           │  └─ (custom events)                 │
           │                                      │
           │  Events received:                   │
           │  ├─ clients:update                  │
           │  ├─ connect                         │
           │  ├─ disconnect                      │
           │  └─ connect_error                   │
           └──────────────────────────────────────┘
                            │
                            │ Network
                            │
                            ▼
           ┌──────────────────────────────────────┐
           │      LAN Realtime Server             │
           │      (server.js)                     │
           │                                      │
           │  Socket.IO Server                    │
           │  In-Memory Client Registry           │
           │  Event Routing & Broadcasting        │
           └──────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Device 1 │  │ Device 2 │  │ Device 3 │
        │(Client)  │  │(Client)  │  │(Client)  │
        │          │  │          │  │          │
        │realtime- │  │realtime- │  │realtime- │
        │client.js │  │client.js │  │client.js │
        └──────────┘  └──────────┘  └──────────┘
```

## State Management Flow

```
┌─────────────────────────────────────────────┐
│         Browser LocalStorage                │
│  ┌───────────────────────────────────────┐  │
│  │   quizSettings (including realtime)   │  │
│  │   ├─ serverHost: ""                   │  │
│  │   ├─ realtimeEnabled: false           │  │
│  │   ├─ autoSync: true                   │  │
│  │   ├─ broadcastUpdates: true           │  │
│  │   └─ realtimeSyncInterval: 5          │  │
│  │                                       │  │
│  │   quizResults: [...]                  │  │
│  │   quizExams: [...]                    │  │
│  │   quizQuestions: [...]                │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         ▲           │              ▲
         │           ▼              │
         │     ┌──────────────┐     │
         ├────→│ Settings.js  │────┬┘
         │     │              │    │
         │     │ Manages:     │    │
         │     │ - Load       │    │
         │     │ - Save       │    │
         │     │ - Apply      │    │
         │     └──────────────┘    │
         │                         │
         │                         ▼
         │     ┌──────────────────────────────┐
         │     │ realtime-settings.js         │
         │     │                              │
         │     │ Runtime Variables:           │
         │     │ - realtimeSocket             │
         │     │ - connectedDevices[]         │
         │     │ - connectionCheckInterval    │
         │     └──────────────────────────────┘
         │                │
         │                ▼
         │     ┌──────────────────────────────┐
         │     │ Socket.IO Connection         │
         │     │                              │
         │     │ Remote State (Server):       │
         │     │ - clients {id: {...}}        │
         │     │ - Device registries          │
         │     │ - Live connections           │
         └─────→──────────────────────────────┘
```

## Key Interactions Timeline

```
Time  Event                          Action
────────────────────────────────────────────────────────────────
T0    Page Load                      → Load settings.js
                                     → Load realtime-settings.js
                                     → Check if realtimeEnabled

T1    User clicks Settings           → openSettingsModal()
                                     → Populate form fields
                                     → Show Realtime tab

T2    User enters server URL         → Input captured
                                     → Ready to test

T3    User clicks "Test Connection"  → testRealtimeConnection()
                                     → Create test socket
                                     → 5s timeout
                                     → Show result

T4    User clicks "Enable"           → connectToRealtimeServer()
                                     → io(serverHost)
                                     → socket.emit('identify')

T5    Server broadcasts clients      → socket.on('clients:update')
                                     → renderConnectedDevices()
                                     → Update device list UI

T6    Monitor runs (every 10s)       → startConnectionMonitor()
                                     → socket.emit('identify')
                                     → Keep list fresh

T7    User clicks "Request Data"     → requestDeviceData(id)
                                     → admin:requestClientData
                                     → Device responds
                                     → Show data

T8    User clicks "Sync All"         → mergeAllDevices()
                                     → Collect all device data
                                     → Update localStorage
                                     → Download backup

T9    User saves settings            → saveSettingsForm()
                                     → Save to localStorage
                                     → Keep realtime active
```

---

This architecture ensures smooth real-time synchronization between the admin panel and multiple client devices on the local network!
