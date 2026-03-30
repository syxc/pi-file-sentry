/**
 * RTK Integration for pi
 *
 * Automatically rewrites bash commands to use RTK for token-optimized output.
 * See: https://github.com/rtk-ai/rtk
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { isToolCallEventType } from '@mariozechner/pi-coding-agent';
import { execSync } from 'child_process';

const MIN_RTK_MINOR = 23;
const CHECK_TIMEOUT_MS = 2000;
const REWRITE_TIMEOUT_MS = 1000;

let rtkState: { available: boolean; version?: string } | null = null;

/**
 * Check RTK availability. Cached after first call.
 */
function checkRtk(): { available: boolean; version?: string } {
  if (rtkState !== null) {
    return rtkState;
  }

  try {
    const output = execSync('rtk --version 2>/dev/null', {
      encoding: 'utf-8',
      timeout: CHECK_TIMEOUT_MS,
    }).trim();

    const version = output.match(/rtk\s+([\d.]+)/)?.[1] ?? 'unknown';
    const [major, minor] = version.split('.').map(Number);

    // Require 0.23+
    const ok = major > 0 || minor >= MIN_RTK_MINOR;

    return (rtkState = { available: ok, version: ok ? version : undefined });
  } catch {
    return (rtkState = { available: false });
  }
}

/**
 * Skip rewrite for: empty, heredocs, pipes, sudo, installs, already-rtk.
 */
function shouldSkip(cmd: string): boolean {
  const c = cmd.trim();
  if (!c) return true;

  return (
    c.includes('<<') ||
    c.includes('|') ||
    c.includes('sudo') ||
    /\b(npm|yarn|pnpm|pip|cargo|go)\s+install\b/.test(c) ||
    c.startsWith('rtk ')
  );
}

/**
 * Try to rewrite command via RTK. Returns null if no optimization.
 */
function rewrite(cmd: string): string | null {
  try {
    const result = execSync(`rtk rewrite "${cmd.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: REWRITE_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return result !== cmd ? result : null;
  } catch {
    return null;
  }
}

export default function (pi: ExtensionAPI) {
  let initialized = false;

  pi.on('session_start', async (_event, ctx) => {
    if (initialized) return;
    initialized = true;

    const { available, version } = checkRtk();
    ctx.ui.setStatus('rtk', available ? `RTK v${version} ✓` : 'RTK not installed');
  });

  pi.on('tool_call', async (event, _ctx) => {
    if (!isToolCallEventType('bash', event)) return;
    if (!checkRtk().available) return;

    const cmd = event.input.command;
    if (shouldSkip(cmd)) return;

    const rewritten = rewrite(cmd);
    if (rewritten) {
      event.input.command = rewritten;
    }
  });

  pi.registerCommand('rtk-status', {
    description: 'Show RTK status',
    handler: async (_args, ctx) => {
      const { available, version } = checkRtk();
      ctx.ui.notify(
        available ? `RTK v${version} active` : 'RTK not installed. Run: brew install rtk',
        available ? 'success' : 'warn'
      );
    },
  });
}
