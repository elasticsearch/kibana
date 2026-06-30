'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REQUIRED_LABEL = 'ai:auto-commit';
const SKIP_LABEL = 'reviewer:skip-ai';
const REVIEWER_LABELS = Object.freeze({
  codex: 'reviewer:codex',
  claude: 'reviewer:claude',
});

const PROTECTED_PATH_PREFIXES = [
  '.agents/',
  '.buildkite/',
  '.claude/',
  '.codex/',
  '.cursor/',
  '.github/',
  '.githooks/',
  '.husky/',
  'config/',
  'scripts/',
];

const PROTECTED_BASENAMES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'CODEOWNERS',
  'GEMINI.md',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const getInputs = () => {
  const [owner, repo] = getRequiredEnv('GITHUB_REPOSITORY').split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY must be in owner/repo format');
  }

  const prNumber = Number.parseInt(getRequiredEnv('PR_NUMBER'), 10);
  if (!Number.isInteger(prNumber)) {
    throw new Error('PR_NUMBER must be an integer');
  }

  return {
    owner,
    repo,
    token: getRequiredEnv('GITHUB_TOKEN'),
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
    prNumber,
    reviewerRunId: getRequiredEnv('REVIEWER_RUN_ID'),
    artifactDir: getRequiredEnv('ARTIFACT_DIR'),
    expectedHeadSha: getRequiredEnv('EXPECTED_HEAD_SHA'),
    patchSha256: process.env.PATCH_SHA256 || '',
    reviewerId: getRequiredEnv('REVIEWER_ID'),
    requesterLogin: getRequiredEnv('REQUESTER_LOGIN'),
  };
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}${stderr}`);
  }

  return result.stdout?.trim() ?? '';
};

const githubRequest = async ({ inputs, method = 'GET', endpoint, body }) => {
  const response = await fetch(`${inputs.apiUrl}${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${inputs.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${endpoint} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
};

const postComment = async ({ inputs, body }) => {
  await githubRequest({
    inputs,
    method: 'POST',
    endpoint: `/repos/${inputs.owner}/${inputs.repo}/issues/${inputs.prNumber}/comments`,
    body: { body },
  });
};

const getPullRequest = (inputs) =>
  githubRequest({
    inputs,
    endpoint: `/repos/${inputs.owner}/${inputs.repo}/pulls/${inputs.prNumber}`,
  });

const getCollaboratorPermission = (inputs) =>
  githubRequest({
    inputs,
    endpoint: `/repos/${inputs.owner}/${inputs.repo}/collaborators/${encodeURIComponent(
      inputs.requesterLogin
    )}/permission`,
  });

const hasWriteAccess = (permission) =>
  ['admin', 'write'].includes(permission.permission) ||
  ['admin', 'maintain', 'write'].includes(permission.role_name);

const getLabelNames = (pullRequest) => pullRequest.labels.map((label) => label.name);

const validatePullRequest = async (inputs, pullRequest) => {
  const labels = getLabelNames(pullRequest);
  const reviewerLabel = REVIEWER_LABELS[inputs.reviewerId];

  if (!reviewerLabel) {
    throw new Error(`Unsupported REVIEWER_ID: ${inputs.reviewerId}`);
  }

  if (pullRequest.state !== 'open') {
    throw new Error(`PR #${inputs.prNumber} is not open`);
  }

  if (!labels.includes(reviewerLabel)) {
    throw new Error(`PR #${inputs.prNumber} does not have ${reviewerLabel}`);
  }

  if (!labels.includes(REQUIRED_LABEL)) {
    throw new Error(`PR #${inputs.prNumber} does not have ${REQUIRED_LABEL}`);
  }

  if (labels.includes(SKIP_LABEL)) {
    throw new Error(`PR #${inputs.prNumber} has ${SKIP_LABEL}`);
  }

  if (pullRequest.head.sha !== inputs.expectedHeadSha) {
    throw new Error(
      `PR head changed from ${inputs.expectedHeadSha} to ${pullRequest.head.sha}; skipping autofix`
    );
  }

  const sameRepo = pullRequest.head.repo?.full_name === pullRequest.base.repo?.full_name;
  if (!sameRepo && !pullRequest.maintainer_can_modify) {
    throw new Error('PR branch does not allow maintainer modifications');
  }

  const permission = await getCollaboratorPermission(inputs);
  if (!hasWriteAccess(permission)) {
    throw new Error(`${inputs.requesterLogin} does not have write access`);
  }

  return pullRequest;
};

const walkFiles = (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
};

const findPatchFile = (artifactDir) => {
  const patches = walkFiles(artifactDir).filter((file) => /(^|\/)aw-.*\.patch$/.test(file));
  if (patches.length !== 1) {
    throw new Error(`Expected exactly one aw-*.patch artifact, found ${patches.length}`);
  }
  return patches[0];
};

const sha256File = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const stripPatchPath = (value) =>
  value
    .replace(/^"|"$/g, '')
    .replace(/^a\//, '')
    .replace(/^b\//, '')
    .trim();

const getPatchPaths = (patchFile) => {
  const paths = new Set();
  for (const line of fs.readFileSync(patchFile, 'utf8').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git (.+) (.+)$/);
      if (match) {
        paths.add(stripPatchPath(match[1]));
        paths.add(stripPatchPath(match[2]));
      }
    } else if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const patchPath = line.slice(4).split('\t')[0];
      if (patchPath !== '/dev/null') {
        paths.add(stripPatchPath(patchPath));
      }
    }
  }
  return [...paths].filter(Boolean);
};

