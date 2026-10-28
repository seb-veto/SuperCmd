---
name: vv-raycast
description: Inspect the VV Raycast command library and BB conversation bindings.
---

Use `bb vv-raycast commands --json` for saved AI prompts and `bb vv-raycast chats --json` for BB thread bindings. Both are read-only. The native `vv_raycast_commands` tool returns the same command library.

Open Raycast in VV plugin navigation for app search, AI Chat and Create AI Command. Opening a saved command prepares a prompt; Send is the explicit execution action. AI uses BB’s native model/environment/permission controls. Saved prompts do not grant extra access. Do not start conversations or launch apps merely to inspect the library.

This experimental integration has no background clipboard collection, global shortcut takeover, third-party accounts or extension-store installation. Unconfirmed sends do not retry automatically. Full Raycast parity remains under qualification.
