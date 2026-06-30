/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import type { IndicatorsTableProps } from './table';
import { IndicatorsTable } from './table';
import { TestProvidersComponent } from '../../../../mocks/test_providers';
import type { Indicator } from '../../../../../../common/threat_intelligence/types/indicator';
import { generateMockIndicator } from '../../../../../../common/threat_intelligence/types/indicator';
import { BUTTON_TEST_ID, TABLE_UPDATE_PROGRESS_TEST_ID } from './test_ids';
import { IOC_DETAILS_TITLE_TEST_ID } from '../../../../../flyout_v2/ioc/main/test_ids';

jest.mock('../../../../hooks/use_investigate_in_timeline', () => ({
  useInvestigateInTimeline: jest.fn(() => ({ investigateInTimelineFn: jest.fn() })),
}));

const stub = () => {};

const tableProps: IndicatorsTableProps = {
  onChangePage: stub,
  onChangeItemsPerPage: stub,
  indicators: [],
  pagination: { pageSize: 10, pageIndex: 0, pageSizeOptions: [10] },
  indicatorCount: 0,
  isLoading: false,
  browserFields: {},
  columnSettings: {
    columnVisibility: {
      visibleColumns: [],
      setVisibleColumns: () => {},
    },
    columns: [],
    handleResetColumns: () => {},
    handleToggleColumn: () => {},
    sorting: {
      columns: [],
      onSort: () => {},
    },
  },
};

const indicatorsFixture: Indicator[] = [
  {
    ...generateMockIndicator(),
    fields: {
      'threat.indicator.type': ['url'],
    },
  },
  {
    ...generateMockIndicator(),
    fields: {
      'threat.indicator.type': ['file'],
    },
  },
];

describe('<IndicatorsTable />', () => {
  it('should render loading spinner when doing initial loading', async () => {
    let container: HTMLElement;
    await act(async () => {
      container = render(
        <TestProvidersComponent>
          <IndicatorsTable {...tableProps} isLoading={true} />
        </TestProvidersComponent>
      ).container;
    });

    expect(container!.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('should render loading indicator when doing data update', async () => {
    await act(async () => {
      render(
        <TestProvidersComponent>
          <IndicatorsTable
            {...tableProps}
            indicatorCount={indicatorsFixture.length}
            indicators={indicatorsFixture}
            isFetching={true}
          />
        </TestProvidersComponent>
      );
    });

    expect(screen.queryByTestId(TABLE_UPDATE_PROGRESS_TEST_ID)).toBeInTheDocument();
  });

  // TODO enable back before merging
  it.skip('should render datagrid when loading is done', async () => {
    let container: HTMLElement;
    await act(async () => {
      container = render(
        <TestProvidersComponent>
          <IndicatorsTable
            {...tableProps}
            isLoading={false}
            isFetching={false}
            indicatorCount={indicatorsFixture.length}
            indicators={indicatorsFixture}
          />
        </TestProvidersComponent>
      ).container;
    });

    expect(screen.queryByTestId('euiDataGridBody')).toBeInTheDocument();

    // Two rows should be rendered
    expect(screen.queryAllByTestId(BUTTON_TEST_ID).length).toEqual(2);

    await act(async () => {
      screen.getAllByTestId(BUTTON_TEST_ID)[0].click();
    });

    expect(screen.queryByTestId(IOC_DETAILS_TITLE_TEST_ID)).toBeInTheDocument();

    expect(container!.querySelector('[role="progressbar"]')).not.toBeInTheDocument();
    expect(screen.queryByTestId(TABLE_UPDATE_PROGRESS_TEST_ID)).not.toBeInTheDocument();
  });
});
