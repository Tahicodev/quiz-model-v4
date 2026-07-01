# Quiz Model v3 - Warm-up & State Synchronization Analysis

## Executive Summary

The system uses a **server-authoritative architecture** where the canonical game state lives in Node.js server memory (`activeGames` Map), with clients receiving state updates via Socket.IO events. The warm-up phase is implemented only for **Card games** and uses math challenges to establish a winner before transitioning to the main game.

---

## 1. WARM-UP PHASE LOGIC

### 1.1 Warm-up Initialization

**File:** [game-server.js](game-server.js#L1084-L1102)

```javascript
function resetWarmupChallenge(game, reason = '') {
	if (!isCardGameType(game?.type)) return false;

	const math = generateMathChallenge(
		game.settings?.mathOperators,
		game.settings?.mathMin,
		game.settings?.mathMax,
	);

	const previousRound = Number(session.warmup?.round || 0);
	session.warmup = {
		question: math.question, // "5 + 3 = ?"
		answer: math.answer, // "8"
		startedAt: Date.now(),
		answers: [], // Track user answers
		winnerId: '', // Winner of warmup
		resolved: false,
		attempts: 0,
		maxAttempts: Math.floor(
			toPositiveNumber(game.settings?.warmupMaxAttempts, 5),
		),
		round: previousRound + 1,
		lastResetReason: String(reason || ''),
	};
	return true;
}
```

**Key Constraints:**

- Only for `cards` and `cards-draw` game types
- Max 5 attempts per challenge
- Uses configurable math operators, min, max values
- Each reset increments round counter

### 1.2 Warm-up Answer Processing

**Files:** [game-server.js](game-server.js) - Socket event handlers

```javascript
// Expected pattern (search game-server.js for warm-up answer handling):
// 1. Student submits answer via socket event
// 2. Server validates against session.warmup.answer
// 3. Tracks submission in session.warmup.answers array
// 4. When correct answer received or maxAttempts reached → warmup resolved
// 5. Winner determined and stored in session.warmup.winnerId
```

**Answer Tracking Structure:**

```javascript
session.warmup.answers = [
	{ userId, answer, answeredAt, correct },
	// ...
];
```

---

## 2. GAME STATE SYNCHRONIZATION PATTERNS

### 2.1 State Layers

```
┌─────────────────────────────────────────────────┐
│  Server (Node.js)                               │
│  - activeGames Map (authoritative)              │
│  - In-memory only (lost on restart)             │
└─────────────────────────────────────────────────┘
            ↓ emit: admin:syncGames
            ↓ emit: game:stateUpdate
┌─────────────────────────────────────────────────┐
│  Client Browser localStorage                    │
│  - quizGames: full game snapshots               │
│  - quizGamesSyncedAt: timestamp                 │
│  - Cache + persistence, never source of truth   │
└─────────────────────────────────────────────────┘
```

### 2.2 Merge Strategy (Warmup & Round Reset Detection)

**File:** [realtime-client.js](realtime-client.js#L746-L800)

```javascript
const mergeWarmup = (existingWarmup, incomingWarmup) => {
	if (incomingWarmup === null) return null;
	if (incomingWarmup === undefined) return existingWarmup || null;
	if (!existingWarmup) return incomingWarmup || null;

	const merged = { ...existingWarmup, ...incomingWarmup };

	// RESET DETECTION: Check if question or round changed
	const warmupReset =
		String(incomingWarmup.question || '') !==
			String(existingWarmup.question || '') ||
		Number(incomingWarmup.round || 0) !== Number(existingWarmup.round || 0) ||
		String(incomingWarmup.startedAt || '') !==
			String(existingWarmup.startedAt || '');

	if (Array.isArray(incomingWarmup.answers) && warmupReset) {
		// ✓ Replace answers on reset (fresh challenge)
		merged.answers = incomingWarmup.answers.slice();
	} else {
		// ✓ Merge answers when accumulating responses
		merged.answers = mergeAnswers(
			existingWarmup.answers || [],
			incomingWarmup.answers || [],
		);
	}

	merged.resolved = Boolean(existingWarmup.resolved || incomingWarmup.resolved);
	merged.winnerId = incomingWarmup.winnerId || existingWarmup.winnerId || '';
	merged.startedAt = incomingWarmup.startedAt || existingWarmup.startedAt;

	return merged;
};
```

**Critical Logic:**

- Detects warmup reset by comparing `question`, `round`, `startedAt`
- On reset: replaces answers array (don't merge old answers)
- On accumulation: merges new answers into existing (preserves history)
- Last answer wins in merge (sorted by `answeredAt`)

### 2.3 Answer Merge Algorithm

**File:** [realtime-client.js](realtime-client.js#L644-L666)

```javascript
const mergeAnswers = (existingList = [], incomingList = []) => {
	const map = new Map();

	// Load existing answers by userId
	existingList.forEach((entry) => {
		if (entry && entry.userId) map.set(entry.userId, entry);
	});

	// Merge incoming answers
	incomingList.forEach((entry) => {
		if (!entry || !entry.userId) return;
		const prev = map.get(entry.userId);
		if (!prev) {
			map.set(entry.userId, entry);
			return;
		}

		// Correct answer beats wrong answer
		if (entry.correct && !prev.correct) {
			map.set(entry.userId, { ...prev, ...entry });
			return;
		}

		// Later timestamp beats earlier
		const prevTime = prev.answeredAt || 0;
		const nextTime = entry.answeredAt || 0;
		if (nextTime > prevTime) {
			map.set(entry.userId, { ...prev, ...entry });
		}
	});

	return Array.from(map.values());
};
```

**Merge Priority:**

1. One entry per userId (de-duplicated)
2. Correct answer > wrong answer
3. Later timestamp > earlier timestamp

### 2.4 Sync Timing Detection

**File:** [realtime-client.js](realtime-client.js#L1082-L1127)

```javascript
const incomingTime = payload.syncedAt
	? new Date(payload.syncedAt).getTime()
	: 0;
const currentTime = localStorage.getItem('quizGamesSyncedAt')
	? new Date(localStorage.getItem('quizGamesSyncedAt')).getTime()
	: 0;

if (incomingTime && currentTime && incomingTime < currentTime) {
	// Incoming update is OLDER than local state
	// Only accept if:
	// 1. More participants
	// 2. Higher status rank (draft < open < live < completed)
	// 3. Warmup was resolved on server but not locally
	// 4. Session started on server but not locally

	if (
		incoming.session?.warmup?.resolved &&
		!current.session?.warmup?.resolved
	) {
		return true; // Accept old update if it resolves warmup
	}
}
```

---

## 3. REAL-TIME EVENT HANDLERS

### 3.1 Key Socket Events Flow

```
CLIENT INITIATION
├─ socket.emit('identify', { role: 'client' })
└─ socket.emit('client:requestGames')

ADMIN → CLIENT BROADCASTS
├─ admin:syncGames      ← Full game list with merge logic
├─ admin:syncUsers      ← User account list
├─ admin:syncGamification ← Tournament/gamification data
├─ game:stateUpdate     ← Individual game state change
└─ game:questionLocked  ← Immediate feedback (question locked)

CLIENT STATE UPDATES
├─ admin:syncGames      (mergeWarmup, mergeRound logic)
├─ game:stateUpdate     (upsert single game)
└─ game:questionLocked  (dispatch quiz:question-locked event)

PERIODIC SYNCS
├─ heartbeat (5s interval)
├─ sendLocalStorageUpdate (results only, not full data)
└─ initialSyncRequestTimer (250ms delay after connect)
```

### 3.2 Duplicate Sync Prevention

**File:** [realtime-client.js](realtime-client.js#L188-L228)

```javascript
function shouldSkipDuplicateSync(payload, listKey, syncType) {
	const nextKey = buildSyncPayloadKey(payload, listKey);

	if (syncType === 'games') {
		if (nextKey === lastSyncedGamesKey) {
			return true; // Skip if identical
		}
		lastSyncedGamesKey = nextKey;
		return false;
	}
	// Similar for 'users', 'gamification'
}

function buildSyncPayloadKey(payload, listKey) {
	return [
		payload.syncedAt || '',
		payload.scope?.type || 'global',
		payload.scope?.teacherId || '',
		Array.isArray(payload[listKey]) ? payload[listKey].length : 0,
		payload.cache ? 'cache' : 'live',
		list
			.slice(0, 12)
			.map((item) => item.id || item.userId || '')
			.join('|'),
	].join('::');
}
```

**Deduplication Key Components:**

- syncedAt timestamp
- scope type & teacherId
- list length
- cache vs live flag
- sample of first 12 item IDs

### 3.3 Game State Update Event

**File:** [realtime-client.js](realtime-client.js#L1248-L1280)

```javascript
socket.on('game:stateUpdate', (game) => {
	if (!game || !game.id) return;

	try {
		const gameId = String(game.id || '');
		const normalizedGame = window.GameCore?.normalizeGame
			? window.GameCore.normalizeGame(game)
			: game;

		if (normalizedGame?.session) {
			normalizeRealtimeCardSession(normalizedGame.session);
		}

		// Use GameCore cache, not just localStorage
		if (window.GameCore?.getQuizGames && window.GameCore?.saveQuizGames) {
			const existingGames = window.GameCore.getQuizGames();
			const index = existingGames.findIndex(
				(g) => String(g?.id || '') === gameId,
			);

			if (index >= 0) {
				existingGames[index] = { ...normalizedGame, id: gameId };
			} else {
				existingGames.push({ ...normalizedGame, id: gameId });
			}

			window.GameCore.saveQuizGames(existingGames);
		}

		// Dispatch event for UI updates
		window.dispatchEvent(new CustomEvent('quiz:games-updated'));
	} catch (e) {
		console.error('[GameClient] Failed to update local game store:', e);
	}

	logCardDebugSnapshot('game:stateUpdate', game.id);
});
```

### 3.4 Question Locked Event (Instant Feedback)

**File:** [realtime-client.js](realtime-client.js#L1283-L1292)

```javascript
socket.on('game:questionLocked', (data) => {
	if (!data) return;
	console.log(
		'[GameClient] Question locked in round',
		data.roundIndex,
		'winner:',
		data.winnerId,
	);

	// Immediate visual feedback before full stateUpdate
	window.dispatchEvent(
		new CustomEvent('quiz:question-locked', {
			detail: data,
		}),
	);
});
```

**Purpose:** Provides instant feedback while waiting for authoritative state update

---

## 4. GAME PHASE TRANSITIONS

### 4.1 Warm-up → Main Game Flow

```
LOBBY OPEN
├─ Participants join
└─ Ready to start

START GAME BUTTON CLICKED
├─ Server validation (≥2 participants, ≥1 question for cards)
├─ Initialize round 0
├─ Transition based on game type:
│
├─ FOR CARD GAMES:
│  ├─ resetWarmupChallenge() ← Create math challenge
│  ├─ Broadcast admin:syncGames with warmup state
│  ├─ Clients display warmup UI
│  ├─ Students submit answers
│  ├─ Server checks if warmup.resolved (winner found or maxAttempts)
│  ├─ Broadcast game:stateUpdate with warmup.winnerId
│  ├─ Transition to Round 0 (main game)
│  └─ Initialize card distribution
│
└─ FOR OTHER GAME TYPES:
   ├─ Skip warmup
   └─ Start Round 0 directly
```

### 4.2 Round Initialization

**File:** [game-server.js](game-server.js#L1344-L1356)

```javascript
function createRoundState(game, roundIndex) {
	const index = Number.isFinite(Number(roundIndex))
		? Math.max(0, Math.floor(Number(roundIndex)))
		: 0;
	return {
		questionId: game.questions[index]?.id || '',
		startedAt: Date.now(),
		answers: [],
		resolved: false,
	};
}
```

**Lifecycle:**

1. `createRoundState()` initializes
2. Students submit answers (accumulated in `answers[]`)
3. Timer expires or all answered → server resolves
4. `game:questionLocked` event broadcast
5. `game:stateUpdate` with resolved round
6. Transition to next round

---

## 5. SYNC ISSUES & VULNERABILITIES

### 5.1 CRITICAL SYNC ISSUE: Older Timestamp Rejection

**File:** [realtime-client.js](realtime-client.js#L1082-L1127)

**Problem:**

```javascript
// When server sends update with OLDER timestamp than local state:
if (incomingTime < currentTime) {
	// Rejects update unless special conditions
	// BUT: If warmup.resolved changes, it DOES accept old update
}
```

**Risk Scenario:**

1. Admin sends warmup state at `12:00:00`
2. Client receives earlier, stores as `quizGamesSyncedAt: 12:00:00`
3. Server connection drops, auto-reconnects at `12:01:00`
4. Server re-broadcasts same warmup at `12:00:00` (from memory)
5. Client sees `incomingTime (12:00:00) < currentTime (12:00:00+cache)` → **Rejected**
6. **Result:** Student sees stale warmup, submits answers that don't register

**Mitigation Status:**

- ✅ Checks `warmup?.resolved` status as override
- ⚠️ But only if incoming explicitly set resolved=true
- ❌ Doesn't handle partial warmup state updates

### 5.2 SYNC ISSUE: Warm-up Reset Detection

**File:** [realtime-client.js](realtime-client.js#L748-L755)

**Problem:**

```javascript
const warmupReset =
	String(incomingWarmup.question || '') !==
		String(existingWarmup.question || '') ||
	Number(incomingWarmup.round || 0) !== Number(existingWarmup.round || 0) ||
	String(incomingWarmup.startedAt || '') !==
		String(existingWarmup.startedAt || '');

if (Array.isArray(incomingWarmup.answers) && warmupReset) {
	merged.answers = incomingWarmup.answers.slice(); // Replace
}
```

**Risk:** String comparison of timestamp may fail due to:

- ISO format variations (`2024-01-01T00:00:00Z` vs `2024-01-01T00:00:00.000Z`)
- Timezone differences in serialization
- Floating point rounding in milliseconds

**Result:** Answers might not be reset when they should be

### 5.3 SYNC ISSUE: GameCore Cache Inconsistency

**File:** [realtime-client.js](realtime-client.js#L1248-L1270)

```javascript
// Preferred: Use GameCore cache
if (window.GameCore?.getQuizGames && window.GameCore?.saveQuizGames) {
	const existingGames = window.GameCore.getQuizGames();
	// update cache
	window.GameCore.saveQuizGames(existingGames);
} else {
	// Fallback: Direct localStorage
	localStorage.setItem('quizGames', JSON.stringify(dedupedGames));
}
```

**Risk:** Dual path means:

- If GameCore.saveQuizGames crashes silently → cache corrupted
- Fallback to localStorage may create divergence
- No error handling between the two

### 5.4 SYNC ISSUE: Card State Normalization

**File:** [realtime-client.js](realtime-client.js#L318-L390) - `normalizeRealtimeCardSession`

```javascript
if (card.pendingCard && typeof card.pendingCard === 'object') {
	card.pendingCard.questionId = normalizeCardQuestionIdRef(
		card.pendingCard.questionId,
	);
}
```

**Risk:** Mutation of object in-place without validation:

- If `card.pendingCard.questionId` is invalid → loses original reference
- No backup of original ID for debugging
- Silent data loss possible

### 5.5 SYNC ISSUE: Participant Merge

**File:** [realtime-client.js](realtime-client.js#L668-L686)

```javascript
const mergeParticipants = (existingList = [], incomingList = []) => {
	const map = new Map();
	existingList.forEach((p) => {
		if (p && p.userId) map.set(p.userId, { ...p });
	});
	incomingList.forEach((p) => {
		if (!p || !p.userId) return;
		const prev = map.get(p.userId) || {};
		map.set(p.userId, { ...prev, ...p }); // Last write wins
	});
	return Array.from(map.values());
};
```

**Risk:** "Last write wins" means:

- Server update always overwrites client-side status changes
- If student clicks "Ready" locally, server update resets it
- No conflict detection or versioning

---

## 6. BROADCAST PATTERNS

### 6.1 Question Update Broadcasting

**No explicit "question updated" event found**

**Assumption from code:**

1. Admin pushes updated game via `admin:syncGames`
2. Client receives full game snapshot
3. Client extracts new questions from `game.questions[]`
4. No delta/patch mechanism observed

**File:** [realtime-admin.js](realtime-admin.js#L236-L290)

```javascript
socket.on('admin:syncGames', (payload) => {
	// Full game list, then:
	persistAdminGames(payload.quizGames, payload.syncedAt);
	window.renderGameList();
	window.renderGameLobby();
	window.renderAdminGameWatch();
});
```

### 6.2 Game Phase Broadcast Pattern

**Event flow:**

```
emit('admin:syncGames', { quizGames: [...], syncedAt: '...' })
↓
Client receives full games with current phase in:
  - session.warmup.resolved
  - session.round (current round)
  - game.results (if completed)
↓
Client dispatches 'quiz:games-updated' event
↓
UI listeners update display
```

---

## 7. CODE QUALITY ISSUES

### 7.1 Missing Error Boundaries

**File:** [realtime-client.js](realtime-client.js#L1248-L1280)

```javascript
try {
	const normalizedGame = window.GameCore?.normalizeGame ? ... : game;
	// ... code that might throw
} catch (e) {
	console.error('[GameClient] Failed...', e);  // Only logs, doesn't recover
}
```

**Issue:** No recovery mechanism; game state may be corrupted

### 7.2 Silent Failures in Card Normalization

**File:** [realtime-client.js](realtime-client.js#L342-L390)

```javascript
function normalizeRealtimeCardSession(session) {
	const card = session?.card;
	if (!card || typeof card !== 'object') return;

	// Mutates in place, no validation
	if (card.pendingCard && typeof card.pendingCard === 'object') {
		card.pendingCard.questionId = normalizeCardQuestionIdRef(
			card.pendingCard.questionId,
		);
	}
}
```

### 7.3 No Transaction Semantics

- No rollback on partial sync failure
- No optimistic locking between client/server
- Concurrent updates can cause data loss

---

## 8. RECOMMENDATIONS

### Short Term

1. **Fix timestamp comparison:** Normalize ISO strings before comparison

   ```javascript
   const incomingTs = new Date(payload.syncedAt).getTime();
   const localTs = new Date(
   	localStorage.getItem('quizGamesSyncedAt'),
   ).getTime();
   ```

2. **Add warmup reset validation:**

   ```javascript
   const warmupReset = incomingWarmup.round > (existingWarmup.round || 0);
   ```

3. **Log sync decisions:**
   ```javascript
   console.log('[Sync] Warmup merge:', {
   	reset: warmupReset,
   	incoming: incomingWarmup.round,
   	existing: existingWarmup.round,
   });
   ```

### Medium Term

1. Implement version numbers for game state
2. Add conflict resolution strategy (CRDT-like)
3. Separate warmup state into independent sync topic

### Long Term

1. Migrate to server-sent events (SSE) for reliability
2. Implement pessimistic locking for live game state
3. Add sync audit logging for debugging

---

## SUMMARY TABLE

| Component        | Implementation                   | Sync Pattern                             | Issues                                        |
| ---------------- | -------------------------------- | ---------------------------------------- | --------------------------------------------- |
| **Warm-up**      | Math challenge (card games only) | Merge on question/round/timestamp change | Timestamp format may break reset detection    |
| **Round**        | Question + answers accumulation  | Merge answers by userId                  | Last-write-wins can lose concurrent updates   |
| **Participants** | Join/leave list                  | Merge by userId                          | No conflict detection for status changes      |
| **Card Hands**   | Array of question IDs per player | Replace if incomingCard provided         | Mutation without validation                   |
| **Questions**    | Delta not observed, full sync    | Full game snapshot replacement           | No incremental update support                 |
| **Game Status**  | draft → open → live → completed  | Status rank comparison                   | Older updates rejected (with warmup override) |
