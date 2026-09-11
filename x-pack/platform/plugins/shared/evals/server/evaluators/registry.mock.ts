/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import semverCompare from 'semver/functions/compare';
import type { EvaluatorDefinition, EvaluatorRegistry } from './types';

const latestOf = (definitions: EvaluatorDefinition[]): EvaluatorDefinition | undefined =>
  [...definitions].sort((left, right) => semverCompare(right.version, left.version))[0];

/** Creates an in-memory evaluator registry for route tests. */
export const createEvaluatorRegistryMock = (
  definitions: EvaluatorDefinition[] = []
): EvaluatorRegistry => {
  const byName = new Map<string, EvaluatorDefinition[]>();
  for (const definition of definitions) {
    byName.set(definition.name, [...(byName.get(definition.name) ?? []), definition]);
  }

  const visibleDefinitions = (name: string): EvaluatorDefinition[] => {
    const namedDefinitions = byName.get(name) ?? [];
    const builtIns = namedDefinitions.filter((definition) => definition.origin === 'built_in');
    return builtIns.length > 0 ? builtIns : namedDefinitions;
  };

  return {
    isBuiltIn: (name) => visibleDefinitions(name).some(({ origin }) => origin === 'built_in'),
    asScoped: () => ({
      list: async () =>
        [...byName.keys()]
          .map((name) => latestOf(visibleDefinitions(name)))
          .filter((definition): definition is EvaluatorDefinition => definition !== undefined),
      get: async (name, version) =>
        version
          ? visibleDefinitions(name).find((definition) => definition.version === version)
          : latestOf(visibleDefinitions(name)),
    }),
  };
};
