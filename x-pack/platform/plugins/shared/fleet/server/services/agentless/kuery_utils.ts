/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KueryNode } from '@kbn/es-query';
import { fromKueryExpression, toKqlExpression } from '@kbn/es-query';

/**
 * Rewrites bare field names in a KQL kuery string to be prefixed with the given
 * saved object type, e.g. `name:"foo"` → `fleet-package-policies.name:"foo"`.
 *
 * The core saved objects layer requires all filter fields to be namespaced by
 * SO type. This lets the public agentless API accept simple field names without
 * exposing the internal `fleet-package-policies` type to callers.
 */
export const prefixKueryFieldsWithSavedObjectType = (
  kuery: string,
  savedObjectType: string
): string => {
  const rewrite = (node: KueryNode): KueryNode => {
    const n = node as any;
    if (n.type === 'function' && (n.function === 'is' || n.function === 'range')) {
      const [fieldNode, ...rest] = n.arguments;
      if (
        fieldNode?.type === 'literal' &&
        !String(fieldNode.value).startsWith(`${savedObjectType}.`)
      ) {
        return {
          ...n,
          arguments: [{ ...fieldNode, value: `${savedObjectType}.${fieldNode.value}` }, ...rest],
        };
      }
    }
    if (n.arguments) {
      return { ...n, arguments: n.arguments.map(rewrite) };
    }
    return node;
  };
  return toKqlExpression(rewrite(fromKueryExpression(kuery)));
};
