/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import type { LegendActionProps, SeriesIdentifier } from '@elastic/charts';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import type { Datatable } from '@kbn/expressions-plugin/common';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { getLegendActions } from './get_legend_actions';
import { createMockVisData, createMockPieParams } from '../mocks';
import { getFilterEventData } from './filter_helpers';
import type { FilterEvent } from '../types';

const visData = createMockVisData();
const visParams = createMockPieParams();

/** Wraps the raw filter data into the FilterEvent shape that getLegendActions expects. */
const makeGetFilterEventData =
  (data: Datatable) =>
  (series: SeriesIdentifier): FilterEvent => ({
    name: 'filter',
    data: {
      negate: false,
      data: getFilterEventData(data, series),
    },
  });

/** Series props for a value that exists in the mock vis data (col-0-2 / 'Carrier' column). */
const seriesProps: LegendActionProps = {
  color: '#fff',
  label: 'Logstash Airways',
  series: [{ key: 'Logstash Airways', specId: 'pie' }] as unknown as SeriesIdentifier[],
};

/** Series props for a value that does NOT exist in the mock vis data. */
const unknownSeriesProps: LegendActionProps = {
  color: '#fff',
  label: 'Unknown',
  series: [
    { key: 'Value That Does Not Exist In Data', specId: 'pie' },
  ] as unknown as SeriesIdentifier[],
};

const esqlVisData: Datatable = {
  ...visData,
  meta: { type: ESQL_TABLE_TYPE },
};

/** ES|QL vis data where col-0-2 (Carrier, column index 0) is a computed column. */
const esqlVisDataWithComputedColumn: Datatable = {
  ...visData,
  meta: { type: ESQL_TABLE_TYPE },
  columns: visData.columns.map((col) =>
    col.id === 'col-0-2'
      ? {
          ...col,
          isComputedColumn: true,
          meta: {
            ...col.meta,
            sourceParams: { ...col.meta.sourceParams, sourceField: col.name },
          },
        }
      : col
  ),
};

/**
 * ES|QL vis data where col-0-2 is a computed column produced by RENAME — the column
 * name differs from the source field name, so the underlying index field is still
 * addressable and filtering should be allowed (no warning, no disabled actions).
 */
const esqlVisDataWithRenamedComputedColumn: Datatable = {
  ...visData,
  meta: { type: ESQL_TABLE_TYPE },
  columns: visData.columns.map((col) =>
    col.id === 'col-0-2'
      ? {
          ...col,
          isComputedColumn: true,
          meta: {
            ...col.meta,
            // sourceField ('Carrier') differs from col.name ('Carrier: Descending') → filterable
            sourceParams: { ...col.meta.sourceParams, sourceField: 'Carrier' },
          },
        }
      : col
  ),
};

/** Renders the component, opens the popover, and returns the userEvent instance. */
const renderAndOpen = async (
  Component: React.ComponentType<LegendActionProps>,
  props: LegendActionProps = seriesProps
) => {
  const user = userEvent.setup();
  renderWithKibanaRenderContext(<Component {...props} />);
  const button = await screen.findByRole('button', { name: /legend actions/i });
  await user.click(button);
  return { user };
};

describe('getLegendActions', () => {
  describe('basic rendering', () => {
    it('does not render when the series key is not found in the data', () => {
      const Component = getLegendActions(
        undefined,
        makeGetFilterEventData(visData),
        jest.fn(),
        [],
        visParams,
        visData,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      renderWithKibanaRenderContext(<Component {...unknownSeriesProps} />);
      expect(screen.queryByRole('button', { name: /legend actions/i })).not.toBeInTheDocument();
    });

    it('renders the action button when the column is filterable', async () => {
      const Component = getLegendActions(
        jest.fn().mockResolvedValue(true),
        makeGetFilterEventData(visData),
        jest.fn(),
        [],
        visParams,
        visData,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      renderWithKibanaRenderContext(<Component {...seriesProps} />);
      expect(await screen.findByRole('button', { name: /legend actions/i })).toBeInTheDocument();
    });
  });

  describe('ES|QL computed column', () => {
    it('renders the action button when the column is computed', () => {
      const Component = getLegendActions(
        undefined,
        makeGetFilterEventData(esqlVisDataWithComputedColumn),
        jest.fn(),
        [],
        visParams,
        esqlVisDataWithComputedColumn,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      renderWithKibanaRenderContext(<Component {...seriesProps} />);
      expect(screen.getByRole('button', { name: /legend actions/i })).toBeInTheDocument();
    });

    it('shows disabled Filter for and Filter out actions when the column is computed and cannot be filtered', async () => {
      const Component = getLegendActions(
        undefined,
        makeGetFilterEventData(esqlVisDataWithComputedColumn),
        jest.fn(),
        [],
        visParams,
        esqlVisDataWithComputedColumn,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      await renderAndOpen(Component);
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Filter for' })).toBeDisabled();
        expect(screen.getByRole('menuitem', { name: 'Filter out' })).toBeDisabled();
      });
    });

    it('shows a warning message when the column is computed and cannot be filtered', async () => {
      const Component = getLegendActions(
        undefined,
        makeGetFilterEventData(esqlVisDataWithComputedColumn),
        jest.fn(),
        [],
        visParams,
        esqlVisDataWithComputedColumn,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      await renderAndOpen(Component);
      const warning = await screen.findByTestId('legendFilterFooterMessage');
      expect(warning).toHaveTextContent(
        `You can't apply a filter or drill down from this value because it relies on a field created at query time.`
      );
    });

    it('does not disable filter actions or show a warning for a renamed computed column', async () => {
      // A RENAME column has isComputedColumn=true but a different sourceField, meaning the
      // underlying index field is still addressable — filtering should work normally.
      const Component = getLegendActions(
        jest.fn().mockResolvedValue(true),
        makeGetFilterEventData(esqlVisDataWithRenamedComputedColumn),
        jest.fn(),
        [],
        visParams,
        esqlVisDataWithRenamedComputedColumn,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      await renderAndOpen(Component);
      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Filter for' })).toBeEnabled();
        expect(screen.getByRole('menuitem', { name: 'Filter out' })).toBeEnabled();
      });
      expect(screen.queryByTestId('legendFilterFooterMessage')).not.toBeInTheDocument();
    });
  });

  describe('ES|QL mode with a non-computed column', () => {
    it('does not show the disabled-filter warning', async () => {
      const Component = getLegendActions(
        jest.fn().mockResolvedValue(true),
        makeGetFilterEventData(esqlVisData),
        jest.fn(),
        [],
        visParams,
        esqlVisData,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      await renderAndOpen(Component);
      expect(screen.queryByTestId('legendFilterFooterMessage')).not.toBeInTheDocument();
    });
  });

  describe('non-ES|QL mode', () => {
    it('does not show the disabled-filter warning even when isComputedColumn is true', async () => {
      const visDataWithComputedOutsideEsql: Datatable = {
        ...visData,
        columns: visData.columns.map((col) =>
          col.id === 'col-0-2' ? { ...col, isComputedColumn: true } : col
        ),
      };
      const Component = getLegendActions(
        jest.fn().mockResolvedValue(true),
        makeGetFilterEventData(visDataWithComputedOutsideEsql),
        jest.fn(),
        [],
        visParams,
        visDataWithComputedOutsideEsql,
        fieldFormatsMock as unknown as FieldFormatsStart
      );
      await renderAndOpen(Component);
      expect(screen.queryByTestId('legendFilterFooterMessage')).not.toBeInTheDocument();
    });
  });
});
