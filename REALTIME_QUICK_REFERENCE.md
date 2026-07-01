# 🎯 Realtime Server UI - Quick Reference Card

## 📍 Location

**Settings → Realtime Tab** (in Admin Dashboard)

---

## 🎮 UI Elements & What They Do

### 🔧 SERVER CONFIGURATION PANEL

| Element                    | What It Does                   | Notes                           |
| -------------------------- | ------------------------------ | ------------------------------- |
| **Server Host/Port Input** | Set realtime server address    | e.g., `http://localhost:3000`   |
| **Test Connection**        | Verify server is reachable     | Shows error if connection fails |
| **Status Indicator**       | 🟢 Connected / 🔴 Disconnected | Updates in real-time            |
| **Enable Realtime Sync**   | Turn realtime features on/off  | Auto-reconnects if re-enabled   |

### 📱 CONNECTED DEVICES PANEL

| Element             | What It Does                  | Notes                          |
| ------------------- | ----------------------------- | ------------------------------ |
| **Device List**     | Shows all connected devices   | Auto-updates every 10 seconds  |
| **Device Name**     | Device identifier             | Shows deviceId if no name      |
| **IP Address**      | Device's network IP           | For identification             |
| **Status Badge**    | 🟢 online / ⚪ disconnected   | Real-time status               |
| **Last Seen**       | Timestamp of last activity    | Shows time device was active   |
| **Request Button**  | Ask device to send fresh data | Useful if data seems stale     |
| **Download Button** | Save device data as JSON      | Creates backup of device data  |
| **Refresh Devices** | Manually refresh device list  | Usually updates automatically  |
| **Sync All**        | Merge ALL devices' data       | Combines results, deduplicates |
| **Device Count**    | (n) devices connected         | Shows real-time count          |

### ⚙️ SYNC OPTIONS PANEL

| Option                | Purpose                           | Default |
| --------------------- | --------------------------------- | ------- |
| **Auto-Sync Results** | Automatically sync quiz results   | ✅ ON   |
| **Broadcast Updates** | Push updates to connected devices | ✅ ON   |
| **Sync Interval**     | How often to sync (seconds)       | 5       |

---

## 🔄 Common Tasks

### 🔌 Connect to Server

```
1. Enter server address (e.g., http://localhost:3000)
2. Click "Test Connection"
3. Should say "Successfully connected"
4. Check "Enable Realtime Sync"
5. Click "Save Changes"
```

### 📱 View Connected Devices

```
1. Check "Realtime" tab
2. Look at "Connected Devices" panel
3. Devices should list automatically
4. If not showing: Click "Refresh Devices"
```

### 📥 Get Data From Device

```
1. Find device in list
2. Click "Request" button
3. Device sends its latest data
4. Admin receives it automatically
```

### 💾 Backup Device Data

```
1. Click "Download" next to device
2. Browser downloads JSON file
3. File contains all device's data
4. Can be imported later
```

### 🔄 Merge All Devices

```
1. Click "Sync All" button
2. Confirm action
3. All device data merges together
4. Results deduplicated automatically
5. Backup JSON downloaded
6. Admin localStorage updated
```

---

## 📊 What Data Syncs?

✅ Quiz Results
✅ Quiz Exams
✅ Questions
✅ Classes/Batches
✅ Settings/Configuration
✅ All localStorage data

---

## 🔍 Understanding Device Status

| Status          | Meaning                                  | Action                         |
| --------------- | ---------------------------------------- | ------------------------------ |
| 🟢 online       | Device is currently connected            | Can request data               |
| ⚪ disconnected | Device was connected but lost connection | Can still download cached data |
| ? unknown       | No status info                           | Device may not have synced yet |

---

## 💬 Toast Messages You'll See

| Message                            | Meaning                | Action                 |
| ---------------------------------- | ---------------------- | ---------------------- |
| "Settings saved successfully!"     | Changes saved          | None needed            |
| "Successfully connected to server" | Connection test passed | Good to enable         |
| "Failed to connect: ..."           | Can't reach server     | Check server address   |
| "Requesting device list..."        | Fetching devices       | Wait a moment          |
| "Downloaded data from Device"      | Device data saved      | Check downloads folder |
| "Synced data from n device(s)"     | Merge completed        | Check admin panel      |
| "Not connected to server"          | Realtime is disabled   | Enable it first        |

