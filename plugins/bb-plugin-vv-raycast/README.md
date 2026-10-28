# Raycast in VV

Experimental Raycast-style launcher inside the existing VV host. Open **Raycast** from plugin navigation, or http://127.0.0.1:38986/plugins/vv-raycast/launcher.

The foundation is the MIT-licensed SuperCmd fork at https://github.com/seb-veto/SuperCmd, upstream commit `2da7b9e5dec0199a972a59cece402c85f729d5d7`. The actual command-row and action-panel renderers are reused under `vendor/`; their bounded model/helper imports and accessibility are adapted for VV. The standalone Electron process and its AI accounts are not started.

App search reads the enrolled local macOS host’s application folders; Open validates against a fresh catalog and launches that selected application. Hidden app backups are excluded. No shell command is constructed. Search, arrows, Enter and Cmd-1…9 select/open items; Cmd-K opens actions, Escape returns focus, Cmd-F favorites. These keys are scoped to this plugin. No global hotkey is registered.

AI Chat uses the existing BB composer and ThreadChat for real provider sessions, models, environments, streaming, stop, approvals and conversation history. **Create AI Command** saves a name and prompt. `{selection}` means text entered explicitly in the command input; it does not read other apps. Opening a command prepares a draft, and Send is a separate execution action. Unconfirmed creation is persisted and never automatically retried. Saved commands use revision checks to refuse stale overwrites. Commands live in this plugin’s SQLite; conversations live in BB. Theme and favorites stay in the browser profile.

Build with `npm ci`, `bb plugin build`, `npm test`, `npx tsc --noEmit`. Install into the intended VV server with `BB_SERVER_URL=http://127.0.0.1:38986 bb plugin install . --yes`; later changes use `bb plugin build` and `BB_SERVER_URL=http://127.0.0.1:38986 bb plugin reload vv-raycast`.

`bb vv-raycast commands|chats --json` and the `vv_raycast_commands` agent tool expose bounded read-only state. No AI execution is implied by inspection.

## Qualification gaps

This is an installed first candidate, not a completed pixel-perfect Raycast clone. Native BB conversation controls deliberately retain their execution semantics; their full Raycast visual adaptation is unfinished. Root layout, real app icons, result grouping/ranking, forms, quick AI, chat sidebar/settings and recovery need exact reference comparisons. Clipboard, file search, calculator, quicklinks, snippets, notes, window management, extension execution and other Raycast surfaces are not implemented by this plugin yet. No inert controls claim them. Existing source tests do not establish provider or native-host acceptance.

Private reference captures and acceptance tracking: `/Users/seb/Tasks/raycast-vv-20261028/Tasks.md`. Keep private host/app catalogs and browser reference screenshots out of public commits.
