# Web App Creator — feature design review

**Date:** 2026-09-05 (EDT)
**Original review scope:** Read-only inspection on 2026-09-05.
**Overall:** 31/50 — focused interaction work needed. 31 feature areas reviewed.

The page-first composition is worth keeping. The app now looks like a website with an embedded assistant, but several everyday interactions still break the sense of control: attachments can hide Send, unsent work disappears, disconnected runs appear active, and project names are hard to distinguish.

## Implementation follow-up · 2026-09-06

The approved design is implemented: a 352 × 360 glass widget with square corners, plain conversation text, an in-panel project switcher, and a draggable compact state that keeps the composer ready. Left/right docks fill the viewport. The required fixes protect Send with attachments, preserve drafts/retry references, recover stream connections, deduplicate creation, support project naming and brief search, improve keyboard controls, and expose stopping/retry feedback. [The approved interactive reference](reconsidered-preview.html) retains local simulated interactions. The findings and scores below remain the original review baseline.

## Evidence and limits

Reviewed the current local app on 2026-09-05, including the supplied project 8b13b1be-8a4a-4831-be40-a620c443fdbc, another saved project, and all 75 project metadata records. Checked both main surfaces at 320×640, 375×812, 768×1024, 1024×768, 1440×960 and 2560×1440. Used browser interaction, screenshots, computed layout bounds, source inspection, and temporary in-browser fixtures. Fixtures covered creation, empty editor, rejected send, running/retry/memory, stream closure and stopping; they did not create projects or invoke an AI provider. The phone preset did not enable pointer:coarse, so physical touch targets and the on-screen keyboard remain unverified. No deletion, saved model change, live paid generation, live streaming HTML update, formal contrast audit, screen-reader test, or performance profile was performed.

Priority meanings: P1 blocks a core task or loses work; P2 causes repeated friction or misleading feedback; P3 is focused polish. Scores are design judgments, not test percentages.

## Five design lenses

| Lens | Score | Evidence | What moves the score |
|---|---:|---|---|
| First impression | 8/10 | The live page dominates; the glass assistant reads as an embedded helper. | Keep this composition and the restrained corner scale. |
| Hierarchy | 6/10 | Project identity disappears in the editor; technical controls compete with writing. | Expose the current project and protect the composer’s primary action. |
| Color voice | 7/10 | Amber actions and dense glass work over both warm and saturated pages. | Keep state colors; reduce the visual weight of the multicolor model strip. |
| Type voice | 6/10 | Project rows scan well, but model pricing, tool details, and settings depend on 10–12px text. | Increase essential metadata size and shorten technical labels. |
| Interaction feel | 4/10 | Minimize, drag, preview sizes, and export work; draft loss, attachment overflow, and disconnected runs interrupt core work. | Resolve P1 findings before adding more motion or surface polish. |

## First impression and prompt fidelity

The dominant work is operating a live page. The floating assistant supports that work, and the project list supports finding and comparing saved pages. The current direction honors the requested liquid glass and less-rounded corners. The first read is strongest on an existing page; the weakest moments are discovering which project is open and deciding what a row of model icons means.

The remaining generic signals are the repeated “Your assistant”/“Let’s make it yours” language and routine technical logs. They are secondary to concrete usability failures. More ornament or a new palette would not resolve the current issues.

## What is working

- **The page is the workspace:** The full-page preview and compact assistant match the product idea. Preserve this relationship.
- **Restrained glass geometry:** Subtle corners, quiet amber actions, and denser overlay surfaces give the app a consistent identity.
- **Useful interaction foundations:** Native project links, lazy thumbnails, focus-preserving minimize, pointer resize, viewport presets, export, and reduced-motion overrides are real working foundations.

## Prioritized findings

### R01 · P1 · Four permitted attachments hide Send on a small screen

**Evidence (Browser reproduction + computed bounds):** At 320×640, one selected element plus three PNG images is within the four-item limit. The panel ends at y=632, but Send occupies y=657–689. It is clipped by the panel; the prompt field shrinks to 16px. One attachment-limit error also reduces the field to 16px.

