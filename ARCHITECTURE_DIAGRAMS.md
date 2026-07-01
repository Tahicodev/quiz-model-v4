# Exam Mode vs Training Mode: Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        QUIZ APPLICATION                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Quiz Interface (index.html)                │  │
│  │  - Student info form                                         │  │
│  │  - Question display                                          │  │
│  │  - Answer submission                                         │  │
│  │  - Score tracking                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Mode Detection (getExamMode)                    │  │
│  │                                                              │  │
│  │  ┌─────────────────────┐      ┌──────────────────────────┐  │  │
│  │  │ Check localStorage  │─────→│ examActiveSession found? │  │  │
│  │  └─────────────────────┘      └──────────────────────────┘  │  │
│  │                                     │                        │  │
│  │                       ┌─────────────┴──────────────┐          │  │
│  │                       ↓                            ↓          │  │
│  │                   YES: EXAM              NO: TRAINING        │  │
│  │                   MODE                   MODE               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │         Load Mode & Initialize Quiz (loadQuizMode)          │  │
│  │                                                              │  │
│  │  ┌──────────────────────┐  ┌──────────────────────────────┐ │  │
│  │  │    EXAM MODE         │  │   TRAINING MODE              │ │  │
│  │  ├──────────────────────┤  ├──────────────────────────────┤ │  │
│  │  │ Load from:           │  │ Load from:                   │ │  │
│  │  │ - examActiveSession  │  │ - quizSettings               │ │  │
│  │  │   .questions         │  │ - quizQuestions              │ │  │
│  │  │   .settings          │  │ - quizActivity               │ │  │
│  │  │   .duration          │  │ - quizResults                │ │  │
│  │  └──────────────────────┘  └──────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Initialize Quiz (initQuiz)                      │  │
│  │  - Load questions array                                      │  │
│  │  - Set configuration                                         │  │
│  │  - Show first question                                       │  │
│  │  - Start timer                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │            Answer Submission & Processing                    │  │
│  │  (selectOption, submitMultiSelect, validateFillBlankAnswer)  │  │
│  │                              │                                 │  │
│  │                              ↓                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │  saveAnswer() - Save to appropriate storage              │ │  │
│  │  │                                                          │ │  │
│  │  │  ┌─────────────────┐       ┌──────────────────────────┐ │ │  │
│  │  │  │ EXAM MODE       │       │ TRAINING MODE            │ │ │  │
│  │  │  ├─────────────────┤       ├──────────────────────────┤ │ │  │
│  │  │  │ Save to:        │       │ Save to:                 │ │ │  │
│  │  │  │ examActiveSession       │ question object          │ │ │  │
│  │  │  │ .answers array  │       │ (for endQuiz processing) │ │ │  │
│  │  │  │ (real-time)     │       │                          │ │ │  │
│  │  │  └─────────────────┘       └──────────────────────────┘ │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  │                              │                                 │  │
│  │                              ↓                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │  Update Score & UI                                      │ │  │
│  │  │                                                          │ │  │
│  │  │  ┌─────────────────┐       ┌──────────────────────────┐ │ │  │
│  │  │  │ EXAM MODE       │       │ TRAINING MODE            │ │ │  │
│  │  │  ├─────────────────┤       ├──────────────────────────┤ │ │  │
│  │  │  │ - No visual     │       │ - Show feedback          │ │ │  │
│  │  │  │   feedback      │       │ - Color code answer      │ │ │  │
│  │  │  │ - Silent record │       │ - Apply time penalty     │ │ │  │
│  │  │  │ - Score updated │       │ - Update score           │ │ │  │
│  │  │  └─────────────────┘       └──────────────────────────┘ │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  │                              │                                 │  │
│  │                              ↓                                 │  │
│  │  ┌──────────────────────────────────────────────────────────┐ │  │
│  │  │  Move to Next Question                                  │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                      ┌───────┴────────┐                             │
│                      │ All questions  │                             │
│                      │   answered?    │                             │
│                      └───────┬────────┘                             │
│                              │                                      │
│                         YES  ↓  NO                                  │
│                          ┌───┴──────┐                               │
│                          │ Next Qn  │                               │
│                          └───┬──────┘                               │
│                              │                                      │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │            End Quiz & Save Results (endQuiz)                │  │
│  │                                                              │  │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐ │  │
│  │  │    EXAM MODE     │  │   TRAINING MODE                  │ │  │
│  │  ├──────────────────┤  ├──────────────────────────────────┤ │  │
│  │  │ Save to:         │  │ Save to:                         │ │  │
│  │  │ examActiveSession│  │ - quizResults (results array)    │ │  │
│  │  │ .results         │  │ - quizActivity (activity log)    │ │  │
│  │  │ .completedAt     │  │ - Dashboard updated              │ │  │
│  │  │ .answers         │  │                                  │ │  │
│  │  │ .studentInfo     │  │ Completion Screen:               │ │  │
│  │  │                  │  │ - Show Corrections button        │ │  │
│  │  │ Completion Screen│  │ - Show Previous Results button   │ │  │
│  │  │ - Take Another   │  │                                  │ │  │
│  │  │   Exam button    │  │                                  │ │  │
│  │  └──────────────────┘  └──────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │    Real-time Sync (via deviceId & socket.io)                │  │
│  │  - Results synchronized with admin                          │  │
│  │  - Device ID included in all communications                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Storage Architecture

