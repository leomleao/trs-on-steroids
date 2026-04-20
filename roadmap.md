# Project Roadmap

## Vision
Keep TRS on Steroids useful, simple, and reliable for day-to-day ticket work inside the portal.

## Current State
- The extension injects through the manifest content script only.
- Duplicate `in-page.js` execution is prevented by a one-time bootstrap guard.
- Ticket context extraction is refactored around the real `/helpdesk/edit_popup` iframe.
- `ticketData` includes rich metadata and the full cached comments array.
- Comment templates use a dropdown workflow.
- A notification area appears above the ticket title for overdue or risky conditions.
- AI-powered "Fill time" button generates a one-line summary and estimates duration using Chrome Prompt API with Summarizer fallback.
- "Extract & Summarise" generates a paragraph summary and key-points list from cached comments using LanguageModel (parallel execution).

## Completed Work

### Extension Loading and Stability
- [x] Remove duplicate runtime injection from `background.js`
- [x] Stop relying on `all_frames` injection
- [x] Add one-time bootstrap protection in `in-page.js`
- [x] Simplify the manifest so the content script runs on `https://portal.theconfigteam.co.uk/*`
- [x] Remove unused background/permissions from the extension manifest

### Ticket Context Refactor
- [x] Confirm live ticket structure from a real ticket page
- [x] Refactor ticket extraction to use the real ticket iframe document
- [x] Wait for ticket readiness before reading fields
- [x] Normalize ticket extraction through shared helpers for text, numeric, select, overview, and TinyMCE fields
- [x] Expand `ticketData` with: `status`, `title`, `priority`, `owner`, `assignedTo`, `loggedBy`, `loggedDate`, `externalId`, `deliveryDate`, `details`, `comments`

### Comment Workflow Improvements
- [x] Replace multiple template buttons with a single dropdown
- [x] Make template application happen immediately on dropdown selection
- [x] Let `Apply Template` act as a restore action for the original comment content
- [x] Keep `Fill time` as a separate action
- [x] Improve control alignment in the comment editor toolbar
- [x] Move "Manage Templates" into the Apply Template dropdown (removed standalone button)
- [x] Restyle Manage Templates modal to match portal jQuery UI dialog appearance
- [x] Fix Manage Templates modal inputs being un-typeable (jQuery UI focus trap)
- [x] Replace raw HTML textarea with WYSIWYG contenteditable editor (renders HTML, correct line break handling)
- [x] Fix Enter key being swallowed by jQuery UI in the template editor

### Notification Area
- [x] Add a general notification section above the ticket title
- [x] Warn when next contact date is in the past
- [x] Warn when delivery date is in the past
- [x] Warn when the last customer-facing comment is older than 7 days
- [x] Warn when consultant time exceeds quoted time
- [x] Warn when remaining time is below 1.25 hours
- [x] Show a specific message when no time is left on the ticket
- [x] Improve the notification visual style so it is clearer and more prominent

### AI Features
- [x] Extract & Summarise: generate paragraph summary + key-points from cached comments
- [x] Refactor to LanguageModel-first with Summarizer fallback on both summary and key-points
- [x] Add `AI_PROMPTS` constants with grounded, English-first system prompts
- [x] `session.destroy()` in `finally` to release model after each call
- [x] Parallel summary + key-points via `Promise.all`
- [x] Fill Time: AI-generated single-line summary and duration estimate from TinyMCE comment
- [x] Loading spinner with funny rotating verbs during Fill Time AI generation
- [x] Lower temperatures for deterministic tasks (0.1 duration, 0.3 summary)
- [x] Tune summary prompt to cap at 3-5 sentences and prioritise newest comments

### Bug Fixes and Cleanup
- [x] Fix the single-line summary fallback path
- [x] Fix stale `ticketData` access by moving reads/writes to a shared top-window store
- [x] Replace the old editor polling loop with mutation-based button insertion
- [x] Fix `slice(-7)` bug — comments array is newest-first, must use `slice(0, N)`
- [x] Fix "AI Summary" tab navigation using `findElement` instead of `document.querySelector`

