# Protocol browser verification

- Date: 2026-09-06.
- Target: isolated executor worktree, Vite at `http://127.0.0.1:4178`, temporary API at port 50891.
- Fixture: `pnpm --filter @workspace/server fixture:protocol`, scripted agent, temporary project `33333333-3333-4333-8333-333333333333`.
- Browser: two independent agent-browser sessions, `architecture018-a` and `architecture018-b`.

## Observed results

1. Both editors were open before the first submission. Sending “Build a calm portfolio page” in A produced the same prompt and streamed response in B; both showed Generating and Stop. [Second editor](screenshots/second-editor-running.png).
2. Reloading A during the paused run restored its prompt, response, and active Stop control. Clicking Stop in B changed both editors to Stopped. [Reloaded editor after Stop](screenshots/reloaded-editor-stopped.png).
3. B retained the unsent draft “Keep this newer draft” while A submitted a second request. Releasing the scripted run through the fixture control changed both editors to Done. Reloading A preserved both turns without duplicate response text. [Completion and preserved draft](screenshots/completed-preserved-draft.png).
4. Renaming the project in B updated A's already-open library without a refresh. [Remote rename](screenshots/list-remote-rename.png).
5. Deleting the seeded project from B's library, then accepting its confirmation, changed both libraries to the authoritative empty state with zero projects. [Remote deletion](screenshots/list-remote-delete.png).
6. Both browser error logs were empty.

The Vite development server performed hot updates during formatting. One rename dialog was reopened after such an update. The browser CLI reported a stale menu item after the delete confirmation; independent snapshots verified the deletion completed in both sessions. Neither was treated as a product defect.

## Scope and cleanup

The browser fixture verifies actual client/server behavior with deterministic text and terminal states. It does not exercise paid models, screenshot providers, or generated-page design quality. Document-write failures, byte boundaries, and disk reconstruction are covered by executable server tests separately.

Both browser sessions closed. The fixture's `/shutdown` completed with process exit 0 and awaited temporary-runtime disposal. Vite was stopped with SIGINT. Existing project data was not used.
