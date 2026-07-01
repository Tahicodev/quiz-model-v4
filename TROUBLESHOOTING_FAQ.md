# Troubleshooting & FAQ

## Common Questions & Solutions

### Q1: How do I verify which mode the quiz is in?

**Check localStorage in Browser DevTools:**

```javascript
// Open Browser Console (F12)

// Check for examActiveSession
JSON.parse(localStorage.getItem('examActiveSession'));
// Output: null → Training Mode
// Output: { examId: "...", ... } → Exam Mode

// Check global variables
console.log(currentMode); // 'exam' or 'training'
console.log(currentExam); // null or { id, name, ... }
console.log(quizConfig); // Current quiz settings
```

---

### Q2: Quiz is in exam mode but I want it in training mode. How do I switch?

**Solution: Clear the exam session**

```javascript
// In Browser Console:
localStorage.removeItem('examActiveSession');
location.reload();

// OR in Admin Interface:
// Click "Clear Session" button
// This will push session:clear event to all clients
```

---

### Q3: Quiz is in training mode but should be in exam mode. How do I fix it?

**Solution: Push exam session from admin**

```javascript
// Using Admin Interface:
1. Go to Exam Management
2. Select exam
3. Click "Push to Class" or "Push to Student"
4. Select target class/student
5. Click "Send"

// In real-time, the quiz page will:
// - Receive session:receive event
// - Save examActiveSession to localStorage
// - Reload page
// - Automatically switch to exam mode
```

---

### Q4: Real-time sync isn't working. What do I check?

**Troubleshooting Steps:**

```javascript
// 1. Check if deviceId exists
localStorage.getItem('deviceId');
// Should return: 'device-xxxxxxxxx'
// If null, refresh page to regenerate

// 2. Check socket.io connection
console.log(io.connected); // Should be: true
// Or check Network tab for socket.io messages

// 3. Check server URL
localStorage.getItem('quizServerHost');
// Should point to correct admin server URL

// 4. Check if real-time-client.js is loaded
typeof window.io; // Should be: 'function'

// 5. Monitor socket events
// Add to realtime-client.js temporarily:
socket.onAny((event, ...args) => {
	console.log('[SOCKET]', event, args);
});
```

---

### Q5: Answers aren't being saved. What went wrong?

**Exam Mode:**

```javascript
// Check if examActiveSession exists
localStorage.getItem('examActiveSession');
// If null: Exam wasn't properly pushed from admin

// Check if answers are being saved
const session = JSON.parse(localStorage.getItem('examActiveSession'));
console.log(session.answers);
// Should show array of answer objects

// Check browser console for errors in saveAnswer()
// Look for: "Error saving answer to examActiveSession"
```

**Training Mode:**

```javascript
// Check if questions have userAnswer property
console.log(questions[0].userAnswer);
// Should show the submitted answer

// Check if results were saved after quiz
const results = JSON.parse(localStorage.getItem('quizResults'));
console.log(results[results.length - 1]); // Last result
// Should show your recent quiz attempt
```

---

### Q6: Visual feedback appears in exam mode (should be silent)

**This is a bug. Check:**

```javascript
// Verify currentMode is actually 'exam'
console.log(currentMode); // Should be 'exam'

// The issue might be in selectOption() or submitMultiSelect()
// These should only show feedback if currentMode === 'training'

// Temporary fix:
// Find the line: if (currentMode === quizModes.training) {
// Make sure feedback code is inside this block
```

---

### Q7: Results saved in wrong location (exam results in quizResults instead of examActiveSession)

**This shouldn't happen. Verify:**

```javascript
// Check the mode at quiz end
console.log(currentMode); // Should be 'exam'
console.log(currentExam); // Should NOT be null

// If mode is wrong, results will go to wrong location
// Solution: Start over with proper exam session
localStorage.removeItem('examActiveSession');
localStorage.removeItem('quizResults');
location.reload();
```

---

### Q8: Data inconsistency - examActiveSession and quizResults both have results

**This shouldn't happen in normal operation. Solutions:**

```javascript
// Option 1: Clear the questionable data
// If exam mode was correct:
localStorage.removeItem('quizResults');
// Or keep it for reference

// Option 2: Clear everything and start fresh
localStorage.clear();
location.reload();

// This typically happens if:
// 1. Mode switched mid-quiz
// 2. Page was reloaded during quiz
// 3. Both modes were somehow active simultaneously
```

---

### Q9: Settings from quizSettings are being used instead of examActiveSession.settings

**Verify settings loading:**

```javascript
// Check which settings object was used
console.log(quizConfig); // Final quiz configuration
console.log(currentMode); // Should be 'exam'

// Check exam settings
const session = JSON.parse(localStorage.getItem('examActiveSession'));
console.log(session.settings); // Should match quizConfig

// The loadQuizMode() function should apply exam settings
// If not working, check getExamMode() is returning correct values
const { mode, settings } = getExamMode();
console.log(mode, settings); // Should show 'exam' and correct settings
```

---

### Q10: Previous attempts not showing in training mode

**Troubleshooting:**

```javascript
// Check if results were saved
const results = JSON.parse(localStorage.getItem('quizResults'));
console.log(results); // Should be an array

// Check if activity was logged
const activity = JSON.parse(localStorage.getItem('quizActivity'));
console.log(activity); // Should be an array

// If both are empty arrays:
// 1. Quiz might not have been completed
// 2. Quiz ended with error
// 3. Data was cleared

// Check the results structure:
// Should have: numero, name, class, score, totalPoints, date, mode
```

