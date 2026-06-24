/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Re-exports from the canonical form types. `ComposeFormValues` is an alias
 * for `FormValues` kept for backward compatibility with existing compose
 * discover imports.
 */
export type {
  FormValues as ComposeFormValues,
  ComposedQuery,
  StandaloneQuery,
  RuleQuery,
  RuleKind,
  RuleArtifact as ComposeRuleArtifact,
} from '../../form/types';
export { getBreachQuery, getRecoverQuery } from '../../form/utils/query_helpers';
