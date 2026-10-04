# 🧸 Kids Space — Adapted Implementation Plan
> **For:** `quiz-model-v4` · Target audience: Primary / Preschool teachers  
> **Principle:** No new question types — all games are **wrappers** that adapt the 7 existing question types into kid-friendly interactions using the existing `Question` schema and the available kids assets.

---

## 0. Core Philosophy

| Rule | Rationale |
|------|-----------|
| **One schema to rule them all** | Kids games consume `Question` rows exactly as quizzes and games do — same `type`, `text`, `options_json`, `answer`, `media_url`. No migration needed. |
| **Games = presentation layer** | A "Kids Game" is a themed skin + interaction wrapper on top of existing questions. The answer-checking logic is identical to the regular game engine. |
| **AI generation = same prompts, kid topics** | The existing AI generator is called with kid-friendly topic/difficulty parameters. It produces questions in the same JSON shape — no new AI pipeline needed. |
| **Unified tabs** | Kids Games live under the **Games tab** alongside regular games and tournaments — just a separate sub-tab / filter with a `is_kids` flag on the `Game` model. |

---

## 1. Existing Question Types → Kids Game Mapping

The 7 question types used in the app map to 7 themed kids games. Each game wraps one or more question types.

### 1.1 Type-to-Game Mapping Table

| App Question Type | Kids Game Name | Core Mechanic | Key Assets Used |
|---|---|---|---|
| `multiple-choice` (single) | 🫧 **Bubble Pop** | Tap the correct floating bubble | `bg-ocean`, `bg-jungle`, mascot states, `sfx-correct` |
| `multiple-choice` (multi, `allowMultipleAnswers`) | 🌟 **Star Collector** | Tap ALL stars that are correct | `bg-space`, `bg-magic`, mascot, `sfx-correct` |
| `true-false` | 🐸 **Leap Frog** | Swipe a frog LEFT (false) or RIGHT (true) | `bg-forest`, `bg-farm`, mascot |
| `odd-one-out` | 🧺 **Sort It Out** | Find the item that doesn't belong | `bg-circus`, mascot, `prop-adventure-blocks` |
| `matching` | 🎴 **Pair Party** | Drag lines to match pairs | `bg-school`, `bg-castle`, `prop-adventure-puzzle`, `sfx-hint` |
| `draggable` (order) | 🏗️ **Build-a-Tower** | Stack blocks in the correct order | `prop-adventure-blocks`, `bg-city`, mascot |
| `fill-blank` | 🪄 **Magic Words** | Drag words from a word bank into blanks | `bg-magic`, `prop-adventure-tap`, mascot |
| `code` (sub-mode) | 🔭 **Code Explorer** | Code MCQ/fill-blank with space theme | `bg-space`, `bg-dinosaur`, mascot |

> **Note on `code` type**: Code questions are presented as thematic "puzzles" — the code block is shown as a "scroll" or "ancient tablet" prop with a kid-friendly frame. The underlying interaction matches the question's `codeAnswerMode` (MCQ → Bubble Pop skin, fill-blank → Magic Words skin, etc.).

---

## 2. Data Model

### 2.1 No New Question Table
Questions are stored in the existing `Question` table. Kids games reference them via the existing `Game` → question list mechanism.

### 2.2 `KidsGame` Model (new Prisma model)
```prisma
model KidsGame {
  id           String   @id @default(uuid())
  school_id    String
  teacher_id   String
  name         String
  description  String?
  game_type    String   // 'bubble-pop' | 'star-collector' | 'leap-frog' | 
                        //  'sort-it-out' | 'pair-party' | 'build-a-tower' |
                        //  'magic-words' | 'code-explorer'
  theme        String   @default("jungle") // bg-* keys from assets.txt
  grade        String?  // CP | CE1 | CE2 | CM1 | CM2 | Maternelle
  subject      String?  // Maths | Français | Sciences | ...
  questions_json String  // JSON: Question[] — snapshot at publish time, same shape
                         // as the existing Question model (type, text, options_json, answer, ...)
  config_json  String?  // game-specific config: time_per_q, max_hints, mascot_theme, etc.
  status       String   @default("draft") // draft | published | archived
  play_count   Int      @default(0)
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  school       School         @relation(fields: [school_id], references: [id], onDelete: Cascade)
  teacher      User           @relation(fields: [teacher_id], references: [id], onDelete: Cascade)
  sessions     KidsGameSession[]

  @@index([school_id])
  @@index([teacher_id])
  @@index([game_type])
  @@index([grade])
  @@index([status])
}

model KidsGameSession {
  id           String   @id @default(uuid())
  game_id      String
  player_name  String   // kid enters just their first name (no login required)
  avatar       String?  // chosen animal emoji / color
  score        Int      @default(0)
  stars        Int      @default(0) // 0-3 stars rating
  answers_json String?  // [{question_id, given, correct, time_ms}]
  completed    Boolean  @default(false)
  created_at   DateTime @default(now())

  game KidsGame @relation(fields: [game_id], references: [id], onDelete: Cascade)

  @@index([game_id])
  @@index([created_at])
}
```

