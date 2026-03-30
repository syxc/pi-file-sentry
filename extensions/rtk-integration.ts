/**
 * RTK Integration for pi Coding Agent
 *
 * Automatically intercepts and rewrites bash commands to use RTK (Rust Token Killer)
 * for token-optimized output, achieving 60-90% token savings on supported commands.
 *
 * Features:
 * - Transparent command rewriting with zero user intervention
 * - Intelligent skip logic for complex commands (pipes, heredocs, installs)
 * - Version-aware RTK detection (requires v0.23+)
 * - Real-time status indication in pi UI
 * - Graceful fallback when RTK is unavailable
 *
 * @remarks
 * This extension operates transparently - users type normal bash commands,
 * and supported commands are automatically rewritten to use RTK before execution.
 *
 * @example
 * User types: `git status`
 * Extension rewrites to: `rtk git status`
 * Result: Same output, 60-90% fewer tokens
 *
 * @see {@link https://github.com/rtk-ai/rtk} - RTK repository
 * @see {@link ~/.pi/agent/RTK.md} - Local RTK documentation
 *
 * @packageDocumentation
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { isToolCallEventType } from '@mariozechner/pi-coding-agent';
import { execSync, ExecSyncOptions } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RTK version components for semantic version comparison.
 */
interface SemVer {
  major: number;
  minor: number;
}

/**
 * RTK availability state with optional version information.
 */
