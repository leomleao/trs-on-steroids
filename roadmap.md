# Project Roadmap

## Vision
Keep TRS on Steroids useful, simple, and reliable for day-to-day ticket work inside the portal.

## Current State
- The extension now injects through the manifest content script only.
- Duplicate `in-page.js` execution was reduced by removing the old background-driven reinjection path.
- Ticket context extraction has been refactored around the real `/helpdesk/edit_popup` iframe instead of relying on broad document searches.
- `window.ticketData` now includes richer ticket metadata for template filling and ticket awareness.
- Comment templates now use a dropdown workflow instead of multiple buttons.
- A notification area now appears above the ticket title to highlight overdue or risky ticket conditions.

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
- [x] Expand `ticketData` with:
  - `status`
  - `title`
  - `priority`
  - `owner`
  - `assignedTo`
  - `loggedBy`
  - `loggedDate`
  - `externalId`
  - `deliveryDate`
  - `details`
- [x] Fix details extraction from the TinyMCE Details iframe

### Comment Workflow Improvements
- [x] Replace multiple template buttons with a single dropdown
- [x] Make template application happen immediately on dropdown selection
- [x] Let `Apply Template` act as a restore action for the original comment content
- [x] Keep `Fill time` as a separate action
- [x] Improve control alignment in the comment editor toolbar

### Notification Area
- [x] Add a general notification section above the ticket title
- [x] Warn when next contact date is in the past
- [x] Warn when delivery date is in the past
- [x] Warn when the last customer-facing comment is older than 7 days
- [x] Warn when consultant time exceeds quoted time
- [x] Warn when remaining time is below 1.25 hours
- [x] Show a specific message when no time is left on the ticket
- [x] Improve the notification visual style so it is clearer and more prominent

### Bug Fixes and Cleanup
- [x] Fix the single-line summary fallback path
- [x] Fix stale `ticketData` access by moving reads/writes to a shared top-window store
- [x] Replace the old editor polling loop with mutation-based button insertion

## In Progress / Needs Follow-up
- [ ] Confirm ticket switching is fully reliable in all portal navigation flows
- [ ] Add targeted diagnostics for ticket identity changes if stale-ticket behavior still appears
- [ ] Validate notification rules across more ticket types and statuses

## Next Priorities

### Stabilization
- [ ] Finish hardening refresh behavior when moving between tickets
- [ ] Test repeated ticket navigation in the same shell page
- [ ] Review whether the current ticket signature is enough or whether refresh should key directly off the live ticket ID

### Template Handling
- [ ] Allow users to customize or manage their own templates
- [ ] Consider storing templates in a more flexible structure than `template1` / `template2` / `template3`
- [ ] Improve placeholder coverage using the richer `ticketData`

### Time and Ticket Assistance
- [ ] Improve time-filling suggestions using the new ticket context
- [ ] Consider surfacing ticket health signals that help consultants decide whether to chase, close, or re-estimate
- [ ] Add extra warnings such as:
  - missing next contact date on customer-facing statuses
  - no customer-facing comment recorded
  - suspicious date combinations

## Milestones
- [x] Template dropdown implemented
- [x] Rich ticket context extraction implemented
- [x] Notification area implemented
- [ ] Ticket switching refresh fully stabilized
- [ ] Time-filling helper improved
- [ ] Release ready

## Feature Tracker

| Feature | Estimated Effort | Status |
| --- | --- | --- |
| Refactor ticket context extraction around the real ticket iframe | Large | Done |
| Adjust template messaging UI from buttons to dropdown | Small | Done |
| Add ticket notification area above title | Medium | Done |
| Improve stale ticket-data refresh when switching tickets | Medium | In progress |
| Allow users to customize their own templates | Medium | Planned |
| Add a feature to help with time filling | Medium | Planned |

## Future Ideas
- User-managed template presets
- More notification rules based on status and customer communication gaps
- Better ticket-switch diagnostics
- Smarter time-entry suggestions
- Richer ticket summary and close-out assistance
