/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import { DataViewType } from '@kbn/data-views-plugin/common';
import type { DataViewFieldBase } from '@kbn/es-query';
import type { SavedObjectReference } from '@kbn/core-saved-objects-common';
import type { Column, DataSourceBase, SerializedDataSource } from '../types';
import { columnFromDataViewField } from '../to_column';

/**
 * `DataSource` implementation backed by a {@link DataView}.
 *
 * Used for DSL queries. A thin wrapper — every property
 * and method delegates directly to the underlying `DataView`, so DSL consumers
 * see no behavioral change from using a `DataView` directly.
 *
 * Consumers that need DSL-only features (runtime fields, scripted fields,
 * `getSourceFiltering()`, `getComputedFields()`, etc.) should call
 * {@link getDataView} to access the underlying instance.
 */
export class DataViewSource implements DataSourceBase {
  public readonly kind = 'index-pattern' as const;
  public readonly references: SavedObjectReference[];

  constructor(private readonly dataView: DataView) {
    if (!dataView.id) {
      throw new Error('DataViewSource requires a DataView with an id');
    }
    this.references = [{ type: 'index-pattern', id: dataView.id, name: 'data-source' }];
  }

  public get id(): string {
    return this.dataView.id!;
  }

  public get name(): string {
    return this.dataView.getName();
  }

  public get title(): string {
    return this.dataView.getIndexPattern();
  }

  public get timeFieldName(): string | undefined {
    return this.dataView.timeFieldName;
  }

  /**
   * Pass-through of the underlying `DataView`'s field list. Same instances
   * DSL consumers see today — no mapping, no transformation.
   *
   * Exposed primarily to satisfy `DataViewBase` (consumed by filter utilities
   * in `@kbn/es-query`). DSL consumers reaching for richer field metadata
   * should prefer `getDataView().fields`.
   */
  public get fields(): DataViewFieldBase[] {
    return this.dataView.fields.getAll();
  }

  public getColumns(): readonly Column[] {
    return this.dataView.fields.getAll().map(columnFromDataViewField);
  }

  public getColumn(name: string): Column | undefined {
    const field = this.dataView.fields.getByName(name);
    return field ? columnFromDataViewField(field) : undefined;
  }

  public isTimeBased(): boolean {
    return !!this.dataView.timeFieldName;
  }

  public isRollup(): boolean {
    return this.dataView.type === DataViewType.ROLLUP;
  }

  public isPersisted(): boolean {
    return this.dataView.isPersisted();
  }

  public serialize(): SerializedDataSource {
    return {
      kind: 'index-pattern',
      id: this.id,
      references: this.references,
    };
  }

  /**
   * Returns the underlying `DataView` instance. Use this when you need
   * DSL-specific functionality not exposed by the `DataSource` interface.
   */
  public getDataView(): DataView {
    return this.dataView;
  }
}
