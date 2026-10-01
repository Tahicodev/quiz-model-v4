# Importing Kids Space levels you generated yourself

You can write levels with ChatGPT, Claude or Gemini **on your own computer**, with
no API key and no connection to the school server, then bring the result into
Kids Space. This page is the exact format. It is not a convention: the app
rejects anything that deviates, so treat the field names, the counts and the
cross-references as fixed.

**Always check a file before importing it:**

```
node scripts/validate-kids-levels.mjs my-levels.json --template treasure_hunt
```

That command is the authority. It runs the same schemas the server runs, plus the
cross-reference rules the schemas cannot express (see [The rules the schemas
cannot check](#the-rules-the-schemas-cannot-check)). It is what stops a mistake
from reaching a child mid-game.

---

## 1. The file

A JSON file holding the levels. The validator accepts all three of these, and so
does the **Import a levels file** button in the wizard's AI content step:

- a bare array: `[ { … }, { … } ]`
- an object with a `levels` array: `{ "levels": [ { … } ] }`
- a single level on its own: `{ "level_type": …, "content_json": { … } }` —
  what you get after copying one example out of a chat

```json
{
  "levels": [
    {
      "level_type": "multiple_choice",
      "content_json": {
        "instruction": "Choisis la bonne réponse.",
        "question": "Combien font 2 + 2 ?",
        "options": [{ "id": "a", "value": "3" }, { "id": "b", "value": "4" }],
        "correctId": "b"
      }
    }
  ]
}
```

### Or a plain question, in the shape the Questions tab uses

A level written the way a question is written also imports, which is what makes
a level set portable: the same file works in the Questions tab and in a game.
Drop `content_json` and the ids, and say the mechanic with `type`.

```json
{
  "levels": [
    { "type": "mcq", "text": "Combien font 2 + 2 ?", "options": ["3", "4"], "answer": "4" },
    { "type": "true-false", "text": "Le soleil est une étoile.", "answer": "true" }
  ]
}
```

| `type` | becomes | needs `options`? |
| --- | --- | --- |
| `mcq` | `multiple_choice` | yes |
| `true-false` | `multiple_choice` | no — the game shows *True* and *False* |
| `order` | `word_order` | no, the letters of `answer` are the pieces |
| `fill-blank` | `drag_drop` | yes, the words to drag |
| `matching` | `matching` | yes, as `[["left", "right"], …]` |

Two things to know:

- `true-false` is a **question type, not a mechanic**. There is no `true_false`
  mechanic, so a level with `"level_type": "true_false"` is rejected.
- Only the four types above become a flat question. `memory`, `sorting`,
  `sequence`, `find_correct` and `bubble_pop` keep a game-only shape, because
  folding them into a plain question loses what makes them that mechanic —
  which card pairs with which, which order is right.

The `answer` may be the text of the correct option (`"4"`) or its id
(`"b"`) — both work. If a level says `language`, the file is checked in that
language; otherwise the wizard's own language is used.

## 2. One level

| Field | Required | Type | Notes |
|---|---|---|---|
| `level_type` | yes | string | The mechanic, or a game template. See [below](#3-level_type). |
| `content_json` | yes | object | The question itself. Its shape depends on `level_type`. |
| `order_index` | no | integer ≥ 0 | Position in the game. Defaults to the order in the array, so you can leave it out. |
| `points` | no | integer 1–500 | Score for a correct answer. Default `10`. |
| `hint` | no | string ≤ 300 chars | Shown when the child asks for help. |
| `explanation` | no | string ≤ 500 chars | Shown after a correct answer. |
| `media_url` | no | string | Optional asset URL. |
| `narrative_json` | no | object | Story beat: `storyText`, `characterSays`, `sceneDescription`, `sceneEmoji`. All optional. |

UTF-8, no comments, no trailing commas. A byte-order mark (which Notepad and
Word like to add) is tolerated by the validator.

## 3. `level_type`

There are nine **core mechanics**, and each one is a self-contained question:

`multiple_choice` · `word_order` · `drag_drop` · `matching` · `memory` ·
`sorting` · `sequence` · `find_correct` · `bubble_pop`

There are also **game templates**, which are narrative shells drawn on top of a
core mechanic: `treasure_hunt` · `obstacle_run` · `puzzle` · `board_game` ·
`build_construct` · `whack_tap` · `animal_rescue` · `space_adventure` · `cooking` ·
`escape_room` · `farm_garden`

For a **core mechanic**, put the mechanic in `level_type` and the question
directly in `content_json`. One `level_type` per level, always: a level is one
mechanic, and mixing two is rejected, because a level that changed mechanic
part-way has no single set of fields to play with.

For a **game template**, put the template in `level_type` and name the mechanic
inside `content_json` with an extra `mechanic` field. The template then wraps
that question in its world:

```json
{
  "level_type": "treasure_hunt",
  "content_json": {
    "mechanic": "multiple_choice",
    "worldText": "Le coffre s'ouvre ! Choisis la clé qui ouvre la serrure.",
    "instruction": "Choisis la bonne réponse !",
    "question": "Quelle clé ouvre ce coffre ?",
    "options": [
      { "id": "k1", "value": "La clé dorée", "emoji": "🔑" },
      { "id": "k2", "value": "La clé rouge", "emoji": "🔴" },
      { "id": "k3", "value": "La clé verte", "emoji": "🟢" }
    ],
    "correctId": "k1"
  }
}
```

`mechanic` must name one of the nine. Everything else in `content_json` is the
core mechanic's own content, unchanged.

---

## 4. The nine mechanics

Each example below is complete and passes the validator.

### multiple_choice — choose one answer (min 1 level)

```json
{
  "level_type": "multiple_choice",
  "points": 10,
  "hint": "Compte sur tes doigts.",
  "explanation": "4 + 3 font bien 7.",
  "content_json": {
    "instruction": "Choisis la bonne réponse !",
    "question": "Combien font 4 + 3 ?",
    "options": [
      { "id": "opt1", "value": "6", "emoji": "🌱" },
      { "id": "opt2", "value": "7", "emoji": "⭐" },
      { "id": "opt3", "value": "8", "emoji": "🍎" }
    ],
    "correctId": "opt2"
  }
}
```

`options`: 2 to 6. Each has `id` and `value`; `image` and `emoji` are optional.
`correctId` **must be the `id` of one of the options**.

### word_order — put the pieces in order (min 2 levels)

```json
{
  "level_type": "word_order",
  "content_json": {
    "instruction": "Remets les lettres dans le bon ordre pour former le mot.",
    "answer": "CHAT",
    "items": [
      { "id": "1", "value": "A" },
      { "id": "2", "value": "C" },
      { "id": "3", "value": "T" },
      { "id": "4", "value": "H" }
    ]
  }
}
```

`items` are the shuffled pieces, so their order in the file does not matter — but
they must be the same letters as `answer` (`A`, `C`, `T`, `H` is `CHAT`).
Grading ignores case and spaces. Works for whole words or single letters.

### drag_drop — drop words into gaps (min 2 levels)

```json
{
  "level_type": "drag_drop",
  "content_json": {
    "instruction": "Glisse le bon mot dans le trou.",
    "template": "Le {blank} brille dans le ciel.",
    "blanks": [{ "position": 0, "answer": "soleil" }],
    "choices": [
      { "id": "c1", "value": "soleil" },
      { "id": "c2", "value": "poisson" },
      { "id": "c3", "value": "voiture" }
    ]
  }
}
```

The critical part: **`position` is the 0-based index of the gap**, counting
`{blank}` tokens in `template` from left to right. `0` is the first gap, `1` the
second. The number of `{blank}` tokens must equal the number of entries in
`blanks`, and every `answer` must appear in `choices` or the child cannot drag it
in. (`_` is also treated as a gap, so avoid it unless you mean it.)

### matching — link the pairs (min 2 levels)

```json
{
  "level_type": "matching",
  "content_json": {
    "instruction": "Relie chaque mot à son contraire !",
    "pairs": [
      { "id": "p1", "left": "Grand", "right": "Petit", "leftEmoji": "🐘", "rightEmoji": "🐭" },
      { "id": "p2", "left": "Chaud", "right": "Froid", "leftEmoji": "🔥", "rightEmoji": "❄️" }
    ]
  }
}
```

`pairs`: 2 to 10. Each `id` must be unique — the child links a left side to a
right side, and grading compares those ids.

### memory — find the pairs (min 4 levels)

```json
{
  "level_type": "memory",
  "content_json": {
    "instruction": "Retrouve les deux cartes identiques !",
    "cards": [
      { "id": "c1", "matchId": "m1", "value": "Chien", "emoji": "🐶", "type": "emoji" },
      { "id": "c2", "matchId": "m2", "value": "Chiot", "emoji": "🐕", "type": "emoji" },
      { "id": "c3", "matchId": "m1", "value": "Chien", "emoji": "🐶", "type": "emoji" },
      { "id": "c4", "matchId": "m2", "value": "Chiot", "emoji": "🐕", "type": "emoji" }
    ]
  }
}
```

`cards`: 4 to 24, an even number in practice. Cards are paired by `matchId`, so
**every `matchId` must appear exactly twice** and each pair needs a different
`matchId`. `type` is `text`, `image` or `emoji` (default `text`).

### sorting — put items in categories (min 3 levels)

```json
{
  "level_type": "sorting",
  "content_json": {
    "instruction": "Trie les animaux dans leur habitat !",
    "categories": [
      { "id": "cat_farm", "label": "La ferme", "emoji": "🚜" },
      { "id": "cat_sea", "label": "La mer", "emoji": "🌊" }
    ],
    "items": [
      { "id": "i1", "value": "La vache", "emoji": "🐄", "categoryId": "cat_farm" },
      { "id": "i2", "value": "Le poisson", "emoji": "🐟", "categoryId": "cat_sea" },
      { "id": "i3", "value": "Le cochon", "emoji": "🐖", "categoryId": "cat_farm" },
      { "id": "i4", "value": "Le dauphin", "emoji": "🐬", "categoryId": "cat_sea" }
    ]
  }
}
```

`categories`: 2 to 4, each with a unique `id` and a `label`. `items`: 3 to 30.
Every `categoryId` must be the `id` of a category that exists. Use every
category at least once.

### sequence — put things in order (min 2 levels)

```json
{
  "level_type": "sequence",
  "content_json": {
    "instruction": "Remets les étapes dans l'ordre !",
    "items": [
      { "id": "n1", "value": "Semer la graine" },
      { "id": "n2", "value": "Arroser" },
      { "id": "n3", "value": "Récolter" }
    ],
    "correctOrder": ["n1", "n2", "n3"]
  }
}
```

`items`: 2 to 12. `correctOrder` must list **every item id exactly once** — it is
a permutation, not a subset.

### find_correct — pick the odd one out (min 3 levels)

```json
{
  "level_type": "find_correct",
  "content_json": {
    "instruction": "Trouve l'élément qui ne va pas avec les autres !",
    "question": "Lequel n'est pas un fruit ?",
    "items": [
      { "id": "i1", "value": "Pomme", "emoji": "🍎" },
      { "id": "i2", "value": "Poire", "emoji": "🍐" },
      { "id": "i3", "value": "Voiture", "emoji": "🚗" }
    ],
    "correctId": "i3"
  }
}
```

`items`: 3 to 12. `correctId` must be the `id` of the item that does not belong.

### bubble_pop — pop the right bubble (min 3 levels)

```json
{
  "level_type": "bubble_pop",
  "content_json": {
    "instruction": "Éclate seulement la bulle demandée !",
    "target": { "value": "étoile", "type": "emoji" },
    "bubbles": [
      { "id": "b1", "value": "étoile", "isCorrect": true },
      { "id": "b2", "value": "cœur", "isCorrect": false },
      { "id": "b3", "value": "lune", "isCorrect": false },
      { "id": "b4", "value": "soleil", "isCorrect": false }
    ]
  }
}
```

`bubbles`: 3 to 20. **Exactly one** bubble must have `"isCorrect": true`, and
its `value` must match `target.value`.

---

## 5. The rules the schemas cannot check

These pass validation and then break during a game, which is why the validator
looks for them separately. A child sees the failure, not you.

| Rule | What goes wrong otherwise |
|---|---|
| `correctId` is a real `id` | The answer can never be selected |
| `{blank}` count equals `blanks` count, `position` counts from 0 | Unplayable, or the right word lands in the wrong gap |
| Every `blanks[].answer` is in `choices` | The correct word is not draggable |
| `word_order` pieces are the letters of `answer` | The child cannot build the word |
| Every `matchId` appears exactly twice | An unpaired card can never be matched |
| Every `categoryId` exists | The item has nowhere to go |
| `correctOrder` is a full permutation | A missing item can never be placed |
| Exactly one `isCorrect` bubble, matching `target` | Wrong scoring, or an unwinnable game |
| `mechanic` names one of the nine | "This adventure needs a game mechanic" |

## 6. How many levels a game needs

A game cannot be published below its template's minimum.

| Levels | Templates |
|---|---|
| 1 | `multiple_choice` |
| 2 | `word_order`, `drag_drop`, `matching`, `sequence` |
| 3 | `sorting`, `find_correct`, `bubble_pop` |
| 4 | `memory`, `puzzle`, `animal_rescue`, `cooking`, `farm_garden` |
| 5 | `treasure_hunt`, `obstacle_run`, `board_game`, `build_construct`, `whack_tap`, `space_adventure`, `escape_room` |

The validator checks this when you pass `--template`.

---

## 7. Prompts to paste into ChatGPT, Claude or Gemini

Give the model the format, not just the topic. **The prompt the wizard shows is
the one to copy**: the *Copy format prompt* button in the AI step writes the
whole thing, including your own topic, grade, language and level count, so the
model is given the same contract the game validates. The version below is the
short fallback if you would rather paste it yourself.

For a **core mechanic**, ask for the flat question shape — the same one the
Questions tab uses, which is shorter and has no ids to get wrong:

```
You are producing levels for a children's educational game. One mechanic only:
multiple_choice, word_order, drag_drop or matching.

Return STRICTLY a JSON array, no markdown fence, no prose:

[
  { "type": "mcq", "text": "…", "options": ["…", "…"], "answer": "…", "hint": "…", "explanation": "…" }
]

Rules:
- "type" is mcq, true-false, order, fill-blank or matching. Multiple choice may
  also be asked as true-false: keep the same fields, set "type" to "true-false",
  "answer" to "true" or "false", and leave out "options".
- "answer" is the text of the correct option, or the correct piece for
  word_order.
- options 2-6; matching pairs 2-10 as [["left", "right"], …].
- No ids, no level_type, no content_json. Short text a 7 year old can read.
- Every string in the language asked for below.
```

For a mechanic with no plain-question shape — `memory`, `sorting`, `sequence`,
`find_correct`, `bubble_pop` — or for a game template, use the full shape below.

```
You are producing a levels file for a children's educational game.

Return ONE JSON object and nothing else: no prose, no markdown fence, no
comment. Shape:

{ "levels": [ { "level_type": "...", "content_json": { ... } } ] }

Rules, all mandatory:
- level_type is one of: multiple_choice, word_order, drag_drop, matching,
  memory, sorting, sequence, find_correct, bubble_pop.
- content_json must match the mechanic named by level_type.
- Every id you invent must be referenced consistently: correctId must equal the
  id of one existing option/item; correctOrder must list every item id exactly
  once; every categoryId must be a category id you defined.
- drag_drop only: the number of {blank} tokens in "template" equals the number
  of entries in "blanks", position starts at 0 and counts the {blank} tokens
  left to right, and every blank answer appears in "choices".
- memory only: every matchId appears exactly twice, at least 2 pairs.
- bubble_pop only: exactly one bubble has "isCorrect": true and it matches
  target.value.
- word_order only: the item values are the letters of answer, in any order.
- Use simple, short text suitable for a 7 year old. No HTML, no markdown, no
  LaTeX. Emoji are welcome and encouraged in "value" and "emoji" fields.
- Counts: options 2-6; word_order items 2+; drag_drop choices 2+; matching
  pairs 2-10; memory cards 4-24; sorting categories 2-4 and items 3-30;
  sequence items 2-12; find_correct items 3-12; bubble_pop bubbles 3-20.

Topic: <your topic>. Level: <grade>. Language: <fr or en>. Number of levels: <n>.

Before answering, check each id reference in your own output.
```

For a game template such as `treasure_hunt`, add this to the prompt:

```
Wrap each question in the adventure shell: set level_type to "treasure_hunt"
and add a "mechanic" field ("multiple_choice", "word_order", ...) plus a short
"worldText" to content_json. The rest of content_json is the mechanic's normal
content.
```

Then validate before importing:

```
node scripts/validate-kids-levels.mjs levels.json --template treasure_hunt
```

### Editor autocomplete

Point your editor at `docs/kids-levels.schema.json` to get completion and inline
errors while you write (VS Code: `"json.schemas": [{ "fileMatch": ["*.json"],
"url": "./docs/kids-levels.schema.json" }]`). It is generated from the same
schemas as the validator, via `node scripts/gen-kids-levels-schema.mjs`.

---

## 8. Getting the file into Kids Space

The file is a normal JSON payload for the activity:

```
PUT /api/v1/kids/activities/<activity-id>
{ "levels": [ ... ] }
```

Two behaviours worth knowing before you send it:

- **It replaces the level set.** Levels you leave out are deleted. Keep the whole
  set in the file, including `id` for the levels you want updated in place. A
  level sent without an `id` is created as new; a level whose `id` is unknown to
  the activity is also created as new, and can end up duplicated.
- **One level at a time** is `POST /api/v1/kids/activities/<activity-id>/levels`
  with a single level object, which appends it.
- **The save path wants the game shape.** The flat question shape in §1 is
  accepted by the *validator* and by the wizard's import button, which convert it
  before saving. Put the same question through `PUT` directly and send
  `level_type` plus `content_json`, as §2 describes.

Both are teacher-authenticated and scoped to your own school, and both require a
primary school. `content_json` may be sent as an object (preferred) or as an
already-stringified JSON string.
