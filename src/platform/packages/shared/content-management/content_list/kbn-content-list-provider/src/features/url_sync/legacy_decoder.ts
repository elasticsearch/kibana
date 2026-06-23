/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Query } from '@elastic/eui';
import type { ParsedQuery, UrlStateSlices } from './types';
import type { SortState } from './url_codec';

const LEGACY_KEYS = ['s', 'title', 'filter', 'sort', 'sortdir', 'created_by', 'favorites'] as const;

export interface LegacyDecodeResult {
  state: UrlStateSlices;
  consumed: ReadonlyArray<string>;
}

const firstString = (value: ParsedQuery[string]): string | undefined => {
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? value : undefined;
};

const stringArray = (value: ParsedQuery[string]): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? [value] : [];
};

const resolveLegacySortField = (
  field: string,
  validSortFields: ReadonlySet<string>
): string | undefined => {
  if (field === 'title') {
    if (validSortFields.has('title')) {
      return 'title';
    }
    if (validSortFields.has('attributes.title')) {
      return 'attributes.title';
    }
    return undefined;
  }

  if ((field === 'updatedAt' || field === 'accessedAt') && validSortFields.has(field)) {
    return field;
  }

  return undefined;
};

const buildQueryText = ({
  freeText,
  createdBy,
  favorites,
}: {
  freeText?: string;
  createdBy: string[];
  favorites: boolean;
}): string | undefined => {
  let query = Query.parse('');

  for (const user of createdBy) {
    query = query.addSimpleFieldValue('createdBy', user);
  }

  if (favorites) {
    query = query.addMustIsClause('starred');
  }

  const parts = [freeText?.trim(), query.text].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );
  if (parts.length === 0) {
    return freeText !== undefined ? '' : undefined;
  }
  return parts.join(' ');
};

/**
 * Decodes legacy URL parameters into a {@link UrlStateSlices} object.
 *
 * @param params - The parsed URL parameters.
 * @param validSortFields - The valid sort fields.
 * @param onUnknownValue - A callback to call when an unknown value is encountered.
 * @returns A {@link LegacyDecodeResult} object.
 */
export const decodeLegacyParams = (
  params: ParsedQuery,
  validSortFields: ReadonlySet<string>,
  onUnknownValue?: (key: string, value: unknown) => void
): LegacyDecodeResult | null => {
  const consumed = LEGACY_KEYS.filter((key) => params[key] !== undefined);
  if (consumed.length === 0) {
    return null;
  }

  const state: UrlStateSlices = {};
  // Free-text precedence: prefer the modern `TableListView` key (`s`), fall back
  // to its `title` alias, and finally accept the older `?filter=` bookmark seed
  // some plugins (e.g. `graph`) used to feed `initialFilter` from the URL.
  const freeText = firstString(params.s) ?? firstString(params.title) ?? firstString(params.filter);
  const createdBy = stringArray(params.created_by);
  const favorites = firstString(params.favorites) === 'true';
  const queryText = buildQueryText({ freeText, createdBy, favorites });

  if (queryText !== undefined) {
    state.queryText = queryText;
  }

  const legacySort = firstString(params.sort);
  if (legacySort) {
    const field = resolveLegacySortField(legacySort, validSortFields);
    const directionParam = firstString(params.sortdir);
    const defaultDirection = legacySort === 'title' ? 'asc' : 'desc';
    const direction: SortState['direction'] =
      directionParam === 'asc' || directionParam === 'desc' ? directionParam : defaultDirection;

    if (field) {
      state.sort = { field, direction };
    } else {
      onUnknownValue?.('sort', legacySort);
    }
  }

  return { state, consumed };
};
