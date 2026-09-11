/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Mustache from 'mustache';
import {
  JUDGE_EVIDENCE_TEMPLATE_VARIABLES,
  JUDGE_EVIDENCE_KEYS,
  type LlmJudgeConfig,
} from './types';

const EVIDENCE_TEMPLATE_VARIABLES = JUDGE_EVIDENCE_KEYS.map(
  (key) => JUDGE_EVIDENCE_TEMPLATE_VARIABLES[key]
);
const RESERVED_REFERENCE_DATA_KEYS = new Set([
  ...EVIDENCE_TEMPLATE_VARIABLES,
  '__proto__',
  'constructor',
  'prototype',
]);

export class InvalidJudgeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJudgeConfigError';
  }
}

interface TemplateVariables {
  all: string[];
  escaped: string[];
}

/**
 * Reads variables and records interpolations that Mustache would HTML-escape.
 *
 * Parses through a per-call writer, whose cache is discarded with it, because the
 * module-level `Mustache.parse` memoizes every template it sees into a process-global
 * cache with no eviction — and validation runs on drafts that are never stored. This
 * only covers validation; rendering a judge still goes through Mustache's default
 * writer inside the inference plugin.
 */
const getTemplateVariables = (template: string): TemplateVariables => {
  const all = new Set<string>();
  const escaped = new Set<string>();
  const writer = new Mustache.Writer();

  const collect = (tokens: unknown[]): void => {
    for (const token of tokens) {
      if (!Array.isArray(token)) {
        continue;
      }

      const [type, value, , , children] = token as [string, string, ...unknown[]];
      if (type === 'name' || type === '&' || type === '#' || type === '^') {
        all.add(value.split('.')[0]);
      }
      if (type === 'name') {
        escaped.add(value.split('.')[0]);
      }

      if (Array.isArray(children)) {
        collect(children);
      }
    }
  };

  collect(writer.parse(template));
  return { all: [...all], escaped: [...escaped] };
};

const findDuplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates];
};

/**
 * Checks the parts of a judge config that its request schema cannot: that the
 * declared scores can be reported, and that the prompt only reads variables the
 * definition will actually be given. Both are the difference between a
 * definition that fails at create time and one that fails mid-experiment.
 */
export const validateJudgeConfig = (judge: LlmJudgeConfig): void => {
  const { scores } = judge.output;

  if (judge.evidence.length === 0) {
    throw new InvalidJudgeConfigError(
      'An evaluator must require at least one trace evidence field: input, response, or steps.'
    );
  }

  const duplicateScores = findDuplicates(scores.map(({ name }) => name));
  if (duplicateScores.length > 0) {
    throw new InvalidJudgeConfigError(
      `Duplicate score name(s): ${duplicateScores.join(', ')}. Each score must be named once.`
    );
  }

  for (const score of scores) {
    if (score.type === 'categorical') {
      if (!score.labels || score.labels.length === 0) {
        throw new InvalidJudgeConfigError(
          `Score "${score.name}" is categorical and must declare at least one label.`
        );
      }

      const duplicateLabels = findDuplicates(score.labels.map(({ value }) => value));
      if (duplicateLabels.length > 0) {
        throw new InvalidJudgeConfigError(
          `Score "${score.name}" declares duplicate label(s): ${duplicateLabels.join(', ')}.`
        );
      }
      continue;
    }

    if (score.labels && score.labels.length > 0) {
      throw new InvalidJudgeConfigError(
        `Score "${score.name}" is numeric and cannot declare labels.`
      );
    }
  }

  const duplicateEvidence = findDuplicates(judge.evidence);
  if (duplicateEvidence.length > 0) {
    throw new InvalidJudgeConfigError(
      `Duplicate evidence requirement(s): ${duplicateEvidence.join(', ')}.`
    );
  }

  const referenceDataKeys = judge.reference_data_keys ?? [];
  const duplicateKeys = findDuplicates(referenceDataKeys);
  if (duplicateKeys.length > 0) {
    throw new InvalidJudgeConfigError(
      `Duplicate reference data key(s): ${duplicateKeys.join(', ')}.`
    );
  }

  const reservedKeys = referenceDataKeys.filter((key) => RESERVED_REFERENCE_DATA_KEYS.has(key));
  if (reservedKeys.length > 0) {
    throw new InvalidJudgeConfigError(
      `Reference data key(s) ${reservedKeys.join(', ')} are reserved and cannot be used.`
    );
  }

  const available = new Set([
    ...judge.evidence.map((key) => JUDGE_EVIDENCE_TEMPLATE_VARIABLES[key]),
    ...referenceDataKeys,
  ]);

  for (const [label, template] of [
    ['prompt', judge.prompt],
    ['system_prompt', judge.system_prompt],
  ] as Array<[string, string]>) {
    let variables: TemplateVariables;
    try {
      variables = getTemplateVariables(template);
    } catch (error) {
      throw new InvalidJudgeConfigError(
        `The ${label} is not a valid template: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const unknown = variables.all.filter((variable) => !available.has(variable));
    if (unknown.length > 0) {
      const unknownNames = unknown.map((variable) => `"${variable}"`).join(', ');
      throw new InvalidJudgeConfigError(
        `The ${label} references ${unknownNames}, which the evaluator is not given. Declare it as evidence (${EVIDENCE_TEMPLATE_VARIABLES.join(
          ', '
        )}) or as a reference data key.`
      );
    }

    if (variables.escaped.length > 0) {
      const escapedNames = variables.escaped.map((variable) => `"${variable}"`).join(', ');
      throw new InvalidJudgeConfigError(
        `The ${label} uses HTML-escaped Mustache interpolation for ${escapedNames}. Use triple braces (for example, {{{agent_response}}}) or {{& variable}} so evidence is passed to the judge unchanged.`
      );
    }
  }
};
