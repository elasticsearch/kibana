/**
 * Shared analyzer behind the `guard-skill-boundaries` hook (Claude Code + Cursor).
 * Provides hard (non-LLM) enforcement for two surfaces that prompt-text guardrails
 * alone cannot close:
 *
 *   1. Secret/credential reads — deny Read/Bash access to files that commonly hold
 *      credentials, so an injected payload cannot exfiltrate them even if the model
 *      fails to detect the injection.
 *
 *   2. Writes to skill instruction files — deny Write/Edit to any skill's
 *      `references/` directory or `SKILL.md`, so a rogue "Continuous Learning"
 *      proposal or injected write instruction cannot silently poison skill context
 *      across sessions.
 *
 * PRECISION NOTES (honesty; same "non-goals" pattern as strip-review-event):
 *
 *   - `Read`/`Write`/`Edit` path checks are PRECISE: the tool input carries a
 *     structured `file_path`, so matching is exact once the path is normalised.
 *
 *   - The `Bash` command check is BEST-EFFORT string matching. Obfuscated forms
 *     such as `cat $HOME/.netrc`, `eval "cat ~/.netrc"`, or a variable holding
 *     the path will pass through. The Bash arm is defense-in-depth, not a
 *     guarantee; the tool-level arms (Read/Write/Edit) are the real boundaries.
 *
 *   - Fails OPEN: any error in this analyzer results in `null` (allow), matching
 *     the convention in strip-review-event. A broken hook must never block work.
 *
 * @see .claude/hooks/guard-skill-boundaries.mjs  — Claude Code wrapper
 * @see .cursor/hooks/guard-skill-boundaries.mjs  — Cursor wrapper
 */

import { homedir } from 'node:os';
import { resolve, normalize } from 'node:path';

// ---------------------------------------------------------------------------
// Secret path patterns
// ---------------------------------------------------------------------------

/**
 * Absolute path prefixes (resolved against HOME at module load time) that are
 * treated as credential locations. A Read/Bash that targets any of these is
 * denied.
 */
const HOME = homedir();

const SECRET_PATH_PREFIXES = [
  resolve(HOME, '.netrc'),        // single file — exact match also caught below
  resolve(HOME, '.aws'),          // AWS credentials directory
  resolve(HOME, '.ssh'),          // SSH private keys
  resolve(HOME, '.claude'),       // Claude Code settings, session tokens
  resolve(HOME, '.config', 'gh'), // GitHub CLI auth tokens
];

/**
 * Basename patterns for `.env`-style files anywhere in the tree. Matched
 * against the last path component after normalisation.
 */
const ENV_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\./,   // .env.local, .env.production, etc.
];

/**
 * Substrings checked against the raw Bash command string for the best-effort
 * Bash arm. Each is a simple lowercase substring — no glob/regex, to keep
 * the false-positive rate low.
 */
const BASH_SECRET_SUBSTRINGS = [
  '.netrc',
  '/.aws/',
  '/.ssh/',
  '/.claude/',
  '/.config/gh/',
  '/.env',
];

/**
 * Path substrings that identify skill instruction files in the Bash arm.
 * Combined with a write-indicator check — reading these files is allowed.
 */
const BASH_SKILL_PATH_SUBSTRINGS = ['.agents/skills/'];

/**
 * Shell write indicators. If a command contains one of these AND a skill
 * instruction path, it is a best-effort shell-based write attempt.
 * Using `>` (which also covers `>>` and `> `) catches both spaced and
 * no-space redirect forms: `echo x > file` and `echo x>file`.
 */
const BASH_WRITE_INDICATORS = ['>>', '>', 'tee ', 'sed -i'];

// ---------------------------------------------------------------------------
// Skill instruction file patterns
// ---------------------------------------------------------------------------

/**
 * Matches the canonical locations of skill instruction files inside any
 * `.agents/skills/` subtree. Checked against the `file_path` from Write/Edit.
 */
const SKILL_INSTRUCTION_PATTERNS = [
  // references/ directory under any skill
  /(?:^|\/)\.agents\/skills\/[^/]+\/references\//,
  // the skill's own SKILL.md
  /(?:^|\/)\.agents\/skills\/[^/]+\/SKILL\.md$/,
];

// ---------------------------------------------------------------------------
// Deny messages
// ---------------------------------------------------------------------------

const DENY_SECRET_READ = (path) =>
  `Reading credential/secret files is blocked by the guard-skill-boundaries hook. ` +
  `The path '${path}' matches a known credential location ` +
  `(~/.netrc, ~/.aws, ~/.ssh, ~/.claude, ~/.config/gh, or a .env file). ` +
  `If this is a legitimate need, ask the user to run the command directly in their terminal.`;