### 2.3 Question Shape Reused (No Change)
The `questions_json` field in `KidsGame` stores an **array of Question objects** with the same exact shape already used everywhere:

```jsonc
[
  {
    "id": "...",          // original Question.id (for deduplication)
    "type": "multiple-choice",   // existing app type
    "text": "Which animal lives in the ocean?",
    "options_json": "[\"Shark\",\"Lion\",\"Elephant\",\"Eagle\"]",
    "answer": "Shark",
    "explanation": "Sharks are fish that live in the ocean.",
    "points": 1,
    "difficulty": "easy",
    "media_url": null     // teacher-supplied image URL / base64
  }
]
```

---

## 3. AI Content Generation

The existing AI generator (`AIService.js`) is reused with kid-friendly parameters. No new AI endpoint is needed — just a new **Kids AI wizard** UI panel that:

1. Lets the teacher pick: **game type → topic → grade → count**
2. Maps the game type to its underlying question type(s):
   - Bubble Pop → `multiple-choice`
   - Leap Frog → `true-false`
   - Sort It Out → `odd-one-out`
   - Pair Party → `matching`
   - Build-a-Tower → `draggable`
   - Magic Words → `fill-blank`
   - Star Collector → `multiple-choice` + flag `allowMultipleAnswers: true`
   - Code Explorer → `code`
3. Calls `POST /api/v1/ai/generate` with:
   ```json
   {
     "type": "multiple-choice",
     "topic": "Farm animals",
     "difficulty": "easy",
     "count": 5,
     "audience": "kids-primaire",
     "language": "fr"
   }
   ```
4. The AI service already uses the exact same JSON output format — questions drop directly into the `questions_json` array.
5. **Missing assets prompt**: If the teacher wants image options, a simple upload dialog appears for each question that needs a `media_url` (or they can use AI image generation if configured).

---

## 4. Game Mechanics — End-to-End Workflows

### 4.1 🫧 Bubble Pop (multiple-choice single)
**Source type:** `multiple-choice`  
**Assets:** `bg-ocean` / any theme, mascot states, `sfx-correct`, `sfx-retry`

**Workflow:**
1. **Setup (teacher):** Pick questions from bank or AI-generate. Choose theme. Set time per bubble (default 15s). Publish → get a 4-char PIN code.
2. **Join (kid):** Enter PIN on the kids player URL. Type first name. Choose avatar (animal emoji).
3. **Gameplay loop:**
   - Background fills with the chosen theme (e.g. ocean).
   - Question text appears at the top in a large, playful font.
   - 2–4 answer options float as animated colored bubbles on screen.
   - A countdown ring surrounds each bubble.
   - Kid taps a bubble → bubble pops with particle animation.
   - **Correct:** mascot jumps (excited), `sfx-correct` plays, stars rain down, score increments.
   - **Wrong:** mascot shakes head (encourage), `sfx-retry` plays, the correct bubble glows.
   - If time runs out → all bubbles pop with a puff, correct one stays outlined.
4. **End screen:** Total stars (0–3 based on score %), mascot celebrates, `badge-finish` or `badge-star-master` shown.

**Answer checking:** `given === question.answer` (string equality, existing logic).

---

### 4.2 🌟 Star Collector (multiple-choice multi)
**Source type:** `multiple-choice` with `allowMultipleAnswers: true`  
**Assets:** `bg-space`, `bg-magic`, mascot, `sfx-correct`, `sfx-celebration`

