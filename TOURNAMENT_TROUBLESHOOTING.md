# Tournament System - Troubleshooting & Quick Reference

## ⚡ QUICK START

### For Admin/Teacher

1. Open Admin Dashboard
2. Click Games Studio → Tournament Studio
3. Configure tournament:
   - Name
   - Game mode target
   - Max participants
   - Format (elimination/swiss)
   - Scoring rules
4. Click "Start Tournament"
5. Monitor leaderboard in real-time

### For Student

1. Open quiz workspace
2. Navigate to "Tournament" tab
3. See active tournament details
4. Click "Join Tournament"
5. Play games matching tournament mode
6. Watch points accumulate on leaderboard

---

## 🔧 TROUBLESHOOTING

### Issue: "Tournament Join button doesn't work"

**Symptoms**: Click doesn't respond, no changes
**Causes & Fixes**:

1. **No active tournament** → Admin must create and start one first
2. **Already joined** → Button shows "Joined" (disabled) - this is correct
3. **Socket not connected** → Check browser console for connection errors
4. **Browser offline** → Verify internet connection
5. **localStorage full** → Clear old tournament data: `localStorage.removeItem('quizTournamentsHistory')`

**Steps**:

```javascript
// Check in browser console:
1. localStorage.getItem('quizTournamentActive') // Should have tournament object
2. window.clientSocket?.connected // Should be true
3. Auth.getStudentContext() // Should have valid student data
```

---

### Issue: "Joined tournament but admin can't see me"

**Symptoms**: Admin leaderboard shows 0 participants
**Causes & Fixes**:

1. **Server sync disabled** → Verify `server.js` line 407 handler exists
2. **Socket broadcast failed** → Check server console for errors
3. **Different browser tabs** → Each tab has separate socket (open in same tab)
4. **Browser cache** → Hard refresh (Ctrl+Shift+R)

**Verification**:

```javascript
// Server console should show:
// "Tournament update synced successfully" message
// Check server.js line 430 for broadcast
```

---

### Issue: "Points not updating when I complete games"

**Symptoms**: Game says I won, but tournament leaderboard doesn't show points
**Causes & Fixes**:

1. **Wrong game mode** → Game must match tournament target mode
2. **Invalid game result** → Make sure you actually completed game (not quit)
3. **Not in tournament** → Must join first with "Join Tournament" button
4. **Gamification disabled** → Check Settings → Gamification toggle (must be ON)
5. **awardGamificationV2 broken** → Check server.js doesn't have syntax errors

**Validation**:

```javascript
// Browser console check:
1. Auth.getStudentContext().tournamentScores // Should have this tournament ID
2. localStorage.getItem('quizGamification') // Should have tournament data
3. window.clientSocket.emit('student:syncStoredData', {}, (ack) => console.log(ack))
```

---

### Issue: "Other students can't see me on the leaderboard"

**Symptoms**: Only I see my points, others see 0
**Causes & Fixes**:

1. **Real-time sync issue** → Points sync happens on game completion
2. **Multiple sockets** → Make sure everyone connects to same server
3. **Student data not syncing** → Verify `student:syncStoredData` handler in server.js works

**Steps**:

1. Complete a game while another student watches
2. Check browser console for sync messages
3. Verify `admin:syncGamification` events are received

---

### Issue: "Tournament ends but winner doesn't get rewards"

**Symptoms**: Admin clicks "End", no reward popup
**Causes & Fixes**:

1. **No games played** → Tournament must have point data to determine winner
2. **All students tied** → System picks first joiner as tie-breaker
3. **Badge system error** → Check utils.js awardBadge() function
4. **localStorage quota exceeded** → Clear old tournament records

**Check**:

```javascript
// In browser console:
localStorage.getItem('quizBadges'); // Should have new badge
localStorage.getItem('quizGamification'); // Should show updated EXP
```

---

### Issue: "Multiple tournaments running simultaneously"

**Solution**: Current system only supports 1 active

```javascript
// To run multiple in future:
// Change localStorage key from 'quizTournamentActive'
// to 'quizTournamentActive_[tournamentId]'
// Update references throughout codebase
```

---

## 📱 BROWSER CONSOLE DIAGNOSTICS

### Check if everything is connected

```javascript
// Run in student browser console:

// 1. Check socket connection
console.log('Socket connected:', window.clientSocket?.connected);

// 2. Check tournament data
console.log('Active tournament:', localStorage.getItem('quizTournamentActive'));

// 3. Check student context
console.log('Student context:', Auth.getStudentContext());

// 4. Check tournament join status
console.log('Am I in tournament?', Auth.getStudentContext().tournamentScores);

// 5. Check points
const ctx = Auth.getStudentContext();
console.log('Tournament points:', ctx.tournamentScores[ctx.activeId] || 0);

// 6. Force sync if stuck
window.clientSocket.emit('student:syncStoredData', {}, (ack) => {
	console.log('Sync response:', ack);
});
```

### Check admin can see updates

```javascript
// Run in admin browser console:

// 1. Check if tournament is active
console.log('Tournament active:', localStorage.getItem('quizTournamentActive'));

// 2. Check leaderboard data
const tournament = JSON.parse(localStorage.getItem('quizTournamentActive'));
console.log('Participants:', tournament?.participants || []);

// 3. Check server last sync
console.log('Last sync:', localStorage.getItem('lastGamificationSync'));

// 4. Force refresh
window.location.reload();
```