### EXAM MODE Storage

```
┌─────────────────────────────────────────────────────────┐
│            localStorage.examActiveSession               │
│                                                         │
│  {                                                      │
│    examId: "exam-123"                                   │
│    examName: "Windows 7 Quiz"                           │
│    duration: 5                                          │
│                                                         │
│    settings: {                    ← Override quizSettings
│      welcomeTitle: "...",                               │
│      welcomeMessage: "...",                             │
│      penalty: 0                                         │
│    }                                                    │
│                                                         │
│    questions: [                   ← Main question source
│      {                                                  │
│        id: "q-1",                                       │
│        question: "...",                                 │
│        options: [...],                                  │
│        answer: "...",                                   │
│        points: 1,                                       │
│        ...                                              │
│      },                                                 │
│      ...                                                │
│    ]                                                    │
│                                                         │
│    studentInfo: {                 ← Filled after start  │
│      numero: "S001",                                    │
│      name: "John Doe",                                  │
│      class: "Class A"                                   │
│    }                                                    │
│                                                         │
│    answers: [                     ← Updated real-time
│      {                                                  │
│        questionIndex: 0,                                │
│        questionId: "q-1",                               │
│        questionText: "...",                             │
│        userAnswer: "Answer text",                       │
│        isCorrect: true,                                 │
│        points: 1,                                       │
│        pointsAwarded: 1,                                │
│        type: "multiple-choice",                         │
│        timestamp: "2024-01-25T..."                      │
│      },                                                 │
│      ...                                                │
│    ]                                                    │
│                                                         │
│    completedAt: "2024-01-25T..."  ← Set on completion  │
│                                                         │
│    results: {                     ← Set on completion
│      score: 4,                                          │
│      totalPoints: 5,                                    │
│      totalQuestions: 5,                                 │
│      timeSpent: 234,                                    │
│      answers: [...],                                    │
│      passed: true                                       │
│    }                                                    │
│  }                                                      │
│                                                         │
│  ✗ NOT SAVED: quizResult, quizActivity                 │
└─────────────────────────────────────────────────────────┘
```

### TRAINING MODE Storage

```
┌─────────────────────────────────────────────────────────┐
│          localStorage.quizSettings                      │
│                                                         │
│  {                                                      │
│    totalQuestions: 5,                                   │
│    timeLimit: 300,                                      │
│    penalty: 5,                                          │
│    welcomeTitle: "...",                                 │
│    welcomeMessage: "...",                               │
│    ...other settings...                                 │
│  }                                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│          localStorage.quizQuestions                     │
│                                                         │
│  [                                                      │
│    {                                                    │
│      question: "...",                                   │
│      options: [...],                                    │
│      answer: "...",                                     │
│      points: 1,                                         │
│      ...                                                │
│    },                                                   │
│    ...                                                  │
│  ]                                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           localStorage.quizResults                      │
│                                                         │
│  [                                                      │
│    {                                                    │
│      id: "S001-2024-01-25T...",                         │
│      numero: "S001",                                    │
│      name: "John Doe",                                  │
│      studentName: "John Doe",                           │
│      class: "Class A",                                  │
│      classId: "class-1",                                │
│      score: 4,                                          │
│      totalPoints: 5,                                    │
│      totalQuestions: 5,                                 │
│      time: 123,                                         │
│      date: "2024-01-25T...",                            │
│      dateTaken: "2024-01-25T...",                       │
│      examTitle: "Training Quiz",                        │
│      mode: "training"                                   │
│    },                                                   │
│    ...                                                  │
│  ]                                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│          localStorage.quizActivity                      │
│                                                         │
│  [                                                      │
│    {                                                    │
│      type: "result",                                    │
│      studentName: "John Doe",                           │
│      examTitle: "Training Quiz",                        │
│      name: "John Doe — Training Quiz",                  │
│      date: "2024-01-25T...",                            │
│      dateDisplay: "1/25/2024, 2:30:45 PM",              │
│      mode: "training",                                  │
│      isValid: true,                                     │
│      icon: "<svg>...",                                  │
│      color: "icon-blue",                                │
│      meta: {                                            │
│        score: "4/5",                                    │
│        class: "Class A",                                │
│        timeRemaining: 123                               │
│      }                                                  │
│    },                                                   │
│    ...                                                  │
│  ]                                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Mode Decision Tree

```
User visits quiz page (index.html)
         │
         ↓
