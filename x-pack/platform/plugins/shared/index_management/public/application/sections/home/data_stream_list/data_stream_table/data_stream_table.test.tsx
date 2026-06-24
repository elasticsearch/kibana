/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { ScopedHistory } from '@kbn/core/public';
import { MAX_DATA_RETENTION } from '../../../../../../common/constants';
import type { DataStream } from '../../../../../../common/types';
import { DataStreamTable } from './data_stream_table';

let mockSelectedNames = new Set<string>();

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');

  const EuiInMemoryTable = ({
    items,
    columns,
    search,
    selection,
    'data-test-subj': dataTestSubj,
  }: any) => {
    const toggleSelect = (item: any) => {
      if (mockSelectedNames.has(item.name)) {
        mockSelectedNames.delete(item.name);
      } else {
        mockSelectedNames.add(item.name);
      }

      const selectedItems = items.filter((i: any) => mockSelectedNames.has(i.name));
      selection?.onSelectionChange?.(selectedItems);
    };

    return (
      <div data-test-subj={dataTestSubj}>
        <div data-test-subj="toolsLeft">{search?.toolsLeft}</div>
        <div data-test-subj="rows">
          {items.map((item: any) => (
            <div key={item.name} data-test-subj={`row-${item.name}`}>
              <button
                type="button"
                data-test-subj={`toggleSelect-${item.name}`}
                onClick={() => toggleSelect(item)}
              >
                toggleSelect
              </button>
              {columns
                .filter((c: any) => c.field)
                .map((col: any) => (
                  <div
                    key={`${item.name}-${col.field}`}
                    data-test-subj={`cell-${item.name}-${col.field}`}
                  >
                    {col.render ? col.render(item[col.field], item) : String(item[col.field])}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return {
    ...actual,
    EuiInMemoryTable,
    EuiButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    EuiSwitch: ({ label, ...props }: any) => <button {...props}>{label}</button>,
    EuiLink: ({ children, ...props }: any) => <a {...props}>{children}</a>,
    EuiTextColor: ({ children }: any) => <span>{children}</span>,
    EuiFlexGroup: ({ children }: any) => <div>{children}</div>,
    EuiFlexItem: ({ children }: any) => <div>{children}</div>,
    EuiIconTip: ({ iconProps }: any) => (
      <span data-test-subj={iconProps?.['data-test-subj'] ?? 'iconTip'} />
    ),
    useEuiTheme: () => ({ euiTheme: { colors: { danger: '#BD271E' } } }),
  };
});

jest.mock('@kbn/shared-ux-table-persist', () => ({
  useEuiTablePersist: () => ({
    pageSize: 20,
    sorting: {},
    onTableChange: jest.fn(),
  }),
}));

jest.mock('../../../../app_context', () => ({
  useAppContext: () => ({
    config: {
      enableSizeAndDocCount: false,
      enableDataStreamStats: false,
      enableTogglingDataRetention: false,
    },
  }),
}));

jest.mock('../../../../../shared_imports', () => ({
  reactRouterNavigate: () => ({}),
}));

jest.mock('../../../../components', () => ({
  DataHealth: () => null,
}));

jest.mock('../data_stream_badges', () => ({
  DataStreamsBadges: () => null,
}));

jest.mock('../data_stream_detail_panel', () => ({
  ConditionalWrap: ({ children }: any) => <>{children}</>,
}));

jest.mock('../delete_data_stream_confirmation_modal', () => ({
  DeleteDataStreamConfirmationModal: () => null,
}));

jest.mock('../edit_data_retention_modal', () => ({
  EditDataRetentionModal: () => null,
}));

jest.mock('../data_stream_actions_menu', () => ({
  DataStreamActionsMenu: ({ dataStreamActions }: any) => (
    <div data-test-subj="dataStreamActionsMenu">
      {dataStreamActions.map((action: any) => (
        <button
          key={action['data-test-subj'] ?? action.name}
          type="button"
          data-test-subj={action['data-test-subj']}
          onClick={action.onClick}
        >
          {action.name}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('../data_retention_value', () => ({
  DataRetentionValue: () => <span data-test-subj="dataRetentionValue">retention</span>,
}));

jest.mock('../../components', () => ({
  FilterListButton: () => null,
}));

const renderWithIntl = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

const createDataStream = (overrides: Partial<DataStream> = {}): DataStream => ({
  name: 'my-data-stream',
  timeStampField: { name: '@timestamp' },
  indices: [
    {
      name: 'index-000001',
      uuid: 'uuid-1',
      preferILM: false,
      managedBy: 'Data stream lifecycle',
    },
  ],
  generation: 1,
  health: 'green',
  indexTemplateName: 'my-template',
  privileges: {
    delete_index: true,
    manage_data_stream_lifecycle: true,
    read_failure_store: true,
  },
  hidden: false,
  nextGenerationManagedBy: 'Data stream lifecycle',
  lifecycle: {
    enabled: true,
    data_retention: '7d',
  } as DataStream['lifecycle'],
  indexMode: 'standard',
  ...overrides,
});

const createHistory = (): ScopedHistory => ({ location: {} } as unknown as ScopedHistory);

describe('DataStreamTable', () => {
  beforeEach(() => {
    mockSelectedNames = new Set<string>();
  });

  it('shows bulk edit data retention action when selected stream is DSL-managed and has privileges', () => {
    const dataStream = createDataStream({
      name: 'ds1',
      nextGenerationManagedBy: 'Data stream lifecycle',
    });

    renderWithIntl(
      <DataStreamTable
        dataStreams={[dataStream]}
        reload={jest.fn()}
        history={createHistory()}
        includeStats={false}
        filters=""
        viewFilters={{ hidden: true, managed: true } as any}
        onViewFilterChange={jest.fn()}
        setIncludeStats={jest.fn()}
      />
    );

    expect(screen.queryByTestId('bulkEditDataRetentionButton')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggleSelect-ds1'));

    expect(screen.getByTestId('bulkEditDataRetentionButton')).toBeInTheDocument();
  });

  it('does not show bulk edit data retention action when selected stream is ILM-managed', () => {
    const dataStream = createDataStream({
      name: 'ds1',
      nextGenerationManagedBy: 'Index Lifecycle Management',
      lifecycle: undefined,
    });

    renderWithIntl(
      <DataStreamTable
        dataStreams={[dataStream]}
        reload={jest.fn()}
        history={createHistory()}
        includeStats={false}
        filters=""
        viewFilters={{ hidden: true, managed: true } as any}
        onViewFilterChange={jest.fn()}
        setIncludeStats={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('toggleSelect-ds1'));

    expect(screen.queryByTestId('bulkEditDataRetentionButton')).not.toBeInTheDocument();
  });

  it('renders the max retention indicator when using MAX_DATA_RETENTION', () => {
    const dataStream = createDataStream({
      name: 'ds1',
      nextGenerationManagedBy: 'Data stream lifecycle',
      lifecycle: {
        enabled: true,
        data_retention: '7d',
        effective_retention: '30d',
        retention_determined_by: MAX_DATA_RETENTION,
      } as DataStream['lifecycle'],
    });

    renderWithIntl(
      <DataStreamTable
        dataStreams={[dataStream]}
        reload={jest.fn()}
        history={createHistory()}
        includeStats={false}
        filters=""
        viewFilters={{ hidden: true, managed: true } as any}
        onViewFilterChange={jest.fn()}
        setIncludeStats={jest.fn()}
      />
    );

    expect(screen.getByTestId('usingMaxRetention')).toBeInTheDocument();
  });

  it('does not render the max retention indicator for ILM-managed streams', () => {
    const dataStream = createDataStream({
      name: 'ds1',
      nextGenerationManagedBy: 'Index Lifecycle Management',
      lifecycle: {
        enabled: true,
        data_retention: '7d',
        effective_retention: '30d',
        retention_determined_by: MAX_DATA_RETENTION,
      } as DataStream['lifecycle'],
    });

    renderWithIntl(
      <DataStreamTable
        dataStreams={[dataStream]}
        reload={jest.fn()}
        history={createHistory()}
        includeStats={false}
        filters=""
        viewFilters={{ hidden: true, managed: true } as any}
        onViewFilterChange={jest.fn()}
        setIncludeStats={jest.fn()}
      />
    );

    expect(screen.queryByTestId('usingMaxRetention')).not.toBeInTheDocument();
  });
});
