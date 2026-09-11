/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type { DatasourceDimensionDropHandlerProps, TextBasedPrivateState } from '@kbn/lens-common';
import { getDropProps } from './get_drop_props';
import {
  column1,
  column2,
  column3,
  numericDraggedColumn,
  fieldList,
  notNumericDraggedField,
  numericDraggedField,
} from './mocks';
import { addColumnsToCache } from '../fieldlist_cache';

const defaultProps = {
  state: {
    layers: {
      first: {
        columns: [column1, column2, column3],
        query: {
          esql: 'from foo',
        },
      },
    },
  },
  source: numericDraggedColumn,
  target: {
    id: 'columnId3',
    layerId: 'first',
    columnId: 'columnId3',
    groupId: 'x',
    humanData: {
      label: 'products.base_price',
      groupLabel: 'Vertical axis',
      position: 1,
      layerNumber: 1,
    },
  },
} as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
const allColumns = [...fieldList, column1, column2, column3].map((f) => {
  return {
    id: f.columnId,
    name: f.fieldName,
    meta: f?.meta,
  };
}) as DatatableColumn[];
addColumnsToCache(
  {
    esql: 'from foo',
  },
  allColumns
);
describe('Text-based: getDropProps', () => {
  it('should return undefined if source and target belong to different layers', () => {
    const props = {
      ...defaultProps,
      source: {
        ...defaultProps.source,
        layerId: 'second',
      },
    };
    expect(getDropProps(props)).toBeUndefined();
  });
  it('should return undefined if source and target is the same column', () => {
    const props = {
      ...defaultProps,
      source: {
        ...defaultProps.target,
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toBeUndefined();
  });
  it('should return undefined if source is a non-numeric field and target is a metric dimension', () => {
    const props = {
      ...defaultProps,
      source: notNumericDraggedField,
      target: {
        ...defaultProps.target,
        isMetricDimension: true,
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toBeUndefined();
  });
  it('should not return undefined if source is a non-numeric field, target is a metric dimension but datatable doesnt have numeric fields', () => {
    const props = {
      ...defaultProps,
      state: {
        ...defaultProps.state,
        layers: {
          first: {
            columns: [column1, column2, column3],
          },
        },
      },
      source: notNumericDraggedField,
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({ dropTypes: ['field_replace'], nextLabel: 'category' });
  });
  it('should return reorder if source and target are operations from the same group', () => {
    const props = {
      ...defaultProps,
      source: {
        ...defaultProps.source,
        groupId: 'x',
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['reorder'],
      nextLabel: 'category',
    });
  });
  it('should return move_compatible if target is an empty column from compatible group', () => {
    const props = {
      ...defaultProps,
      target: {
        ...defaultProps.target,
        columnId: 'columnId4',
        groupId: 'x',
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['move_compatible', 'duplicate_compatible'],
      nextLabel: 'category',
    });
  });
  it('should return replace_compatible and swap_compatible if target is a column from compatible group', () => {
    const props = {
      ...defaultProps,
      target: {
        ...defaultProps.target,
        groupId: 'x',
        isMetricDimension: false,
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['replace_compatible', 'replace_duplicate_compatible', 'swap_compatible'],
      nextLabel: 'category',
    });
  });
  it('should return replace_compatible if target is a non-compatible column from compatible group', () => {
    const props = {
      ...defaultProps,
      target: {
        ...defaultProps.target,
        groupId: 'x',
        isMetricDimension: false,
      },
      source: {
        ...defaultProps.source,
        isMetricDimension: true,
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['replace_compatible', 'replace_duplicate_compatible', 'swap_compatible'],
      nextLabel: 'category',
    });
  });
  it('should return duplicate_compatible if target is an empty column from the same group', () => {
    const props = {
      ...defaultProps,
      target: {
        ...defaultProps.target,
        columnId: 'columnId4',
        groupId: 'y',
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['duplicate_compatible'],
      nextLabel: 'category',
    });
  });
  it('should return field_add if source is a field and target is an empty column', () => {
    const props = {
      ...defaultProps,
      source: notNumericDraggedField,
      target: {
        ...defaultProps.target,
        columnId: 'columnId4',
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['field_add'],
      nextLabel: 'category',
    });
  });
  it('should return field_add if field is numeric and the dimension is metric', () => {
    expect(
      getDropProps({
        ...defaultProps,
        source: numericDraggedField,
        target: {
          ...defaultProps.target,
          isMetricDimension: true,
          columnId: 'columnId4',
        },
      })
    ).toStrictEqual({
      dropTypes: ['field_add'],
      nextLabel: 'products.base_price',
    });
  });
  it('should return undefined if field is not numeric and the dimension is metric', () => {
    expect(
      getDropProps({
        ...defaultProps,
        source: notNumericDraggedField,
        target: {
          ...defaultProps.target,
          isMetricDimension: true,
          columnId: 'columnId4',
        },
      })
    ).toStrictEqual(undefined);
  });
  it('should return field_replace if source is a field and target is a non-empty column', () => {
    const props = {
      ...defaultProps,
      source: notNumericDraggedField,
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    expect(getDropProps(props)).toEqual({
      dropTypes: ['field_replace'],
      nextLabel: 'category',
    });
  });
  it('uses the activeData overlay to treat a persisted non-numeric column as numeric for metric-dimension drops', () => {
    const props = {
      ...defaultProps,
      source: notNumericDraggedField,
      target: {
        ...defaultProps.target,
        isMetricDimension: true,
      },
      activeData: {
        first: {
          type: 'datatable',
          columns: [{ id: 'category', name: 'category', meta: { type: 'number' } }],
          rows: [],
        },
      },
    } as unknown as DatasourceDimensionDropHandlerProps<TextBasedPrivateState>;
    // Without the overlay this returns undefined (persisted type is `string`); the Query Result
    // Type overlay marks `category` as `number`, so the drop into the metric dimension is allowed.
    expect(getDropProps(props)).toEqual({ dropTypes: ['field_replace'], nextLabel: 'category' });
  });
});
