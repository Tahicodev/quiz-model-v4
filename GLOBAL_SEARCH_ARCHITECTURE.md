# Global Search - Visual Guide & Architecture

## 📐 User Interface

```
┌─────────────────────────────────────────────────────────────────┐
│  Quiz Admin Dashboard                                      ☰     │
├─────────────────────────────────────────────────────────────────┤
│  [Logo] Admin Dashboard    [🔍 Search anything... (Cmd+K)]  👤   │
│                                                                   │
│                    ┌─────────────────────────────────┐           │
│                    │ SEARCH RESULTS                  │           │
│                    ├─────────────────────────────────┤           │
│                    │ 📝 QUESTIONS              (3)   │           │
│                    │  ├─ "What is Windows?"          │           │
│                    │  │  Question • Operating Systems│           │
│                    │  ├─ "Alt+Tab keyboard..."       │           │
│                    │  │  Question • Windows Basics   │           │
│                    │  └─ "Defragment hard disk..."   │           │
│                    │     Question • OS Tools         │           │
│                    │                                 │           │
│                    │ 🏷️  CATEGORIES            (1)   │           │
│                    │  └─ Operating Systems           │           │
│                    │     Category • 12 questions     │           │
│                    │                                 │           │
│                    │ 📋 EXAMS                  (1)   │           │
│                    │  └─ Windows Fundamentals        │           │
│                    │     Exam • 20 questions, 60min  │           │
│                    └─────────────────────────────────┘           │
│                                                                   │
│ [Questions] [Categories] [Exams] [Classes] [Results] [Activity] │
│                                                                   │
│ QUESTIONS                                                         │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ # │ Question        │ Options      │ Answer       │ Actions   │
│ ├───┼─────────────────┼──────────────┼──────────────┼────────── │
│ │ 1 │ What is Windows?│ Menu, Start..│ Menu Démarrer│ ✎ 🗑      │
│ │ 2 │ Alt+Tab usage...│ Alt+Tab, ... │ Alt+Tab      │ ✎ 🗑      │
│ └───┴─────────────────┴──────────────┴──────────────┴────────── │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GLOBAL SEARCH SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  USER INPUT                                                      │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ • Click search bar                                  │        │
│  │ • Type query                                        │        │
│  │ • Press Cmd+K / Ctrl+K                             │        │
│  │ • Press Enter                                       │        │
│  │ • Press Escape to close                            │        │
│  └─────────────────────────────────────────────────────┘        │
│                         ↓                                         │
│  SEARCH ENGINE                                                   │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ handleGlobalSearchInput()                           │        │
│  │    ↓                                                 │        │
│  │    ├─ searchQuestions()                             │        │
│  │    │  └─ Match: text, options, answer, category   │        │
│  │    │                                                │        │
│  │    ├─ searchCategories()                            │        │
│  │    │  └─ Match: name, count questions             │        │
│  │    │                                                │        │
│  │    ├─ searchExams()                                 │        │
│  │    │  └─ Match: name, description, questions      │        │
│  │    │                                                │        │
│  │    ├─ searchClasses()                               │        │
│  │    │  └─ Match: name, student count               │        │
│  │    │                                                │        │
│  │    └─ searchResults()                               │        │
│  │       └─ Match: student name, ID, score           │        │
│  └─────────────────────────────────────────────────────┘        │
│                         ↓                                         │
│  DATA PROCESSING                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ • Group results by type                             │        │
│  │ • Limit to 15 total results (5 per type)            │        │
│  │ • Sort by relevance                                 │        │
│  │ • Escape HTML for security                          │        │
│  └─────────────────────────────────────────────────────┘        │
│                         ↓                                         │
│  DISPLAY RESULTS                                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ displayGlobalSearchResults()                        │        │
│  │ ├─ Create dropdown                                  │        │
│  │ ├─ Group by type                                    │        │
│  │ ├─ Add icons                                        │        │
│  │ ├─ Format titles & descriptions                     │        │
│  │ └─ Show in header                                   │        │
│  └─────────────────────────────────────────────────────┘        │
│                         ↓                                         │
│  USER CLICKS RESULT                                              │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ handleSearchResultClick()                           │        │
│  │ ├─ Determine target tab                             │        │
│  │ ├─ Close search dropdown                            │        │
│  │ ├─ Clear search input                               │        │
│  │ └─ Navigate to result                               │        │
│  └─────────────────────────────────────────────────────┘        │
│                         ↓                                         │
│  NAVIGATION                                                      │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ • openTab() - Switch to correct section             │        │
│  │ • highlightSearchResult() - Apply highlight effect  │        │
│  │ • scrollIntoView() - Smooth scroll to item          │        │
│  │ • Remove highlight after 3 seconds                  │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔌 Integration Points

```
┌────────────────────────────────────────────────────────────┐
│                   ADMIN.HTML                               │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  <head>                                                     │
│    <script src="utils.js"></script>      ← Shared utils    │
│    <script src="settings.js"></script>                     │
│    <script src="*-management.js"></script>                 │
│    <script src="global-search.js"></script> ← OUR FILE     │
│    <script src="admin-main.js"></script>                   │
│  </head>                                                    │
│                                                             │
│  <body>                                                     │
│    <header class="app-header">                             │
│      <div class="header-global-search">                    │
│        <input id="globalSearchInput" /> ← OUR TARGET       │
│        <div id="globalSearchResults"></div> ← OUR OUTPUT   │
│      </div>                                                 │
│    </header>                                                │
│                                                             │
│    <section id="questions">     ← Link: Questions tab      │
│      <table id="question-list"></table>                    │
│    </section>                                               │
│                                                             │
│    <section id="categories">    ← Link: Categories tab     │
│      <table id="categoryList"></table>                     │
│    </section>                                               │
│                                                             │
│    <section id="exams">         ← Link: Exams tab          │
│      <table id="examList"></table>                         │
│    </section>                                               │
│                                                             │
│    <section id="classes">       ← Link: Classes tab        │
│      <table id="classList"></table>                        │
│    </section>                                               │
│                                                             │
│    <section id="results">       ← Link: Results tab        │
│      <table id="results-list"></table>                     │
│    </section>                                               │
│  </body>                                                    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