const DENY_BASH_SECRET =
  `The command contains a reference to a known credential path ` +
  `(~/.netrc, ~/.aws, ~/.ssh, ~/.claude, ~/.config/gh, or .env). ` +
  `Reading secret files is blocked by the guard-skill-boundaries hook. ` +
  `If this is a legitimate need, ask the user to run the command directly in their terminal. ` +
  `Note: this is a best-effort check on the raw command string — obfuscated paths may pass through.`;

const DENY_BASH_SKILL_WRITE =
  `The command appears to write to a skill instruction file (.agents/skills/). ` +
  `Shell-based writes to skill files are blocked by the guard-skill-boundaries hook. ` +
  `Skill instruction files must only be changed via a reviewed pull request. ` +
  `Note: this is a best-effort check — write patterns via variables or eval may pass through.`;

const DENY_SECRET_WRITE = (path) =>
  `Writing to credential/secret files is blocked by the guard-skill-boundaries hook. ` +
  `The path '${path}' matches a known credential location ` +
  `(~/.netrc, ~/.aws, ~/.ssh, ~/.claude, ~/.config/gh, or a .env file). ` +
  `If this is a legitimate need, ask the user to run the command directly in their terminal.`;

const DENY_SKILL_WRITE = (path) =>
  `Writing to skill instruction files is blocked by the guard-skill-boundaries hook. ` +
  `The path '${path}' is inside a skill's references/ directory or is a SKILL.md file. ` +
  `Skill instruction files must only be changed via a reviewed pull request — ` +
  `they are authoritative instruction context loaded on every session. ` +
  `To propose an update, print the suggested change as text and ask the user to apply it via PR.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a file path and resolve HOME-relative ~/ notation. */
const normalisePath = (filePath) => {
  if (typeof filePath !== 'string') return '';
  const expanded = filePath.startsWith('~/')
    ? resolve(HOME, filePath.slice(2))
    : filePath;
  return normalize(resolve(expanded));
};

/** True if the normalised path is inside or equal to a secret prefix. */
const isSecretPath = (normalised) => {
  const base = normalised.split('/').pop() ?? '';
  if (ENV_FILE_PATTERNS.some((re) => re.test(base))) return true;
  return SECRET_PATH_PREFIXES.some(
    (prefix) => normalised === prefix || normalised.startsWith(prefix + '/')
  );
};

/** True if the normalised path is a skill instruction file. */
const isSkillInstructionPath = (normalised) =>
  SKILL_INSTRUCTION_PATTERNS.some((re) => re.test(normalised));

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Analyse a Claude Code / Cursor tool call. Returns `null` (allow) or
 * `{ deny: <reason string> }`.
 *
 * @param {{ tool_name: string, tool_input: Record<string, unknown> }} call
 */
export const analyzeToolCall = ({ tool_name, tool_input }) => {
  if (!tool_name || typeof tool_name !== 'string') return null;

  const name = tool_name.toLowerCase();

  // --- Read / Grep / Glob: check file_path -----------------------------------
  if (name === 'read' || name === 'grep' || name === 'glob') {
    const raw = tool_input?.file_path ?? tool_input?.path ?? tool_input?.pattern ?? '';
    const normalised = normalisePath(String(raw));
    if (isSecretPath(normalised)) return { deny: DENY_SECRET_READ(raw) };
    return null;
  }

  // --- Write / Edit: block secret paths AND skill instruction paths ----------
  if (name === 'write' || name === 'edit') {
    const raw = tool_input?.file_path ?? '';
    const normalised = normalisePath(String(raw));
    if (isSecretPath(normalised)) return { deny: DENY_SECRET_WRITE(raw) };
    if (isSkillInstructionPath(normalised)) return { deny: DENY_SKILL_WRITE(raw) };
    return null;
  }

  // --- Bash: best-effort substring check on raw command ---------------------
  if (name === 'bash') {
    const cmd = String(tool_input?.command ?? '').toLowerCase();
    if (BASH_SECRET_SUBSTRINGS.some((s) => cmd.includes(s))) {
      return { deny: DENY_BASH_SECRET };
    }
    const hasSkillPath = BASH_SKILL_PATH_SUBSTRINGS.some((s) => cmd.includes(s));
    const hasWriteIndicator = BASH_WRITE_INDICATORS.some((s) => cmd.includes(s));
    if (hasSkillPath && hasWriteIndicator) {
      return { deny: DENY_BASH_SKILL_WRITE };
    }
    return null;
  }

  return null;
};
