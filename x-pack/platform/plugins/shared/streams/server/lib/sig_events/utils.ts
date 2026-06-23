/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryLink } from '@kbn/streams-schema';
import { orderBy } from 'lodash';

interface WithEvidenceNames {
  stream_names?: string[];
  rule_names?: string[];
  evidences?: Array<{ stream_name?: string | null; rule_name?: string | null }>;
}

export function enrichFromEvidences<T extends WithEvidenceNames>(doc: T): T {
  const evidences = doc.evidences ?? [];
  const streamNames = doc.stream_names?.length
    ? doc.stream_names
    : [...new Set(evidences.map((e) => e.stream_name).filter((s): s is string => !!s))];
  const ruleNames = doc.rule_names?.length
    ? doc.rule_names
    : [...new Set(evidences.map((e) => e.rule_name).filter((s): s is string => !!s))];

  if (streamNames === doc.stream_names && ruleNames === doc.rule_names) return doc;
  return { ...doc, stream_names: streamNames, rule_names: ruleNames };
}

/**
 * Sort query links for the Discovery "Queries" table.
 */
export function sortQueryLinksForTable(queryLinks: QueryLink[]): QueryLink[] {
  return orderBy(
    queryLinks,
    ['rule_backed', (link) => link.query.severity_score ?? 0, (link) => link.query.title],
    ['asc', 'desc', 'asc']
  );
}
