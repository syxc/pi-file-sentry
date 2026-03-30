/**
 * File Sentry for pi
 *
 * Permission system for Read/Write/Edit/Bash operations.
 * Reads rules from ~/.config/amp/settings.json
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const STATE_PATH = join(homedir(), '.pi', 'agent', 'file-sentry.json');
const CONFIG_PATH = join(homedir(), '.config', 'amp', 'settings.json');

const recentDenials = new Set<string>();

let state: { mode: 'enabled' | 'yolo' } = { mode: 'enabled' };

function loadState(): { mode: 'enabled' | 'yolo' } {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    }
  } catch {}
  return { mode: 'enabled' };
}

function saveState(s: { mode: 'enabled' | 'yolo' }): void {
  try {
    const dir = dirname(STATE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
  } catch {}
}

function globToRegex(pattern: string): RegExp {
  let p = pattern;
  if (p.startsWith('~/')) {
    p = join(homedir(), p.slice(2));
  }

  const GS_LEAD = '\x00GL\x00', GS_TAIL = '\x00GT\x00', STAR = '\x00ST\x00';

  if (p.startsWith('**/')) p = p.replace(/^\*\*\//, GS_LEAD);
  p = p.replace(/\/\*\*\//g, `/${GS_LEAD}`);
  p = p.replace(/\/\*\*$/g, GS_TAIL);
  p = p.replace(/\*/g, STAR);
  p = p.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  p = p.replace(new RegExp(escapeRegex(GS_LEAD), 'g'), '(.*/)?');
  p = p.replace(new RegExp(escapeRegex(GS_TAIL), 'g'), '(?:/.*)?');
  p = p.replace(new RegExp(escapeRegex(STAR), 'g'), '[^/]*');
  p = p.replace(/\\\?/g, '.');

  return new RegExp(`^${p}$`);
}

function escapeRegex(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function matches(value: string, pattern: string | string[]): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];

  for (const p of patterns) {
    if (p === '*') return true;

    const regexMatch = p.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      try {
        if (new RegExp(regexMatch[1], regexMatch[2]).test(value)) return true;
      } catch {}
      continue;
    }

    if (p.includes('*') || p.includes('?')) {
      if (globToRegex(p).test(value)) return true;
      continue;
    }

    if (value === p) return true;
  }
  return false;
}

function checkAction(tool: string, value: string): 'allow' | 'ask' | 'deny' {
  try {
    const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const rules = data['amp.permissions'] ?? [];

    for (const rule of rules) {
      if (rule.tool !== '*' && rule.tool.toLowerCase() !== tool.toLowerCase()) {
        continue;
      }

      const matchValue = tool.toLowerCase() === 'bash' ? rule.matches?.cmd : rule.matches?.path;
      if (matchValue === undefined) return rule.action;
      if (matches(value, matchValue)) return rule.action;
    }
  } catch {}

  return 'allow';
}

function shouldNotify(key: string): boolean {
  if (recentDenials.has(key)) return false;
  recentDenials.add(key);
  setTimeout(() => recentDenials.delete(key), 5000);
  return true;
}

export default function (pi: ExtensionAPI): void {
  state = loadState();
  saveState(state);

  pi.registerCommand('file-sentry', {
    description: 'File Sentry: yolo | enable | status',
    handler: async (args, ctx) => {
      const cmd = typeof args === 'string' ? args.toLowerCase() : (args[0] ?? '').toLowerCase();

      if (cmd === 'yolo') {
        state.mode = 'yolo';
        saveState(state);
        ctx.ui.setStatus('file-sentry', 'YOLO');
        ctx.ui.notify('File Sentry: YOLO mode - all operations allowed', 'warning');
        return;
      }

      if (cmd === 'enable' || cmd === 'enabled') {
        state.mode = 'enabled';
        saveState(state);
        ctx.ui.setStatus('file-sentry', undefined);
        ctx.ui.notify('File Sentry: protection enabled', 'info');
        return;
      }

      try {
        const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
        const rules = (data['amp.permissions'] ?? []).filter((r: any) =>
          ['Read', 'Edit', 'Write', '*'].includes(r.tool)
        );
        ctx.ui.notify(`File Sentry: mode=${state.mode}, rules=${rules.length}`, 'info');
      } catch {
        ctx.ui.notify(`File Sentry: mode=${state.mode}, rules=0`, 'info');
      }
    },
  });

  pi.on('tool_call', async (event, ctx) => {
    if (state.mode === 'yolo') return;

    const tool = event.toolName.toLowerCase();
    if (!['bash', 'read', 'edit'].includes(tool)) return;

    let value = '';
    if (tool === 'bash') value = (event.input.command as string) ?? '';
    else if (tool === 'read' || tool === 'edit') value = (event.input.path as string) ?? '';

    if (!value) return;

    const action = checkAction(tool, value);
    if (action === 'allow') return;

    const display = tool === 'bash' ? value : `${tool.toUpperCase()} ${value}`;

    if (action === 'deny') {
      if (shouldNotify(value)) {
        ctx.ui.notify(`⛔ File Sentry blocked: ${display}`, 'error');
      }
      return { block: true, reason: `File Sentry denied: ${display}` };
    }

    if (!ctx.hasUI) {
      return { block: true, reason: `File Sentry denied (no UI): ${display}` };
    }

    const choice = await ctx.ui.select(`⚠️ File Sentry\n\n${display}\n\nAllow this operation?`, ['Yes', 'No']);

    if (choice !== 'Yes') {
      ctx.abort?.();
      return { block: true, reason: 'Blocked by user' };
    }
  });

  pi.on('session_start', async (_e, ctx) => {
    if (state.mode === 'yolo') {
      ctx.ui.setStatus('file-sentry', 'YOLO');
    }
  });
}
