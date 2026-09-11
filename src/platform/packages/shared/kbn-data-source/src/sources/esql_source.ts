/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type { DataViewFieldBase } from '@kbn/es-query';
import type { SavedObjectReference } from '@kbn/core-saved-objects-common';
import { getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import type { Column, DataSourceBase, SerializedDataSource } from '../types';
import { columnFromDatatableColumn, columnToFieldBase } from '../to_column';
import { sha256 } from '../sha256';

export interface EsqlSourceArgs {
  query: string;
  resultColumns: readonly DatatableColumn[];
  timeFieldName?: string;
  /**
   * CPS project routing string. When present it is included in the id hash so
   * that the same query run in different projects produces distinct ids and
   * filter state does not bleed across project boundaries.
   */
  projectRouting?: string;
}

interface EsqlSourceConstructorArgs {
  id: string;
  title: string;
  timeFieldName: string | undefined;
  resultColumns: readonly DatatableColumn[];
}

/**
 * `DataSource` implementation for ES|QL queries.
 *
 * Built directly from `(query, resultColumns)` — does not require or create a
 * `DataView`. Identity is derived from the FROM clause's target string and the
 * (caller-provided) time field name; columns come from the query response.
 *
 * Construct via the async {@link EsqlSource.create} factory; the constructor
 * is private because id derivation uses `crypto.subtle.digest` (async).
 */
export class EsqlSource implements DataSourceBase {
  public readonly kind = 'esql' as const;
  public readonly id: string;
  public readonly title: string;
  public readonly timeFieldName: string | undefined;
  public readonly references: SavedObjectReference[];
  public readonly fields: DataViewFieldBase[];

  /**
   * Raw response columns from the ES|QL query. Exposed for consumers that need
   * richer per-column metadata than the unified {@link Column} shape provides
   * (e.g. `isComputedColumn`, `timeSeriesMetric`, `isNull`). Most consumers
   * should prefer {@link getColumns}.
   */
  public readonly resultColumns: readonly DatatableColumn[];

  private readonly columns: readonly Column[];
  private readonly columnsByName: ReadonlyMap<string, Column>;

  private constructor({ id, title, timeFieldName, resultColumns }: EsqlSourceConstructorArgs) {
    this.id = id;
    this.title = title;
    this.timeFieldName = timeFieldName;
    this.references = [{ type: 'index-pattern', id, name: 'data-source' }];

    this.resultColumns = resultColumns;
    this.columns = resultColumns.map(columnFromDatatableColumn);
    this.columnsByName = new Map(this.columns.map((c) => [c.name, c]));
    this.fields = this.columns.map(columnToFieldBase);
  }

  /** Async factory — id derivation via `crypto.subtle` requires async. */
  public static async create(args: EsqlSourceArgs): Promise<EsqlSource> {
    const title = getIndexPatternFromESQLQuery(args.query);
    const hashInput = JSON.stringify([
      'esql',
      title,
      args.projectRouting ?? null,
      args.timeFieldName ?? null,
    ]);
    const hash = await sha256(hashInput);
    return new EsqlSource({
      id: `esql-${hash}`,
      title,
      timeFieldName: args.timeFieldName,
      resultColumns: args.resultColumns,
    });
  }

  public get name(): string {
    return this.title;
  }

  public getColumns(): readonly Column[] {
    return this.columns;
  }

  public getColumn(name: string): Column | undefined {
    return this.columnsByName.get(name);
  }

  public isTimeBased(): boolean {
    return !!this.timeFieldName;
  }

  public isRollup(): boolean {
    return false;
  }

  public isPersisted(): boolean {
    return false;
  }

  public serialize(): SerializedDataSource {
    return {
      kind: 'esql',
      id: this.id,
      title: this.title,
      timeFieldName: this.timeFieldName,
      references: this.references,
    };
  }
}
