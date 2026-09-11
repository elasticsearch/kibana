/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { resolveEvaluatorRole, EVALUATOR_ROLES, assertRolesDeclared } from './evaluator_roles';

describe('resolveEvaluatorRole', () => {
  it('returns the declared role for a registered evaluator', () => {
    expect(resolveEvaluatorRole('ShouldNotCallTool')).toBe('gate');
    expect(resolveEvaluatorRole('Factuality')).toBe('grader');
  });

  it('reports an unregistered evaluator as unknown rather than guessing', () => {
    // Defaulting an unknown evaluator to `grader` would fail it for saturation;
    // defaulting to `gate` would excuse a dead grader. Both are worse than
    // saying so.
    expect(resolveEvaluatorRole('SomeNewEvaluator')).toBe('unknown');
  });

  it('does not infer a role from the evaluator name', () => {
    // The name-matching stopgap classified anything starting with "Should" as a
    // gate. A registry must not inherit that behaviour: a name is not a
    // declaration.
    expect(resolveEvaluatorRole('ShouldSomethingNeverDeclared')).toBe('unknown');
  });

  it('matches parameterised evaluator instances to their declared base name', () => {
    // Golden records these per skill, e.g. "Skill Invoked (data-exploration)".
    // They are the same evaluator and must not each need registering.
    expect(resolveEvaluatorRole('Skill Invoked (data-exploration)')).toBe('gate');
    expect(resolveEvaluatorRole('Skill Invoked (attack-discovery-generator)')).toBe('gate');
  });

  it('is case- and spacing-insensitive for the same evaluator', () => {
    // Suites record both `SkillInvoked` and `Skill Invoked`.
    expect(resolveEvaluatorRole('SkillInvoked')).toBe('gate');
    expect(resolveEvaluatorRole('skill invoked')).toBe('gate');
  });

  it('declares a role for every evaluator seen in the golden extract', () => {
    // Guards against a suite adding an evaluator that silently audits as
    // unknown forever.
    const seen = [
      'Factuality',
      'Relevance',
      'Groundedness',
      'Criteria',
      'Rubric',
      'ShouldNotCallTool',
      'Skill Invoked',
      'ForbiddenTools',
    ];
    expect(seen.filter((name) => resolveEvaluatorRole(name) === 'unknown')).toEqual([]);
  });

  it('keeps known-constant evaluators as graders so the audit keeps flagging them', () => {
    // These two return a constant 1.000 across all 159 golden observations.
    // Re-labelling them as gates would silence the audit rather than fix them,
    // which is the cheapest possible way to make this tool useless.
    expect(resolveEvaluatorRole('RequiredAlertIdsInResponse')).toBe('grader');
    expect(resolveEvaluatorRole('DocVersionReleaseDate')).toBe('grader');
  });

  it('requires a rationale for every declaration', () => {
    // The rationale is the claim a reviewer agrees to; a role without one is
    // just the old regex with extra steps. The shortest legitimate rationale in
    // the registry is 21 characters, so this threshold bites on an emptied or
    // placeholder string without forcing prose.
    const missing = EVALUATOR_ROLES.filter((entry) => entry.rationale.trim().length < 21);
    expect(missing).toEqual([]);
  });

  it('never declares the same evaluator twice', () => {
    const names = EVALUATOR_ROLES.map((entry) => entry.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('fails loudly when asked to audit an undeclared evaluator', () => {
    expect(() => assertRolesDeclared(['Factuality', 'MysteryEvaluator'])).toThrow(
      /MysteryEvaluator/
    );
  });

  it('passes the assertion when every evaluator is declared', () => {
    expect(() => assertRolesDeclared(['Factuality', 'ShouldNotCallTool'])).not.toThrow();
  });
});
