# Quiz App — LAN Realtime Setup

This project adds a simple LAN realtime server (Express + Socket.IO) to enable an admin to discover and pull localStorage data from up to 20 client machines running the quiz interface.

Quick start

1. Install dependencies on the server machine (one of the LAN PCs):

```bash
cd /home/tahicodev/quiz-model-v3
npm install
npm start
```

2. Open the admin panel from any browser on the LAN (use the server machine IP):

```
http://<SERVER_IP>:3000/admin.html
```

3. Open the quiz interface on student machines (up to 20):

```
http://<SERVER_IP>:3000/index.html
```

Notes

- The admin panel shows a floating "Devices (LAN)" panel listing detected clients (IP, status). Use "Request" to ask a client to send its localStorage immediately, or "Download" to download the last-known snapshot for that client.
- The admin can click "Merge All" to download a merged JSON file of all client data.
- The server stores client info in memory only (no persistence). Restarting the server clears the registry.
- To change the server host used by clients/admin via UI, open Settings and set the server host via the `setQuizServerHost(host)` helper or set `quizServerHost` in browser console/localStorage.

Security

- This is an internal LAN debugging tool. Do not expose the server to the public internet without adding authentication and TLS.

If you want, I can:

- Add a UI tab in Settings to set the server host and device limit.
- Add server-side persistence for collected data.
- Add admin-side merge/visualization in the results tab.
