/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Walker, Parser, isColumn } from '@elastic/esql';
import type {
  ESQLAstChangePointCommand,
  ESQLCommandOption,
  ESQLAstItem,
} from '@elastic/esql/types';
import {
  appendEntityFiltersToChangePointLineEsql,
  buildChangePointLineDataQuery,
  getChangePointOutputColumnNames,
  getChangePointSeriesColumns,
} from '@kbn/esql-utils';
import { CommandNames } from '@kbn/esql-language';
import type { Datatable } from '@kbn/expressions-plugin/common';
import { i18n } from '@kbn/i18n';
import { CHANGE_POINT_TYPE_COLUMN, CHANGE_POINT_PVALUE_COLUMN } from '../constants';
import { formatPvalueLabel } from './get_pvalue_impact';

const isByOption = (a: ESQLAstItem): a is ESQLCommandOption =>
  (a as { type?: string; name?: string }).type === 'option' &&
  (a as { type?: string; name?: string }).name === 'by';

const getChangePointByColumns = (esql?: string): string[] | undefined => {
  if (!esql) return undefined;
  try {
    const { root } = Parser.parse(esql);
    const changePointCommands = Walker.findAll(
      root,
      (node) => node.type === 'command' && node.name === CommandNames.CHANGE_POINT
    );
    const cp = changePointCommands[0] as ESQLAstChangePointCommand | undefined;
    if (!cp) return undefined;
    const byOption = cp.args.find(isByOption);
    if (!byOption) return undefined;
    const cols = byOption.args.filter(isColumn).map((c) => c.parts.join('.'));
    return cols.length ? cols : undefined;
  } catch {
    return undefined;
  }
};

export interface ChangePointCardModel {
  readonly id: string;
  readonly title: string;
  readonly lineEsql: string;
  /** The BY grouping column names when the query uses `CHANGE_POINT ... BY col[, col]`. */
  readonly byColumns?: readonly string[];
  readonly annotationEvents: Array<{ name: string; datetime: string }>;
  /**
   * The lowest (most significant) pvalue across all annotation events for this card.
   * Undefined when type/pvalue are absent from the result schema (e.g. BY mode with WHERE type IS NOT NULL).
   */
  readonly minPvalue?: number;
  /** Distinct change-point type strings present in this card's annotations (empty in BY mode). */
  readonly changePointTypes: readonly string[];
  /**
   * Column IDs used to identify change-point annotation rows in this result set.
   * Used by {@link getCardForRow} to determine whether a no-BY row is an actual
   * change point before returning the card.
   */
  readonly typeColumnId: string;
  readonly pvalueColumnId: string;
  /**
   * Serialized value of each entity-dimension column for this card (keyed by column ID).
   * Populated from entityColumnIds — covers both explicit BY columns and heuristic columns.
   * Empty object for no-split (single-series) cards.
   */
  readonly entityValues: Readonly<Record<string, string>>;
  /**
   * Human-readable "col: val" description of every entity dimension, e.g.
   * `"host: web-server-1, service: orders"`. Always uses `col: val` format (unlike `title`,
   * which omits the column name for single-column cards). `undefined` for no-split cards.
   * Suitable for use as a Lens panel description or case-attachment metadata.
   */
  readonly entityDescription: string | undefined;
}

const serializeCell = (value: unknown): string => {
  if (value === undefined) return '';
  // Matches the behavior of the result table in Discover
  if (value === null) return '(null)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const pickTimestampCell = (
  row: Record<string, unknown>,
  timeColumn: string,
  table: Datatable,
  reservedColumnIds: ReadonlySet<string>
): unknown => {
  const primary = row[timeColumn];
  if (primary !== undefined && primary !== null) {
    return primary;
  }
  for (const col of table.columns) {
    if (col.meta?.type !== 'date') continue;
    if (reservedColumnIds.has(col.id)) continue;
    const v = row[col.id];
    if (v !== undefined && v !== null) {
      return v;
    }
  }
  return undefined;
};

