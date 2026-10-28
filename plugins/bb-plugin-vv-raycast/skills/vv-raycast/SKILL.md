---
name: vv-raycast
description: Search local file metadata, calculate, and inspect Raycast commands and BB conversation bindings.
---

Read-only commands:

- `bb vv-raycast commands --json`: saved AI prompts, bounded to1,000 characters each with a truncation flag.
- `bb vv-raycast chats --json`: plugin-owned BB thread bindings.
- `bb vv-raycast calculate "10ft in m" --json`: local arithmetic, percentages, functions and unit conversions. Unsupported input returns null. No model or network request.
- `bb vv-raycast files "query" --json`: at most50 local file/folder metadata results from the enrolled primary Mac’s home. Absolute and ~/ home paths resolve directly. No file contents are returned. Hidden paths, caches, Library and per-folder ignore rules are excluded. The donor index builds on demand; `indexing` means results are partial, and `indexLimited` means its entry cap was reached. Neither state proves complete coverage.

The `vv_raycast_commands`, `vv_raycast_calculate` and `vv_raycast_files` tools expose those read-only capabilities. Search can build a local metadata index; it does not upload a file or open an app. Query only the files relevant to the user’s request.

Open Raycast in VV for application search, file details/Open/Show in Finder, calculator, Quick AI, AI Chat and saved commands. File selections expire and are checked again before opening. If a file moved, changed identity or became ignored, search again; do not substitute an arbitrary shell path.

Opening an AI command prepares a draft; Send is the explicit execution action. BB retains native models, environments, permissions and approvals. Saved prompts grant no extra access. Do not start conversations, launch apps or open files merely to inspect the library. Unconfirmed initial sends reuse the persisted draft identity and do not retry automatically.

No background clipboard collection, global shortcut takeover, third-party accounts or extension-store installation is enabled. Full Raycast parity remains under qualification.
