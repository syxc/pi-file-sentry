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
