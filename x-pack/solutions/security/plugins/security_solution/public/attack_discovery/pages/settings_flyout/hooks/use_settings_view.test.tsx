/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createFilterManagerMock } from '@kbn/data-plugin/public/query/filter_manager/filter_manager.mock';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';

import { useKibana } from '../../../../common/lib/kibana';
import type { UseSettingsView } from './use_settings_view';
import { useSettingsView } from './use_settings_view';
import { TestProviders } from '../../../../common/mock';

const mockFilterManager = createFilterManagerMock();

// Mock EuiSuperDatePicker to capture onTimeChange
const mockOnTimeChange = jest.fn();
jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiSuperDatePicker: (props: { onTimeChange: jest.Mock }) => {
    if (props.onTimeChange) {
      mockOnTimeChange.mockImplementation(props.onTimeChange);
    }
    return <div data-test-subj="alertSelectionDatePicker" />;
  },
}));

// Mock for discover-utils UI_SETTINGS in case META_FIELDS is imported from there
jest.mock('@kbn/discover-utils', () => ({
  ...jest.requireActual('@kbn/discover-utils/src/constants'),
  UI_SETTINGS: {
    META_FIELDS: 'metaFields',
    SORT_DEFAULT_ORDER_SETTING: 'discover:sort:defaultOrder',
    DOC_HIDE_TIME_COLUMN_SETTING: 'doc_table:hideTimeColumn',
  },
  buildDataTableRecord: jest.fn(),
  getChartHidden: jest.fn().mockReturnValue(undefined),
  getDefaultSort: jest.fn().mockReturnValue([]),
  getSortArray: jest.fn().mockReturnValue([]),
  getTableHidden: jest.fn().mockReturnValue(undefined),
  getSidebarClosed: jest.fn().mockReturnValue(undefined),
}));

jest.mock('@kbn/data-plugin/common', () => ({
  getEsQueryConfig: jest.fn().mockReturnValue({}),
  createEscapeValue: jest.fn().mockReturnValue(() => ''),
  getCalculateAutoTimeExpression: jest.fn().mockReturnValue(jest.fn()),
  UI_SETTINGS: {
    HISTOGRAM_BAR_TARGET: 'HISTOGRAM_BAR_TARGET',
    HISTOGRAM_MAX_BARS: 'HISTOGRAM_MAX_BARS',
    SEARCH_QUERY_LANGUAGE: 'SEARCH_QUERY_LANGUAGE',
    QUERY_ALLOW_LEADING_WILDCARDS: 'QUERY_ALLOW_LEADING_WILDCARDS',
    META_FIELDS: 'metaFields',
    // Add more keys as needed for coverage
  },
  KBN_FIELD_TYPES: {
    DATE: 'date',
    DATE_RANGE: 'date_range',
  },
}));

const mockOnQuerySubmit = jest.fn();

jest.mock('react-router', () => ({
  matchPath: jest.fn(),
  useLocation: jest.fn().mockReturnValue({
    search: '',
  }),
  withRouter: jest.fn(),
}));

jest.mock('../../../../common/lib/kibana');

jest.mock('../../../../common/hooks/use_space_id', () => {
  return {
    useSpaceId: jest.fn().mockReturnValue('default'),
  };
});

jest.mock('../../../../data_view_manager/hooks/use_data_view', () => ({
  useDataView: jest.fn().mockReturnValue({
    dataView: {
      id: 'security',
      title: 'security',
    },
    status: 'ready',
  }),
}));

jest.mock('../../../../common/lib/kuery', () => ({
  convertToBuildEsQuery: jest
    .fn()
    .mockReturnValue([
      JSON.stringify({ bool: { must: [], filter: [], should: [], must_not: [] } }),
      undefined,
    ]),
}));

jest.mock('../parse_filter_query', () => ({
  parseFilterQuery: jest
    .fn()
    .mockReturnValue({ bool: { must: [], filter: [], should: [], must_not: [] } }),
}));

// Mock for data-plugin/public
jest.mock('@kbn/data-plugin/public', () => ({
  ...jest.requireActual('@kbn/data-plugin/public'),
  FilterManager: jest.fn().mockImplementation(() => mockFilterManager),
}));

// Mock FilterManager so useRef in the hook uses our mock instance
jest.mock('@kbn/data-plugin/public', () => {
  const actual = jest.requireActual('@kbn/data-plugin/public');
  return {
    ...actual,
    FilterManager: jest.fn().mockImplementation(() => mockFilterManager),
  };
});

