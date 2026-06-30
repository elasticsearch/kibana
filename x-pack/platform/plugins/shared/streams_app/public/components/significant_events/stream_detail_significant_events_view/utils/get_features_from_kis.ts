/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';
import type { Feature } from '@kbn/significant-events-schema';

export const getFeaturesFromKIs = (knowledgeIndicators: KnowledgeIndicator[]): Feature[] =>
  knowledgeIndicators
    .filter((ki): ki is Extract<KnowledgeIndicator, { kind: 'feature' }> => ki.kind === 'feature')
    .map((ki) => ki.feature);
