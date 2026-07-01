# LAN Realtime Server UI - Implementation Guide

## Overview

A complete UI has been integrated into the Admin Panel's Settings tab to manage and control the LAN Realtime Server for Quiz App. This allows admins to configure real-time synchronization between the admin panel and connected client devices on the local network.

## What's New

### 1. **New "Realtime" Settings Tab**

Located in **Settings Modal** (Profile > Settings > Realtime tab)

#### Features:

**A. Server Configuration Panel**

- **Server Host/Port Input**: Configure the realtime server address (e.g., `http://localhost:3000`)
- **Test Connection Button**: Verify connectivity to the realtime server
- **Connection Status Indicator**: Real-time display of connection status (Connected/Disconnected/Error)
- **Enable Realtime Sync Toggle**: Turn realtime synchronization on/off

**B. Connected Devices Panel**

- **Device List Display**: Shows all connected devices with:
  - Device name/ID
  - IP address
  - Current status (online/disconnected)
  - Last seen timestamp
- **Request Button**: Request data refresh from a specific device
- **Download Button**: Download device data as JSON
- **Device Count**: Real-time counter of connected devices
- **Refresh Devices Button**: Manually refresh the device list
- **Sync All Button**: Merge data from all connected devices

**C. Sync Options Panel**

- **Auto-Sync Results**: Automatically sync quiz results across devices
- **Broadcast Updates**: Push question/exam updates to connected devices
- **Sync Interval**: Configure how frequently to sync (in seconds)

## Files Modified/Created

### New Files:

1. **`realtime-settings.js`** - Complete UI handler for realtime settings
   - Connection management
   - Device list rendering
   - Data sync operations
   - Status monitoring

### Modified Files:

1. **`admin.html`** - Added Realtime tab and UI components

   - New tab button in settings modal
   - Complete Realtime settings section with 3 panels
   - Socket.IO CDN script tag

2. **`settings.js`** - Extended to support realtime settings
   - Added realtime config to DEFAULT_SETTINGS:
     - `serverHost`: Server URL (default: empty/current origin)
     - `realtimeEnabled`: Toggle for realtime sync
     - `autoSync`: Auto-sync quiz results
     - `broadcastUpdates`: Push updates to devices
     - `realtimeSyncInterval`: Sync frequency in seconds
   - Updated `openSettingsModal()` to populate realtime fields
   - Updated `saveSettingsForm()` to save realtime settings

## How to Use

### 1. Access Realtime Settings

```
Admin Panel → Profile Icon (top-right) → Settings → Realtime Tab
```

### 2. Configure Server

1. Enter your realtime server address (e.g., `http://192.168.1.100:3000`)
2. Click "Test Connection" to verify
3. Enable the "Enable Realtime Sync" checkbox
4. Save settings

### 3. Monitor Connected Devices

- Device list auto-updates when devices connect/disconnect
- Shows device name, IP, status, and last activity
- Click "Refresh Devices" to manually update the list

### 4. Sync Data

- **Request**: Get latest data from a specific device
- **Download**: Save device data as JSON file
- **Sync All**: Merge data from all connected devices into the admin panel

## Architecture

### Connection Flow

```
Admin Panel (realtime-settings.js)
    ↓
Socket.IO Client
    ↓
LAN Realtime Server (server.js)
    ↓
Connected Devices (realtime-client.js)
```

### Data Structure

Each device sends to server:

```javascript
{
  socketId: "socket_id",
  ip: "192.168.1.x",
  deviceId: "device-xxx",
  name: "Device Name",
  lastSeen: timestamp,
  status: "online|disconnected",
  data: {
    quizResults: [...],
    quizExams: [...],
    quizQuestions: [...],
    quizSettings: {...}
  }
}
```

## Key Functions (in realtime-settings.js)

### Global Functions (Window Scope)

- `testRealtimeConnection()` - Test connectivity to server
- `refreshRealtimeDevices()` - Refresh device list
- `requestDeviceData(socketId)` - Request data from device
- `downloadDeviceData(socketId)` - Download device data as JSON
- `mergeAllDevices()` - Merge all device data

### Internal Functions

- `connectToRealtimeServer()` - Establish Socket.IO connection
- `disconnectFromRealtimeServer()` - Close connection
- `updateRealtimeStatus(status, message)` - Update status UI
- `renderConnectedDevices(devices)` - Render device list
- `startConnectionMonitor()` - Monitor connection health
- `stopConnectionMonitor()` - Stop monitoring

## Integration with Existing Features

### Realtime-Client Integration

- Client devices automatically register with server on load
- Send heartbeats every 5 seconds
- Sync localStorage updates continuously
- Respond to admin requests for data

### Realtime-Admin Integration

- Replaces the floating panel with integrated UI
- Same device management functionality
- Better organization within settings

## Customization

### Change Default Sync Interval

In `admin.html`, find the sync interval input:

```html
<input type="number" id="setting-realtimeSyncInterval" value="5" />
```

### Modify Device Display Format

Edit `renderConnectedDevices()` function in `realtime-settings.js`

### Add Custom Events

Add handlers in the Socket.IO event listeners section:

```javascript
realtimeSocket.on('custom:event', (data) => {
	// Handle custom event
});
```

## Security Considerations

⚠️ **Important**: This implementation is designed for **local network use only**

- No authentication implemented (add your own for production)
- Uses CORS: `{ origin: '*' }` (restrict this in production)
- Exposes all localStorage data (consider filtering sensitive data)

## Dependencies

- **Socket.IO 4.5.4** (loaded via CDN)
- **Express.js** (server, already in package.json)
- **Node.js runtime** (for server.js)

## Troubleshooting

### Connection Fails

1. Check server is running: `npm start`
2. Verify server address in settings
3. Check firewall allows port 3000 (or configured port)
4. Click "Test Connection" for detailed error

### Devices Not Appearing

1. Ensure devices are loading `realtime-client.js`
2. Check browser console for Socket.IO errors
3. Click "Refresh Devices" button
4. Verify devices have localStorage enabled

### Data Not Syncing

1. Check "Auto-Sync Results" is enabled
2. Verify sync interval is appropriate
3. Check browser console for errors
4. Use "Sync All" button to manually trigger

## Future Enhancements

Potential improvements:

- [ ] Authentication/authorization
- [ ] Data encryption for sensitive info
- [ ] Device filtering and grouping
- [ ] Scheduled sync tasks
- [ ] Sync history/logs
- [ ] Custom data transformation
- [ ] Offline queue and retry logic
- [ ] WebRTC for P2P sync option

## Support

For issues or questions:

1. Check browser console (F12 > Console)
2. Check server logs
3. Review Socket.IO documentation: https://socket.io
4. Test with "Test Connection" button
