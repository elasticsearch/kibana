/**
 * Unit tests for guard-skill-boundaries.mjs
 * Run with: node --test .agents/hooks/guard-skill-boundaries.test.mjs
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { homedir } from 'node:os';
import { analyzeToolCall } from './guard-skill-boundaries.mjs';

const HOME = homedir();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const allow = (tool_name, tool_input) => {
  const result = analyzeToolCall({ tool_name, tool_input });
  assert.equal(result, null, `Expected allow for ${tool_name}(${JSON.stringify(tool_input)})`);
};

const deny = (tool_name, tool_input) => {
  const result = analyzeToolCall({ tool_name, tool_input });
  assert.ok(result?.deny, `Expected deny for ${tool_name}(${JSON.stringify(tool_input)})`);
  assert.equal(typeof result.deny, 'string');
};

// ---------------------------------------------------------------------------
// Read: secret paths → deny
// ---------------------------------------------------------------------------

test('Read ~/.netrc is denied', () => {
  deny('Read', { file_path: `${HOME}/.netrc` });
});

test('Read ~/.netrc with tilde is denied', () => {
  deny('Read', { file_path: '~/.netrc' });
});

test('Read ~/.aws/credentials is denied', () => {
  deny('Read', { file_path: `${HOME}/.aws/credentials` });
});

test('Read ~/.ssh/id_rsa is denied', () => {
  deny('Read', { file_path: `${HOME}/.ssh/id_rsa` });
});

test('Read ~/.claude/settings.json is denied', () => {
  deny('Read', { file_path: `${HOME}/.claude/settings.json` });
});

test('Read ~/.config/gh/hosts.yml is denied', () => {
  deny('Read', { file_path: `${HOME}/.config/gh/hosts.yml` });
});

test('Read .env file is denied', () => {
  deny('Read', { file_path: '/Users/glo/projects/kibana/.env' });
});

test('Read .env.local file is denied', () => {
  deny('Read', { file_path: '/Users/glo/projects/kibana/.env.local' });
});

// ---------------------------------------------------------------------------
// Read: normal paths → allow
// ---------------------------------------------------------------------------

test('Read a normal source file is allowed', () => {
  allow('Read', { file_path: '/Users/glo/projects/kibana/src/index.ts' });
});

test('Read a skill SKILL.md for analysis is allowed', () => {
  // Read is allowed (only Write/Edit to skill files is blocked)
  allow('Read', {
    file_path: '/Users/glo/projects/kibana/x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-validator/SKILL.md',
  });
});

test('Read a references file for analysis is allowed', () => {
  allow('Read', {
    file_path: '/Users/glo/projects/kibana/x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-validator/references/domain-knowledge.md',
  });
});

test('Read a file named .environment (not .env) is allowed', () => {
  allow('Read', { file_path: '/tmp/.environment' });
});

// ---------------------------------------------------------------------------
// Write / Edit: skill instruction files → deny
// ---------------------------------------------------------------------------

test('Write to references/defect-patterns.md is denied', () => {
  deny('Write', {
    file_path: '/Users/glo/projects/kibana/x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-validator/references/defect-patterns.md',
  });
});

test('Edit references/domain-knowledge.md is denied', () => {
  deny('Edit', {
    file_path: '/Users/glo/projects/kibana/x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-validator/references/domain-knowledge.md',
  });
});

test('Write to SKILL.md is denied', () => {
  deny('Write', {
    file_path: '/Users/glo/projects/kibana/x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-fix/SKILL.md',
  });
});

test('Write to root-level .agents/skills SKILL.md is denied', () => {
  deny('Write', {
    file_path: '/Users/glo/projects/kibana/.agents/skills/scout-ui-testing/SKILL.md',
  });
});

// ---------------------------------------------------------------------------
// Write / Edit: secret paths → deny (regression: was silently allowed before)
// ---------------------------------------------------------------------------

test('Write to ~/.ssh/authorized_keys is denied', () => {
  deny('Write', { file_path: '~/.ssh/authorized_keys' });
});

test('Write to ~/.aws/credentials is denied', () => {
  deny('Write', { file_path: '~/.aws/credentials' });
});

test('Edit ~/.claude/settings.json is denied', () => {
  deny('Edit', { file_path: '~/.claude/settings.json' });
});

test('Write to .env file is denied', () => {
  deny('Write', { file_path: '/Users/glo/projects/kibana/.env' });
});

// ---------------------------------------------------------------------------
// Write / Edit: normal files → allow
// ---------------------------------------------------------------------------

test('Write to a normal source file is allowed', () => {
  allow('Write', { file_path: '/Users/glo/projects/kibana/src/foo.ts' });
});

test('Write to bug-fixer-session analysis.json is allowed', () => {
  allow('Write', { file_path: '/Users/glo/projects/kibana/.bug-fixer-session/analysis.json' });
});

test('Write to a scripts/ file inside a skill is allowed', () => {
  allow('Write', {
    file_path: '/Users/glo/projects/kibana/x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-validator/scripts/fetch_issue.sh',
  });
});

// ---------------------------------------------------------------------------
// Bash: secret substrings → deny (best-effort)
// ---------------------------------------------------------------------------

test('Bash cat ~/.netrc is denied', () => {
  deny('Bash', { command: 'cat ~/.netrc' });
});

test('Bash referencing ~/.aws/ is denied', () => {
  deny('Bash', { command: 'cat ~/.aws/credentials' });
});

test('Bash referencing ~/.claude/ is denied', () => {
  deny('Bash', { command: 'cat ~/.claude/settings.json' });
});

test('Bash referencing .env is denied (best-effort)', () => {
  deny('Bash', { command: 'cat /path/to/.env' });
});

// ---------------------------------------------------------------------------
// Bash: normal commands → allow
// ---------------------------------------------------------------------------

test('Bash gh issue view is allowed', () => {
  allow('Bash', { command: 'gh issue view 12345 --repo elastic/kibana --json number,title,body' });
});

test('Bash git log is allowed', () => {
  allow('Bash', { command: 'git log --oneline -20 -- src/some/file.ts' });
});

test('Bash node scripts invocation is allowed', () => {
  allow('Bash', {
    command: 'bash x-pack/solutions/security/plugins/security_solution/.agents/skills/bug-validator/scripts/fetch_issue.sh 12345',
  });
});

test('Bash rg search is allowed', () => {
  allow('Bash', { command: "rg 'somePattern' src/" });
});

// ---------------------------------------------------------------------------
// Bash: shell-based writes to skill instruction files → deny
// ---------------------------------------------------------------------------

test('Bash redirect append to references/ is denied', () => {
  deny('Bash', { command: 'echo "evil" >> .agents/skills/bug-validator/references/defect-patterns.md' });
});

test('Bash redirect overwrite to references/ is denied', () => {
  deny('Bash', { command: 'echo "evil" > .agents/skills/bug-validator/references/domain-knowledge.md' });
});

test('Bash tee to skill file is denied', () => {
  deny('Bash', { command: 'echo "evil" | tee .agents/skills/bug-fix/SKILL.md' });
});

test('Bash sed -i on skill references file is denied', () => {
  deny('Bash', { command: "sed -i 's/old/new/' .agents/skills/bug-validator/references/bulk-mode.md" });
});

// Regression: no-space redirect bypassed the '> ' indicator check
test('Bash no-space redirect to skill file is denied', () => {
  deny('Bash', { command: 'echo "injected content">.agents/skills/bug-fixer/SKILL.md' });
});

// Reading a references file via shell is allowed (only writes are blocked)
test('Bash cat of a references file is allowed', () => {
  allow('Bash', { command: 'cat .agents/skills/bug-validator/references/domain-knowledge.md' });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('Unknown tool name is allowed', () => {
  allow('WebFetch', { url: 'https://github.com/elastic/kibana' });
});

test('Null/undefined tool_input is allowed gracefully', () => {
  allow('Read', null);
});

test('Empty tool name is allowed gracefully', () => {
  allow('', {});
});
