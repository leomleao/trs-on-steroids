# Feature Ideas for Portal Enhancement

---

## 1. Smart Comment Templates

**Title:** Reusable Comment Templates with Dynamic Placeholders

**Description:**

**The Problem:** Consultants repeatedly type the same types of messages — follow-ups, closure notices, status updates — wasting time and leading to inconsistent communication with customers.

**The Idea:** A built-in template system that lets users select from pre-defined and custom comment templates, each supporting dynamic placeholders (e.g. customer name, last comment date, ticket title). Templates are applied instantly into the comment editor and can be managed through a dedicated UI where users create, edit, and delete their own templates alongside the built-in ones.

*Screenshots:*

<!-- Template dropdown in toolbar -->

<!-- Template manager modal -->

<!-- Placeholder buttons -->

---

## 2. Comment Draft Auto-Save

**Title:** Never Lose a Comment Draft Again

**Description:**

**The Problem:** If a consultant is writing a comment and accidentally navigates away from the ticket or closes the browser, the in-progress comment is lost entirely with no way to recover it.

**The Idea:** Automatically save comment drafts as the user types, persisted per ticket. When the user returns to the same ticket and opens the comment editor, their draft is restored exactly where they left off. A toolbar button allows clearing the draft when it's no longer needed.

*Screenshots:*

<!-- Draft restore notification -->

<!-- Erase draft button in toolbar -->

---

## 3. AI-Powered Comment Summarisation

**Title:** Instant AI Summary of Ticket Comments

**Description:**

**The Problem:** Tickets with long comment histories are time-consuming to read through, especially when a consultant is picking up a ticket they haven't worked on recently or is covering for a colleague.

**The Idea:** A one-click "AI Summary" button that reads the most recent comments on a ticket and generates both a short paragraph summary (latest status, what was done, blockers, next action) and a bullet-point list of key milestones. This gives consultants immediate context without scrolling through dozens of comments.

*Screenshots:*

<!-- AI Summary button -->

<!-- Generated summary output -->

---

## 4. AI-Assisted Timesheet Entry

**Title:** Auto-Fill Time Entries with AI

**Description:**

**The Problem:** After writing a comment, consultants must manually write a timesheet summary and estimate the duration spent — a repetitive step that slows down ticket workflows and often results in vague or inconsistent time descriptions.

**The Idea:** A toolbar button that analyses the comment being written and automatically generates a concise one-line timesheet summary and estimates the duration in 0.25-hour increments. If the comment mentions an explicit time (e.g. "spent 30 minutes"), it uses that; otherwise it infers from the content. Both fields are pre-filled, saving the consultant from manual entry.

*Screenshots:*

<!-- Fill Time button in toolbar -->

<!-- Auto-filled summary and duration -->

---

## 5. Proactive Ticket Risk Warnings

**Title:** At-a-Glance Ticket Health Warnings

**Description:**

**The Problem:** Consultants can miss critical ticket conditions — overdue contact dates, expired delivery dates, or over-consumed time budgets — because this information is spread across multiple fields and requires manual checking.

**The Idea:** An inline warning panel displayed prominently above the ticket title that automatically evaluates key risk conditions and surfaces them as a bulleted alert list. Warnings include overdue dates, stale customer communication (no customer-facing comment in 7+ days), and time budget alerts (approaching or exceeding quoted hours). Warnings are context-aware, suppressing irrelevant alerts based on ticket status.

*Screenshots:*

<!-- Warning panel with active alerts -->

---
