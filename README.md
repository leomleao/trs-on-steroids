# TRS on Steroids

TRS on Steroids is a Chrome/Edge extension for improving day-to-day ticket handling inside `https://portal.theconfigteam.co.uk/*`.

The project is currently focused much more on portal workflow improvements than on AI. The main value today is better ticket context extraction, faster comment-template application, and inline warnings that highlight risky or incomplete tickets while you are working.

## Current State

The extension currently does the following:

- injects directly into the portal via a Manifest V3 content script
- reads ticket data from the real ticket iframe instead of relying on broad page scraping
- keeps a shared `ticketData` object across frame contexts
- adds a template dropdown to the comment editor
- supports quick application of built-in and user-managed templates
- adds a warning panel above the ticket title
- includes a `Fill time` action in the comment workflow

## Ticket Data Available

The extension currently captures ticket information such as:

- requester / person name
- last customer-facing comment
- last and previous customer-facing comment dates
- next contact date
- consultant and customer time totals
- quoted ticket time
- status
- title
- priority
- entry type
- owner
- assigned to
- logged by
- logged date
- external ID
- delivery date
- details

This data is used mainly for template filling and ticket warnings.

## Current Warning Rules

The inline warning area can currently flag:

- missing next contact date
- next contact date in the past
- missing delivery date for Change Requests
- delivery date in the past
- unassigned tickets
- stale customer-facing updates
- higher-priority stale tickets with a shorter threshold
- no time left on the ticket
- very low remaining quoted time
- consultant time exceeding total quoted time

There are also status-specific exceptions:

- delivery-date-past warnings are suppressed for `Customer UAT`, `Provided to Customer`, and `Accepted`
- closed tickets only show the over-consumed-time warning

## Templates

Built-in templates still ship from [chrome-extension/templates.json](/home/leo/dev/trs-on-steroids/chrome-extension/templates.json), and custom templates are stored in `chrome.storage.sync`.

The comment editor now includes a `Manage Templates` action that lets you:

- create, edit, and delete your own templates
- persist them across browser restarts
- sync them across your signed-in browser profile
- insert any supported `ticketData` placeholder directly into the template body

At the moment the built-in templates are focused on:

- 3rd Strike
- 2nd Strike
- Closure

## AI Usage

AI is no longer the main focus of the repo.

There is still some optional browser-AI functionality in the extension for:

- generating an internal summary of ticket comments
- generating comment key points
- supporting the single-line summary / time workflow

These features rely on browser-provided APIs such as `Summarizer` and optional Prompt API support when available. They should be treated as helper features, not the core product.

## Repo Layout

- [chrome-extension](/c:/Dev/trs-on-steroids/chrome-extension) - main extension source
- [chrome-extension/in-page.js](/home/leo/dev/trs-on-steroids/chrome-extension/in-page.js) - portal integration, ticket extraction, templates, warnings, and summary helpers
- [chrome-extension/manifest.json](/home/leo/dev/trs-on-steroids/chrome-extension/manifest.json) - extension manifest used for loading the real extension
- [chrome-store/description/en.txt](/c:/Dev/trs-on-steroids/chrome-store/description/en.txt) - store description draft
- [roadmap.md](/c:/Dev/trs-on-steroids/roadmap.md) - current project roadmap
- [CONTEXT.md](/c:/Dev/trs-on-steroids/CONTEXT.md) - implementation handoff / deeper project notes

## Loading the Extension

1. Open `chrome://extensions` or `edge://extensions`
2. Enable Developer Mode
3. Choose `Load unpacked`
4. Select [chrome-extension](/c:/Dev/trs-on-steroids/chrome-extension)

The extension is scoped to:

- `https://portal.theconfigteam.co.uk/*`

## Near-Term Priorities

- keep ticket refresh reliable when switching between tickets
- validate warning rules across more ticket types and statuses
- improve template flexibility and customization
- keep the extension simple, stable, and useful during real ticket work

## Privacy

- no external service integration is required for the core workflow
- the core extension behavior is local to the browser and portal page

## Store Links

- Chrome Web Store: https://chrome.google.com/webstore
- Edge Add-ons: https://microsoftedge.microsoft.com/addons/detail/malfemiangnnapjacgepbekjiabkkjbk