**Workflow:**
1. **Setup:** Teacher picks multi-answer questions. Theme = Space or Magic.
2. **Gameplay loop:**
   - Stars float around the background.
   - Each star has an answer option on it.
   - Kid taps stars to collect them (selected = glowing).
   - A "Check!" button appears at bottom.
   - On submit: correct stars pulse gold, wrong selections dim.
   - Score = (correct collected / total correct) × points.
3. **End screen:** Constellation of collected stars, score, mascot celebration.

---

### 4.3 🐸 Leap Frog (true-false)
**Source type:** `true-false` (stored as `multiple-choice` with `options_json: ["True","False"]`)  
**Assets:** `bg-forest`, `bg-farm`, mascot (idle on lily pad)

**Workflow:**
1. **Gameplay loop:**
   - Frog sits on a lily pad in the center.
   - Question text appears in a speech bubble above the frog.
   - Two lily pads labeled ✅ (True) and ❌ (False) animate left and right.
   - Kid taps a pad (or swipes on mobile) → frog leaps to that pad.
   - Correct pad turns green, wrong turns red.
   - Mascot reacts accordingly.
2. Simple, fast — ideal for very young learners (Maternelle / CP).

---

### 4.4 🧺 Sort It Out (odd-one-out)
**Source type:** `odd-one-out`  
**Assets:** `bg-circus`, `prop-adventure-blocks`, mascot, `sfx-hint`

**Workflow:**
1. **Gameplay loop:**
   - 4 items appear as cards/tiles (text or images from `media_url`).
   - "Find the one that doesn't belong!" instruction from mascot.
   - Kid taps a tile → it bounces. Tap again to deselect.
   - **Submit:** If correct tile selected, it flies away with a pop; remaining 3 group together.
   - **Wrong:** Tiles shake, hint available (uses `sfx-hint`).
2. Optional image mode: if all 4 options have `media_url`, images are shown on cards.

---

### 4.5 🎴 Pair Party (matching)
**Source type:** `matching`  
**Assets:** `bg-school`, `prop-adventure-puzzle`, mascot, `sfx-correct`

**Workflow:**
1. **Data:** `options_json` contains pairs: `["A:1","B:2","C:3"]` (standard matching format). Answer = `"A:1,B:2,C:3"`.
2. **Gameplay loop:**
   - Left column: terms (shuffled). Right column: definitions (shuffled).
   - Kid taps a left item → it highlights. Then taps a right item → a line draws between them.
   - When all pairs connected: "Check!" button.
   - Correct pairs: lines turn green and lock. Wrong: lines turn red, items bounce back.
   - Max 3 hints (a hint reveals one correct pair — uses `sfx-hint`).
3. **End screen:** Puzzle pieces snap together animation, stars rating.

---

### 4.6 🏗️ Build-a-Tower (draggable / order)
**Source type:** `draggable` (ordering)  
**Assets:** `prop-adventure-blocks`, `bg-city`, `bg-castle`, mascot, `sfx-correct`

**Workflow:**
1. **Data:** `options_json` = items in shuffled order; `answer` = correct comma-joined order.
2. **Gameplay loop:**
   - Items appear as colorful blocks stacked randomly.
   - Kid drags blocks to rearrange them (drag-and-drop within a stack).
   - An animated "crane" or "character" helps place blocks.
   - "Build!" button when ready.
   - Correct: tower shakes with celebration, mascot cheers.
   - Wrong: tower wobbles, wrong block glows.
3. Supports 2–6 items (optimal for kids).

---

### 4.7 🪄 Magic Words (fill-blank)
**Source type:** `fill-blank` (with optional word bank `options_json`)  
**Assets:** `bg-magic`, `prop-adventure-tap`, mascot, `sfx-correct`

**Workflow:**
1. **Data:** `text` contains `___` placeholder(s); `options_json` = word bank; `answer` = correct word(s).
2. **Gameplay loop:**
   - Sentence displayed with blank(s) shown as glowing scrolls / parchment slots.
   - Word bank shown as floating bubbles at the bottom.
   - Kid drags a word bubble into the blank → it snaps in.
   - "Cast the spell!" button.
   - Correct: sparkle animation, mascot waves wand.
   - Wrong: words bounce back, incorrect slot glows red.