export const formatAnnotationTimestamp = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    const asNum = Number(value);
    if (!Number.isNaN(asNum) && value.length <= 13) {
      return new Date(asNum).toISOString();
    }
    const d = Date.parse(value);
    if (!Number.isNaN(d)) return new Date(d).toISOString();
  }
  return undefined;
};

/** Change-point rows: non-empty type and a defined pvalue column. */
const isChangePointTableRow = (
  row: Record<string, unknown>,
  typeColumnId: string,
  pvalueColumnId: string
): boolean => {
  const t = row[typeColumnId];
  if (t === null || t === undefined || String(t).length === 0) {
    return false;
  }
  const p = row[pvalueColumnId];
  return p !== null && p !== undefined;
};

/**
 * Builds a human-readable card title from entity columns and their values in the first row.
 *
 * Resolution order:
 *  1. Explicit `byColumns` from `CHANGE_POINT ... BY col[, col]`
 *  2. Heuristic `entityColumnIds` (non-reserved columns present in the result table)
 *  3. Returns empty string — caller will use a numbered fallback
 *
 * Single column:  show the value only — `"www.elastic.co"`
 * Multiple columns: show `"col: val"` pairs — `"host: www.elastic.co, response.keyword: 200"`
 */
const buildCardTitle = (
  byColumns: string[] | undefined,
  entityColumnIds: readonly string[],
  firstRow: Record<string, unknown>
): string => {
  const cols = byColumns ?? (entityColumnIds.length > 0 ? [...entityColumnIds] : undefined);
  if (!cols?.length) return '';
  if (cols.length === 1) return serializeCell(firstRow[cols[0]]) || cols[0];
  return cols.map((col) => `${col}: ${serializeCell(firstRow[col])}`).join(', ');
};

type ChangePointRow = Record<string, unknown>;

interface ChangePointCardsBuildContext {
  readonly table: Datatable;
  readonly esql: string;
  readonly typeColumnId: string;
  readonly pvalueColumnId: string;
  readonly timeColumn: string;
  /**
   * Columns used to identify distinct entities. Comes from the explicit `BY` clause when present;
   * otherwise derived heuristically as the result columns that are not reserved (value, time,
   * type, pvalue).
   */
  readonly entityColumnIds: readonly string[];
  readonly timestampReservedIds: ReadonlySet<string>;
  /** Explicit BY grouping columns parsed from `CHANGE_POINT ... BY col[, col]`. */
  readonly byColumns: string[] | undefined;
  /**
   * True when the query uses `CHANGE_POINT ... BY` and the result table does not contain
   * type/pvalue columns. In this mode every row in a group is a change point annotation.
   */
  readonly isByMode: boolean;
  readonly groups: ReadonlyMap<string, { entityLabel: string; rows: ChangePointRow[] }>;
}

