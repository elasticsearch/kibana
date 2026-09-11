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
  reconcileQueryColumns,
} from './utils';
import type { TextBasedLayerColumn } from '@kbn/lens-common';

describe('Text based languages utils', () => {
  describe('loadIndexPatternRefs', () => {
    it('should return a list of sorted indexpattern refs', async () => {
      const refs = await loadIndexPatternRefs(mockDataViewsService() as DataViewsPublicPluginStart);
      expect(refs[0].title < refs[1].title).toBeTruthy();
    });
  });

  describe('reconcileQueryColumns', () => {
    it('preserves configured column IDs when compatible query fields change', () => {
      const existingColumns: TextBasedLayerColumn[] = [
        {
          columnId: 'x-axis',
          fieldName: '@timestamp',
          meta: { type: 'date' },
        },
        {
          columnId: 'y-axis',
          fieldName: 'COUNT(*)',
          label: 'Count of records',
          customLabel: true,
          meta: { type: 'number' },
        },
      ];
      const queryColumns: DatatableColumn[] = [
        { id: '@timestamp', name: '@timestamp', meta: { type: 'date' } },
        { id: 'MAX(bytes)', name: 'MAX(bytes)', meta: { type: 'number' } },
      ];

      expect(reconcileQueryColumns(existingColumns, queryColumns)).toEqual([
        {
          columnId: 'x-axis',
          fieldName: '@timestamp',
          label: '@timestamp',
          meta: { type: 'date' },
        },
        {
          columnId: 'y-axis',
          fieldName: 'MAX(bytes)',
          label: 'Count of records',
          customLabel: true,
          meta: { type: 'number' },
        },
      ]);
    });

    it('rebinds same-type dimensions positionally when the query renames and reorders them', () => {
      const existingColumns: TextBasedLayerColumn[] = [
        { columnId: 'metric-a', fieldName: 'COUNT(*)', meta: { type: 'number' } },
        { columnId: 'metric-b', fieldName: 'MEDIAN(bytes)', meta: { type: 'number' } },
      ];
      const queryColumns: DatatableColumn[] = [
        { id: 'AVG(bytes)', name: 'AVG(bytes)', meta: { type: 'number' } },
        { id: 'SUM(bytes)', name: 'SUM(bytes)', meta: { type: 'number' } },
      ];

      // no exact match: positional matching keeps existing dimension order
      expect(reconcileQueryColumns(existingColumns, queryColumns)).toEqual([
        {
          columnId: 'metric-a',
          fieldName: 'AVG(bytes)',
          label: 'AVG(bytes)',
          meta: { type: 'number' },
        },
        {
          columnId: 'metric-b',
          fieldName: 'SUM(bytes)',
          label: 'SUM(bytes)',
          meta: { type: 'number' },
        },
      ]);
    });

    it('falls back to the first remaining same-type dimension when positional match is incompatible', () => {
      const existingColumns: TextBasedLayerColumn[] = [
        { columnId: 'metric-a', fieldName: 'COUNT(*)', meta: { type: 'number' } },
        { columnId: 'metric-b', fieldName: 'MEDIAN(bytes)', meta: { type: 'number' } },
      ];
      const queryColumns: DatatableColumn[] = [
        { id: 'message', name: 'message', meta: { type: 'string' } },
        { id: 'MEDIAN(bytes)', name: 'MEDIAN(bytes)', meta: { type: 'number' } },
        { id: 'AVG(bytes)', name: 'AVG(bytes)', meta: { type: 'number' } },
      ];

      // exact match wins for MEDIAN(bytes); the renamed metric binds to the
      // first remaining same-type dimension (best-effort, may be ambiguous)
      expect(reconcileQueryColumns(existingColumns, queryColumns)).toEqual([
        {
          columnId: 'message',
          fieldName: 'message',
          label: 'message',
          meta: { type: 'string' },
        },
        {
          columnId: 'metric-b',
          fieldName: 'MEDIAN(bytes)',
          label: 'MEDIAN(bytes)',
          meta: { type: 'number' },
        },
        {
          columnId: 'metric-a',
          fieldName: 'AVG(bytes)',
          label: 'AVG(bytes)',
          meta: { type: 'number' },
        },
      ]);
    });

    it('uses query column IDs for new incompatible fields', () => {
      const existingColumns: TextBasedLayerColumn[] = [
        { columnId: 'metric', fieldName: 'COUNT(*)', meta: { type: 'number' } },
      ];
      const queryColumns: DatatableColumn[] = [
        { id: 'message', name: 'message', meta: { type: 'string' } },
      ];

      expect(reconcileQueryColumns(existingColumns, queryColumns)).toEqual([
        {
          columnId: 'message',
          fieldName: 'message',
          label: 'message',
          meta: { type: 'string' },
        },
      ]);
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
    it('should return true if there are non numeric field', async () => {
      const fieldList = [
        {
          id: 'a',
          name: 'Test 1',
          meta: {
            type: 'string',
          },
        },
        {
          id: 'b',
          name: 'Test 2',
          meta: {
            type: 'string',
          },
        },
      ] as DatatableColumn[];
      const flag = canColumnBeUsedBeInMetricDimension(fieldList, 'string');
      expect(flag).toBeTruthy();
    });

    it('should return true if there are numeric field and the selected type is number', async () => {
      const fieldList = [
        {
          id: 'a',
          name: 'Test 1',
          meta: {
            type: 'number',
          },
        },
        {
          id: 'b',
          name: 'Test 2',
          meta: {
            type: 'string',
          },
        },
      ] as DatatableColumn[];
      const flag = canColumnBeUsedBeInMetricDimension(fieldList, 'number');
      expect(flag).toBeTruthy();
    });

    it('should return false if there are non numeric fields and the selected type is non numeric', async () => {
      const fieldList = [
        {
          id: 'a',
          name: 'Test 1',
          meta: {
            type: 'number',
          },
        },
        {
          id: 'b',
          name: 'Test 2',
          meta: {
            type: 'string',
          },
        },
      ] as DatatableColumn[];
      const flag = canColumnBeUsedBeInMetricDimension(fieldList, 'date');
      expect(flag).toBeFalsy();
    });

    it('should return true if there are many columns regardless the types', async () => {
      const fieldList = [
        { id: 'a', name: 'Test 1', meta: { type: 'number' } },
        { id: 'b', name: 'Test 2', meta: { type: 'number' } },
        { id: 'c', name: 'Test 3', meta: { type: 'date' } },
        { id: 'd', name: 'Test 4', meta: { type: 'string' } },
        { id: 'e', name: 'Test 5', meta: { type: 'string' } },
        { id: 'f', name: 'Test 6', meta: { type: 'string' } },
        { id: 'g', name: 'Test 7', meta: { type: 'string' } },
        { id: 'h', name: 'Test 8', meta: { type: 'string' } },
        { id: 'i', name: 'Test 9', meta: { type: 'string' } },
        { id: 'j', name: 'Test 10', meta: { type: 'string' } },
      ] as DatatableColumn[];
      const flag = canColumnBeUsedBeInMetricDimension(fieldList, 'date');
      expect(flag).toBeTruthy();
    });
  });
});
