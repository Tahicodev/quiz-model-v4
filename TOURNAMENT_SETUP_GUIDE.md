# Tournament Setup - Complete Guide

## Quick Start Workflow

### Step 1: Create Games First

Before setting up a tournament, you need to create games that students can play in the tournament.

1. Go to **Admin Panel** → **Games Studio**
2. Create at least 2-4 games with different types:
   - Example: "Card Battle Round 1" (type: **cards**)
   - Example: "Sprint Race Round 2" (type: **sprint-race**)
   - Example: "Hot Potato Challenge" (type: **hot-potato**)
3. Make sure each game has:
   - ✓ A unique name
   - ✓ A game type (cards, race, sprint-race, hot-potato, etc.)
   - ✓ Status set to **"open"** or **"draft"** (they filter by this)
   - ✓ At least one question/challenge

### Step 2: Set Up the Tournament

1. Go to **Admin Panel** → **Gamification** → **Tournament Planner**
2. Fill in the basic tournament settings:
   - **Tournament Name**: e.g., "Winter Championship 2024"
   - **Global Target Mode**: Choose the default game type for all rounds
     - **"Any Mode"**: Students can play any game type
     - **Specific Type** (cards, race, etc.): Only shows games of that type
   - **Format**: Choose elimination, swiss, or round-robin
   - **Max Participants**: How many students can join
   - **Rounds**: How many rounds the tournament has (1-25)

### Step 3: Configure Rounds

For each round that appears:

**Option A: Use Same Game Type in All Rounds**

- Just set the **Global Target Mode** at the top
- Each round will automatically use that mode
- Leave the per-round mode as "Use Global Setting"

**Option B: Different Game Types Per Round**

1. For each round, select a **different Target Game Mode**:
   - Round 1: Select "cards"
   - Round 2: Select "sprint-race"
   - Round 3: Select "hot-potato"

2. (Optional) Select specific games for each round:
   - If you want to restrict which games can be played
   - Only show certain games to students

3. If you don't select specific games:
   - Students see ALL games matching that round's target mode

### Step 4: Review & Start Tournament

1. Review the **Tournament Leaderboard** section
2. Click **"Start Tournament"** button
3. Students will now see the tournament in their workspace

---

## Understanding Global Mode vs Per-Round Mode

### Global Target Mode (Default for All Rounds)

- Set once at the top of the Tournament Planner
- Applies to ALL rounds automatically
- Students see games matching this type in every round

### Per-Round Target Mode (Override Specific Rounds)

- Set individually for each round
- **Empty = Use Global Setting**
- Set to a specific type = Override the global setting for just that round

### Example:

```
Global Target Mode: "Any Mode"

Round 1: Use Global Setting (Any Mode) → students see all games
Round 2: Override with "cards" → students see ONLY card games
Round 3: Override with "race" → students see ONLY race games
Round 4: Use Global Setting (Any Mode) → students see all games
```

---

## Troubleshooting

### Problem: "No games available for [mode]"

**Solution:**

1. Go to Games Studio and create games of that type
2. Make sure games have status "open" or "draft"
3. Return to Tournament Planner and refresh

### Problem: Games not appearing in Round Game Assignments

**Solution:**

1. First, check if games exist:
   - Go to **Tournament Diagnostic** → **Refresh Diagnostics**
   - See how many games are in localStorage
2. If no games:
   - Create games in Games Studio first
3. If games exist but don't show:
   - Check the Round's Target Mode
   - Games must match that mode to appear

### Problem: Students can't see games in tournament

**Solution:**

1. Make sure you've selected a Target Mode (not "empty")
2. If using per-round modes, check each round has a mode set
3. Verify games have status "open" or "draft"
4. Try the "Tournament Diagnostic" to verify setup

---

## Best Practices

1. **Create 2-4 games per game type** you want to use
2. **Test with test games first** using the Diagnostic tool
3. **Set Global Mode** as your default, then override specific rounds
4. **Don't change tournament settings** while it's active
5. **Monitor the Live Leaderboard** to track student progress

---

## Quick Reference

| Setting             | Effect                                                       |
| ------------------- | ------------------------------------------------------------ |
| Global Target Mode  | Default for all rounds unless overridden                     |
| Per-Round Mode      | Overrides global mode for just that round                    |
| Selected Games      | Restricts available games (if empty, uses all matching mode) |
| Status (open/draft) | Only these games show to students                            |
| Tournament Status   | "Active" = can't edit settings                               |

---

## Using the Tournament Diagnostic Tool

Visit **tournament-diagnostic.html** to:

- See how many games are loaded
- Check active tournament configuration
- Create test games (for testing)
- Clear all data (for resetting)
- View detailed console logs

### Example Test Workflow:

1. Visit "tournament-diagnostic.html"
2. Click "Create Test Games"
3. Go back to Admin Panel
4. Tournament Planner should now show 4 test games
5. You can now configure rounds with these games

---

**Need help?** Check the console (F12) for error messages or visit tournament-diagnostic.html for detailed system information.