3. If `options_json` is empty, falls back to a large typed-text input (with emoji keyboard for Maternelle).

---

### 4.8 🔭 Code Explorer (code)
**Source type:** `code` (with any `codeAnswerMode`)  
**Assets:** `bg-space`, `bg-dinosaur`, `prop-immersive-planets`, mascot

**Workflow:**
1. Code block displayed in a friendly "scroll" or "robot screen" UI frame (no scary dark editor).
2. Interaction layer = the `codeAnswerMode` maps to its kid game:
   - `multiple-choice` → Bubble Pop skin
   - `fill-blank` → Magic Words skin
   - `matching` → Pair Party skin
   - `draggable` → Build-a-Tower skin
   - `odd-one-out` → Sort It Out skin
3. Suitable for CM1/CM2 (older primary students).

---

## 5. UI Architecture

### 5.1 Admin / Teacher Side — Games Tab Changes

**Current Games Tab structure:**
```
Games Tab
├── Games sub-tab (existing regular games)
└── Tournaments sub-tab
```

**New structure:**
```
Games Tab
├── Games sub-tab (existing)
├── 🧸 Kids Games sub-tab  ← NEW
│   ├── [Filter bar: by game type, grade, subject, status]
│   ├── [Game cards grid]
│   └── [+ New Kids Game button]
└── Tournaments sub-tab
```

**For Admin role:** Sees ALL school's kids games. Filter bar includes: Teacher, Game Type, Grade, Subject, Status.

**For Teacher role:** Sees ONLY their own kids games. Filter bar: Game Type, Grade, Subject, Status.

---

### 5.2 Kids Game List — Card Design
Each game card shows:
- Themed background thumbnail (from chosen theme asset)
- Game type badge (🫧 Bubble Pop, 🐸 Leap Frog, etc.)
- Grade badge (CP, CE1, etc.)
- Subject pill
- Question count
- Star rating average (from `KidsGameSession`)
- Play count
- Status badge (Draft / Published)
- Actions: **Edit | Play Preview | Share PIN | Archive**

---

### 5.3 Kids Game Creator Wizard (Teacher)

**Step 1 — Game Type:** Visual card picker with animated preview GIFs of each game type.

**Step 2 — Theme:** Scrollable theme gallery using the 12 `bg-*` assets. Preview updates live.

**Step 3 — Questions:** Three source options:
- **From Question Bank** (filter by category, type, difficulty, tags — standard bank picker)
- **AI Generate** (Kids AI wizard as described in §3)
- **Manual Entry** (inline question form — same fields as the existing question editor but simplified UI)

**Step 4 — Config:**
- Game name, grade, subject
- Time per question (5s–60s slider)
- Max hints (0–3)
- Mascot theme (same as background theme or custom)
- Allow replay (yes/no)

**Step 5 — Publish & Share:**
- Publish → generates a 4-char PIN
- Shows a shareable QR code + PIN card (printable, kid-friendly design)
- A public URL: `/kids/play/{PIN}`

---

### 5.4 Kids Player Page (`/kids/play/{PIN}`)

**No login required.** Kid-facing page with:
1. **Welcome screen:** Theme background fills the screen. Mascot waving. Kid enters name + picks avatar.
2. **Game screen:** Full-screen immersive game with the interaction for that game type (as described in §4).
3. **Result screen:** Stars (0–3), mascot celebration, badge unlock, "Play Again" button.
4. **Responsive:** Works on tablet (classroom iPad) and desktop (classroom projector). Touch-first.

---

## 6. Backend API — New Endpoints

All new routes are added to `src/backend/routes/kids.routes.js` (new file) and mounted at `/api/v1/kids`.