---

## In Progress / Needs Follow-up
- [ ] Confirm ticket switching is fully reliable in all portal navigation flows
- [ ] Add targeted diagnostics for ticket identity changes if stale-ticket behavior still appears
- [ ] Validate notification rules across more ticket types and statuses

---

## Next Priorities

### Stabilization
- [ ] Finish hardening refresh behavior when moving between tickets
- [ ] Test repeated ticket navigation in the same shell page
- [ ] Review whether the current ticket signature is enough or whether refresh should key directly off the live ticket ID

### Template Handling
- [x] Allow users to customize or manage their own templates
- [x] Store templates in `chrome.storage.sync` so they roam across the consultant's machines (replace static `templates.json`)
- [x] Improve placeholder coverage using the richer `ticketData`

### Time and Ticket Assistance
- [ ] Improve time-filling suggestions using the new ticket context
- [ ] Consider surfacing ticket health signals that help consultants decide whether to chase, close, or re-estimate
- [ ] Add extra warnings:
  - missing next contact date on customer-facing statuses
  - no customer-facing comment recorded
  - suspicious date combinations

---

## Browser API Opportunities

The extension currently uses only a content script with no background worker or permissions beyond `host_permissions`. The following Chrome/Edge extension APIs are available and would meaningfully improve the workflow. All are fully supported in both Chrome and Edge (MV3).

### `chrome.storage` — Persistent and Synced State

**What it enables:**
- `storage.session` — survive page navigations without re-scraping. Store `ticketData` here so switching tabs or reloading does not lose context.
- `storage.sync` — roam user preferences (custom templates, warning thresholds) across all the consultant's machines automatically.
- `storage.local` — store a rolling today-log (tickets touched, time logged, last warning state) for a daily summary or end-of-day review.
- Cache AI-generated Fill Time summaries keyed by ticket ID + comment hash — skip redundant LanguageModel calls on unchanged tickets.

**Manifest change:** Add `"storage"` to `permissions`.

---

### `chrome.alarms` — Scheduled Background Checks

**What it enables:**
- Periodic staleness sweep (e.g. every 30 min): read cached ticket list, identify anything past a staleness threshold, fire a desktop notification — even if the portal tab is not open.
- Next-contact-date reminder: when a ticket is saved with a future NCD, store it; a daily 09:00 alarm fires a reminder for anything due today.
- Time-budget alert: alarm checks cached tickets approaching their time budget and nudges before the consultant logs the final hours.
- End-of-day timesheet nudge: 17:00 daily alarm counts tickets with no time entry and reminds the consultant.

**Manifest change:** Add `"alarms"` to `permissions`, add a `background.js` service worker.

**Note:** Alarms survive service worker sleeping/waking and browser restarts (min interval: 30 seconds on Chrome 120+). Re-register handlers on service worker startup.

---

### `chrome.sidePanel` — Persistent Sidebar UI

**What it enables:**
- Move the notification/warning banner out of the portal DOM and into a dedicated sidebar panel that cannot be broken by portal layout updates.
- Rich AI summary panel: Fill Time and Extract & Summarise output displayed with copy buttons, summary history, and expandable comment threads — without cramming output into portal form fields.
- Daily ticket dashboard: list of tickets worked today (from `storage.local`), their status, time remaining, and next-contact countdowns — stays open as the consultant navigates between tickets.
- Template library manager: a searchable, scrollable picker in the sidebar replaces the inline `<select>` dropdown.

**Manifest change:** Add `"sidePanel"` to `permissions`, add `"side_panel": { "default_path": "panel.html" }`, create `panel.html`.

---

### `chrome.notifications` — Desktop Notifications

**What it enables:**
- Proactive stale-ticket alerts from the background service worker (complement to the in-page banner — fires even when the portal tab is not focused).
- Actionable next-contact reminders with "Open ticket" and "Snooze" buttons via `onButtonClicked`.
- End-of-day timesheet nudge: "You have N tickets with no time logged today."

**Manifest change:** Add `"notifications"` to `permissions`.

