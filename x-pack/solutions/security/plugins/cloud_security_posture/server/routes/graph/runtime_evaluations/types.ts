/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** One `| EVAL` step from Pass 4 domain documentation. */
export interface EvaluationSnippet {
  readonly id: string;
  readonly section: string;
  readonly esql: string;
}

export interface IntegrationEvaluations {
  readonly integration: string;
  readonly evaluations: readonly EvaluationSnippet[];
}
