# Quick Reference: Exam vs Training Mode

## How the System Works

### Mode Detection

The system automatically detects the mode based on **localStorage examActiveSession**:

```javascript
// If examActiveSession exists AND has studentInfo verified → EXAM MODE
// If examActiveSession doesn't exist OR missing studentInfo → TRAINING MODE
```

**Key Point:** Student/Class verification is done via `examActiveSession.studentInfo` ONLY

- No need for quizExam or quizClass on student devices
- Anyone can access and use the quiz app interface
- Exam eligibility is verified by examining examActiveSession content

### Exam Mode (`examActiveSession`)

**Single source of truth:** `localStorage.examActiveSession`

**Contains:**

```json
{
    "examId": "exam-123",
    "examName": "Windows 7 Quiz",
    "duration": 5,
    "questions": [...],
    "settings": {
        "welcomeTitle": "...",
        "welcomeMessage": "...",
        "penalty": 0
    },
    "studentInfo": { "numero": "S001", "name": "John", "class": "Class A" },
    "completedAt": "2024-01-25T...",
    "results": {
        "score": 4,
        "totalPoints": 5,
        "answers": [...]
    }
}
```

**Data Flow:**

```
Admin sends exam → examActiveSession created (with studentInfo)
                → Contains: numero, name, class, examId, questions, settings
Student accesses app → System checks examActiveSession.studentInfo
                    → If studentInfo verified: EXAM MODE ✓
                    → If studentInfo missing: Falls back to TRAINING MODE
Student takes exam → Answers saved to examActiveSession.answers (real-time)
                  → Activity logged to quizActivity (quiz_started)
                  → Activity logged to quizActivity (answer_submitted, sampled)
Quiz ends → Results saved to examActiveSession.results
         → Activity logged to quizActivity (quiz_completed)
Admin syncs → Exam data available for review
           → Activity visible in dashboard/activity log
```

**Student Verification Logic:**

```javascript
// examActiveSession must have:
{
    "examId": "exam-123",           // ✓ Exam exists
    "studentInfo": {                // ✓ Student verified
        "numero": "S001",           // ✓ Student ID required
        "name": "John",             // ✓ Student name required
        "class": "Class A"          // ✓ Class required
    },
    "questions": [...],             // ✓ Questions loaded
    // ... other data
}

// If any of these are missing → Falls back to TRAINING MODE
```

**UI Behavior:**

