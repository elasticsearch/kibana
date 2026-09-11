/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DatatableColumn } from '@kbn/expressions-plugin/public';
import { mockDataViewsService } from '../../data_views_service/mocks';
import {
  loadIndexPatternRefs,
  getAllColumns,
  canColumnBeUsedBeInMetricDimension,
  hasNumericColumn,
  resolveTextBasedColumnType,
  MAX_NUM_OF_COLUMNS,
} from './utils';
import type { TextBasedLayerColumn } from '@kbn/lens-common';

describe('Text based languages utils', () => {
  describe('loadIndexPatternRefs', () => {
    it('should return a list of sorted indexpattern refs', async () => {
      const refs = await loadIndexPatternRefs(mockDataViewsService() as DataViewsPublicPluginStart);
      expect(refs[0].title < refs[1].title).toBeTruthy();
    });
  });

  describe('getAllColumns', () => {
    it('should remove columns that do not exist on the query and remove duplicates', async () => {
      const existingOnLayer = [
        {
          fieldName: 'time',
          columnId: 'time',
          meta: {
            type: 'date',
          },
        },
        {
          fieldName: 'bytes',
          columnId: 'bytes',
          meta: {
            type: 'number',
          },
        },
      ] as TextBasedLayerColumn[];
      const columnsFromQuery = [
        {
          name: 'timestamp',
          id: 'timestamp',
          meta: {
            type: 'date',
          },
        },
        {
          name: 'bytes',
          id: 'bytes',
          meta: {
            type: 'number',
          },
        },
        {
          name: 'memory',
          id: 'memory',
          meta: {
            type: 'number',
          },
        },
      ] as DatatableColumn[];
      const allColumns = getAllColumns(existingOnLayer, columnsFromQuery);
      expect(allColumns).toStrictEqual([
        {
          fieldName: 'bytes',
          columnId: 'bytes',
          meta: {
            type: 'number',
          },
        },
        {
          fieldName: 'timestamp',
          columnId: 'timestamp',
          label: 'timestamp',
          meta: {
            type: 'date',
          },
        },
        {
          fieldName: 'memory',
          columnId: 'memory',
          label: 'memory',
          meta: {
            type: 'number',
          },
        },
      ]);
    });

    it('should maintain the variable info if it exists', async () => {
      const existingOnLayer = [
        {
          fieldName: 'time',
          columnId: 'time',
          meta: {
            type: 'date',
          },
        },
        {
          fieldName: 'bytes',
          columnId: 'bytes',
          meta: {
            type: 'number',
          },
        },
      ] as TextBasedLayerColumn[];
      const columnsFromQuery = [
        {
          name: 'timestamp',
          id: 'timestamp',
          meta: {
            type: 'date',
          },
        },
        {
          name: 'bytes',
          id: 'bytes',
          meta: {
            type: 'number',
          },
        },
        {
          name: 'memory',
          id: 'memory',
          meta: {
            type: 'number',
          },
          variable: 'field1',
        },
      ] as DatatableColumn[];
      const allColumns = getAllColumns(existingOnLayer, columnsFromQuery);
      expect(allColumns).toStrictEqual([
        {
          fieldName: 'bytes',
          columnId: 'bytes',
          meta: {
            type: 'number',
          },
        },
        {
          fieldName: 'timestamp',
          columnId: 'timestamp',
          label: 'timestamp',
          meta: {
            type: 'date',
          },
        },
        {
          fieldName: 'memory',
          columnId: 'memory',
          label: 'memory',
          meta: {
            type: 'number',
          },
          variable: 'field1',
        },
      ]);
    });
  });

  describe('canColumnBeUsedBeInMetricDimension', () => {
    it('should return true if there are no numeric columns', async () => {
      const flag = canColumnBeUsedBeInMetricDimension(false, 2, 'string');
      expect(flag).toBeTruthy();
    });

    it('should return true if there are numeric columns and the selected type is number', async () => {
      const flag = canColumnBeUsedBeInMetricDimension(true, 2, 'number');
      expect(flag).toBeTruthy();
    });

    it('should return false if there are numeric columns and the selected type is non numeric', async () => {
      const flag = canColumnBeUsedBeInMetricDimension(true, 2, 'date');
      expect(flag).toBeFalsy();
    });

    it('should return true if there are many columns regardless of the types', async () => {
      const flag = canColumnBeUsedBeInMetricDimension(true, MAX_NUM_OF_COLUMNS, 'date');
      expect(flag).toBeTruthy();
    });
  });

  describe('resolveTextBasedColumnType', () => {
    const column = {
      columnId: 'col-uuid',
      fieldName: '@timestamp',
      meta: { type: 'string' },
    } satisfies TextBasedLayerColumn;

    it('prefers activeData column type', () => {
      expect(
        resolveTextBasedColumnType(column, {
          id: 'col-uuid',
          name: '@timestamp',
          meta: { type: 'date' },
        })
      ).toEqual('date');
    });

    it('falls back to persisted meta.type', () => {
      expect(resolveTextBasedColumnType(column)).toEqual('string');
    });
  });

  describe('hasNumericColumn', () => {
    const columns = [
      { columnId: 'a', fieldName: 'bytes', meta: { type: 'string' } },
      { columnId: 'b', fieldName: 'name', meta: { type: 'string' } },
    ] satisfies TextBasedLayerColumn[];

    it('detects a numeric column from the activeData overlay even if persisted meta is not numeric', () => {
      const activeColumns = [
        { id: 'a', name: 'bytes', meta: { type: 'number' } },
      ] as DatatableColumn[];
      expect(hasNumericColumn(columns, activeColumns)).toBe(true);
    });

    it('falls back to persisted meta.type when no activeData is present', () => {
      expect(hasNumericColumn(columns)).toBe(false);
    });

    it('does not treat a persisted number as numeric when the overlay says otherwise', () => {
      const persistedNumber = [
        { columnId: 'a', fieldName: 'ts', meta: { type: 'number' } },
      ] satisfies TextBasedLayerColumn[];
      const activeColumns = [{ id: 'a', name: 'ts', meta: { type: 'date' } }] as DatatableColumn[];
      expect(hasNumericColumn(persistedNumber, activeColumns)).toBe(false);
    });
  });
});
