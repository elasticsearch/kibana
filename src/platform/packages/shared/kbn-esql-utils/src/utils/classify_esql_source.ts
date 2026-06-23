/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getIndexPatternFromESQLQuery } from './get_index_pattern_from_query';

export type ESQLSourceKind = 'single' | 'multi' | 'pattern';

/**
 * Classifies an ES|QL FROM/TS source expression into one of three kinds:
 * - `'single'`:   a single index or data stream with no wildcards
 * - `'pattern'`: a single source expression containing a `*` wildcard
 * - `'multi'`:   a comma-separated list of two or more sources
 *
 * Remote-cluster prefixes (`cluster:index`) and source selectors (`::failures`)
 * are handled via AST parsing, so the classification is robust against quoting
 * and other syntax edge cases.
 */
export const classifyESQLSource = (source: string): ESQLSourceKind => {
  const parts = getIndexPatternFromESQLQuery(`FROM ${source}`).split(',').filter(Boolean);

  if (parts.length !== 1) {
    return 'multi';
  }

  return parts[0].includes('*') ? 'pattern' : 'single';
};

export const isSingleSource = (source: string | undefined): source is string =>
  !!source && classifyESQLSource(source) === 'single';
