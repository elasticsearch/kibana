/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Query, AggregateQuery } from '../filters';

type Language = keyof AggregateQuery;

// Checks if the query is of type Query
export function isOfQueryType(arg?: Query | AggregateQuery): arg is Query {
  return Boolean(arg && 'query' in arg);
}

// Checks if the query is of type AggregateQuery
export function isOfAggregateQueryType(
  query?: AggregateQuery | Query | { [key: string]: any }
): query is AggregateQuery {
  return Boolean(query && 'esql' in query);
}

// Checks if an ES|QL query is missing or only whitespace
export function isEmptyEsqlQuery(
  query?: AggregateQuery | Query | { [key: string]: any }
): query is AggregateQuery {
  return isOfAggregateQueryType(query) && query.esql.trim() === '';
}

// returns the language of the aggregate Query, sql, esql etc
export function getAggregateQueryMode(query: AggregateQuery): Language {
  return Object.keys(query)[0] as Language;
}

export function getLanguageDisplayName(language?: string): string {
  const displayName = language && language === 'esql' ? 'es|ql' : language ?? 'es|ql';
  return displayName.toUpperCase();
}
