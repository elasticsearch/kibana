/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, act, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { convertDatatableColumnToDataViewFieldSpec } from '@kbn/data-view-utils';
import { DataViewField } from '@kbn/data-views-plugin/common';
import type { UnifiedHistogramBreakdownContext } from '../../types';
import { dataViewWithTimefieldMock } from '../../__mocks__/data_view_with_timefield';
import { BreakdownFieldSelector } from './breakdown_field_selector';

const mapOptionValues = (option: HTMLElement) => ({
  label: option.getAttribute('title'),
  value: option.getAttribute('value'),
  checked: option.getAttribute('aria-checked'),
  selected: option.getAttribute('aria-selected'),
});

describe('BreakdownFieldSelector', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should render correctly for dataview fields', () => {
    const onBreakdownFieldChange = jest.fn();
    const breakdown: UnifiedHistogramBreakdownContext = {
      field: undefined,
    };

    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={breakdown}
        onBreakdownFieldChange={onBreakdownFieldChange}
      />
    );

    const button = screen.getByTestId('unifiedHistogramBreakdownSelectorButton');
    expect(button.getAttribute('data-selected-value')).toBe(null);

    act(() => {
      button.click();
    });

    const options = screen.getAllByRole('option');
    expect(options.map(mapOptionValues)).toMatchInlineSnapshot(`
      Array [
        Object {
          "checked": null,
          "label": "No breakdown",
          "selected": "true",
          "value": "__EMPTY_SELECTOR_OPTION__",
        },
        Object {
          "checked": null,
          "label": "bytes",
          "selected": "false",
          "value": "bytes",
        },
        Object {
          "checked": null,
          "label": "extension",
          "selected": "false",
          "value": "extension",
        },
      ]
    `);
  });

  it('should render correctly for ES|QL columns', () => {
    const onBreakdownFieldChange = jest.fn();
    const breakdown: UnifiedHistogramBreakdownContext = {
      field: undefined,
    };

    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={breakdown}
        onBreakdownFieldChange={onBreakdownFieldChange}
        esqlColumns={[
          {
            name: 'bytes',
            meta: { type: 'number' },
            id: 'bytes',
          },
          {
            name: 'extension',
            meta: { type: 'string' },
            id: 'extension',
          },
        ]}
      />
    );

    const button = screen.getByTestId('unifiedHistogramBreakdownSelectorButton');
    expect(button.getAttribute('data-selected-value')).toBe(null);

    act(() => {
      button.click();
    });

    const options = screen.getAllByRole('option');
    expect(options.map(mapOptionValues)).toMatchInlineSnapshot(`
      Array [
        Object {
          "checked": null,
          "label": "No breakdown",
          "selected": "true",
          "value": "__EMPTY_SELECTOR_OPTION__",
        },
        Object {
          "checked": null,
          "label": "bytes",
          "selected": "false",
          "value": "bytes",
        },
        Object {
          "checked": null,
          "label": "extension",
          "selected": "false",
          "value": "extension",
        },
      ]
    `);
  });

  it('should mark the option as checked if breakdown.field is defined', () => {
    const onBreakdownFieldChange = jest.fn();
    const field = dataViewWithTimefieldMock.fields.find((f) => f.name === 'extension')!;
    const breakdown: UnifiedHistogramBreakdownContext = { field };

    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={breakdown}
        onBreakdownFieldChange={onBreakdownFieldChange}
      />
    );

    const button = screen.getByTestId('unifiedHistogramBreakdownSelectorButton');
    expect(button.getAttribute('data-selected-value')).toBe('extension');

    act(() => {
      button.click();
    });

    const options = screen.getAllByRole('option');
    expect(options.map(mapOptionValues)).toMatchInlineSnapshot(`
      Array [
        Object {
          "checked": null,
          "label": "No breakdown",
          "selected": "false",
          "value": "__EMPTY_SELECTOR_OPTION__",
        },
        Object {
          "checked": null,
          "label": "bytes",
          "selected": "false",
          "value": "bytes",
        },
        Object {
          "checked": null,
          "label": "extension",
          "selected": "true",
          "value": "extension",
        },
      ]
    `);
  });

  it('should filter options based on the search input', async () => {
    const onBreakdownFieldChange = jest.fn();
    const breakdown: UnifiedHistogramBreakdownContext = {
      field: undefined,
    };

    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={breakdown}
        onBreakdownFieldChange={onBreakdownFieldChange}
      />
    );

    const button = screen.getByTestId('unifiedHistogramBreakdownSelectorButton');
    expect(button.getAttribute('data-selected-value')).toBe(null);

    act(() => {
      button.click();
    });

    const options = screen.getAllByRole('option');
    expect(options.map(mapOptionValues)).toMatchInlineSnapshot(`
      Array [
        Object {
          "checked": null,
          "label": "No breakdown",
          "selected": "true",
          "value": "__EMPTY_SELECTOR_OPTION__",
        },
        Object {
          "checked": null,
          "label": "bytes",
          "selected": "false",
          "value": "bytes",
        },
        Object {
          "checked": null,
          "label": "extension",
          "selected": "false",
          "value": "extension",
        },
      ]
    `);

    act(() => {
      const input = screen.getByTestId('unifiedHistogramBreakdownSelectorSelectorSearch');
      input.focus();
      fireEvent.change(input, { target: { value: 'extee' } });
      jest.advanceTimersByTime(300); // Wait for debounce
    });

    await waitFor(() => {
      const filteredOptions = screen.getAllByRole('option');
      expect(filteredOptions.map(mapOptionValues)).toMatchInlineSnapshot(`
        Array [
          Object {
            "checked": null,
            "label": "extension",
            "selected": "false",
            "value": "extension",
          },
        ]
      `);
    });
  });

  it('should call onBreakdownFieldChange with the selected field when the user selects a dataview field', () => {
    const onBreakdownFieldChange = jest.fn();
    const selectedField = dataViewWithTimefieldMock.fields.find((f) => f.name === 'bytes')!;
    const breakdown: UnifiedHistogramBreakdownContext = {
      field: undefined,
    };
    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={breakdown}
        onBreakdownFieldChange={onBreakdownFieldChange}
      />
    );

    act(() => {
      screen.getByTestId('unifiedHistogramBreakdownSelectorButton').click();
    });

    act(() => {
      screen.getByTitle('bytes').click();
    });

    expect(onBreakdownFieldChange).toHaveBeenCalledWith(selectedField);
  });

  it('renders recommended group in hardcoded order and all-fields group for the rest', () => {
    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={{ field: undefined }}
        onBreakdownFieldChange={jest.fn()}
        recommendedFields={['extension', 'bytes']}
      />
    );

    act(() => {
      screen.getByTestId('unifiedHistogramBreakdownSelectorButton').click();
    });

    expect(screen.getByText('Recommended fields')).toBeInTheDocument();
    expect(screen.getByText('All fields')).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    const values = options.map((o) => o.getAttribute('value'));
    // extension listed before bytes — matches hardcoded order, not alphabetical
    expect(values.indexOf('extension')).toBeLessThan(values.indexOf('bytes'));
  });

  it('falls back to flat list when no recommendedFields match available fields', () => {
    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={{ field: undefined }}
        onBreakdownFieldChange={jest.fn()}
        recommendedFields={['service.name', 'host.name']}
      />
    );

    act(() => {
      screen.getByTestId('unifiedHistogramBreakdownSelectorButton').click();
    });

    expect(screen.queryByText('Recommended fields')).not.toBeInTheDocument();
    expect(screen.queryByText('All fields')).not.toBeInTheDocument();
  });

  it('should call onBreakdownFieldChange with the selected field when the user selects an ES|QL field', () => {
    const onBreakdownFieldChange = jest.fn();
    const esqlColumns = [
      {
        name: 'bytes',
        meta: { type: 'number' },
        id: 'bytes',
      },
      {
        name: 'extension',
        meta: { type: 'string' },
        id: 'extension',
      },
    ] as DatatableColumn[];
    const breakdownColumn = esqlColumns.find((c) => c.name === 'bytes')!;
    const selectedField = new DataViewField(
      convertDatatableColumnToDataViewFieldSpec(breakdownColumn)
    );
    const breakdown: UnifiedHistogramBreakdownContext = {
      field: undefined,
    };
    render(
      <BreakdownFieldSelector
        dataView={dataViewWithTimefieldMock}
        breakdown={breakdown}
        onBreakdownFieldChange={onBreakdownFieldChange}
        esqlColumns={esqlColumns}
      />
    );

    act(() => {
      screen.getByTestId('unifiedHistogramBreakdownSelectorButton').click();
    });

    act(() => {
      screen.getByTitle('bytes').click();
    });

    expect(onBreakdownFieldChange).toHaveBeenCalledWith(selectedField);
  });
});
