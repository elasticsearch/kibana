/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature, QueryLink } from '@kbn/significant-events-schema';
import type { KnowledgeIndicatorFeature, KnowledgeIndicatorQuery } from './types';

export const featureToKnowledgeIndicatorFeature = (feature: Feature): KnowledgeIndicatorFeature => {
  return {
    kind: 'feature',
    feature,
  };
};

export const queryLinkToKnowledgeIndicatorQuery = (
  queryLink: QueryLink
): KnowledgeIndicatorQuery => {
  const { query, rule_backed, rule_id, stream_name } = queryLink;

  return {
    kind: 'query',
    query,
    rule: {
      backed: rule_backed,
      id: rule_id,
    },
    stream_name,
  };
};