┌─────────────────────────────┐
│ Check localStorage for      │
│ examActiveSession?          │
└─────────────────────────────┘
         │
    ┌────┴────┐
    │          │
   YES        NO
    │          │
    ↓          ↓
┌──────────┐  ┌──────────┐
│ EXAM     │  │ TRAINING │
│ MODE     │  │ MODE     │
└──────────┘  └──────────┘
    │              │
    ↓              ↓
Load from:     Load from:
 examActive     quizSettings
 Session         + quizQuestions

Use settings:  Use settings:
 examActive     quizSettings
 Session
 .settings

Store data:    Store data:
 examActive     quizResults
 Session        + quizActivity
 .answers
 .results

UI shows:      UI shows:
 No feedback    Immediate
 during quiz    feedback

End button:    End button:
 "Take Another" "Show
 Exam"          Corrections"
```

---

## Answer Submission Flow

```
┌──────────────────────────┐
│  User submits an answer  │
│ (any question type)      │
└────────────┬─────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ selectOption() / submitMultiSelect() /   │
│ validateFillBlankAnswer() /               │
│ handleDraggableNext() /                   │
│ handleMatchingPairsNext()                 │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ 1. Validate answer vs correct answer     │
│ 2. Determine: isCorrect (boolean)        │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ 3. Get question points                   │
│    const questionPoints = q.points || 1  │
└────────────┬─────────────────────────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ 4. Call saveAnswer()                     │
│                                          │
│    saveAnswer(                           │
│      questionIndex,                      │
│      userAnswer,                         │
│      isCorrect,                          │
│      questionPoints                      │
│    )                                     │
└────────────┬─────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
   EXAM              TRAINING
    │                 │
    ↓                 ↓
Save to:           Save to:
examActive         question
Session            object
.answers[]         only

Real-time          For later
storage            processing
    │                 │
    ↓                 ↓
┌──────────────────────────────────────────┐
│ 5. Update Score (if correct)             │
│    score += questionPoints               │
└────────────┬─────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
   EXAM              TRAINING
    │                 │
    ↓                 ↓
Update score   Update score
silently       + Show
(no visual     feedback
feedback)      + Apply penalty
               if wrong
    │                 │
    └────────┬────────┘
             │
             ↓
┌──────────────────────────────────────────┐
│ 6. Move to next question                 │
│    currentQuestion++                     │
│    showQuestion(currentQuestion)         │
└──────────────────────────────────────────┘
```

---

## Settings Resolution

```
When quiz initializes:

┌─────────────────────────────────────┐
│ getExamMode() checks:               │
│                                     │
│ if (examActiveSession exists) {     │
│   mode = 'exam'                     │
│   settings = examActiveSession      │
│              .settings || {}        │
│ } else {                            │
│   mode = 'training'                 │
│   settings = quizSettings           │
│              || {}                  │
│ }                                   │
└────────────┬────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────┐
│ Apply Settings to quizConfig:                       │
│                                                     │
│ ┌─────────────────┐     ┌──────────────────────┐   │
│ │ EXAM MODE       │     │ TRAINING MODE        │   │
│ ├─────────────────┤     ├──────────────────────┤   │
│ │ totalQuestions: │     │ totalQuestions:      │   │
│ │ questions.length│     │ settings.totalQns || │   │
│ │                 │     │ 5                    │   │
│ │ timeLimit:      │     │ timeLimit:           │   │
│ │ duration * 60   │     │ settings.timeLimit   │   │
│ │                 │     │ || 300               │   │
│ │ penalty:        │     │ penalty:             │   │
│ │ settings.penalty    │     │ settings.penalty    │   │
│ │ || 0            │     │ || 0                 │   │
│ │                 │     │                      │   │
│ │ welcomeTitle:   │     │ welcomeTitle:        │   │
│ │ settings.       │     │ settings.welcomeTitle    │
│ │ welcomeTitle    │     │ || 'Quiz Portal'     │   │
│ │ || examName     │     │                      │   │
│ │                 │     │ welcomeMessage:      │   │
│ │ welcomeMessage: │     │ settings.welcome     │   │
│ │ settings.       │     │ Message || default   │   │
│ │ welcomeMessage  │     │                      │   │
│ │ || default      │     │                      │   │
│ └─────────────────┘     └──────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Real-time Communication Flow

