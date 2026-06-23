/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import { i18n } from '@kbn/i18n';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { getDataViewFieldOrCreateFromColumnMeta } from '@kbn/data-view-utils';
import type {
  DataTableRecord,
  ShouldShowFieldInTableHandler,
  FormattedHit,
  EsHitRecord,
  DataTableColumnsMeta,
} from '../types';
import { formatFieldValueReact } from './format_value';

// We use a special type here allowing formattedValue to be undefined because
// we want to avoid formatting values which will not be shown to users since
// it can be costly, and instead only format the ones which will be rendered
type PartialHitReactPair = [
  fieldDisplayName: string,
  formattedValue: ReactNode | undefined,
  fieldName: string | null
];

interface FormatHitReactOptions {
  skipNullishValues?: boolean;
}

const formattedHitCache = new WeakMap<
  EsHitRecord,
  { formattedHit: FormattedHit; maxEntries: number; skipNullishValues: boolean }
>();

/**
 * Returns a formatted document in form of key/value pairs where the value is a ReactNode
 * @param hit
 * @param dataView
 * @param shouldShowFieldHandler
 * @param maxEntries
 * @param fieldFormats
 * @param columnsMeta
 * @param options
 */
export function formatHitReact(
  hit: DataTableRecord,
  dataView: DataView,
  shouldShowFieldHandler: ShouldShowFieldInTableHandler,
  maxEntries: number,
  fieldFormats: FieldFormatsStart,
  columnsMeta: DataTableColumnsMeta | undefined,
  options?: FormatHitReactOptions
): FormattedHit {
  const skipNullishValues = Boolean(options?.skipNullishValues);
  const cached = formattedHitCache.get(hit.raw);

  if (
    cached &&
    cached.maxEntries === maxEntries &&
    cached.skipNullishValues === skipNullishValues
  ) {
    return cached.formattedHit;
  }

  const highlights = hit.raw.highlight ?? hit.raw.inline_highlights ?? {};
  const flattened = hit.flattened;
  const renderedPairs: PartialHitReactPair[] = [];
  const otherPairs: PartialHitReactPair[] = [];

  // Add each flattened field into the corresponding array for rendered or other pairs,
  // depending on whether the original hit had a highlight for it. That way we can ensure
  // highlighted fields are shown first in the document summary.
  for (const key of Object.keys(flattened)) {
    if (skipNullishValues && (flattened[key] ?? null) === null) {
      continue;
    }

    // Retrieve the (display) name of the fields, if it's a mapped field on the data view
    const field = getDataViewFieldOrCreateFromColumnMeta({
      dataView,
      fieldName: key,
      columnMeta: columnsMeta?.[key],
    });
    const displayKey = field?.displayName;
    const pairs = highlights[key] ? renderedPairs : otherPairs;

    // If the field is a mapped field, we first check if it should be shown,
    // or if it's highlighted, but the parent is not.
    // If not we always include it into the result.
    if (displayKey) {
      const multiParent = field.getSubtypeMulti?.()?.multi.parent;
      const isHighlighted = Boolean(highlights[key]);
      const isParentHighlighted = Boolean(multiParent && highlights[multiParent]);

      if ((isHighlighted && !isParentHighlighted) || shouldShowFieldHandler(key)) {
        pairs.push([displayKey, undefined, key]);
      }
    } else {
      pairs.push([key, undefined, key]);
    }
  }

  const totalLength = renderedPairs.length + otherPairs.length;

  // Truncate the renderedPairs if it exceeds the maxEntries,
  // otherwise fill it up with otherPairs until it reaches maxEntries
  if (renderedPairs.length > maxEntries) {
    renderedPairs.length = maxEntries;
  } else if (renderedPairs.length < maxEntries && otherPairs.length) {
    for (let i = 0; i < otherPairs.length && renderedPairs.length < maxEntries; i++) {
      renderedPairs.push(otherPairs[i]);
    }
  }

  // Now format only the values which will be shown to the user
  for (const pair of renderedPairs) {
    const key = pair[2]!;

    // Format the raw value using the regular field formatters for that field
    const field = getDataViewFieldOrCreateFromColumnMeta({
      dataView,
      fieldName: key,
      columnMeta: columnsMeta?.[key],
    });
    pair[1] = formatFieldValueReact({
      value: flattened[key],
      hit: hit.raw,
      fieldFormats,
      dataView,
      field,
    });
  }

  // If document has more formatted fields than configured via MAX_DOC_FIELDS_DISPLAYED we cut
  // off additional fields and instead show a summary how many more field exists.
  if (totalLength > maxEntries) {
    renderedPairs.push([
      i18n.translate('discover.formatHit.moreFields', {
        defaultMessage: 'and {count} more {count, plural, one {field} other {fields}}',
        values: { count: totalLength - maxEntries },
      }),
      '',
      null,
    ]);
  }

  const formattedHit = renderedPairs as FormattedHit;

  formattedHitCache.set(hit.raw, { formattedHit, maxEntries, skipNullishValues });

  return formattedHit;
}