const getChangePointCardsBuildContext = (params: {
  table: Datatable | undefined;
  esql: string;
}): ChangePointCardsBuildContext | undefined => {
  const { table, esql } = params;
  if (!table?.columns?.length || !esql) return undefined;

  const series = getChangePointSeriesColumns(esql);
  if (!series) return undefined;

  const outputNames = getChangePointOutputColumnNames(esql);
  const typeColumnId = outputNames?.typeColumn ?? CHANGE_POINT_TYPE_COLUMN;
  const pvalueColumnId = outputNames?.pvalueColumn ?? CHANGE_POINT_PVALUE_COLUMN;

  const { valueColumn, timeColumn } = series;
  const columnIds = table.columns.map((c) => c.id);

  // The Lens mini-chart uses a dateHistogram xAxis keyed on timeColumn. If the column is present
  // in the result table but is not a date type (e.g. a keyword used as the ON column), the chart
  // cannot render and change-point annotations have no meaningful x position.
  // Return undefined early so the grid shows the "No change point series" empty state instead of
  // a broken chart.
  const timeColumnMeta = table.columns.find((c) => c.id === timeColumn);
  if (timeColumnMeta && timeColumnMeta.meta?.type !== 'date') return undefined;

  const byColumns = getChangePointByColumns(esql);

  // Entity columns come exclusively from the explicit CHANGE_POINT ... BY clause. Without a BY,
  // all rows belong to a single series and the line query needs no WHERE filter.
  const entityColumnIds: string[] = byColumns
    ? byColumns.filter((id: string) => columnIds.includes(id))
    : [];

  // BY mode: the new `CHANGE_POINT ... BY` syntax omits type/pvalue from the result schema when
  // combined with `WHERE type IS NOT NULL` — every returned row is a change point event.
  const tableColumnIdSet = new Set(columnIds);
  const isByMode =
    Boolean(byColumns?.length) &&
    !tableColumnIdSet.has(typeColumnId) &&
    !tableColumnIdSet.has(pvalueColumnId);

  const timestampReservedIds = new Set<string>([typeColumnId, pvalueColumnId, valueColumn]);

  const groups = new Map<string, { entityLabel: string; rows: ChangePointRow[] }>();

  for (const row of table.rows as ChangePointRow[]) {
    const entityLabel =
      entityColumnIds.length > 0
        ? entityColumnIds.map((id: string) => `${id}=${serializeCell(row[id])}`).join(', ')
        : '';
    const existing = groups.get(entityLabel);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(entityLabel, { entityLabel, rows: [row] });
    }
  }

  return {
    table,
    esql,
    typeColumnId,
    pvalueColumnId,
    timeColumn,
    entityColumnIds,
    timestampReservedIds,
    byColumns,
    isByMode,
    groups,
  };
};

export const buildChangePointCards = (params: {
  table: Datatable | undefined;
  esql: string;
}): ChangePointCardModel[] | undefined => {
  const ctx = getChangePointCardsBuildContext(params);
  if (!ctx) return undefined;

  const {
    table,
    esql,
    typeColumnId,
    pvalueColumnId,
    timeColumn,
    entityColumnIds,
    timestampReservedIds,
    byColumns,
    isByMode,
    groups,
  } = ctx;

  const cards: ChangePointCardModel[] = [];

  for (const [entityLabel, { rows }] of groups.entries()) {
    const firstRow = rows[0];
    let lineEsql = buildChangePointLineDataQuery(esql);
    if (!lineEsql) continue;
    lineEsql = appendEntityFiltersToChangePointLineEsql(lineEsql, firstRow, entityColumnIds);

    const annotationEvents: ChangePointCardModel['annotationEvents'] = [];
    let hasDetectedChangePoint = false;
    let minPvalue: number | undefined;
    const typesSeen = new Set<string>();
    for (const row of rows) {
      // BY mode: type/pvalue are absent from the schema; every row in the group is a change point.
      // Non-BY mode: only rows where type and pvalue are set are annotations.
      const isAnnotation = isByMode
        ? true
        : isChangePointTableRow(row, typeColumnId, pvalueColumnId);
      if (!isAnnotation) continue;
      // Track detection before the timestamp guard so that a change point with an unresolvable
      // timestamp (e.g. a null bucket at the edge of the time range) is still counted.
      hasDetectedChangePoint = true;
      const timeCell = pickTimestampCell(row, timeColumn, table, timestampReservedIds);
      const datetime = formatAnnotationTimestamp(timeCell);
      if (!datetime) continue;

      const label = isByMode
        ? i18n.translate('changePointChartViewer.card.changePointLabel', {
            defaultMessage: 'Change point',
          })
        : `${serializeCell(row[typeColumnId])} (pvalue=${formatPvalueLabel(row[pvalueColumnId])})`;
      annotationEvents.push({ name: label, datetime });
      // Track the most significant (lowest) pvalue and distinct types for sorting/filtering.
      if (!isByMode) {
        const p = row[pvalueColumnId];
        if (typeof p === 'number' && Number.isFinite(p)) {
          minPvalue = minPvalue === undefined ? p : Math.min(minPvalue, p);
        }
        const t = row[typeColumnId];
        if (typeof t === 'string' && t.length > 0) typesSeen.add(t);
      }
    }

    // Skip groups with no detected change point in non-BY mode. This causes buildChangePointCards
    // to return undefined for queries where ES detects no change points, letting the grid show the
    // "No change point series to chart" empty state.
    // In BY mode every row is a change point event, so isByMode guards against over-skipping.
    // A group with hasDetectedChangePoint = true but empty annotationEvents (unresolvable timestamp,
    // e.g. a null bucket at the edge of the time range) is intentionally kept — the card is still
    // correct, just without a rendered annotation marker.
    if (!isByMode && !hasDetectedChangePoint) continue;

    const cardOrdinal = cards.length + 1;
    const title =
      buildCardTitle(byColumns, entityColumnIds, firstRow) ||
      i18n.translate('changePointChartViewer.card.defaultTitleN', {
        defaultMessage: 'Change point series {ordinal}',
        values: { ordinal: cardOrdinal },
      });

    const entityValues: Record<string, string> = {};
    for (const col of entityColumnIds) {
      entityValues[col] = serializeCell(firstRow[col]);
    }

    const entityDescription =
      entityColumnIds.length > 0
        ? entityColumnIds.map((col) => `${col}: ${entityValues[col]}`).join(', ')
        : undefined;

    cards.push({
      // Use entity label as the stable card ID so React remounts when the entity changes.
      id: `cp-card-${entityLabel || 'all'}`,
      title,
      lineEsql,
      byColumns: byColumns ? [...byColumns] : undefined,
      annotationEvents,
      minPvalue,
      changePointTypes: [...typesSeen],
      typeColumnId,
      pvalueColumnId,
      entityValues,
      entityDescription,
    });
  }

  return cards.length > 0 ? cards : undefined;
};