---

## Common Errors & Fixes

### Error: "Uncaught TypeError: currentMode is not defined"

**Cause:** Variables not initialized properly  
**Fix:**

```javascript
// Ensure these exist in script.js before using:
let currentMode = quizModes.training; // Should be at top
let currentExam = null;
let questions = [];

// If not, add them near the global variable declarations
```

---

### Error: "Cannot read property 'examActiveSession' of null"

**Cause:** Trying to access examActiveSession that doesn't exist  
**Fix:**

```javascript
// Always check if it exists first:
const session = localStorage.getItem('examActiveSession');
if (session) {
	const exam = JSON.parse(session);
	// Now safe to use
}

// Or use try/catch:
try {
	const exam = JSON.parse(localStorage.getItem('examActiveSession'));
	if (exam && exam.examId) {
		// Safe to proceed
	}
} catch (e) {
	console.error('Error parsing examActiveSession:', e);
}
```

---

### Error: "saveAnswer is not defined"

**Cause:** Function was deleted or not in scope  
**Fix:**

```javascript
// Make sure saveAnswer() function exists in script.js
// Should be around line 323
// If missing, restore from the implementation

// OR check if it's being called before definition:
// JavaScript needs function to be defined before calling
// Solution: Move function declaration before first call
```

---

### Error: "Socket.io undefined - real-time not working"

**Cause:** Socket.io script not loaded  
**Fix:**

```html
<!-- Ensure in index.html: -->
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js" defer></script>
<script src="realtime-client.js" defer></script>

<!-- Both should be in correct order with defer -->
<!-- socket.io BEFORE realtime-client.js -->
```

---

### Error: "examActiveSession is incomplete - missing answers array"

**Cause:** Exam didn't save answers properly  
**Fix:**

```javascript
// Manually initialize if needed:
const session = JSON.parse(localStorage.getItem('examActiveSession'));
if (!session.answers) {
	session.answers = [];
	localStorage.setItem('examActiveSession', JSON.stringify(session));
}

// Better: Ensure saveAnswer() creates array if needed:
// In saveAnswer(), check:
if (!activeSession.answers) {
	activeSession.answers = [];
}
```

---

## Performance Issues

### Quiz is slow / laggy

**Check:**

```javascript
// 1. Number of questions
console.log(questions.length); // Should be < 100

// 2. localStorage size
localStorage.length; // Each item and size
// If huge, data might be corrupted

// 3. Real-time sync happening too often
// Check Network tab for constant socket.io updates
// If too frequent, server might be sending updates constantly

// Solutions:
// 1. Reduce question count
// 2. Clear old quizActivity entries (keep last 50)
// 3. Restart server and browser
```

---

### Memory leak / RAM growing

**Check:**

```javascript
// Likely causes:
// 1. Timer not cleared properly
if (timerId) clearInterval(timerId);

// 2. Event listeners not removed
// Check DevTools > Memory > Take heap snapshot
// Look for growing arrays

// 3. localStorage growing too large
// Periodically clean up old entries:
function cleanupOldActivity() {
	const activity = JSON.parse(localStorage.getItem('quizActivity') || '[]');
	if (activity.length > 100) {
		// Keep only last 50 entries
		localStorage.setItem('quizActivity', JSON.stringify(activity.slice(0, 50)));
	}
}
```

---

## Testing Checklist

### Before Deploying

- [ ] Test exam mode with proper examActiveSession
  - [ ] Questions load correctly
  - [ ] Settings override works
  - [ ] Answers saved in real-time
  - [ ] No visual feedback during quiz
  - [ ] Results show "Take Another Exam"

- [ ] Test training mode without examActiveSession
  - [ ] Questions load from quizQuestions
  - [ ] Settings load from quizSettings
  - [ ] Visual feedback works
  - [ ] Time penalty applied
  - [ ] Results in quizResults and quizActivity
  - [ ] Results show "Show Corrections"

- [ ] Test mode switching
  - [ ] Push exam session → mode switches to exam
  - [ ] Clear session → mode switches to training
  - [ ] Page reload maintains mode

- [ ] Test real-time sync
  - [ ] deviceId generated and persists
  - [ ] socket.io connects successfully
  - [ ] Session push works
  - [ ] Settings push works
  - [ ] Session clear works

- [ ] Test all question types
  - [ ] Multiple choice
  - [ ] Multi-select
  - [ ] Fill in blank
  - [ ] Arrange in order
  - [ ] Matching pairs
  - [ ] All save answers correctly

- [ ] Test browser compatibility
  - [ ] Chrome
  - [ ] Firefox
  - [ ] Safari
  - [ ] Edge
  - [ ] Mobile browsers

---

## When to Contact Support

If you've verified all of the above and still have issues:

1. **Provide:**
   - Browser/version
   - localStorage dump (exported as JSON)
   - Browser console errors
   - Network tab socket.io messages
   - Steps to reproduce

2. **Check:**
   - Is admin server running?
   - Are quiz files loading (Network tab)?
   - Is Socket.io library loading?
   - Are required fields filled in student form?

3. **Try:**
   - Hard refresh (Ctrl+Shift+R)
   - Clear cache (DevTools > Storage > Clear All)
   - Open in different browser
   - Test on different device
   - Restart admin server
