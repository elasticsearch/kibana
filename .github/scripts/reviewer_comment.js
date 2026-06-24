'use strict';

const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'reviewer-comment';
const ARTIFACT_PATH = path.join(ARTIFACT_DIR, 'comment.json');
const SKIP_LABEL = 'reviewer:skip-ai';

const REVIEWERS = Object.freeze({
  codex: Object.freeze({
    id: 'codex',
    command: '@codex',
    label: 'reviewer:codex',
    requiresLabel: true,
    workflowId: 'reviewer-codex.lock.yml',
  }),
  claude: Object.freeze({
    id: 'claude',
    command: '@claude',
    label: 'reviewer:claude',
    requiresLabel: false,
    workflowId: 'reviewer-claude.lock.yml',
  }),
  scout: Object.freeze({
    id: 'scout',
    command: '@scout',
    label: 'reviewer:scout',
    requiresLabel: true,
    workflowId: 'reviewer-scout.lock.yml',
  }),
});

const allowedPermissions = new Set(['admin', 'write']);
const allowedRoles = new Set(['admin', 'maintain', 'write']);

const getLabelNames = (labels = []) => labels.map((label) => label.name);

const findMentionedReviewers = (body = '') => {
  const reviewers = Object.values(REVIEWERS);
  return reviewers.filter((reviewer) => body.includes(reviewer.command));
};

const hasRequiredLabel = ({ reviewer, labelNames }) =>
  !reviewer.requiresLabel || labelNames.includes(reviewer.label);

// Claude is available on every non-skipped PR, so an explicit @claude mention
// should not be blocked by another actionable reviewer label on the PR.
const selectActionableReviewer = ({ body, labelNames }) => {
  const mentioned = findMentionedReviewers(body);
  if (mentioned.includes(REVIEWERS.claude)) {
    return REVIEWERS.claude;
  }

  return mentioned.find((reviewer) => hasRequiredLabel({ reviewer, labelNames }));
};

const isAllowedPermission = (permission) =>
  allowedPermissions.has(permission.permission) || allowedRoles.has(permission.role_name);

const getCollaboratorPermission = async ({ github, owner, repo, username }) => {
  try {
    const response = await github.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    return response.data;
  } catch (error) {
    if (error.status === 404) {
      return undefined;
    }

    throw error;
  }
};

const getPullRequest = async ({ github, owner, repo, pullNumber }) => {
  const response = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  return response.data;
};

const fetchLiveComment = async ({ github, owner, repo, commentType, commentId }) => {
  if (commentType === 'issue_comment') {
    const response = await github.rest.issues.getComment({
      owner,
      repo,
      comment_id: commentId,
    });
    return response.data;
  }

  if (commentType === 'pull_request_review_comment') {
    const response = await github.rest.pulls.getReviewComment({
      owner,
      repo,
      comment_id: commentId,
    });
    return response.data;
  }

  throw new Error(`Unsupported comment type: ${commentType}`);
};

const commentBelongsToPr = ({ comment, commentType, pullNumber }) => {
  if (commentType === 'issue_comment') {
    return comment.issue_url?.endsWith(`/issues/${pullNumber}`);
  }

  return comment.pull_request_url?.endsWith(`/pulls/${pullNumber}`);
};

const validateReviewerAccess = async ({ github, core, owner, repo, actor }) => {
  const permission = await getCollaboratorPermission({ github, owner, repo, username: actor });
  if (!permission) {
    core.info(`${actor} is not a repository collaborator.`);
    return false;
  }

  if (!isAllowedPermission(permission)) {
    core.info(`${actor} does not have reviewer comment permission.`);
    return false;
  }

  return true;
};

const validatePullRequest = ({ core, pullRequest, reviewer }) => {
  if (pullRequest.state !== 'open') {
    core.info(`PR #${pullRequest.number} is not open.`);
    return false;
  }

  const labelNames = getLabelNames(pullRequest.labels);
  if (labelNames.includes(SKIP_LABEL)) {
    core.info(`PR #${pullRequest.number} has ${SKIP_LABEL}.`);
    return false;
  }

  if (!hasRequiredLabel({ reviewer, labelNames })) {
    core.info(`PR #${pullRequest.number} does not have ${reviewer.label}.`);
    return false;
  }

  return true;
};

const routeReviewerComment = async ({ context, core }) => {
  const issueOrPr = context.payload.issue ?? context.payload.pull_request;
  const pullNumber = issueOrPr.number;
  const commentId = context.payload.comment.id;
  const labelNames = getLabelNames(issueOrPr.labels);
  const body = context.payload.comment.body ?? '';

  const reviewer = selectActionableReviewer({ body, labelNames });
  if (!reviewer) {
    core.info(`Comment ${commentId} on PR #${pullNumber} did not mention an actionable reviewer.`);
    return;
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    ARTIFACT_PATH,
    `${JSON.stringify(
      {
        version: 1,
        pr_number: String(pullNumber),
        comment_id: String(commentId),
        comment_type: context.eventName,
        reviewer_id: reviewer.id,
      },
      null,
      2
    )}\n`
  );
  core.setOutput('matched', 'true');
};

const readCommentArtifact = () => {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
};

const dispatchReviewerComment = async ({ github, context, core }) => {
  const artifact = readCommentArtifact();
  if (!artifact) {
    core.info('No reviewer comment artifact found.');
    return;
  }

  const reviewer = REVIEWERS[artifact.reviewer_id];
  if (!reviewer) {
    core.setFailed(`Reviewer comment artifact contained unknown reviewer id: ${artifact.reviewer_id}.`);
    return;
  }

  const { owner, repo } = context.repo;
  const pullNumber = Number.parseInt(artifact.pr_number, 10);
  const commentId = Number.parseInt(artifact.comment_id, 10);
  if (!Number.isInteger(pullNumber) || !Number.isInteger(commentId)) {
    core.setFailed('Reviewer comment artifact did not contain valid PR/comment ids.');
    return;
  }

  const pullRequest = await getPullRequest({ github, owner, repo, pullNumber });
  const liveComment = await fetchLiveComment({
    github,
    owner,
    repo,
    commentType: artifact.comment_type,
    commentId,
  });

  if (!commentBelongsToPr({ comment: liveComment, commentType: artifact.comment_type, pullNumber })) {
    core.setFailed(`Comment ${commentId} does not belong to PR #${pullNumber}.`);
    return;
  }

  if (!liveComment.body?.includes(reviewer.command)) {
    core.info(`Comment ${commentId} no longer mentions ${reviewer.command}.`);
    return;
  }

  if (!validatePullRequest({ core, pullRequest, reviewer })) {
    return;
  }

  if (!(await validateReviewerAccess({ github, core, owner, repo, actor: liveComment.user?.login }))) {
    return;
  }

  await github.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: reviewer.workflowId,
    ref: context.payload.repository.default_branch,
    inputs: {
      pr_number: String(pullNumber),
      comment_id: String(commentId),
    },
  });

  core.info(`Dispatched ${reviewer.workflowId} for PR #${pullNumber} from comment ${commentId}.`);
};

module.exports = {
  REVIEWERS,
  dispatchReviewerComment,
  findMentionedReviewers,
  routeReviewerComment,
  selectActionableReviewer,
};
