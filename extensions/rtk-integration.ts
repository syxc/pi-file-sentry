/**
 * RTK Integration for pi
 * Automatically rewrites bash commands to use RTK for token-optimized output.
 * @see ~/.pi/agent/RTK.md
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { isToolCallEventType } from '@mariozechner/pi-coding-agent';
import { execSync } from 'child_process';

// Cache for rtk availability
let rtkAvailable: boolean | null = null;
let rtkVersion: string | null = null;

/**
 * Check if rtk is installed
 */
function checkRtk(): { available: boolean; version?: string } {
  if (rtkAvailable !== null) {
    return { available: rtkAvailable, version: rtkVersion || undefined };
  }
  try {
    const output = execSync('rtk --version 2>/dev/null', { encoding: 'utf-8', timeout: 2000 }).trim();
    const match = output.match(/rtk\s+([\d.]+)/);
    const version = match ? match[1] : 'unknown';
    const [major, minor] = version.split('.').map(Number);
    if (major === 0 && minor < 23) {
      rtkAvailable = false;
      return { available: false };
    }
    rtkAvailable = true;
    rtkVersion = version;
    return { available: true, version };
  } catch {
    rtkAvailable = false;
    return { available: false };
  }
}

/**
 * Commands to skip
 */
function shouldSkip(cmd: string): boolean {
  const c = cmd.trim();
  if (!c) return true;
  // Skip heredocs, pipes, sudo, installs
  if (
    c.includes('<<') ||
    c.includes('|') ||
    c.includes('sudo') ||
    /\b(npm|yarn|pnpm|pip|cargo|go)\s+install\b/.test(c)
  ) {
    return true;
  }
  // Skip already-rtk commands
  if (c.startsWith('rtk ')) return true;
  return false;
}

/**
 * Rewrite command using rtk
 */
function rewrite(cmd: string): string | null {
  try {
    const result = execSync(`rtk rewrite "${cmd.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result !== cmd ? result : null;
  } catch {
    return null;
  }
}

/**
 * Extension entry point
 */
export default function (pi: ExtensionAPI) {
  let initialized = false;

  pi.on('session_start', async (_event, ctx) => {
    if (initialized) return;
    initialized = true;
    const { available, version } = checkRtk();
    if (available) {
      ctx.ui.setStatus('rtk', `RTK v${version} ✓`);
    } else {
      ctx.ui.setStatus('rtk', 'RTK not installed');
    }
  });

  pi.on('tool_call', async (event, _ctx) => {
    if (!isToolCallEventType('bash', event)) return;
    const { available } = checkRtk();
    if (!available) return;
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
      if (available) {
        ctx.ui.notify(`RTK v${version} active`, 'success');
      } else {
        ctx.ui.notify('RTK not installed. Run: brew install rtk', 'warn');
      }
    },
  });
}
