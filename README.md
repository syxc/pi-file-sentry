# pi-ext

Collection of extensions for [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Extensions

### file-sentry

File operation permission system for Read/Write/Edit tools.

> Works best with [pi-amplike](https://github.com/pasky/pi-amplike) — complements its Bash permission system.

**Usage**:
```bash
/file-sentry yolo      # Allow all operations
/file-sentry enable    # Enable permission checks
/file-sentry status    # Show current mode
```

**Install**: Copy `extensions/file-sentry.ts` and add to `~/.pi/agent/settings.json`:
```json
{ "extensions": ["~/.pi/agent/extensions/file-sentry.ts"] }
```

See [extensions/file-sentry.ts](extensions/file-sentry.ts) for full docs.

---

### rtk-integration

Automatically rewrites bash commands to use [RTK](https://github.com/rtk-ai/rtk) for token-optimized output (60-90% savings).

**Features**:
- ✅ Auto-detects RTK installation
- ✅ Rewrites supported commands (`git`, `ls`, `tree`, `pnpm`, `find`, `grep`, etc.)
- ✅ Silent fallback to normal bash if RTK unavailable
- ✅ Status indicator in pi UI
- ✅ `/rtk-status` command for manual checks

**Install**: Copy `extensions/rtk-integration.ts` and add to `~/.pi/agent/settings.json`:
```json
{ "extensions": ["~/.pi/agent/extensions/rtk-integration.ts"] }
```

**Requirements**:
```bash
brew install rtk  # v0.23+
```

**Example**:
```
# User types: git status
# Extension rewrites to: rtk git status
# Output: token-optimized, 60-90% smaller
```

## License

MIT
