# Luban Bridge S0 probes

This package is an S0 integration spike, not the production Bridge. It exposes only health checks and never reads or executes webpages. The existing Luban extension remains unchanged.

Use Node 24.14.1 (macOS arm64). Dependencies are pinned in package-lock.json. Run `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run probe:mcp`, then `npm run package`. Packaging rejects a different runtime/platform; select the pinned Node explicitly if npm uses another installation.

The bundle at `dist/luban-s0-macos-arm64` includes its own Node, dependencies, health-only extensions, Host template and installer. It must remain together. The installer refuses existing registration overwrite; uninstall checks that the registration belongs to the specified package.

Native Host registration, Cursor CLI approval/login, Keychain and real Feishu probes are explicit actions, never run during npm install/build/test. MCP stdio, Native framed stdio and Codex App Server stdio are separate entrypoints.

See [S0 manual checklist](../docs/v3/verification/v3-s0-manual-checklist.md), [results](../docs/v3/verification/v3-s0-record.md), and [dependency candidates](../docs/v3/verification/v3-s0-dependencies.md).

Secrets go only in the private `.local/feishu.json` input for the bounded S0 probe, never in examples, Git, command arguments or logs. Remove its Secret after validation. Production SecretStore is not implemented yet and must use Keychain. The Feishu probe only replies once to `LUBAN_S0_PING` from the bound sender in single chat and stops after at most 5 minutes.