/**
 * Finds the card in the given list that corresponds to a specific result row.
 * Returns `undefined` when no match is found (e.g. the row belongs to a group
 * that was filtered out by {@link buildChangePointCards}).
 */
export const getCardForRow = (
  cards: ChangePointCardModel[],
  row: Readonly<Record<string, unknown>>
): ChangePointCardModel | undefined => {
  const firstCard = cards[0];
  if (!firstCard) return undefined;

  const { byColumns } = firstCard;
  if (!byColumns?.length) {
    // No BY clause — one card covers the whole dataset. Only return it for rows that are
    // actual change points (non-empty type + defined pvalue). All other rows (e.g. regular
    // time-series buckets without a detected change) should show an empty state.
    const { typeColumnId, pvalueColumnId } = firstCard;
    if (!isChangePointTableRow(row as Record<string, unknown>, typeColumnId, pvalueColumnId)) {
      return undefined;
    }
    return firstCard;
  }

  const entityCols = Object.keys(firstCard.entityValues);
  const entityLabel = entityCols.map((col) => `${col}=${serializeCell(row[col])}`).join(', ');
  const card = cards.find((c) => c.id === `cp-card-${entityLabel}`);
  if (!card) return undefined;

  // Typed cards come from result sets where type/pvalue are present in the schema. Verify
  // this specific row is an actual change point before showing its card. BY-mode cards that
  // omit type/pvalue have no card-level type or pvalue, so they skip this row-level check.
  const cardHasTypedChangePointRows =
    card.changePointTypes.length > 0 || card.minPvalue !== undefined;
  if (
    cardHasTypedChangePointRows &&
    !isChangePointTableRow(row as Record<string, unknown>, card.typeColumnId, card.pvalueColumnId)
  ) {
    return undefined;
  }

  return card;
};