**Why it matters:** Attachments wrap inside a fixed 192px mobile composer with no independent scrolling region. The same four items reduce the desktop prompt field to 16px at the default panel width.

**Next move — interaction + relayout:** Keep Send and a usable text field in a fixed footer; make attachment chips a bounded, scrollable area. Let the composer grow into the conversation when necessary. Verify four long filenames plus an error at 320px and with the on-screen keyboard.

**Sources:** [packages/prompt-panel/src/composer.tsx:92](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/composer.tsx:92), [packages/ui/src/styles/globals.css:812](/Users/alexsandiiarov/Documents/web-app-creator/packages/ui/src/styles/globals.css:812).

[Screenshot evidence in the HTML report](review-report.html#evidence-attachments).

### R02 · P1 · Unsent drafts and attachments disappear when leaving a project

**Evidence (Browser reproduction; failed-send fixture):** A typed draft plus an image survived minimize/reopen with focus restored. Navigating to Projects and reopening the same project returned an empty prompt with no attachments.

**Why it matters:** Prompt and attachment state exist only inside the mounted PromptPanel. A failed send also clears the composer immediately; the prompt remains in the conversation but has no retry or restore action.

**Next move — interaction; persistence implementation:** Persist drafts per project, including recoverable attachment references. Retain or restore the draft after a rejected send and provide an explicit Retry or Edit and retry action.

**Sources:** [packages/prompt-panel/src/prompt-panel.tsx:124](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/prompt-panel.tsx:124), [packages/prompt-panel/src/prompt-panel.tsx:427](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/prompt-panel.tsx:427).

[Screenshot evidence in the HTML report](review-report.html#evidence-draft).

### R03 · P1 · A disconnected run can continue to look active

**Evidence (Finite-stream fixture + source inspection):** A controlled fixture delivered a running snapshot and then closed its event stream. More than 30 seconds later the UI still displayed Generating, Stop generation, and Retrying now; there was no disconnected state or reconnect action.

**Why it matters:** The SSE reader returns at EOF, and the hook only handles rejection. Neither path reconnects. An initial connection error uses a banner without a recovery control. This is a frontend reproduction, not a claim that the current real project is disconnected.

**Next move — interaction + transport implementation:** Represent connecting, live, reconnecting, and offline states. Reconnect with backoff and rehydrate the server snapshot. Keep the page visible and provide Retry connection when automatic recovery fails.

**Sources:** [apps/client/src/lib/sse-client.ts:40](/Users/alexsandiiarov/Documents/web-app-creator/apps/client/src/lib/sse-client.ts:40), [apps/client/src/hooks/use-landing-page.ts:165](/Users/alexsandiiarov/Documents/web-app-creator/apps/client/src/hooks/use-landing-page.ts:165).

[Screenshot evidence in the HTML report](review-report.html#evidence-connection).

### R04 · P2 · Projects are hard to distinguish, and the editor hides their identity

**Evidence (Live metadata + rendered library/editor):** The real library has 75 projects but only 26 distinct stored titles. 34 share “Please replicate the following landing page with an opt-in t…”. Their row menus offer Open editor and Delete project. The editor heading is always Your assistant.

**Why it matters:** The server permanently truncates initial-prompt titles to 60 characters. Wider rows or a tooltip cannot recover the missing portion. There is no rename affordance in the reviewed UI.

**Next move — interaction + writing; metadata implementation:** Add an editable project name, keep the original brief separately, and show the name in the editor’s page controls. Use a page title or user-confirmed name to identify a project; retain metadata as secondary context.

**Sources:** [apps/server/src/mastra/lib/project-store.ts:1207](/Users/alexsandiiarov/Documents/web-app-creator/apps/server/src/mastra/lib/project-store.ts:1207), [apps/client/src/components/projects-page.tsx:578](/Users/alexsandiiarov/Documents/web-app-creator/apps/client/src/components/projects-page.tsx:578), [packages/prompt-panel/src/panel-header.tsx:59](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/panel-header.tsx:59).

[Screenshot evidence in the HTML report](review-report.html#evidence-library).

### R05 · P2 · New project issues two creation requests in the current dev build

**Evidence (Mocked creation counter: 2 requests):** With POST /api/projects intercepted in the browser, one visit to /projects/new produced two create requests before redirecting. No real project was created during this test.

**Why it matters:** The app uses React StrictMode. NewProjectPage starts creation in a mount effect; cleanup suppresses a response but does not prevent the duplicate request. This finding is specific to the current development flow; production was not reproduced.

**Next move — Implementation, then interaction:** Make creation idempotent, ideally with an operation key honored by the server, and initiate one logical creation per user action. Show a retry action if creation fails.

**Sources:** [apps/client/src/main.tsx:14](/Users/alexsandiiarov/Documents/web-app-creator/apps/client/src/main.tsx:14), [apps/client/src/components/projects-page.tsx:73](/Users/alexsandiiarov/Documents/web-app-creator/apps/client/src/components/projects-page.tsx:73).

### R06 · P2 · The model picker exposes machinery before helping with a choice

**Evidence (Rendered Text/Image/Vision tabs + source):** The default 380px assistant shows six tiny role/provider icons in one Models button. The opened picker presents a long list with dense token prices; essential metadata uses 10px text. Search and role switching work.

**Why it matters:** Text, Image, and Vision do not explain when each is used. The source locks alternate Vision rows when the text model handles vision, but supplies no visible explanation of that dependency. That locked state was inspected in source, not exercised on a saved project.

**Next move — typeset + interaction:** Show the main model name with an Advanced models entry. Explain each role in one short sentence, describe linked Vision behavior, and make essential price units readable. Preserve search and detailed pricing for comparison.

**Sources:** [packages/prompt-panel/src/model-dropdown.tsx:243](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/model-dropdown.tsx:243), [packages/prompt-panel/src/model-dropdown.tsx:339](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/model-dropdown.tsx:339).

[Screenshot evidence in the HTML report](review-report.html#evidence-models).

### R07 · P2 · Keyboard support is incomplete in custom controls

**Evidence (Keyboard test + DOM/source inspection; no screen-reader audit):** With the Vision tab focused, ArrowLeft left both focus and selection on Vision. The model popover has no accessible dialog name. Horizontal resize edges are role=separator divs without tabIndex or keyboard handling.

**Why it matters:** The custom tabs have click handlers but no roving focus or tab-panel relationship. Mouse drag/resize works, and layout shortcuts work; the gap is in equivalent keyboard operation.

**Next move — interaction:** Use the existing accessible tab primitive or implement arrow-key navigation, roving focus, and panel relationships. Name the model dialog. Make horizontal resize keyboard-operable or offer an equivalent width control.

**Sources:** [packages/prompt-panel/src/model-dropdown.tsx:285](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/model-dropdown.tsx:285), [packages/prompt-panel/src/model-dropdown.tsx:294](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/model-dropdown.tsx:294), [packages/prompt-panel/src/prompt-panel.tsx:814](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/prompt-panel.tsx:814).

### R08 · P2 · Panel placement can obscure controls, and mobile layout choices have no visible effect

**Evidence (Observed occlusion + mobile before/after bounds):** Floating the panel over the lower-left corner covers the Projects/Export dock; a pointer attempt to use Projects was intercepted by the panel. At 320px, selecting Left sidebar changed data-layout but retained the exact same overlay bounds as Floating.

**Why it matters:** The toolbar is below the assistant in stacking order and only moves for a docked left sidebar. Mobile CSS forces all layout choices to the same bottom overlay.

**Next move — relayout + interaction:** Keep the page-control dock outside the panel’s occupied area. Give mobile useful height or minimize choices, and make desktop-only placement preferences explicit.

**Sources:** [packages/ui/src/styles/globals.css:601](/Users/alexsandiiarov/Documents/web-app-creator/packages/ui/src/styles/globals.css:601), [packages/ui/src/styles/globals.css:775](/Users/alexsandiiarov/Documents/web-app-creator/packages/ui/src/styles/globals.css:775), [packages/prompt-panel/src/panel-command-menu.tsx:96](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/panel-command-menu.tsx:96).

### R09 · P2 · Attachments lose their visual meaning after selection

**Evidence (Rendered selection and image chips):** Selecting a headline fragment correctly attached it as “SELECTOR Element em”. Uploaded screenshots became filename/size chips. Neither chip gives an image preview, readable element excerpt, or a way to locate that element again.

**Why it matters:** The payload is useful to the agent but the visible representation asks the user to remember what was selected. This gets harder with similar filenames or multiple elements.

**Next move — interaction + refine:** Show small image thumbnails with an enlarge action. Describe a selected element using its tag plus a short text excerpt, and offer Locate on page. Keep the selector in optional details.

**Sources:** [packages/prompt-panel/src/composer.tsx:247](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/composer.tsx:247), [packages/prompt-panel/src/turn-message.tsx:63](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/turn-message.tsx:63).

[Screenshot evidence in the HTML report](review-report.html#evidence-draft).

### R10 · P2 · Stopping and failed sends lack a clear next step

**Evidence (Stop-drain and rejected-send fixtures):** In the fixture, Stop generation left the header saying Generating until the existing eight-second fallback completed; it then showed Stopped. A rejected send displayed an error bubble with an empty composer and no retry action.

**Why it matters:** The stop implementation protects the stream drain, but it does not expose a Stopping state. Error copy is shown without an attached recovery action.

**Next move — interaction:** Show Stopping immediately and disable repeated stop intent. Distinguish stopped, failed, and ready states; offer Continue or Edit and retry where appropriate. Preserve the original request and attachments.

**Sources:** [apps/client/src/hooks/use-landing-page.ts:287](/Users/alexsandiiarov/Documents/web-app-creator/apps/client/src/hooks/use-landing-page.ts:287), [packages/prompt-panel/src/turn-message.tsx:56](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/turn-message.tsx:56).

[Screenshot evidence in the HTML report](review-report.html#evidence-connection).

### R11 · P2 · Long conversations read as agent logs

**Evidence (Rendered completed history + measured action height):** The reviewed completed project has repeated Thinking, Skill, Read, Edit, and Screenshot disclosures. A screenshot action label reaches 150px tall inside the 380px panel. Tool details and timings compete with the user’s request and result.

**Why it matters:** The assistant is intended to help build a page in place. A chronological implementation log becomes the dominant content when looking back through a run.

**Next move — relayout + typeset:** Keep a concise run summary and the resulting change visible. Group technical steps under an optional activity disclosure, shortening action labels while preserving complete diagnostics inside.

**Sources:** [packages/prompt-panel/src/turn-message.tsx:47](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/turn-message.tsx:47), [packages/prompt-panel/src/turn-steps.tsx:82](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/turn-steps.tsx:82).

### R12 · P3 · Advanced settings need consequences in plain language

**Evidence (Rendered settings + source):** Settings places Autocompaction and an 80 “% of context window” input next to theme and motion. It does not explain what is preserved or what a lower threshold changes.

**Why it matters:** The technical preference is exposed at the same level as everyday appearance controls. Its units describe the implementation rather than the user’s decision.

**Next move — writing + interaction:** Move it under Advanced and explain: “Summarize older conversation when context fills up.” Keep the percentage as an optional tuning control with a sensible default.

**Sources:** [packages/prompt-panel/src/panel-command-menu.tsx:205](/Users/alexsandiiarov/Documents/web-app-creator/packages/prompt-panel/src/panel-command-menu.tsx:205).

[Screenshot evidence in the HTML report](review-report.html#evidence-settings).

## Feature-by-feature review

“Works” is limited to the specific observed flow. “Source reviewed” does not claim a successful browser exercise.

| Feature | Verdict | Evidence | Review | Next move |
|---|---|---|---|---|
| Project library and thumbnails | Keep / refine | Live + source | Compact aligned rows support scanning; previews load lazily and remain inert. | Keep the list. Solve names before another visual relayout (R04). |
| Project names and editor identity | Needs work | Live + metadata | 75 projects, 26 distinct names, 34 identical truncated names; no visible rename. | Editable name plus current-project identity (R04). |
| Search | Works in reviewed flow | Live | A no-match query showed a recovery state; clearing restored the list. Search only covers stored titles. | Keep feedback; consider searching the original brief after naming is corrected. |
| Status filters | Works in reviewed flow | Live + source | Needs attention returned six projects. All projects restored 75. Counts agree with metadata. | Preserve selected filters on return from an editor. |
| Sorting | Works in reviewed flow | Live + source | Name A–Z was checked against all 75 DOM titles. Date sort implementations were inspected. | Retain the chosen sort between visits; keep the current options. |
| Project creation | Needs work | Mock + source | The redirect renders the empty editor; the dev mount makes two POSTs. No saved draft was created by the review. | Make one logical creation idempotent (R05). |
| Empty project and starter prompts | Keep | Fixture + live controls | Three suggestions fill and focus the composer without sending; export/refresh are disabled until content exists. | Keep the editable starter behavior. Element selection should also explain when there is no page to select. |
| Library loading, empty and error states | Partly verified | Live no-match + source | Library loading copy, first-project empty state, retry, and separate delete-error notice are implemented. Forced list-load failure was not exercised this turn. | Retain distinct states; announce search results near the search control. |
| Delete project | Source reviewed | Menu + source | An irreversible native confirmation precedes DELETE; failure uses a separate notice. No real project was deleted. | Include the project name in confirmation and expose pending deletion feedback. |
| Native project navigation | Keep / refine | Live + source | Rows are links, with a separate action menu and a working return shortcut. | Preserve draft and library context on navigation (R02). |
| Live page canvas | Keep | Live completed pages + source | The generated page owns the screen; the assistant is overlaid. Existing content and in-page controls render. | Keep this core composition. A paid generation and live HTML morph were not re-run. |
| Viewport presets | Works in reviewed flow | Live dimensions | Mobile rendered a 390px frame; Tablet rendered 768px. Preset switching and desktop restoration worked. | Show the pixel width and a selected-state cue inside the preset menu. |
| Refresh preview | Works in reviewed flow | Live + source | Refresh was invoked on a saved page; it rebuilds the frame without editing the project. | Keep; make the effect subtly visible if content is unchanged. |
| HTML export | Works in reviewed flow | Live + HTTP | Export kept the editor open. The endpoint returned 200, text/html and an attachment filename. | Keep Download HTML wording; an export-specific failure/retry state is still absent in the source. |
| Floating, docked and dragged assistant | Keep / refine | Live pointer + shortcuts | Left/right docking and floating worked; dragging moved the panel by the requested offset. | Avoid collision with page controls; make mobile options meaningful (R08). |
| Horizontal resize and chat/composer split | Partly verified | Live width resize + source | Left resize changed width 380→480; right resize changed it 480→560. Vertical split is keyboard-focusable but was not manipulated. | Add keyboard width control and protect composer minimums (R01, R07). |
| Minimize and restore | Keep | Live | Text, attachments, and prompt focus survived collapse/restore; the running fixture changed launcher copy to Building your page. | Keep mounted-state preservation; extend it across navigation (R02). |
| Draft writing and send | Needs work | Live + rejected-send fixture | Enter sent the intercepted request, errors rendered, and an empty composer disables Send. Unsent navigation drafts are lost. | Protect draft state and provide retry (R02). IME input was not tested. |
| Image attachment and validation | Needs work | Live local upload | PNG attachment and the four-item limit were exercised. Four valid items hide Send at 320px. | Bound the attachment area and add visual previews (R01, R09). Other MIME/size branches were source-reviewed. |
| Select an element | Works / refine | Live iframe selection | Hover selection and click produced Element em; selection exited correctly. | Show a readable excerpt and Locate action; keep selector details secondary (R09). |
| Conversation and activity details | Needs work | Rendered history + source | Completed requests, messages, tool labels and timings render; long labels dominate narrow history. | Group low-level steps while retaining inspection (R11). |
| Diagnostic image viewer | Source reviewed | Source | Tool-image buttons open a titled dialog; URL filtering and image rendering are implemented. Successful enlargement was not verified live. | Retain the viewer; add a representative image-dialog interaction check before changing it. |
| Running, retry and memory feedback | Partly works | Controlled fixture | Generating, retry countdown, context-compacted marker, and running launcher rendered. A closed stream left stale running feedback. | Add connection state and truthful retry completion (R03). |
| Stop and recovery | Needs work | Controlled fixture | Stop terminalized the fixture after the fallback; Generating stayed visible during the wait. A failed send had no retry control. | Expose Stopping and attach recovery actions (R10). |
| Text/Image/Vision model selection | Needs work | Live browsing + source | All three role lists and no-match search were inspected; saved model selections were not changed. | Explain roles and linkage, label the primary model, and finish keyboard behavior (R06, R07). |
| Project spend and pricing | Keep / refine | Live + source | The real project showed $0.08 in the trigger and $0.0808 with categories and tokens in the popover. | Raise essential 10px metadata. “Completed turns” currently counts any turn with stats, including streaming ones; adjust the label/count. |
| Theme and glass surfaces | Keep | Light/dark renders | Restrained 6–12px geometry and dense tinted surfaces remain readable over the reviewed generated pages. | Keep this material direction; do not add blur or rounding as the next fix. No formal contrast certification was performed. |
| Motion preferences | Keep | Live settings + media emulation | Off reduced transitions to 0.01ms. OS reduced motion overrode an Enhanced preference. Minimize/restore retains content. | Preserve overrides; physical-device frame-rate performance was not profiled. |
| Autocompaction settings | Needs clearer copy | Rendered control + source | The percentage input and limits are present; the setting’s consequence is unexplained. | Move under Advanced and explain the effect (R12). Actual memory behavior was not executed. |
| Keyboard and focus | Partly works | Live + DOM/source | Layout/navigation shortcuts and restore focus worked. Model tab arrows and horizontal keyboard resizing are missing. | Complete equivalent keyboard paths and dialog naming (R07). Screen-reader behavior remains untested. |
| Responsive composition | Needs work | Six viewport widths | Both major surfaces avoid body overflow at 320, 375, 768, 1024, 1440 and 2560px. This does not catch clipped internal controls. | Fix four-attachment Send clipping and validate physical touch/keyboard layouts (R01, R08). |

## Recommended sequence

| Order | Outcome | Findings | Mode | Work |
|---|---|---|---|---|
| 1 | Protect the primary task | R01–R03 | /design interaction | Keep Send reachable, persist drafts and attachments, restore failed sends, and reconnect interrupted streams. |
| 2 | Make projects identifiable | R04–R05 | /design interaction + implementation | Introduce editable names/current-project identity and idempotent project creation. |
| 3 | Simplify the assistant | R06, R09, R11, R12 | /design typeset + relayout | Clarify model roles, show visual attachment context, collapse low-level activity, and explain advanced settings. |
| 4 | Finish equivalent controls | R07–R08, R10 | /design interaction | Complete keyboard behavior, prevent dock collisions, adapt mobile layout choices, and expose Stopping. |

## Review artifacts and DOX

The paired HTML contains embedded screenshot evidence and uses the design skill’s report scaffold. Only the two prescribed report files were generated. Root AGENTS.md records ownership of the paired design reports; app and package instructions remain unchanged because their implemented behavior and boundaries were not changed. No application test suite was rerun for this report-only change.
