# Tournament System - Quick Reference Card

## Getting Started (5 Minutes)

### 1️⃣ Create Games

- Admin Panel → Games tab
- Create 2-4 games with different types
- Make sure status = "open" or "draft"

### 2️⃣ Set Up Tournament Initial Settings

- Admin Panel → Gamification tab
- Fill: Name, Global Mode, Format, Rounds
- Scroll down to "Round Game Assignments"

### 3️⃣ Configure Each Round

- For each round, optionally:
  - Override Target Mode (or leave as "Use Global")
  - Select specific games (or leave empty for all)
- Games list shows count available

### 4️⃣ Start Tournament

- Click "Start Tournament" button
- Status changes to "Active"
- Students see tournament in workspace

---

## Common Settings

| Setting            | What It Does                   | Default             |
| ------------------ | ------------------------------ | ------------------- |
| Global Target Mode | Default for all rounds         | any                 |
| Round Target Mode  | Override for one round only    | (inherit global)    |
| Game Selection     | Restrict which games available | (all matching mode) |
| Tournament Format  | How brackets are made          | elimination         |
| Rounds             | Number of tournament rounds    | 4                   |
| Max Participants   | Max students who can join      | 16                  |

---

## Mode Options

| Type            | Example Games     |
| --------------- | ----------------- |
| `any`           | All game types    |
| `cards`         | Card Battle games |
| `cards-draw`    | Card Draw Battle  |
| `race`          | Lightning Race    |
| `sprint-race`   | Sprint Race       |
| `hot-potato`    | Hot Potato        |
| `last-survivor` | Last Survivor     |

---

## Troubleshooting

| Problem                | Solution                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Games not showing      | 1. Create games first<br>2. Check game status = "open"<br>3. Refresh page                                 |
| Wrong games showing    | Check the Round's Target Mode<br>Make sure it matches game type                                           |
| Tournament won't start | Check all required fields filled<br>At least 1 game created<br>At least 1 student joined                  |
| Students see no games  | Verify tournament is "Active"<br>Check round has games selected<br>Games status must be "open" or "draft" |

---

## Diagnostic Tools

### Built-in Diagnostic

- **URL**: `http://localhost:3000/tournament-diagnostic.html`
- **Test**: See games loaded ✓
- **Create**: 4 test games for testing ✓
- **Debug**: Check tournament status ✓

### Console Logs (F12)

- Opens in browser console
- Shows error messages
- Search for "DIAGNOSTIC" in console

---

## Files You Might Need

| File                                    | Purpose                           |
| --------------------------------------- | --------------------------------- |
| `admin.html`                            | Admin panel all controls          |
| `tournament-diagnostic.html`            | Debug and test tournament         |
| `TOURNAMENT_SETUP_GUIDE.md`             | Detailed step-by-step guide       |
| `TOURNAMENT_IMPLEMENTATION_COMPLETE.md` | Technical overview                |
| `games-management.js`                   | Tournament code (lines 3565-4040) |

---

## Tournament Data Structure

```javascript
// What gets saved to localStorage["quizTournamentActive"]
{
  id: "tournament-uuid",
  name: "Winter Championship",
  targetMode: "any",                    // Global default
  rounds: 4,
  status: "active",
  roundAssignments: [
    {
      round: 1,
      targetMode: "cards",              // Specific mode for this round
      gameIds: ["game1", "game2"]        // Specific games for this round
    },
    {
      round: 2,
      targetMode: "race",
      gameIds: ["game3"]
    },
    // ... more rounds
  ],
  // ... other tournament data
}
```

---

## Student View Logic

```
For each round, student sees games that:
✓ Match the round's targetMode (or global if not set)
✓ Are in gameIds list (if specified, otherwise all matching)
✓ Have status = "open" or "draft"
```

---

## Tips for Success

✅ **DO:**

- Create games FIRST before tournament
- Use consistent game type naming
- Test with diagnostic tool first
- Keep game status clear (open vs draft)
- Review leaderboard while tournament runs

❌ **DON'T:**

- Change settings after tournament starts
- Create empty tournaments (at least 1 game needed)
- Mix games with no status
- Forget to set Rounds count
- Rely on "Any Mode" without checking games exist

---

## One-Line Explanations

**Global Target Mode**: Default game type for all rounds (can override per-round)

**Per-Round Target Mode**: Game type for just one round (empty = use global)

**Game Selection**: Choose specific games for a round (empty = all matching type)

**Tournament Active**: Status when tournament is running (can't edit settings)

**Round Assignment**: Configuration for each round (mode + games)

---

## Quick Test

```
1. Go: tournament-diagnostic.html
2. Click: "Create Test Games"
3. Go: admin.html Gamification
4. Fill: Tournament name + rounds
5. Should see 4 test games in round selectors
6. Click: "Start Tournament"
✓ Tournament is live!
```

---

## If Something Breaks

**Check in this order:**

1. F12 → Console → Look for red errors
2. Go to tournament-diagnostic.html
3. Check how many games loaded
4. Check if tournament is "Active"
5. Verify all games have correct status
6. Try: Clear All Data and start fresh

---

**Last Updated**: 2024
**Status**: Ready for Production Use