const defaultProps = {
  connectorId: undefined,
  onConnectorIdSelected: jest.fn(),
  onSettingsChanged: jest.fn(),
  onSettingsReset: jest.fn(),
  onSettingsSave: jest.fn(),
  onGenerate: jest.fn(),
  settings: {
    end: 'now',
    filters: [],
    query: { query: '', language: 'kuery' },
    size: 100,
    start: 'now-15m',
  },
  showConnectorSelector: true,
  stats: null,
};

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

describe('useSettingsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseKibana.mockReturnValue({
      services: {
        data: {
          query: {
            filterManager: mockFilterManager,
          },
        },
        lens: {
          EmbeddableComponent: () => <div data-test-subj="mockEmbeddableComponent" />,
        },
        uiSettings: {
          get: jest.fn(),
        },
        unifiedSearch: {
          ui: {
            SearchBar: (props: { onQuerySubmit: jest.Mock }) => {
              if (props.onQuerySubmit) {
                mockOnQuerySubmit.mockImplementation(props.onQuerySubmit);
              }
              return <div data-test-subj="alertSelectionSearchBar" />;
            },
          },
        },
      },
    } as unknown as jest.Mocked<ReturnType<typeof useKibana>>);
  });

  // DRY helper for simulating connector change and save
  function simulateConnectorChangeAndSave(
    result: {
      current: UseSettingsView;
    },
    newConnectorId: string
  ) {
    let handleLocalConnectorIdChange: ((id: string) => void) | undefined;
    if (React.isValidElement(result.current.settingsView)) {
      handleLocalConnectorIdChange = (result.current.settingsView as React.ReactElement).props
        .onConnectorIdSelected;
    }
    act(() => {
      handleLocalConnectorIdChange?.(newConnectorId);
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    fireEvent.click(screen.getByTestId('save'));
  }

  it('should return the alert selection component with `AlertSelectionQuery` as settings view', () => {
    const { result } = renderHook(() => useSettingsView(defaultProps), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.settingsView}</TestProviders>);

    expect(screen.getByTestId('customizeAlerts')).toBeInTheDocument();
  });

  it('should return the alert selection component with `AlertSelectionRange` as settings view', () => {
    const { result } = renderHook(() => useSettingsView(defaultProps), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.settingsView}</TestProviders>);

    expect(screen.getByTestId('alertSelection')).toBeInTheDocument();
  });

  it('should return reset action button', () => {
    const { result } = renderHook(() => useSettingsView(defaultProps), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('reset')).toBeInTheDocument();
  });

  it('should return save action button', () => {
    const { result } = renderHook(() => useSettingsView(defaultProps), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('save')).toBeInTheDocument();
  });

  it('disables the save button when localConnectorId is null', () => {
    const props = { ...defaultProps, connectorId: undefined };
    const { result } = renderHook(() => useSettingsView(props), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('save')).toBeDisabled();
  });

  it('enables the save button when localConnectorId is set', () => {
    const props = { ...defaultProps, connectorId: 'test-connector' };
    const { result } = renderHook(() => useSettingsView(props), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('save')).not.toBeDisabled();
  });

  it('disables the save and run button when localConnectorId is null', () => {
    const props = { ...defaultProps, connectorId: undefined };
    const { result } = renderHook(() => useSettingsView(props), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('saveAndRun')).toBeDisabled();
  });

  it('enables the save and run button when localConnectorId is set', () => {
    const props = { ...defaultProps, connectorId: 'test-connector' };
    const { result } = renderHook(() => useSettingsView(props), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    expect(screen.getByTestId('saveAndRun')).not.toBeDisabled();
  });

  it('invokes onSettingsSave when the save button is clicked', () => {
    const onSettingsSave = jest.fn();
    const props = {
      ...defaultProps,
      connectorId: 'old-connector',
      onSettingsSave,
    };
    const { result } = renderHook(() => useSettingsView(props), {
      wrapper: TestProviders,
    });

    render(<TestProviders>{result.current.actionButtons}</TestProviders>);

    fireEvent.click(screen.getByTestId('save'));

    expect(onSettingsSave).toHaveBeenCalled();
  });

  it('invokes onConnectorIdSelected when the save button is clicked and the connector changed', () => {
    const onSettingsSave = jest.fn();
    const onConnectorIdSelected = jest.fn();
    const props = {
      ...defaultProps,
      connectorId: 'old-connector',
      onSettingsSave,
      onConnectorIdSelected,
    };
    const { result } = renderHook(() => useSettingsView(props), {
      wrapper: TestProviders,
    });

    simulateConnectorChangeAndSave(result as { current: UseSettingsView }, 'new-connector');

    expect(onConnectorIdSelected).toHaveBeenCalledWith('new-connector');
  });

  describe('when save and run is clicked', () => {
    interface SaveAndRunProps {
      connectorId: string;
      onSettingsSave: jest.Mock;
      onGenerate: jest.Mock;
      onConnectorIdSelected: (connectorId: string) => void;
      onSettingsChanged?: typeof defaultProps.onSettingsChanged;
      onSettingsReset?: typeof defaultProps.onSettingsReset;
      settings: typeof defaultProps.settings;
      showConnectorSelector: boolean;
      stats: null;
    }
    let onSettingsSave: jest.Mock;
    let onGenerate: jest.Mock;
    let props: SaveAndRunProps;

    beforeEach(() => {
      jest.useFakeTimers();
      onSettingsSave = jest.fn();
      onGenerate = jest.fn();
      props = {
        ...defaultProps,
        connectorId: 'test-connector',
        onSettingsSave,
        onGenerate,
        onConnectorIdSelected: jest.fn(), // always provide a function
      };
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('invokes onSettingsSave when save and run is clicked', () => {
      const { result } = renderHook(() => useSettingsView(props), {
        wrapper: TestProviders,
      });
      render(<TestProviders>{result.current.actionButtons}</TestProviders>);

      fireEvent.click(screen.getByTestId('saveAndRun'));

      expect(onSettingsSave).toHaveBeenCalled();
    });

    it('invokes onGenerate when save and run is clicked', () => {
      const { result } = renderHook(() => useSettingsView(props), {
        wrapper: TestProviders,
      });

      render(<TestProviders>{result.current.actionButtons}</TestProviders>);

      fireEvent.click(screen.getByTestId('saveAndRun'));
      jest.runAllTimers();

      expect(onGenerate).toHaveBeenCalled();
    });
  });

  describe('when query is submitted', () => {
    it('invokes onSettingsChanged with the new query', () => {
      const onSettingsChanged = jest.fn();
      const props = { ...defaultProps, onSettingsChanged };
      const { result } = renderHook(() => useSettingsView(props), {
        wrapper: TestProviders,
      });
      render(<TestProviders>{result.current.settingsView}</TestProviders>);

      act(() => {
        mockOnQuerySubmit({ query: { query: 'new query', language: 'kuery' } });
      });

      expect(onSettingsChanged).toHaveBeenCalledWith({
        ...props.settings,
        query: { query: 'new query', language: 'kuery' },
      });
    });
  });

  describe('when time is changed', () => {
    it('invokes onSettingsChanged with the new time', () => {
      const onSettingsChanged = jest.fn();
      const props = { ...defaultProps, onSettingsChanged };
      const { result } = renderHook(() => useSettingsView(props), {
        wrapper: TestProviders,
      });
      render(<TestProviders>{result.current.settingsView}</TestProviders>);

      act(() => {
        mockOnTimeChange({ start: 'now-1h', end: 'now' });
      });

      expect(onSettingsChanged).toHaveBeenCalledWith({
        ...props.settings,
        start: 'now-1h',
        end: 'now',
      });
    });

    describe('when localConnectorId changes and save is clicked', () => {
      interface LocalConnectorIdProps {
        connectorId: string | undefined;
        onSettingsSave: jest.Mock;
        onConnectorIdSelected: jest.Mock;
        onSettingsChanged?: typeof defaultProps.onSettingsChanged;
        onSettingsReset?: typeof defaultProps.onSettingsReset;
        settings: typeof defaultProps.settings;
        showConnectorSelector: boolean;
        stats: null;
      }
      let props: LocalConnectorIdProps;

      beforeEach(() => {
        props = {
          connectorId: 'old-connector',
          onSettingsSave: jest.fn(),
          onConnectorIdSelected: jest.fn(),
          onSettingsChanged: defaultProps.onSettingsChanged,
          onSettingsReset: defaultProps.onSettingsReset,
          settings: defaultProps.settings,
          showConnectorSelector: defaultProps.showConnectorSelector,
          stats: defaultProps.stats,
        };
      });

      it('calls onConnectorIdSelected', () => {
        const { result } = renderHook(() => useSettingsView(props));

        simulateConnectorChangeAndSave(result as { current: UseSettingsView }, 'new-connector');

        expect(props.onConnectorIdSelected).toHaveBeenCalledWith('new-connector');
      });

      it('calls onSettingsSave', () => {
        const { result } = renderHook(() => useSettingsView(props));

        simulateConnectorChangeAndSave(result as { current: UseSettingsView }, 'new-connector');

        expect(props.onSettingsSave).toHaveBeenCalled();
      });
    });
  });
});