interface RtkState {
  available: boolean;
  version?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimum RTK version required for compatibility.
 * Version format: major.minor (patch version ignored)
 */
const MIN_RTK_VERSION: Readonly<SemVer> = Object.freeze({ major: 0, minor: 23 });

/**
 * Timeout for RTK version check command (milliseconds).
 * Chosen to balance responsiveness with slow system tolerance.
 */
const CHECK_TIMEOUT_MS = 2000;

/**
 * Timeout for RTK command rewrite operation (milliseconds).
 * Shorter timeout ensures snappy command execution.
 */
const REWRITE_TIMEOUT_MS = 1000;

/**
 * Patterns that indicate commands should not be rewritten.
 * These commands either:
 * - Have complex syntax that RTK may not handle correctly (heredocs, pipes)
 * - Require elevated privileges (sudo)
 * - Are installation commands that should run natively
 * - Are already RTK commands
 */
const SKIP_PATTERNS = {
  /** Heredoc syntax - RTK may not preserve multi-line input correctly */
  heredoc: '<<',
  /** Pipe chains - RTK should process each segment individually */
  pipe: '|',
  /** Sudo commands - privilege escalation should use native commands */
  sudo: 'sudo',
  /** Package manager install commands - run natively for reliability */
  install: /\b(npm|yarn|pnpm|pip|cargo|go)\s+install\b/u,
  /** Already-rewritten RTK commands - prevent double-rewriting */
  rtkPrefix: 'rtk ',
} as const;

/**
 * Base execSync options for RTK commands.
 */
const EXEC_OPTIONS: Readonly<ExecSyncOptions> = Object.freeze({
  encoding: 'utf-8',
  stdio: ['pipe', 'pipe', 'pipe'],
});

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cached RTK availability state.
 * Null indicates state has not been determined yet.
 * Populated on first checkRtk() call, reused thereafter.
 */
let rtkState: RtkState | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if RTK is installed and meets the minimum version requirement.
 *
 * Performs a synchronous version check on first invocation and caches the result.
 * Subsequent calls return the cached state immediately without system calls.
 *
 * @returns RTK availability state with optional version string.
 *
 * @remarks
 * Version check executes: `rtk --version 2>/dev/null`
 * Parses semantic version format: "rtk X.Y.Z"
 * Requires minimum version 0.23 (major version 0, minor version >= 23)
 *
 * @throws Silently catches all errors and returns { available: false }
 */
function checkRtk(): RtkState {
  // Return cached state if already determined
  if (rtkState !== null) {
    return rtkState;
  }

  try {
    // Execute RTK version check
    const output = execSync('rtk --version 2>/dev/null', {
      ...EXEC_OPTIONS,
      timeout: CHECK_TIMEOUT_MS,
    }).trim();

    // Parse version string (format: "rtk X.Y.Z")
    const versionMatch = output.match(/rtk\s+([\d.]+)/u);
    const version = versionMatch?.[1] ?? 'unknown';
    const [majorStr, minorStr] = version.split('.');
    const major = Number(majorStr);
    const minor = Number(minorStr);

    // Validate minimum version requirement
    const isVersionSufficient =
      major > MIN_RTK_VERSION.major ||
      (major === MIN_RTK_VERSION.major && minor >= MIN_RTK_VERSION.minor);

    // Cache and return result
    const result: RtkState = {
      available: isVersionSufficient,
      version: isVersionSufficient ? version : undefined,
    };

    rtkState = result;
    return result;
  } catch (error) {
    // Cache failure state
    const unavailable: RtkState = { available: false };
    rtkState = unavailable;
    return unavailable;
  }
}

/**
 * Determines whether a bash command should be skipped (not rewritten by RTK).
 *
 * Commands are skipped if they:
 * - Are empty or whitespace-only
 * - Contain heredoc syntax (<<)
 * - Contain pipe operators (|)
 * - Use sudo for privilege escalation
 * - Are package manager install commands
 * - Are already RTK commands (rtk prefix)
 *
 * @param cmd - The bash command to evaluate.
 * @returns `true` if the command should be skipped, `false` if it can be rewritten.
 *
 * @example
 * ```typescript
 * shouldSkip('')           // true - empty command
 * shouldSkip('cat << EOF') // true - heredoc
 * shouldSkip('ls | grep')  // true - pipe
 * shouldSkip('sudo apt')   // true - sudo
 * shouldSkip('npm install')// true - install
 * shouldSkip('rtk git')    // true - already RTK
 * shouldSkip('git status') // false - can rewrite
 * ```
 */
function shouldSkip(cmd: string): boolean {
  const trimmed = cmd.trim();

  // Empty commands are always skipped
  if (!trimmed) {
    return true;
  }

  // Destructure patterns for cleaner access
  const { heredoc, pipe, sudo, install, rtkPrefix } = SKIP_PATTERNS;

  // Check each skip condition
  return (
    trimmed.includes(heredoc) ||
    trimmed.includes(pipe) ||
    trimmed.includes(sudo) ||
    install.test(trimmed) ||
    trimmed.startsWith(rtkPrefix)
  );
}

/**
 * Attempts to rewrite a bash command using RTK's optimization.
 *
 * Executes `rtk rewrite "<cmd>"` and returns the optimized version
 * if RTK determines optimization is possible. Returns null if:
 * - RTK is not available
 * - The command cannot be optimized
 * - An error occurs during rewriting
 *
 * @param cmd - The original bash command to rewrite.
 * @returns The RTK-optimized command, or `null` if no optimization possible.
 *
 * @remarks
 * Command strings are escaped to handle embedded double quotes.
 * The rewrite operation has a short timeout (1s) to ensure snappy execution.
 *
 * @example
 * ```typescript
 * rewrite('git status')  // 'rtk git status' (or null if no optimization)
 * rewrite('ls -la')      // 'rtk ls -la' (or null if no optimization)
 * ```
 */
function rewrite(cmd: string): string | null {
  try {
    // Escape double quotes for shell safety
    const escaped = cmd.replace(/"/g, '\\"');

    // Execute RTK rewrite command
    const result = execSync(`rtk rewrite "${escaped}"`, {
      ...EXEC_OPTIONS,
      timeout: REWRITE_TIMEOUT_MS,
    }).trim();

    // Only return if RTK actually modified the command
    return result !== cmd ? result : null;
  } catch (error) {
    // Any error means no optimization possible
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RTK Integration extension main entry point.
 *
 * Registers event handlers for:
 * - `session_start`: Initialize RTK status indicator
 * - `tool_call`: Intercept and rewrite bash commands
 * - `rtk-status` command: Manual status check for users
 *
 * @param pi - Extension API instance for registering handlers and commands.
 */
export default function (pi: ExtensionAPI): void {
  /**
   * Initialization guard to prevent duplicate handler registration.
   * Set to true after first session_start event.
   */
  let initialized = false;

  /**
   * Updates the RTK status indicator in the pi UI.
   *
   * Displays either:
   * - "RTK vX.X.X ✓" when RTK is available
   * - "RTK not installed" when RTK is unavailable
   *
   * @param ui - UI API instance for setting status indicators.
   */
  const updateStatus = (ui: ExtensionAPI['ui']): void => {
    const { available, version } = checkRtk();
    const statusText = available
      ? `RTK v${version} ✓`
      : 'RTK not installed';
    ui.setStatus('rtk', statusText);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Event Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Session initialization handler.
   * Runs once per session to set up the RTK status indicator.
   */
  pi.on('session_start', async (_event, ctx): Promise<void> => {
    if (initialized) {
      return;
    }
    initialized = true;
    updateStatus(ctx.ui);
  });

  /**
   * Bash command interception handler.
   * Rewrites eligible commands to use RTK for token optimization.
   *
   * Processing flow:
   * 1. Verify event is a bash tool call
   * 2. Check RTK availability
   * 3. Evaluate skip conditions
   * 4. Attempt command rewrite
   * 5. Apply rewritten command if optimization successful
   */
  pi.on('tool_call', async (event, _ctx): Promise<void> => {
    // Only process bash tool calls
    if (!isToolCallEventType('bash', event)) {
      return;
    }

    // Skip if RTK is not available
    if (!checkRtk().available) {
      return;
    }

    const cmd = event.input.command;

    // Skip commands that should not be rewritten
    if (shouldSkip(cmd)) {
      return;
    }

    // Attempt to rewrite the command
    const rewritten = rewrite(cmd);

    // Apply rewritten command if optimization successful
    if (rewritten !== null) {
      event.input.command = rewritten;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Registered Commands
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Manual RTK status check command.
   * Users can invoke `/rtk-status` to verify RTK installation.
   */
  pi.registerCommand('rtk-status', {
    description: 'Show RTK installation status and version',
    handler: async (_args, ctx): Promise<void> => {
      const { available, version } = checkRtk();

      if (available) {
        ctx.ui.notify(`RTK v${version} active`, 'success');
      } else {
        ctx.ui.notify('RTK not installed. Run: brew install rtk', 'warn');
      }
    },
  });
}
