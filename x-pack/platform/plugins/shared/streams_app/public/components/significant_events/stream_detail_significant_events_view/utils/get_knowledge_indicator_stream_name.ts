/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';

export const getKnowledgeIndicatorStreamName = (knowledgeIndicator: KnowledgeIndicator): string =>
  knowledgeIndicator.kind === 'feature'
    ? knowledgeIndicator.feature.stream_name
    : knowledgeIndicator.stream_name;