### 6.1 Teacher / Admin Endpoints (auth required)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/kids/games` | List kids games (filtered by role: admin=all, teacher=own). Query params: `game_type`, `grade`, `subject`, `status`, `teacher_id` (admin only), `search`, `limit`, `offset` |
| `POST` | `/api/v1/kids/games` | Create a new kids game |
| `GET` | `/api/v1/kids/games/:id` | Get a single kids game (auth: own or admin) |
| `PATCH` | `/api/v1/kids/games/:id` | Update kids game (own or admin) |
| `DELETE` | `/api/v1/kids/games/:id` | Delete kids game (own or admin) |
| `POST` | `/api/v1/kids/games/:id/publish` | Publish game → generate PIN |
| `GET` | `/api/v1/kids/games/:id/sessions` | Get all sessions/results for a game |
| `POST` | `/api/v1/kids/ai/generate` | Generate questions for a kids game (wraps existing AI service) |

### 6.2 Public Kid Player Endpoints (no auth)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/kids/play/:pin` | Get published game data by PIN (returns questions + config, no answers) |
| `POST` | `/api/v1/kids/play/:pin/session` | Start a game session (creates `KidsGameSession`) |
| `PATCH` | `/api/v1/kids/play/session/:sessionId` | Submit answers + complete session |

---

## 7. Schema (Zod Validation)

```javascript
// src/shared/schemas/kids-game.schema.js

const KIDS_GAME_TYPES = [
  'bubble-pop', 'star-collector', 'leap-frog', 'sort-it-out',
  'pair-party', 'build-a-tower', 'magic-words', 'code-explorer'
];

const KIDS_THEMES = [
  'jungle', 'space', 'ocean', 'farm', 'castle',
  'dinosaur', 'forest', 'city', 'circus', 'magic', 'school', 'superhero'
];

const KIDS_GRADES = ['maternelle', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'];

export const KidsGameCreateSchema = z.object({
  name:           z.string().min(1).max(200),
  description:    z.string().max(1000).optional().nullable(),
  game_type:      z.enum(KIDS_GAME_TYPES),
  theme:          z.enum(KIDS_THEMES).default('jungle'),
  grade:          z.enum(KIDS_GRADES).optional().nullable(),
  subject:        z.string().max(100).optional().nullable(),
  questions_json: z.string().min(2), // JSON array of Question objects
  config_json:    z.string().optional().nullable(),
  status:         z.enum(['draft','published','archived']).default('draft'),
});

export const KidsGameUpdateSchema = KidsGameCreateSchema.partial();

export const KidsGameFilterSchema = z.object({
  game_type:  z.enum(KIDS_GAME_TYPES).optional(),
  grade:      z.enum(KIDS_GRADES).optional(),
  subject:    z.string().optional(),
  status:     z.enum(['draft','published','archived']).optional(),
  teacher_id: z.string().uuid().optional(), // admin only
  search:     z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  offset:     z.coerce.number().int().min(0).default(0),
});

export const KidsSessionCreateSchema = z.object({
  player_name: z.string().min(1).max(50),
  avatar:      z.string().max(10).optional(),
});

export const KidsSessionCompleteSchema = z.object({
  answers_json: z.string(), // [{question_id, given, correct, time_ms}]
  score:        z.number().int().min(0),
  stars:        z.number().int().min(0).max(3),
  completed:    z.boolean().default(true),
});
```

---

## 8. AI Generation — Kids Wizard

The Kids AI wizard calls the **existing** `/api/v1/ai/generate` endpoint with adapted parameters:

```javascript
// Teacher selects: game_type = 'bubble-pop', topic = 'Les animaux de la ferme', 
// grade = 'cp', count = 5

const questionTypeMap = {
  'bubble-pop':     'multiple-choice',
  'star-collector': 'multiple-choice', // + allowMultipleAnswers hint in prompt
  'leap-frog':      'true-false',
  'sort-it-out':    'odd-one-out',
  'pair-party':     'matching',
  'build-a-tower':  'draggable',
  'magic-words':    'fill-blank',
  'code-explorer':  'code',
};

// Request to existing AI endpoint:
{
  type:       questionTypeMap[game_type],
  topic:      "Les animaux de la ferme",
  difficulty: "easy",          // kids always get easy/medium
  count:      5,
  language:   "fr",
  // Kids-specific system prompt injection (new option):
  audience:   "primaire",      // instructs LLM to use simple vocabulary
  grade:      "cp"             // further constrains complexity
}
```

**The response is the same JSON array** of questions already used everywhere. The wizard just inserts them into `questions_json`.

