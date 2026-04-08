# pi-ext

Extensions for [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Extensions

### file-sentry

Permission system for Read/Write/Edit/Bash operations.

Reads rules from `~/.config/amp/settings.json`. Blocks or asks before operations based on configurable rules.

**Mode**: `/file-sentry yolo | enable | status`

**Install**:
```json
{ "extensions": ["~/.pi/agent/extensions/file-sentry.ts"] }
```

> **Tip**: Pairs well with [pi-amplike permissions](https://github.com/pasky/pi-amplike/blob/main/extensions/permissions.ts) for Bash command permissions.

---

### claude-rules

Implements Claude Code's `.claude/rules/` loading behavior for pi. Automatically discovers and loads rules from `~/.claude/rules/` and `.claude/rules/` directories.

**Features**:
- Auto-discovers all `.md` files recursively
- Unconditional rules load at session start
- Path-scoped rules (with `paths:` frontmatter) activate only when working with matching files
- User-level rules (`~/.claude/rules/`) load before project rules (`.claude/rules/`)
- Supports glob patterns: `**/*.ts`, `src/**/*`, `*.{ts,tsx}`

**Example rule with path-scope**:
```markdown
---
paths:
  - "src/**/*.{ts,tsx}"
---

# TypeScript Rules
- Use strict mode
- No default exports, named exports only
```

**Install**:
```json
{ "extensions": ["~/.pi/agent/extensions/claude-rules.ts"] }
```

**Requires**: Create `~/.claude/rules/*.md` and/or `.claude/rules/*.md` with your rules.

---

### rtk-integration

Auto-rewrites bash commands to use [RTK](https://github.com/rtk-ai/rtk) for 60-90% token savings.

Transparent: user types `git status`, runs as `rtk git status`.

**Install**:
```json
{ "extensions": ["~/.pi/agent/extensions/rtk-integration.ts"] }
```

**Requires**:
```bash
brew install rtk  # v0.23+
```

**Commands**:
- `/rtk-status` - Check RTK availability

## License

MIT
