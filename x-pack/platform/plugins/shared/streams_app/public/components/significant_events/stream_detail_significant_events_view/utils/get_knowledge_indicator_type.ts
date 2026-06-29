/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { QUERY_TYPE_STATS } from '@kbn/streams-schema';

export const MATCH_QUERY_TYPE = 'match_query';
export const STATS_QUERY_TYPE = 'stats_query';

export const getKnowledgeIndicatorType = (ki: KnowledgeIndicator): string => {
  if (ki.kind === 'feature') return ki.feature.type;
  return ki.query.type === QUERY_TYPE_STATS ? STATS_QUERY_TYPE : MATCH_QUERY_TYPE;
};
