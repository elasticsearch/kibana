/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';

export const getKnowledgeIndicatorSubtype = (ki: KnowledgeIndicator): string | undefined => {
  if (ki.kind === 'feature') return ki.feature.subtype ?? undefined;
  return undefined;
};
