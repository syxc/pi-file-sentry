/**
 * RTK Integration for pi
 *
 * Automatically rewrites bash commands to use RTK for token-optimized output.
 * Supports 60-90% token savings on supported commands.
 *
 * @see ~/.pi/agent/RTK.md
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { isToolCallEventType } from '@mariozechner/pi-coding-agent';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_RTK_VERSION = { major: 0, minor: 23 };
const CHECK_TIMEOUT_MS = 2000;
const REWRITE_TIMEOUT_MS = 1000;

const SKIP_PATTERNS = {
  heredoc: '<<',
  pipe: '|',
  sudo: 'sudo',
  install: /\b(npm|yarn|pnpm|pip|cargo|go)\s+install\b/,
  rtkPrefix: 'rtk ',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let rtkState: { available: boolean; version?: string } | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if RTK is installed and meets minimum version requirement.
 * Results are cached after first check.
 */
function checkRtk(): { available: boolean; version?: string } {
  if (rtkState !== null) return rtkState;

  try {
    const output = execSync('rtk --version 2>/dev/null', {
      encoding: 'utf-8',
      timeout: CHECK_TIMEOUT_MS,
    }).trim();

    const version = output.match(/rtk\s+([\d.]+)/)?.[1] ?? 'unknown';
    const [major, minor] = version.split('.').map(Number);

    const isVersionSufficient = major > MIN_RTK_VERSION.major ||
      (major === MIN_RTK_VERSION.major && minor >= MIN_RTK_VERSION.minor);

    return rtkState = {
      available: isVersionSufficient,
      version: isVersionSufficient ? version : undefined,
    };
  } catch {
    return rtkState = { available: false };
  }
}

/**
 * Determine if a command should be skipped (not rewritten).
 * Skips: empty commands, heredocs, pipes, sudo, package installs, already-rtk commands.
 */
function shouldSkip(cmd: string): boolean {
  const c = cmd.trim();
  if (!c) return true;

  const { heredoc, pipe, sudo, install, rtkPrefix } = SKIP_PATTERNS;
  return c.includes(heredoc) ||
    c.includes(pipe) ||
    c.includes(sudo) ||
    install.test(c) ||
    c.startsWith(rtkPrefix);
}

/**
 * Attempt to rewrite a command using RTK.
 * @returns The rewritten command, or null if no optimization possible.
 */
function rewrite(cmd: string): string | null {
  try {
    const escaped = cmd.replace(/"/g, '\\"');
    const result = execSync(`rtk rewrite "${escaped}"`, {
      encoding: 'utf-8',
      timeout: REWRITE_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return result !== cmd ? result : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension Entry Point
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let initialized = false;

  const updateStatus = (ui: ExtensionAPI['ui']) => {
    const { available, version } = checkRtk();
    ui.setStatus('rtk', available ? `RTK v${version} ✓` : 'RTK not installed');
  };

  pi.on('session_start', async (_event, ctx) => {
    if (initialized) return;
    initialized = true;
    updateStatus(ctx.ui);
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
    description: 'Show RTK installation status',
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