```
┌─────────────────────────────────────────────────────┐
│          Socket.io Connection                       │
│        (realtime-client.js)                         │
└─────────────────────────────────┬───────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
                    ↓                            ↓
        ┌──────────────────────┐    ┌──────────────────────┐
        │ Generate & Store     │    │ Send with every      │
        │ deviceId in          │    │ socket.io message:   │
        │ localStorage         │    │ deviceId             │
        └──────────────────────┘    └──────────────────────┘
                    │                            │
                    ↓                            ↓
        ┌──────────────────────────────────────────────┐
        │ Socket.io Event Handlers                     │
        │                                              │
        │ ┌────────────────────────────────────────┐  │
        │ │ session:receive                        │  │
        │ │ → Save to examActiveSession            │  │
        │ │ → Reload page → EXAM MODE activated   │  │
        │ └────────────────────────────────────────┘  │
        │                                              │
        │ ┌────────────────────────────────────────┐  │
        │ │ admin:pushSettings                     │  │
        │ │ → Save to quizSettings                 │  │
        │ │ → Reload page → TRAINING MODE updated │  │
        │ └────────────────────────────────────────┘  │
        │                                              │
        │ ┌────────────────────────────────────────┐  │
        │ │ admin:syncQuestions                    │  │
        │ │ → Save to quizQuestions                │  │
        │ │ → Reload page → Questions updated     │  │
        │ └────────────────────────────────────────┘  │
        │                                              │
        │ ┌────────────────────────────────────────┐  │
        │ │ session:clear                          │  │
        │ │ → Remove examActiveSession             │  │
        │ │ → Reload page → Switch to TRAINING    │  │
        │ └────────────────────────────────────────┘  │
        └──────────────────────────────────────────────┘
```

---

## Complete Quiz Lifecycle Example

### Exam Mode Journey

```
1. SETUP PHASE
   ↓
   Admin creates exam
   ↓
   examActiveSession pushed via socket.io
   ↓
   Student browser receives session:receive event
   ↓
   examActiveSession saved to localStorage
   ↓
   Page reloaded

2. INITIALIZATION PHASE
   ↓
   Student navigates to quiz page
   ↓
   getExamMode() detects examActiveSession
   ↓
   currentMode = 'exam'
   ↓
   loadQuizMode() loads from examActiveSession
   ↓
   Questions, duration, settings applied
   ↓
   initQuiz() starts quiz

3. TAKING EXAM PHASE
   ↓
   Question displayed (no answer indicators)
   ↓
   Student submits answer for Q1
   ↓
   Answer validated silently
   ↓
   saveAnswer() stores in examActiveSession.answers
   ↓
   Score updated (silently)
   ↓
   Next question shown
   ↓
   (Repeat for all questions)

4. COMPLETION PHASE
   ↓
   Last answer submitted
   ↓
   endQuiz() triggered
   ↓
   Final results calculated
   ↓
   examActiveSession.results populated with:
      - score, totalPoints, totalQuestions
      - timeSpent, answers[], passed flag
      - completedAt timestamp
   ↓
   All data saved to examActiveSession
   ↓
   Real-time sync sends to admin
   ↓
   Completion screen shown:
      "Quiz Completed!"
      [Take Another Exam] [Show Previous Results]

5. ADMIN REVIEW
   ↓
   Admin sees exam results
   ↓
   Can push new exam or clear session
   ↓
   Student browser syncs in real-time
```

### Training Mode Journey

```
1. SETUP PHASE
   ↓
   Admin configures settings
   ↓
   quizSettings pushed via socket.io
   ↓
   quizQuestions pushed via socket.io
   ↓
   Saved to localStorage
   ↓
   Page reloaded

2. INITIALIZATION PHASE
   ↓
   Student navigates to quiz page
   ↓
   getExamMode() finds no examActiveSession
   ↓
   currentMode = 'training'
   ↓
   loadQuizMode() loads from quizSettings & quizQuestions
   ↓
   Questions and settings applied
   ↓
   initQuiz() starts quiz

3. TAKING QUIZ PHASE
   ↓
   Question displayed
   ↓
   Student submits answer for Q1
   ↓
   Answer validated
   ↓
   Visual feedback shown:
      ✓ Correct → Green highlight
      ✗ Wrong → Red highlight + time penalty
   ↓
   saveAnswer() stores in question object
   ↓
   Score updated (with visual feedback)
   ↓
   Next question shown
   ↓
   (Repeat for all questions)

4. COMPLETION PHASE
   ↓
   Last answer submitted
   ↓
   endQuiz() triggered
   ↓
   Final results calculated
   ↓
   Results entry created:
      - Saved to quizResults array
      - Activity entry created in quizActivity
      - Dashboard updated
   ↓
   Completion screen shown:
      "Quiz Completed!"
      [Show Corrections] [Show Previous Results]

5. REVIEW PHASE
   ↓
   Student can review corrections
   ↓
   Can see previous quiz attempts
   ↓
   Results appear in dashboard
   ↓
   Admin can see activity in overview
```

This comprehensive architecture ensures clear separation between exam and training modes while maintaining seamless real-time synchronization.