- ✓ No instant feedback on answers (exam mode doesn't show if answer is right/wrong)
- ✓ No time penalty for wrong answers
- ✓ "Take Another Exam" button at end (not "Show Corrections")

---

### Training Mode (Multiple Storage Keys)

**Multiple sources:** `quizSettings`, `quizQuestions`, `quizActivity`, `quizResults`

**Data Structure:**

```javascript
// quizSettings (Quiz configuration)
{
    "totalQuestions": 5,
    "timeLimit": 300,
    "penalty": 5,
    "welcomeTitle": "...",
    "welcomeMessage": "..."
}

// quizQuestions (Question bank)
[{ question, options, answer, ... }, ...]

// quizResults (Quiz completion records)
[{
    "numero": "S001",
    "name": "John",
    "class": "Class A",
    "score": 4,
    "totalPoints": 5,
    "date": "2024-01-25T..."
}, ...]

// quizActivity (Dashboard activity log - logs from BOTH exam and training)
[{
    "type": "quiz_started",
    "studentName": "John",
    "examTitle": "Training Quiz",
    "mode": "training",
    "date": "2024-01-25T..."
}, {
    "type": "answer_submitted",
    "studentName": "John",
    "examTitle": "Training Quiz",
    "isCorrect": true,
    "questionNumber": 1,
    "mode": "training",
    "date": "2024-01-25T..."
}, {
    "type": "result",
    "studentName": "John",
    "examTitle": "Training Quiz",
    "score": "4/5",
    "date": "2024-01-25T...",
    "mode": "training"
}, ...]
```

**Data Flow:**

```
quizSettings → Quiz configuration
quizQuestions → Load questions
Student takes quiz → Activity logged: quiz_started
               → Answers stored in question objects
               → Activity logged: answer_submitted (sampled every 2 Qs)
Quiz ends → Results saved to quizResults
         → Activity logged: result (quiz_completed)
         → Dashboard updated
```

**UI Behavior:**

- ✓ Instant feedback: Correct answers highlighted in green, wrong in red
- ✓ Time penalty applied for wrong answers
- ✓ "Show Corrections" button at end (not "Take Another Exam")

---

## Settings Override Logic

When **Exam Mode** is active, settings from `examActiveSession.settings` are used:

| Setting         | Exam Source                                 | Training Source               |
| --------------- | ------------------------------------------- | ----------------------------- |
| Time Limit      | `examActiveSession.duration * 60`           | `quizSettings.timeLimit`      |
| Questions       | `examActiveSession.questions`               | `quizQuestions`               |
| Welcome Title   | `examActiveSession.settings.welcomeTitle`   | `quizSettings.welcomeTitle`   |
| Welcome Message | `examActiveSession.settings.welcomeMessage` | `quizSettings.welcomeMessage` |
| Penalty         | `examActiveSession.settings.penalty`        | `quizSettings.penalty`        |

---

## Key Functions and Their Roles

### `getExamMode()`

**Location:** `script.js` line ~95
**Does:** Determines current mode and returns settings
**Returns:** `{ mode, settings, examActiveSession }`
**Use:** Called at app initialization to determine behavior

### `loadQuizMode()`

**Location:** `script.js` line ~133
**Does:** Loads quiz configuration and questions based on mode
**Calls:** `getExamMode()`
**Result:** Sets `currentMode`, `currentExam`, `questions`, `quizConfig`

### `initQuiz()`

**Location:** `script.js` line ~263
**Does:** Initializes quiz state and displays first question
**Calls:** `loadQuizMode()`, `showQuestion()`, `startTimer()`

### `saveAnswer()`

**Location:** `script.js` line ~323
**Does:** Saves answer to appropriate storage based on mode
**Also:** Logs activity to quizActivity for both exam and training modes
**Exam Mode:** Saves to `examActiveSession.answers` (real-time) + logs activity
**Training Mode:** Saves to question object (for endQuiz processing) + logs activity

### `logActivity()`

**Location:** `script.js` line ~345
**Does:** Logs student activities to quizActivity storage for unified activity log
**Logged Events:**

- `quiz_started` - When student begins a quiz (exam or training)
- `answer_submitted` - When student submits an answer (sampled every 2 questions to avoid spam)
- `quiz_completed` - When quiz is finished and results are saved
  **Works With:** Both exam mode and training mode
  **Output:** Updates `quizActivity` in localStorage + refreshes dashboard if available

### `endQuiz()`

**Location:** `script.js` line ~2020
**Does:** Processes results and saves to appropriate storage
**Exam Mode:** Saves final results to `examActiveSession.results` + logs activity
**Training Mode:** Saves to `quizResults` and `quizActivity` + logs activity

---

## Answer Submission Flow

All answer types follow this pattern:

```javascript
// 1. Validate answer against correct answer
const isCorrect = /* validation logic */;

// 2. Get question points
const questionPoints = q.points || 1;

// 3. Save answer (to examActiveSession or question object)
saveAnswer(currentQuestion, userAnswer, isCorrect, questionPoints);

// 4. Update score and UI (differs by mode)
if (currentMode === 'training') {
    // Show feedback, apply penalty
} else {
    // Silent record, no visual feedback
}

// 5. Move to next question
currentQuestion++;
```

---

## Network Communication (Real-time Sync)

### Device ID

- **Generated:** On first connection in `realtime-client.js`
- **Persisted:** In `localStorage.deviceId`
- **Sent:** With every socket.io message to server
- **Purpose:** Identifies this device/client uniquely

### Real-time Event Handlers

```javascript
socket.on('session:receive', sessionPackage);
// → Save to examActiveSession
// → Reload page to apply

socket.on('admin:pushSettings', payload);
// → Save to quizSettings (training mode)
// → Reload page to apply

socket.on('admin:syncQuestions', payload);
// → Save to quizQuestions
// → Reload page to apply

socket.on('session:clear');
// → Remove examActiveSession
// → Reload page to reset
```

---

## Debugging: How to Check Which Mode is Active

### In Browser Console:

```javascript
// Check localStorage
JSON.parse(localStorage.getItem('examActiveSession')); // null = training mode
JSON.parse(localStorage.getItem('quizSettings'));
JSON.parse(localStorage.getItem('quizQuestions'));

// Check global variables
currentMode; // 'exam' or 'training'
currentExam; // null (training) or { id, name, questions, ... } (exam)

// Check for real-time device
localStorage.getItem('deviceId');
```

### What You'll See:

**Exam Mode:**

```
currentMode = 'exam'
currentExam = { id: '...', name: '...', questions: [...] }
localStorage.examActiveSession = { full exam data }
localStorage.quizResults = [] (empty - exam data only in examActiveSession)
```

**Training Mode:**

```
currentMode = 'training'
currentExam = null
localStorage.examActiveSession = null (or doesn't exist)
localStorage.quizSettings = { ... }
localStorage.quizQuestions = [ ... ]
localStorage.quizResults = [ ... ] (after quiz completion)
```

---

## Common Issues and Solutions

### Issue: Student has exam but it's showing training mode

**Cause:** `examActiveSession.studentInfo` is missing or incomplete

**Solution:**

1. Check `JSON.parse(localStorage.getItem('examActiveSession')).studentInfo` in console
2. Verify it has: `numero`, `name`, `class` properties
3. If missing, admin needs to push exam again with complete student info
4. If present, reload page

### Issue: Exam fallback to training mode intentionally

**When it happens:**

- Admin sent exam to class, but this student is NOT in that class
- Student is taking quiz anyway (open access allowed)
- System falls back to training mode with quizQuestions

**This is expected behavior:** Students can always use training mode regardless of class

### Issue: Quiz shows exam mode but should be training

**Solution:**

1. Check `localStorage.examActiveSession` - if it exists, clear it
2. Reload page
3. Verify `currentMode === 'training'`

### Issue: Answers not saving in exam mode

**Solution:**

1. Check if `examActiveSession` exists in localStorage
2. Verify quiz started from admin push (not manual entry)
3. Check browser console for errors in `saveAnswer()`

### Issue: Training mode but no feedback on answers

**Solution:**

1. Verify `currentMode === 'training'` in console
2. Clear localStorage and reload
3. Ensure `quizSettings` has correct values

### Issue: Real-time sync not working

**Solution:**

1. Check `deviceId` in localStorage (should exist)
2. Check browser console for socket.io connection
3. Verify server is running and accessible
4. Check network tab for socket.io messages
