/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';
import { ES_FIELD_TYPES, KBN_FIELD_TYPES } from '@kbn/field-types';
import type { Entry } from '@kbn/securitysolution-io-ts-list-types';
import { ListOperatorTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import type {
  EmptyEntry,
  EmptyListEntry,
  ExceptionsBuilderReturnExceptionItem,
} from '@kbn/securitysolution-list-utils';
import { getOperatorType } from '@kbn/securitysolution-list-utils';
import type { RuntimeFieldType } from '../../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';
import { RuntimeFieldTypeEnum } from '../../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';

/**
 * Determines if item entries has 'is in list'/'is not in list' entry
 */
export const entryHasListType = (exceptionItems: ExceptionsBuilderReturnExceptionItem[]) => {
  for (const { entries } of exceptionItems) {
    for (const exceptionEntry of entries ?? []) {
      if (getOperatorType(exceptionEntry) === ListOperatorTypeEnum.LIST) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Determines whether any entries within the given exceptionItems reference a
 * field that is not present on the supplied index patterns. The index patterns
 * are sourced from the same data view backing the exception field picker
 * (`useFetchIndexPatterns`), which surfaces both mapped fields and runtime
 * fields defined on the rule's source indices.
 */
export const entryHasNonEcsType = (
  exceptionItems: ExceptionsBuilderReturnExceptionItem[],
  indexPatterns: DataViewBase
): boolean => {
  const doesFieldNameExist = (exceptionEntry: Entry | EmptyListEntry | EmptyEntry): boolean => {
    return indexPatterns.fields.some(({ name }) => name === exceptionEntry.field);
  };

  if (exceptionItems.length === 0) {
    return false;
  }
  for (const { entries } of exceptionItems) {
    for (const exceptionEntry of entries ?? []) {
      if (exceptionEntry.type === 'nested') {
        for (const nestedExceptionEntry of exceptionEntry.entries) {
          if (doesFieldNameExist(nestedExceptionEntry) === false) {
            return true;
          }
        }
      } else if (doesFieldNameExist(exceptionEntry) === false) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Determines whether the bulk close alerts option should be disabled.
 *
 * Disabled only for cases that bulk-close fundamentally can't handle:
 *   - Value list entries (`is in list` / `is not in list`).
 *   - All items have no entries (nothing to match).
 *
 * Entries referencing fields not present on the alerts index — e.g. runtime
 * fields defined on a rule's source index — are intentionally NOT a disabling
 * condition. Bulk-close handles them server-side via runtime-field synthesis,
 * and `ExceptionItemsFlyoutAlertsActions` surfaces a warning callout to set
 * user expectations about coverage.
 */
export const shouldDisableBulkClose = ({
  items,
}: {
  items: ExceptionsBuilderReturnExceptionItem[];
}): boolean => {
  return entryHasListType(items) || items.every((item) => item.entries.length === 0);
};

/**
 * Map a Kibana DataView field's declared ES type to the constrained set of
 * runtime field types the bulk-close endpoint accepts. Falls back to
 * `keyword` for unknown / conflicting types so the close still matches as
 * a string.
 */
export const mapDataViewFieldToRuntimeType = (field: DataViewFieldBase): RuntimeFieldType => {
  // `esTypes` can carry multiple entries when the data view spans indices
  // that map the same field to different ES types (e.g. `keyword` in one
  // index, `ip` in another). We treat that as ambiguous — picking
  // `esTypes[0]` blindly would silently bias toward whatever ES happens
  // to merge first. Only use `esTypes` when it's unambiguous (exactly one
  // entry); otherwise fall through to the broader Kibana `type` below and
  // eventually default to `keyword`.
  const esType = field.esTypes?.length === 1 ? field.esTypes[0] : undefined;
  switch (esType) {
    case ES_FIELD_TYPES.IP:
      return RuntimeFieldTypeEnum.ip;
    case ES_FIELD_TYPES.KEYWORD:
    case ES_FIELD_TYPES.TEXT:
    case ES_FIELD_TYPES.MATCH_ONLY_TEXT:
    case ES_FIELD_TYPES.VERSION:
      return RuntimeFieldTypeEnum.keyword;
    case ES_FIELD_TYPES.DATE:
    case ES_FIELD_TYPES.DATE_NANOS:
      return RuntimeFieldTypeEnum.date;
    case ES_FIELD_TYPES.BOOLEAN:
      return RuntimeFieldTypeEnum.boolean;
    case ES_FIELD_TYPES.GEO_POINT:
      return RuntimeFieldTypeEnum.geo_point;
    case ES_FIELD_TYPES.LONG:
    case ES_FIELD_TYPES.INTEGER:
    case ES_FIELD_TYPES.SHORT:
    case ES_FIELD_TYPES.BYTE:
      return RuntimeFieldTypeEnum.long;
    case ES_FIELD_TYPES.DOUBLE:
    case ES_FIELD_TYPES.FLOAT:
    case ES_FIELD_TYPES.HALF_FLOAT:
    case ES_FIELD_TYPES.SCALED_FLOAT:
      return RuntimeFieldTypeEnum.double;
    // `unsigned_long` covers [0, 2^64-1]. The `long` runtime field is
    // signed 64-bit ([-2^63, 2^63-1]) and `double` loses integer precision
    // above 2^53, so neither preserves the full range. Use `keyword` —
    // exact-match equality on the literal `_source` string works for any
    // value, which is the only operator the exception flyout produces.
    case ES_FIELD_TYPES.UNSIGNED_LONG:
      return RuntimeFieldTypeEnum.keyword;
  }

  // Kibana surfaces some fields with only the broad `type` field set
  // ('string', 'number', etc.) and no `esTypes`. Fall back on that, then
  // `keyword`.
  switch (field.type) {
    case KBN_FIELD_TYPES.IP:
      return RuntimeFieldTypeEnum.ip;
    case KBN_FIELD_TYPES.DATE:
      return RuntimeFieldTypeEnum.date;
    case KBN_FIELD_TYPES.BOOLEAN:
      return RuntimeFieldTypeEnum.boolean;
    case KBN_FIELD_TYPES.GEO_POINT:
      return RuntimeFieldTypeEnum.geo_point;
    case KBN_FIELD_TYPES.NUMBER:
      return RuntimeFieldTypeEnum.double;
    default:
      return RuntimeFieldTypeEnum.keyword;
  }
};

/**
 * Build the `runtimeFields` map the bulk-close endpoint expects.
 *
 * For each exception entry whose field is **not** present on the alerts
 * index (i.e. it's a runtime field defined on the rule's source indices),
 * look up the field's type on those source indices (the unified
 * `DataViewBase` the flyout builds from either `params.index` or
 * `params.data_view_id`) and add it to the output. Fields that can't be
 * resolved fall back to `keyword` and set the returned `hasUntypedFields`
 * flag — callers surface a "best-effort string matching" warning when
 * that's true (typical case: rule has been reconfigured since the alerts
 * were created and the field is no longer on the current source indices).
 *
 * ECS fields (those already present on the alerts index) are skipped —
 * they don't need synthesis on the server side.
 */
export const collectRuntimeFieldTypes = (
  exceptionItems: ExceptionsBuilderReturnExceptionItem[],
  sourceIndexPatterns: DataViewBase,
  alertsIndexPatterns: DataViewBase
): { runtimeFields: Record<string, RuntimeFieldType>; hasUntypedFields: boolean } => {
  const alertsFieldNames = new Set(alertsIndexPatterns.fields.map((field) => field.name));
  const sourceFieldByName = new Map(sourceIndexPatterns.fields.map((field) => [field.name, field]));

  const runtimeFields: Record<string, RuntimeFieldType> = {};
  let hasUntypedFields = false;

  const visit = (entry: Entry | EmptyListEntry | EmptyEntry) => {
    if (!entry.field || alertsFieldNames.has(entry.field)) return;
    if (entry.field in runtimeFields) return;
    const sourceField = sourceFieldByName.get(entry.field);
    if (sourceField) {
      runtimeFields[entry.field] = mapDataViewFieldToRuntimeType(sourceField);
    } else {
      // Rule drift: field no longer surfaced on the rule's source indices,
      // but the exception still references it (e.g. user edited an old
      // exception, or the rule was reconfigured since the alert was indexed).
      // Defaulting to `keyword` lets equality matches still work as a
      // best effort; the caller surfaces a warning in this case.
      runtimeFields[entry.field] = RuntimeFieldTypeEnum.keyword;
      hasUntypedFields = true;
    }
  };
  exceptionItems.forEach(({ entries }) => {
    entries.forEach((entry) => {
      const leaves = entry.type === 'nested' ? entry.entries : [entry];
      leaves.forEach(visit);
    });
  });

  return { runtimeFields, hasUntypedFields };
};