**Note:** Button icons and image types are limited on macOS. Prefer `basic` or `list` types for cross-platform reliability.

---

### `chrome.commands` — Keyboard Shortcuts

**What it enables:**
- `Alt+F`: trigger Fill Time from anywhere in the portal without clicking the button.
- `Alt+T`: open/close the side panel.
- `Alt+S`: run Extract & Summarise.
- `Alt+1` / `Alt+2` / `Alt+3`: apply a specific comment template directly from the keyboard.

**Manifest change:** Add a `"commands"` block to the manifest (no permission entry needed). Handle in service worker or content script.

---

### `chrome.contextMenus` — Right-Click Actions

**What it enables:**
- Right-click on selected text in the portal → "Fill time from selection" — sends the highlighted text to `generateFillTimeSummary` without needing the TinyMCE editor to be open.
- Right-click → "Copy ticket summary to clipboard" — formats `ticketData` as a short summary and writes it to the clipboard.
- Right-click → "Apply template…" — opens a submenu of templates when the comment toolbar is not visible.

**Manifest change:** Add `"contextMenus"` to `permissions`. Handle in service worker.

---

## Milestones
- [x] Template dropdown implemented
- [x] Rich ticket context extraction implemented
- [x] Notification area implemented
- [x] AI-powered Fill Time (summary + duration) implemented
- [x] AI Extract & Summarise refactored with LanguageModel-first path
- [x] Ticket switching refresh fully stabilized
- [x] Persistent state via `chrome.storage` (survive navigation, roam templates)
- [ ] Side panel for warnings and AI output
- [ ] Background alarms + desktop notifications for proactive alerts
- [ ] Release ready (stable + storage + side panel)

---

## Feature Tracker

| Feature | APIs Needed | Estimated Effort | Status |
| --- | --- | --- | --- |
| Refactor ticket context extraction around the real ticket iframe | — | Large | Done |
| Adjust template messaging UI from buttons to dropdown | — | Small | Done |
| Add ticket notification area above title | — | Medium | Done |
| AI Fill Time: single-line summary + duration estimate | LanguageModel, Summarizer | Medium | Done |
| AI Extract & Summarise with LanguageModel-first path | LanguageModel, Summarizer | Medium | Done |
| Improve stale ticket-data refresh when switching tickets | — | Medium | In progress |
| Persist ticket context across navigations | `storage.session` | Small | Planned |
| Allow users to customize their own templates | `storage.sync` | Medium | Done |
| Roaming template and settings storage | `storage.sync` | Small | Done |
| WYSIWYG template editor (HTML rendering + correct line breaks) | — | Small | Done |
| Keyboard shortcuts for Fill Time, templates, side panel | `commands` | Small | Planned |
| Right-click "Fill time from selection" | `contextMenus` | Small | Planned |
| Side panel: ticket dashboard + AI output | `sidePanel`, `storage` | Large | Planned |
| Background staleness sweep + desktop notifications | `alarms`, `notifications`, `storage.local` | Medium | Planned |
| Next-contact-date desktop reminders | `alarms`, `notifications`, `storage.local` | Medium | Planned |
| End-of-day timesheet nudge alarm | `alarms`, `notifications` | Small (once alarm infra exists) | Planned |
| Cache AI summaries (skip redundant LanguageModel calls) | `storage.local` | Small | Planned |
| Context-aware template suggestions from `ticketData` | LanguageModel | Medium | Planned |
| Admin-managed defaults for thresholds (time, contact gaps) | `storage.managed` | Medium | Future |

---

## Future Ideas
- User-managed template presets with import/export
- More notification rules based on status and customer communication gaps
- Better ticket-switch diagnostics
- Smarter time-entry suggestions using full ticket history
- Richer ticket summary and close-out assistance using AI
- Sidebar ticket health dashboard spanning all open tickets
- Context-aware template suggestions based on ticket metadata and comment history
- Admin-managed defaults for thresholds (time remaining, contact gaps, priority overrides)
- Clip selected comment text to Fill Time without opening the TinyMCE editor
