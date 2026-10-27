# ChatGPT Web engine embedded in Code Bridge

Source: https://github.com/miuuyy/codex-chatgpt-web
Revision: cfeaf04bc7f54cea29e1ff2adbcad63bd038b119 (6.1.14)
License: MIT; see LICENSE in this directory.

The original TypeScript engine and locked production dependencies are retained here.
Code Bridge owns the UI, lifecycle, profile directory and worker protocol in
`src/chatgpt-web-manager.mjs` and `src/chatgpt-web-worker.ts` outside this directory.
No separate launcher or third-party installer is required.

This engine automates the ChatGPT browser interface. Account access and usage limits
continue to apply. Browser changes may require updating this pinned engine.
