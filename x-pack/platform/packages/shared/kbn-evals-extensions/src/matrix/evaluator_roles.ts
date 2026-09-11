/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * What each evaluator is *for*, declared rather than guessed.
 *
 * The health audit holds gates and graders to opposite standards: a gate
 * ("did it avoid the forbidden tool?") is supposed to sit at the ceiling, while
 * a grader pinned at the ceiling has stopped discriminating. Getting that
 * backwards either fails healthy gates or excuses dead graders.
 *
 * The first version inferred role from the evaluator's name. That is the wrong
 * mechanism for a correctness check: a name list can be widened until the audit
 * passes, which is precisely the failure the audit exists to catch. Worse, it
 * silently classified `RequiredAlertIdsInResponse` and `DocVersionReleaseDate`
 * as gates -- so the audit stopped asking whether those two had ever once
 * failed, when in fact both return a constant 1.000 across all 159 golden
 * observations.
 *
 * A declaration is auditable in review; a regex is not.
 */

export type DeclaredRole = 'gate' | 'grader';

export interface EvaluatorRoleDeclaration {
  /** Base evaluator name as recorded in golden, without any `(instance)` suffix. */
  name: string;
  role: DeclaredRole;
  /** Why it has this role -- the claim a reviewer is agreeing to. */
  rationale: string;
}

export const EVALUATOR_ROLES: readonly EvaluatorRoleDeclaration[] = [
  {
    name: 'ShouldNotCallTool',
    role: 'gate',
    rationale: 'Asserts a forbidden tool was never called; passing for everyone is the goal.',
  },
  {
    name: 'ForbiddenTools',
    role: 'gate',
    rationale: 'Same contract as ShouldNotCallTool, recorded under a second name.',
  },
  {
    name: 'SkillInvoked',
    role: 'gate',
    rationale:
      'Asserts the expected skill ran at all; quality is graded elsewhere. normalize() also covers the spaced spelling `Skill Invoked` and per-skill instances.',
  },
  {
    name: 'ExpectedSkillInvocation',
    role: 'gate',
    rationale: 'Asserts the expected skill ran.',
  },
  {
    name: 'ExpectedToolCalled',
    role: 'gate',
    rationale: 'Asserts a required tool was called.',
  },
  {
    name: 'FinalAnswerPresent',
    role: 'gate',
    rationale: 'Asserts the agent produced a final message; not a quality signal.',
  },
  {
    name: 'MinExpectedSteps',
    role: 'gate',
    rationale: 'Asserts the trajectory reached a minimum length.',
  },
  {
    name: 'WorkflowEvidence',
    role: 'gate',
    rationale: 'Asserts the workflow stages appear in the trajectory.',
  },
  {
    name: 'ToolUsageOnly',
    role: 'gate',
    rationale: 'Asserts the agent used tools rather than answering from memory.',
  },
  // Graders: these are supposed to spread models out. If one pins at the
  // ceiling it has stopped measuring, and the audit should say so.
  { name: 'Factuality', role: 'grader', rationale: 'Scores factual accuracy against references.' },
  { name: 'Relevance', role: 'grader', rationale: 'Scores answer relevance.' },
  { name: 'Groundedness', role: 'grader', rationale: 'Scores grounding in retrieved evidence.' },
  { name: 'Criteria', role: 'grader', rationale: 'Per-item rubric criteria, judged.' },
  { name: 'Rubric', role: 'grader', rationale: 'Rubric score, judged.' },
  {
    name: 'Trajectory',
    role: 'grader',
    rationale: 'Scores trajectory quality, not mere presence.',
  },
  { name: 'StrictTrajectory', role: 'grader', rationale: 'Stricter trajectory scoring.' },
  { name: 'Sequence Accuracy', role: 'grader', rationale: 'Scores tool-call ordering accuracy.' },
  {
    name: 'RequiredTermsInResponse',
    role: 'grader',
    rationale: 'Scores how many required terms appear; partial credit is meaningful.',
  },
  {
    name: 'AttackDiscoveryBasic',
    role: 'grader',
    rationale: 'Scores discovery quality against expectations.',
  },
  { name: 'AdToolResult', role: 'grader', rationale: 'Scores the attack-discovery tool result.' },
  { name: 'CostPerAlert', role: 'grader', rationale: 'Scores cost efficiency per alert.' },
  {
    name: 'RequiredAlertIdsInResponse',
    role: 'grader',
    rationale:
      'Scores whether the required alert ids came back. Deliberately NOT a gate: it returns a ' +
      'constant 1.000 across all 159 golden observations, and calling it a gate would stop the ' +
      'audit asking whether it can ever fail.',
  },
  {
    name: 'DocVersionReleaseDate',
    role: 'grader',
    rationale:
      'Scores version/date correctness. Also constant 1.000 across 159 observations; kept a ' +
      'grader so the audit keeps flagging it.',
  },
];

const BY_NAME = new Map<string, DeclaredRole>(
  EVALUATOR_ROLES.map((entry) => [normalize(entry.name), entry.role])
);

/**
 * Golden records parameterised instances such as `Skill Invoked (data-exploration)`.
 * They share the base evaluator's contract, so the suffix is dropped before lookup.
 */
function normalize(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * `unknown` is a real answer. Guessing a role for an unregistered evaluator
 * either fails a healthy gate or excuses a dead grader, so the audit reports
 * the gap instead of inventing a classification.
 */
export function resolveEvaluatorRole(evaluatorName: string): DeclaredRole | 'unknown' {
  return BY_NAME.get(normalize(evaluatorName)) ?? 'unknown';
}

/**
 * Fails when a suite has added an evaluator nobody has classified, so new
 * evaluators cannot drift into the audit unexamined.
 */
export function assertRolesDeclared(evaluatorNames: readonly string[]): void {
  const undeclared = [...new Set(evaluatorNames)].filter(
    (name) => resolveEvaluatorRole(name) === 'unknown'
  );
  if (undeclared.length > 0) {
    throw new Error(
      `Undeclared evaluator role(s): ${undeclared.join(
        ', '
      )}. Add each to EVALUATOR_ROLES with a ` +
        `rationale -- the audit holds gates and graders to opposite standards and must not guess.`
    );
  }
}
