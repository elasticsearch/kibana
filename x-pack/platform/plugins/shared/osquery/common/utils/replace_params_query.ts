/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { each, get } from 'lodash';

const CONTAINS_DYNAMIC_PARAMETER_REGEX = /\{{([^}]+)\}}/g; // when there are 2 opening and 2 closing curly brackets (including brackets)

/**
 * Reads `field` from either document shape this runs against: the nested ECS object the alert
 * flyout holds client-side, and the flattened `ParsedTechnicalFields` the server gets from the
 * alerts index. `get` already resolves a dotted path against a literal dotted key, so only the
 * array wrapper needs handling — the flattened form stores every field as an array, while a
 * template stands in for a single value. Without this the server would substitute
 * `name='Ubuntu'` as `name='["Ubuntu"]'` and authz would reject a query the client was
 * entitled to build.
 */
const getFieldValue = (data: object, field: string) => {
  const value = get(data, field);

  return Array.isArray(value) ? value[0] : value;
};

export const replaceParamsQuery = (query: string, data: object) => {
  if (!containsDynamicQuery(query)) {
    return { result: query, skipped: false };
  }

  const matchedBrackets = query.match(new RegExp(CONTAINS_DYNAMIC_PARAMETER_REGEX));
  let resultQuery = query;

  if (matchedBrackets) {
    each(matchedBrackets, (bracesText: string) => {
      const field = bracesText.replace(/{{|}}/g, '').trim();
      if (resultQuery.includes(bracesText)) {
        const foundFieldValue = getFieldValue(data, field);
        if (foundFieldValue) {
          resultQuery = resultQuery.replace(bracesText, foundFieldValue);
        }
      }
    });
  }

  const skipped = new RegExp(CONTAINS_DYNAMIC_PARAMETER_REGEX).test(resultQuery);

  return {
    result: resultQuery,
    skipped,
  };
};

export const containsDynamicQuery = (query: string) =>
  new RegExp(CONTAINS_DYNAMIC_PARAMETER_REGEX).test(query);