## 💾 Data Flow

```
LOCALSTORAGE
├─ quizQuestions        ← Search questions here
├─ quizCategories       ← Search categories here
├─ quizExams            ← Search exams here
├─ quizClasses          ← Search classes here
└─ quizResults          ← Search results here

         ↓

globalSearchInput (DOM element)
├─ Input event → handleGlobalSearchInput()
├─ KeyDown event → keyboard shortcuts
└─ Focus → opens search dropdown

         ↓

Search Functions
├─ searchQuestions(term)
├─ searchCategories(term)
├─ searchExams(term)
├─ searchClasses(term)
└─ searchResults(term)

         ↓

globalSearchResults (array)
├─ Grouped by type
├─ Limited to 15 items
└─ Sorted by type

         ↓

displayGlobalSearchResults()
└─ Renders: <div id="globalSearchResults">

         ↓

User clicks result
├─ handleSearchResultClick()
├─ openTab(event, tabName)
└─ highlightSearchResult(type, id)
```

## 🎯 Search Result Structure

```javascript
Result Object:
{
  type: 'question',              // question|category|exam|class|result
  id: '12345-abc',               // Unique identifier
  title: 'What is Windows?',      // Display title (max 80 chars)
  description: 'Question • Operating Systems',  // Metadata
  category: 'abc-123',            // Category ID (questions only)
  index: 5,                       // Position in table (questions only)
  fullData: { /* complete object */ }  // Original data
}
```

## 🎨 Styling Cascade

```
┌─ :root CSS Variables
│  ├─ --primary: #3b82f6
│  ├─ --bg-surface: #ffffff
│  ├─ --border-color: #e2e8f0
│  └─ --text-main: #0f172a
│
├─ .global-search-results
│  ├─ position: absolute
│  ├─ z-index: 1000
│  ├─ box-shadow: var(--shadow-lg)
│  └─ border: 1px solid var(--border-color)
│
├─ .search-result-item
│  ├─ display: flex
│  ├─ gap: 12px
│  └─ :hover { background: var(--bg-surface-alt) }
│
└─ .global-search-highlight
   └─ @keyframes searchHighlight
      ├─ 0% → #fef08a (yellow)
      └─ 100% → transparent
```

## ⚙️ Configuration Options (Future)

```javascript
// Could be added to config:
const SEARCH_CONFIG = {
	MAX_RESULTS: 15, // Current: 15
	RESULTS_PER_TYPE: 5, // Current: 5
	HIGHLIGHT_DURATION: 3000, // Current: 3 seconds
	DEBOUNCE_DELAY: 0, // Current: instant
	ENABLE_SEARCH_HISTORY: false, // Future feature
	ENABLE_FUZZY_SEARCH: false, // Future feature
};
```

## 📊 Performance Metrics

```
Search Operation Timeline:
├─ 0ms - User types character
├─ 0-5ms - Search all 5 sections simultaneously
├─ 5-10ms - Group results by type
├─ 10-15ms - Create HTML elements
└─ 15-20ms - Display dropdown

Memory Usage:
├─ globalSearchResults array: ~5KB (15 items)
├─ DOM nodes: <50 nodes for dropdown
└─ CSS: ~2KB (search styles)

Storage Read:
├─ localStorage.getItem('quizQuestions'): ~100KB-1MB
├─ localStorage.getItem('quizResults'): ~50KB-500KB
└─ Other lookups: <10KB each
```

## 🔒 Security Features

```
✅ HTML Escaping
   └─ escapeHtml() on all user-controlled content

✅ XSS Prevention
   └─ No innerHTML with untrusted data
   └─ Uses textContent where possible

✅ localStorage Safety
   └─ Assumes localStorage only contains app data
   └─ JSON.parse with try/catch

✅ Input Validation
   └─ Search term trimmed and lowercased
   └─ No command injection possible
```

---

**This visual guide helps understand the complete flow of the global search system from user input to final result highlighting.**