### Check server is working

```
// In terminal where server is running:
// Look for:
// ✓ "student:updateTournament" message when student joins
// ✓ "Broadcasting to X clients" message
// ✓ No error messages about tournament

// Test manually:
// 1. Open admin terminal
// 2. curl http://localhost:3000/health
// 3. Should return OK
```

---

## 🚨 COMMON ERRORS TO CHECK

### Error: "Cannot read property 'emit' of undefined"

**Means**: Socket not initialized
**Fix**:

```javascript
// Before using socket:
const socket = getSocket();
if (!socket?.connected) {
	console.error('Socket not ready');
	return;
}
```

### Error: "quizTournamentActive is null"

**Means**: No active tournament
**Fix**: Admin must create and start tournament first

```javascript
if (!localStorage.getItem('quizTournamentActive')) {
	console.log('No tournament - admin needs to create one');
}
```

### Error: "Tournament undefined at line 8250"

**Means**: Bug in sync function - tournament data missing
**Fix**: Check joinActiveTournament() doesn't have null tournament:

```javascript
if (!activeTournament || !activeTournament.id) {
	console.error('Invalid tournament data');
	return;
}
```

### Error: "Broadcast failed in server.js:430"

**Means**: Server handler has syntax error
**Fix**: Check these lines exist exactly:

- Line 407: `socket.on('student:updateTournament', ...)`
- Line 430: socket emit loop
- No missing brackets or semicolons

---

## 🔄 RESET TOURNAMENT DATA (if corrupted)

### Clear all tournament data

```javascript
// In browser console:
localStorage.removeItem('quizTournamentActive');
localStorage.removeItem('quizTournamentsHistory');
localStorage.removeItem('quizGamification');
localStorage.removeItem('user'); // WARNING: Also clears user data
location.reload();
```

### Clear only tournament history

```javascript
// Keep active tournament, only clear old ones:
localStorage.removeItem('quizTournamentsHistory');
```

### Keep only current tournament

```javascript
// Clear history but keep active:
const active = localStorage.getItem('quizTournamentActive');
localStorage.clear();
localStorage.setItem('quizTournamentActive', active);
```

---

## 📊 EXPECTED BEHAVIOR

### What should happen when student joins

```
1. Student clicks "Join Tournament"
2. joinActiveTournament() is called
3. Local tournament updated with student in participants[]
4. saveActiveTournamentRecord() stores to localStorage
5. syncTournamentUpdate() emits socket event
6. Server receives 'student:updateTournament'
7. Server validates and caches
8. Server broadcasts 'admin:syncGamification' to all
9. Admin receives update → leaderboard refreshes
10. Other students receive update → see participant count increase
11. Join button becomes "Joined" (disabled)
12. Toast shows "Joined tournament arena successfully"

Total time: < 500ms
```

### What should happen when game is completed

```
1. Student finishes game
2. Game result sent to awardGamificationV2()
3. System checks if tournament active
4. Checks if student is participant
5. Checks if game mode matches target
6. Awards: (expGained × multiplier) + winnerBonus
7. Updates tournamentScores[tournamentId]
8. Calls student:syncStoredData
9. Server receives and caches
10. Admin leaderboard recalculates
11. Admin sees updated points and ranks
12. Other students see this student's points update

Total time: < 1000ms
```

---

## ✅ VALIDATION CHECKLIST

Use this to verify tournament is working:

- [ ] Tournament shows in Tournament tab when created
- [ ] Join button is clickable when tournament is active
- [ ] Toast appears when clicking join
- [ ] Button changes to "Joined"
- [ ] Admin sees participant count increase
- [ ] Other students see participant count increase
- [ ] Student can click "Play" to start games
- [ ] Game selection filters to tournament mode
- [ ] Winning a game adds points to tournament score
- [ ] Leaderboard updates within 1 second of game completion
- [ ] Rank re-calculates based on new points
- [ ] Admin can end tournament
- [ ] Winner is identified correctly
- [ ] Winner gets badge notification
- [ ] Tournament data appears in history

---

## 📞 SUPPORT

If you encounter issues not covered above:

1. **Check browser console** (F12) for JavaScript errors
2. **Check server console** for sync/broadcast errors
3. **Verify socket connection** - look for "connected" message
4. **Test with 2 students** - if works with 2, scale up
5. **Try hard refresh** - Ctrl+Shift+R in browser
6. **Check localStorage** - verify quizTournamentActive has valid data
7. **Restart server** - sometimes helps with socket state
8. **Test in incognito** - rules out browser cache/extensions

---

## 🎯 NEXT STEPS FOR ENHANCEMENT

Future improvements that could be made:

1. **Multiple simultaneous tournaments** - Change localStorage keys to use tournament ID
2. **Team tournaments** - Add team field to participants
3. **Playoff rounds** - Auto-generate bracket after initial rounds
4. **Tie-breaking rules** - Configurable head-to-head, performance in final rounds
5. **Advanced seeding** - Pre-tournament performance history
6. **Time limits** - Countdown timer for tournament duration
7. **Re-entry windows** - Allow/disallow joins after specific time
8. **Custom scoring** - Per-tournament scoring algorithms
9. **Mobile app** - Native apps with notification push
10. **API for integrations** - Connect to other platforms