**Missing asset handling:** After AI generation, the wizard shows each question. If a question could benefit from an image (e.g. Sort It Out with pictures), the teacher sees an "Add image" button per option. They can:
- Upload an image file
- Paste an image URL
- (If AI image generation configured) Generate with one click

---

## 9. Assets Integration

### 9.1 Existing Assets → Game Mapping

| Asset | Used In |
|-------|---------|
| `bg-jungle`, `bg-space`, `bg-ocean`, `bg-farm`, `bg-castle`, `bg-dinosaur`, `bg-forest`, `bg-city`, `bg-circus`, `bg-magic`, `bg-school`, `bg-superhero` | Full-screen background per game theme |
| `mascot-idle` | Default/waiting state |
| `mascot-happy` | Correct answer |
| `mascot-encourage` | Wrong answer (supportive) |
| `mascot-excited` | Streak / high score |
| `mascot-amazed` | New personal best |
| `mascot-celebrate` | Game completed |
| `prop-adventure-blocks` | Build-a-Tower blocks + Sort It Out tiles |
| `prop-adventure-puzzle` | Pair Party connecting lines / puzzle frame |
| `prop-adventure-tap` | Magic Words word bank bubbles |
| `prop-adventure-treasure` | End screen reward chest |
| `prop-immersive-planets` | Code Explorer decoration |
| `prop-immersive-seeds` | Leap Frog / Farm theme decoration |
| `badge-finish` | Completion reward (any game) |
| `badge-star-master` | 3-star rating reward |
| `badge-streak-hero` | Streak/fast answers reward |
| `sfx-correct` | Correct answer sound |
| `sfx-retry` | Wrong answer sound |
| `sfx-celebration` | Game completion fanfare |
| `sfx-hint` | Hint used |
| `puzzle-reveal-template` | Pair Party background puzzle (teacher supplies image) |

### 9.2 Asset Serving
Assets are served from `public/kids/assets/` (already the `output_root` in `assets.txt`). The existing files in `Kids assets/` are copied to `public/kids/assets/` as part of the setup step.

### 9.3 Missing Assets — Teacher Supply
For `puzzle-reveal-template` (Pair Party reveal image) and any custom `media_url` on questions, the teacher is prompted in the creator wizard. The upload goes through the existing `/api/v1/uploads` endpoint.

---

## 10. Implementation Phases

### Phase 1 — Data Layer (Week 1)
- [ ] Add `KidsGame` and `KidsGameSession` models to `prisma/schema.prisma`
- [ ] Run migration
- [ ] Add `kids-game.schema.js` to `src/shared/schemas/`
- [ ] Copy `Kids assets/` files to `public/kids/assets/` (organized by category)
- [ ] Create `src/backend/routes/kids.routes.js` with all 9 endpoints
- [ ] Register route in `src/backend/server.js`

### Phase 2 — Teacher UI — Kids Games List (Week 2)
- [ ] Add **Kids Games** sub-tab to the Games tab in `admin.html`
- [ ] Kids game list with cards (grid layout, themed card design)
- [ ] Filter bar (game type, grade, subject, status, teacher — role-aware)
- [ ] Card actions: Edit, Preview, Share PIN, Archive
- [ ] PIN / QR code share modal (printable kid-friendly design)

### Phase 3 — Kids Game Creator Wizard (Week 3)
- [ ] 5-step wizard modal in `admin.html`
- [ ] Step 1: Game type picker (animated cards)
- [ ] Step 2: Theme gallery
- [ ] Step 3: Questions (bank picker + AI wizard + manual entry)
- [ ] Step 4: Config panel
- [ ] Step 5: Publish + share
- [ ] Wire to API endpoints

### Phase 4 — Kids Player Page (Week 4)
- [ ] Create `public/kids/index.html` — PIN entry landing
- [ ] Create `public/kids/play.html` — full-screen game page
- [ ] Implement `KidsPlayerEngine` JS class with:
  - Question loader (from public API by PIN)
  - Session tracker
  - Answer checker (same string equality / array match logic as existing)
  - Score / stars calculator
- [ ] Implement each of the 8 game renderers (one JS class per game type)
- [ ] Implement `SoundManager` (using existing `.mp3` assets)
- [ ] Implement `MascotManager` (state machine: idle → happy/encourage/celebrate)
- [ ] Implement results/end screen

