# File Sentry

Pi coding agent extension for file operation permissions.

> Works best with [pi-amplike](https://github.com/pasky/pi-amplike) — complements its Bash permission system with Read/Edit/Write controls.

## Install

Copy `file-sentry.ts` to your extensions directory and register it in `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["~/.pi/agent/extensions/file-sentry.ts"]
}
```

## Usage

```bash
/file-sentry yolo      # Allow all operations without prompts
/file-sentry enable    # Enable permission checks
/file-sentry status    # Show current mode and rule count
```

## Configure Rules

Add rules to `~/.config/amp/settings.json`:

```json
{
  "amp.permissions": [
    {
      "tool": "Bash",
      "matches": { "cmd": "/^rm -rf \\//" },
      "action": "deny"
    },
    {
      "tool": "Read",
      "matches": { "path": "~/.ssh/**" },
      "action": "ask"
    },
    {
      "tool": "Edit",
      "matches": { "path": "**/*.env" },
      "action": "ask"
    }
  ]
}
```

### Rule Format

```typescript
{
  tool: "Bash" | "Read" | "Edit" | "Write" | "*",
  matches: { 
    cmd?: string | string[]   // For Bash tool
    path?: string | string[]  // For Read/Edit/Write tools
  },
  action: "allow" | "ask" | "deny"
}
```

### Pattern Matching

- **Exact**: `"/etc/passwd"`
- **Glob**: `"**/*.ts"`, `"~/.config/**"`
- **Regex**: `"/^rm -rf \\/$/"` (wrapped in slashes)
- **Multiple**: `["**/*.secret", "**/private/**"]`

Rules are evaluated top-to-bottom. First match wins.

## State

Mode is persisted to `~/.pi/agent/file-sentry.json`:

```json
{ "mode": "enabled" }
```

## License

MIT
