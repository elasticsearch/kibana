/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleQuery } from '../types';

const joinComposedQuerySegment = (base: string, segment: string): string => {
  const trimmedBase = base.trim();
  const trimmedSegment = segment.trim();

  if (!trimmedSegment) {
    return trimmedBase;
  }

  if (!trimmedBase) {
    return trimmedSegment.startsWith('|') ? trimmedSegment : `| ${trimmedSegment}`;
  }

  const normalizedSegment = trimmedSegment.startsWith('|') ? trimmedSegment : `| ${trimmedSegment}`;

  return `${trimmedBase}\n${normalizedSegment}`;
};

export const getBreachQuery = (query: RuleQuery | undefined): string => {
  if (!query) return '';
  if (query.format === 'standalone') return query.breach.query;
  return joinComposedQuerySegment(query.base, query.breach.segment);
};

export const getRecoverQuery = (query: RuleQuery | undefined): string => {
  if (!query) return '';
  if (query.format === 'standalone') return query.recovery?.query ?? '';
  if (!query.recovery?.segment.trim()) return '';
  return joinComposedQuerySegment(query.base, query.recovery.segment);
};