const isProtectedPath = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const basename = path.posix.basename(normalized);
  return (
    PROTECTED_BASENAMES.has(basename) ||
    PROTECTED_PATH_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))
  );
};

const assertAllowedPatch = (patchFile) => {
  const paths = getPatchPaths(patchFile);
  const protectedPaths = paths.filter(isProtectedPath);
  if (protectedPaths.length > 0) {
    throw new Error(`Patch touches protected paths: ${protectedPaths.join(', ')}`);
  }
};

const checkoutPullRequest = (inputs) => {
  run('git', ['config', '--global', 'user.name', 'github-actions[bot]']);
  run('git', ['config', '--global', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  run('gh', ['auth', 'setup-git']);
  run('gh', ['pr', 'checkout', String(inputs.prNumber)]);
};

const applyPatch = ({ patchFile, inputs }) => {
  checkoutPullRequest(inputs);

  const checkedOutSha = run('git', ['rev-parse', 'HEAD'], { capture: true });
  if (checkedOutSha !== inputs.expectedHeadSha) {
    throw new Error(`Checked out ${checkedOutSha}, expected ${inputs.expectedHeadSha}`);
  }

  run('git', ['-c', 'commit.gpgsign=false', 'am', '--3way', '--no-commit', patchFile]);

  const changedFiles = [
    run('git', ['diff', '--name-only'], { capture: true }),
    run('git', ['diff', '--name-only', '--cached'], { capture: true }),
  ]
    .join('\n')
    .split('\n')
    .filter(Boolean)
    .filter((file, index, files) => files.indexOf(file) === index);
  const protectedPaths = changedFiles.filter(isProtectedPath);
  if (protectedPaths.length > 0) {
    throw new Error(`Applied patch touches protected paths: ${protectedPaths.join(', ')}`);
  }

  if (changedFiles.length === 0) {
    throw new Error('Patch applied with no changes');
  }

  run('git', ['add', '-A']);
  run('git', ['commit', '-m', `Apply AI reviewer autofix for PR #${inputs.prNumber}`]);
  run('git', ['push']);
  return run('git', ['rev-parse', 'HEAD'], { capture: true });
};

const main = async () => {
  const inputs = getInputs();
  let pullRequest;

  try {
    pullRequest = await getPullRequest(inputs);
    await validatePullRequest(inputs, pullRequest);
    const patchFile = findPatchFile(inputs.artifactDir);
    const patchSha256 = sha256File(patchFile);

    if (inputs.patchSha256 && inputs.patchSha256 !== patchSha256) {
      throw new Error(`Patch checksum mismatch: expected ${inputs.patchSha256}, got ${patchSha256}`);
    }

    assertAllowedPatch(patchFile);
    const commitSha = applyPatch({ patchFile, inputs });
    await postComment({
      inputs,
      body: `AI reviewer autofix pushed ${commitSha}.\n\nSource reviewer run: ${inputs.serverUrl}/${inputs.owner}/${inputs.repo}/actions/runs/${inputs.reviewerRunId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);

    if (pullRequest) {
      await postComment({
        inputs,
        body: `AI reviewer autofix was not pushed: ${message}\n\nSource reviewer run: ${inputs.serverUrl}/${inputs.owner}/${inputs.repo}/actions/runs/${inputs.reviewerRunId}`,
      });
    }

    process.exitCode = 1;
  }
};

main();