### Phase 5 — AI Kids Wizard (Week 5)
- [ ] Kids AI wizard panel in the creator (Step 3)
- [ ] Game type → question type mapping
- [ ] Grade/audience parameter injection
- [ ] Missing asset prompt UI
- [ ] Wire to existing AI endpoint

### Phase 6 — Polish & Testing (Week 6)
- [ ] Touch / tablet responsiveness (iPad-first)
- [ ] Accessibility (large fonts, high contrast, screen-reader labels)
- [ ] Teacher results dashboard (per-game session list, per-question accuracy)
- [ ] Print PIN card (A4, kid-friendly design)
- [ ] E2E tests for each game type's answer checking
- [ ] Asset preloading / offline-friendly caching

---

## 11. File Structure

```
quiz-model-v4/
├── public/
│   └── kids/
│       ├── index.html           ← PIN entry page
│       ├── play.html            ← Game player
│       ├── kids-player.css      ← Kids-specific styles
│       ├── kids-player.js       ← Main player engine
│       └── games/
│           ├── BubblePopGame.js
│           ├── StarCollectorGame.js
│           ├── LeapFrogGame.js
│           ├── SortItOutGame.js
│           ├── PairPartyGame.js
│           ├── BuildATowerGame.js
│           ├── MagicWordsGame.js
│           └── CodeExplorerGame.js
├── src/
│   ├── shared/
│   │   └── schemas/
│   │       └── kids-game.schema.js   ← New schema (Zod)
│   └── backend/
│       └── routes/
│           └── kids.routes.js         ← New routes
├── Kids assets/                       ← Source assets (copy to public/kids/assets/)
└── prisma/
    └── schema.prisma                  ← Add KidsGame + KidsGameSession models
```

---

## 12. Answer Checking — Unified Logic

The existing answer-checking logic from `student-workspace.js` / `game-server.cjs` is reused as-is. The `KidsPlayerEngine` calls the same comparison functions:

| Question Type | Answer Format | Check |
|---|---|---|
| `multiple-choice` | `"Shark"` | `given === answer` |
| `multiple-choice-multi` | `"Shark,Dolphin"` | same items (order-insensitive) |
| `true-false` | `"true"` or `"false"` | `given.toLowerCase() === answer.toLowerCase()` |
| `odd-one-out` | `"Lion"` (the odd one) | `given === answer` |
| `matching` | `"A:1,B:2,C:3"` | all pairs match (order-insensitive) |
| `draggable` | `"Step1,Step2,Step3"` | exact order match |
| `fill-blank` | `"apple"` | `given.trim().toLowerCase() === answer.trim().toLowerCase()` |

No new logic. Kids games just provide a different UI to collect the `given` string, then run the same check.

---

## 13. Teacher Results / Analytics

A "Results" tab inside each kids game detail shows:
- Total play count
- Average score %
- Average stars
- Per-question accuracy table (same format as exam analytics)
- Session list: player name, avatar, score, stars, date, duration

This reuses the existing `results-management.js` patterns — just filtered on `KidsGameSession`.

---

## 14. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No new question types** | Preserves schema unity. All 7 types are sufficient for every educational game scenario for primary school. |
| **Questions stored as JSON snapshot in `KidsGame`** | Same approach used for `Game.questions_json` in the existing app — decoupled from the question bank (teacher can edit the bank without breaking published kids games). |
| **No student login for kids player** | Primary/preschool kids don't have school accounts. PIN + first name is the right UX. Results are associated with `KidsGameSession`, not a `User`. |
| **AI reuses existing endpoint** | No duplication. The `audience: "primaire"` and `grade` params are added as optional hints to the system prompt in the existing AI route — minimal change. |
| **`is_kids` flag on Game vs. separate `KidsGame` model** | Chose separate model: kids games have significantly different config (theme, mascot, grade, PIN), different sessions (no user FK), and a completely different player UI. Mixing them into `Game` would bloat it. |
| **Games Tab integration** | Kids Games added as a **sub-tab** inside the existing Games tab — not a separate top-level tab. This keeps navigation simple and admin can filter across all game types from one place. |

---

*Plan version: 1.0 — October 2026 — Adapted from original kids-space concept to match quiz-model-v4 architecture.*