---

## ⚡ Keyboard Shortcuts

None built-in, but you can use browser shortcuts:

- **F12** - Open console to see debug info
- **Ctrl+Shift+Delete** - Clear localStorage (resets all data!)

---

## 🎛️ Settings Saved

These are saved to localStorage automatically:

```
serverHost        → Your server address
realtimeEnabled   → Is realtime on/off?
autoSync          → Auto-sync enabled?
broadcastUpdates  → Broadcasting enabled?
realtimeSyncInterval → Sync frequency (seconds)
```

All persisted when you click "Save Changes"

---

## 🔌 Connection Behavior

- **Auto-reconnect**: If connection drops, automatically tries to reconnect
- **Health check**: Every 10 seconds, checks if still connected
- **Timeout**: 5 second timeout on connection test
- **Graceful disconnect**: Properly closes connection when disabled

---

## 📈 Monitoring

### Server Console Output

When devices connect, you see:

```
socket connected [socket-id] [ip-address]
```

### Admin UI Shows

- Green dot when connected
- Red dot when disconnected
- Live device list updates
- Timestamps of activity

---

## 🚨 If Something Goes Wrong

### Connection Test Fails?

1. ✅ Is server running? (`npm start`)
2. ✅ Correct address? (e.g., `http://localhost:3000`)
3. ✅ Port accessible? (3000 open?)
4. ✅ Firewall blocking? (Check firewall)

### Devices Not Showing?

1. ✅ Devices have `realtime-client.js`? (Loaded in HTML)
2. ✅ Devices connected to same server? (Check address)
3. ✅ Realtime enabled? (Check toggle)
4. ✅ Refresh page in F12 console: `window.refreshRealtimeDevices()`

### Data Not Syncing?

1. ✅ "Enable Realtime Sync" checked?
2. ✅ "Auto-Sync Results" checked?
3. ✅ Try "Sync All" manually
4. ✅ Check sync interval (5s is default)

See **REALTIME_UI_SETUP.md** for full troubleshooting.

---

## 🎓 Learn More

| Need                | File                          |
| ------------------- | ----------------------------- |
| Quick setup (5 min) | REALTIME_QUICK_START.md       |
| Full setup (15 min) | REALTIME_UI_SETUP.md          |
| How it works        | REALTIME_ARCHITECTURE.md      |
| What was done       | REALTIME_UI_IMPLEMENTATION.md |
| Troubleshooting     | REALTIME_UI_SETUP.md          |

---

## 🔑 Key Keyboard Tips

```
Press F12 to open Developer Console

Then in console, try:
- window.testRealtimeConnection()  // Test connection
- window.refreshRealtimeDevices()  // Refresh devices
- window.mergeAllDevices()         // Sync all
```

---

## 📱 Device Sync Example

```
Device 1: 10 results
Device 2: 8 results
Device 3: 6 results

Click "Sync All" →

Admin now has: 24 results
(Combined from all devices, no duplicates)
```

---

## 🎯 Common Workflow

```
1. Open Settings → Realtime
2. Enter server address
3. Click "Test Connection" (verify it works)
4. Check "Enable Realtime Sync"
5. Click "Save Changes"
6. Devices appear in list automatically
7. Click "Sync All" to merge
8. Data automatically backs up
```

**Time needed: ~2 minutes**

---

## ✨ Pro Tips

💡 **Tip 1**: Test connection before enabling sync

💡 **Tip 2**: Devices auto-appear when they connect

💡 **Tip 3**: Sync interval of 5 seconds is usually perfect

💡 **Tip 4**: Always backup before syncing (done automatically!)

💡 **Tip 5**: Check "Last Seen" to find inactive devices

💡 **Tip 6**: Download device data regularly for backups

💡 **Tip 7**: "Refresh Devices" if list seems stale

---

## 🎉 You're All Set!

**Go to Settings → Realtime Tab and start syncing!** 🚀

Need help? Check the documentation files or F12 console.
