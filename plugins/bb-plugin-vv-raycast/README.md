# Raycast in VV

Experimental Raycast replica inside VV, powered by BB server. Open **Raycast** from plugin navigation, or http://127.0.0.1:38986/plugins/vv-raycast/launcher. Full Raycast parity is unfinished.

The foundation is the MIT-licensed [SuperCmd fork](https://github.com/seb-veto/SuperCmd), upstream commit `2da7b9e5dec0199a972a59cece402c85f729d5d7`. The actual command-row and action-panel renderers are reused under `vendor/`, with bounded imports and accessibility adapted for VV. The standalone Electron process and its AI accounts are not started. The Raycast glyph in `assets/mark.svg` comes from [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/raycast.svg), CC0; its license is alongside it.

App search reads the enrolled local macOS host’s application folders, with real app icons. Open validates against a fresh catalog and launches only that selected application. Hidden app backups are excluded; no shell command is constructed. Search, arrows, Enter and Cmd-1…9 select/open items; Cmd-K opens searchable actions, Escape returns focus, Cmd-F favorites, and Cmd-E edits saved commands. Shortcuts are scoped to this plugin.

AI Chat uses BB’s native composer and ThreadChat for provider sessions, models, environments, streaming, stop, approvals and history. The chat sidebar searches titles, and pins, renames and archives the same native BB threads. It collapses on narrow screens. Quick AI has a separate compact surface; Tab opens it, and Cmd-J expands the same conversation/draft into AI Chat. Unlike Raycast’s immediate Tab submission, this candidate prepares a draft and requires Send. It does not paste into another app or collect screen/clipboard context.

**Create AI Command** saves a name and prompt. `{selection}` means text entered explicitly in the command input. Continue substitutes that input into a BB draft; Send starts execution. Input and native drafts survive reload. Cmd-Enter saves an edited command. Unconfirmed initial submissions are persisted and never automatically retried. Saved commands use revision checks to refuse stale overwrites. Commands live in this plugin’s SQLite; conversations, pinning, archive state and titles live in BB. Theme and favorites stay in the browser profile.

## Build and runtime

Use the intended VV cohort’s CLI, currently `/Users/seb/.bb-local/bin/bb`, with `BB_SERVER_URL=http://127.0.0.1:38986`. The qualified installed runtime/build is SDK0.6.56. Never launch an older VV variant against the shared data to build this plugin.

The public npm declaration package remains pinned to0.6.49 because0.6.56 is not published. Local qualification used the complete0.6.56 SDK from the qualified VV source cohort, installed without saving or modifying the lockfile. No private SDK or local absolute dependency is published in this fork. `bb plugin types` requests0.6.56 but cannot install it from npm yet. A clean public install therefore does not reproduce the exact local declaration cohort.

Run `npm ci`, `bb plugin build`, `npx tsc --noEmit`, and `npm test`. With a complete matching SDK supplied locally, install it using `npm install --no-save --package-lock=false <sdk-directory>` before those checks. Install into the intended server with `bb plugin install . --yes`; later changes use `bb plugin build` and `bb plugin reload vv-raycast`.

`bb vv-raycast commands|chats --json` and the `vv_raycast_commands` agent tool expose bounded read-only state. They do not execute AI commands. General agent execution parity remains open.

## Qualification

Six backend/host tests pass, covering duplicate/uncertain sends, revisions, owned native chat actions, app-path validation and real icons. One explicitly approved synthetic BB conversation returned `RAYCAST_QA_OK`; it was rendered in VV’s native browser and retained on reload. Native UI checks cover root search/actions, chat reopen, pin/unpin/rename/archive, command editing/input/reload, compact Quick AI and draft handoff. Archive stopped the QA thread’s own browser session as expected; restoration was through BB CLI, so the Restore UI is not yet qualified. These checks establish only their named layers.

The native BB composer, controls and message presentation still differ from Raycast. Root ranking, AI chat projects/settings, Quick AI auto-submit/paste, file search, calculator, quicklinks, snippets, notes, clipboard history, window management and extension execution remain unfinished. No inert controls claim them. The clone is not accepted as pixel-perfect.

Private references, screenshots, exact receipts and the remaining queue: `/Users/seb/Tasks/raycast-vv-20261028/Tasks.md`. Keep private host catalogs and screenshots out of public commits.
