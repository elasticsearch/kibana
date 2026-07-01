/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import semverCompare from 'semver/functions/compare';
import { groundednessEvaluator } from './groundedness';
import { correctnessEvaluator } from './correctness';
import {
  inputTokensEvaluatorDef,
  latencyEvaluatorDef,
  outputTokensEvaluatorDef,
  toolCallsEvaluatorDef,
} from './trace_metrics';
import type { EvaluatorDefinition, EvaluatorRegistry } from './types';

export const createEvaluatorRegistry = (): EvaluatorRegistry => {
  const evaluators = new Map<string, Map<string, EvaluatorDefinition>>();

  const register = (definition: EvaluatorDefinition) => {
    const versionsForName =
      evaluators.get(definition.name) ?? new Map<string, EvaluatorDefinition>();
    versionsForName.set(definition.version, definition);
    evaluators.set(definition.name, versionsForName);
  };

  register(groundednessEvaluator);
  register(correctnessEvaluator);
  register(latencyEvaluatorDef);
  register(inputTokensEvaluatorDef);
  register(outputTokensEvaluatorDef);
  register(toolCallsEvaluatorDef);

  return {
    list: () =>
      [...evaluators.values()]
        .map((versionsForName) => {
          const latestVersion = [...versionsForName.keys()].sort((a, b) => semverCompare(b, a))[0];
          return latestVersion ? versionsForName.get(latestVersion) : undefined;
        })
        .filter((definition): definition is EvaluatorDefinition => definition !== undefined),
    get: (name, version) => {
      const versionsForName = evaluators.get(name);
      if (!versionsForName) {
        return undefined;
      }

      if (version) {
        return versionsForName.get(version);
      }

      const latestVersion = [...versionsForName.keys()].sort((a, b) => semverCompare(b, a))[0];
      return latestVersion ? versionsForName.get(latestVersion) : undefined;
    },
  };
};
