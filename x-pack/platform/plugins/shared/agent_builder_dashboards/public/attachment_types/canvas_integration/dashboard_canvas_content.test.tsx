/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';
import type { ActionButton } from '@kbn/agent-builder-browser/attachments';
import type { DashboardAttachment } from '@kbn/agent-builder-dashboards-common/types';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { DashboardCanvasAttachment } from './dashboard_canvas_attachment';
import * as agentBuilderDashboardsCommon from '@kbn/agent-builder-dashboards-common';
import { DASHBOARD_ATTACHMENT_TYPE } from '@kbn/agent-builder-dashboards-common';

jest.mock('@kbn/dashboard-plugin/public', () => ({
  DashboardRenderer: jest.fn(() => <div data-test-subj="dashboardRenderer" />),
}));

jest.mock('@kbn/agent-builder-dashboards-common', () => {
  const actual = jest.requireActual('@kbn/agent-builder-dashboards-common');

  return {
    ...actual,
    attachmentDataToDashboardState: jest.fn(actual.attachmentDataToDashboardState),
  };
});

const MockSearchBar = jest.fn(() => <div data-test-subj="searchBar" />);

describe('DashboardCanvasAttachment', () => {
  const createMockDashboardApi = (
    overrides: Partial<Pick<DashboardApi, 'isManaged' | 'isEditableByUser'>> = {}
  ): DashboardApi & {
    children$: BehaviorSubject<Record<string, unknown>>;
    dataViews$: BehaviorSubject<any[]>;
    isApproximate$: BehaviorSubject<boolean>;
  } => {
    const children$ = new BehaviorSubject<Record<string, unknown>>({});
    const dataViews$ = new BehaviorSubject<any[]>([]);
    const filters$ = new BehaviorSubject<Filter[]>([]);
    const isApproximate$ = new BehaviorSubject(false);
    const query$ = new BehaviorSubject<Query | undefined>(undefined);
    const timeRange$ = new BehaviorSubject({ from: 'now-15m', to: 'now' });

    return {
      children$,
      locator: {
        navigate: jest.fn().mockResolvedValue(undefined),
      },
      dataViews$,
      filters$,
      forceRefresh: jest.fn(),
      isApproximate$,
      query$,
      isEditableByUser: true,
      isManaged: false,
      runQuickSave: jest.fn().mockResolvedValue(undefined),
      runInteractiveSave: jest.fn().mockResolvedValue({ id: 'new-dashboard-id' }),
      savedObjectId$: new BehaviorSubject<string | undefined>(undefined),
      setFilters: jest.fn((nextFilters?: Filter[]) => filters$.next(nextFilters ?? [])),
      setEsqlApproximation: jest.fn((isApproximate: boolean) => isApproximate$.next(isApproximate)),
      setQuery: jest.fn((nextQuery?: Query) => query$.next(nextQuery)),
      setViewMode: jest.fn(),
      setTimeRange: jest.fn((nextTimeRange?: { from: string; to: string }) => {
        if (nextTimeRange) {
          timeRange$.next(nextTimeRange);
        }
      }),
      timeRange$,
      ...overrides,
    } as unknown as DashboardApi & {
      children$: BehaviorSubject<Record<string, unknown>>;
      dataViews$: BehaviorSubject<any[]>;
      isApproximate$: BehaviorSubject<boolean>;
    };
  };

  const createMockFilterManager = () => {
    let currentFilters: Filter[] = [];
    const updates$ = new Subject<void>();

    return {
      getFilters: jest.fn(() => currentFilters),
      getUpdates$: jest.fn(() => updates$.asObservable()),
      setFilters: jest.fn((nextFilters: Filter[]) => {
        currentFilters = nextFilters;
        updates$.next();
      }),
      emitFilters: (nextFilters: Filter[]) => {
        currentFilters = nextFilters;
        updates$.next();
      },
    };
  };

  const createMockTimefilter = () => {
    let currentTime: TimeRange = { from: 'now-15m', to: 'now' };
    const timeUpdate$ = new Subject<void>();

    return {
      getTime: jest.fn(() => currentTime),
      getTimeUpdate$: jest.fn(() => timeUpdate$.asObservable()),
      setTime: jest.fn((nextTime: TimeRange) => {
        currentTime = nextTime;
        timeUpdate$.next();
      }),
      emitTime: (nextTime: TimeRange) => {
        currentTime = nextTime;
        timeUpdate$.next();
      },
    };
  };

  const createMockData = (
    filterManager: ReturnType<typeof createMockFilterManager>,
    timefilter: ReturnType<typeof createMockTimefilter>
  ) => {
    const data = dataPluginMock.createStartContract();
    Object.assign(data.query.filterManager, filterManager);
    Object.assign(data.query.timefilter.timefilter, timefilter);
    return data;
  };

  const mockAttachment: DashboardAttachment = {
    type: DASHBOARD_ATTACHMENT_TYPE,
    id: 'test-dashboard-id',
    data: {
      title: 'Test Dashboard',
      description: 'Test Description',
      panels: [],
    },
  };

  const defaultProps = {
    attachment: mockAttachment,
    conversationId: 'test-conversation-id',
    isSidebar: false,
    dashboardLocator: undefined,
    searchBarComponent: MockSearchBar as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const simulateDashboardApiAvailable = (mockApi: DashboardApi) => {
    const mockDashboardRenderer = DashboardRenderer as jest.Mock;
    const onApiAvailable = mockDashboardRenderer.mock.calls[0]?.[0]?.onApiAvailable;
    if (onApiAvailable) {
      act(() => {
        onApiAvailable(mockApi);
      });
    }
  };

  const getLatestSearchBarProps = (): Record<string, any> | undefined =>
    (MockSearchBar as jest.Mock).mock.calls.at(-1)?.[0] as Record<string, any> | undefined;

  type DashboardCanvasAttachmentProps = React.ComponentProps<typeof DashboardCanvasAttachment>;

  const renderDashboardCanvasAttachment = async (
    propsOverride: Partial<DashboardCanvasAttachmentProps> = {},
    {
      canWriteDashboards = true,
      mockApiOverrides = {},
    }: {
      canWriteDashboards?: boolean;
      mockApiOverrides?: Partial<Pick<DashboardApi, 'isManaged' | 'isEditableByUser'>>;
    } = {}
  ) => {
    const registerActionButtons: jest.MockedFunction<
      DashboardCanvasAttachmentProps['registerActionButtons']
    > = jest.fn();
    const updateOrigin: jest.MockedFunction<DashboardCanvasAttachmentProps['updateOrigin']> = jest
      .fn()
      .mockResolvedValue(undefined);
    const closeCanvas: jest.MockedFunction<DashboardCanvasAttachmentProps['closeCanvas']> =
      jest.fn();
    const checkSavedDashboardExist: jest.MockedFunction<
      DashboardCanvasAttachmentProps['checkSavedDashboardExist']
    > = jest.fn().mockResolvedValue(false);
    const mockFilterManager = createMockFilterManager();
    const mockTimefilter = createMockTimefilter();
    const mockData = createMockData(mockFilterManager, mockTimefilter);
    const mockApi = createMockDashboardApi(mockApiOverrides);
    const openSidebarConversation = jest.fn();

    const props: DashboardCanvasAttachmentProps = {
      ...defaultProps,
      data: mockData,
      registerActionButtons,
      updateOrigin,
      closeCanvas,
      checkSavedDashboardExist,
      openSidebarConversation,
      canWriteDashboards,
      ...propsOverride,
    };

    const renderResult = render(<DashboardCanvasAttachment {...props} />);

    // Wait for savedObjectStatus to resolve before DashboardRenderer is rendered
    await waitFor(() => {
      expect(DashboardRenderer).toHaveBeenCalled();
    });

    simulateDashboardApiAvailable(mockApi);

    return {
      ...renderResult,
      props,
      mockApi,
      mockFilterManager,
      mockTimefilter,
      registerActionButtons,
      updateOrigin,
      closeCanvas,
      checkSavedDashboardExist: props.checkSavedDashboardExist,
      openSidebarConversation,
    };
  };

  it('renders the dashboard renderer and search bar', async () => {
    const { container } = await renderDashboardCanvasAttachment();

    expect(container.querySelector('[data-test-subj="dashboardRenderer"]')).not.toBeNull();
    expect(container.querySelector('[data-test-subj="searchBar"]')).not.toBeNull();
  });

  it('registers action buttons when dashboard API becomes available', async () => {
    const { registerActionButtons } = await renderDashboardCanvasAttachment();

    expect(registerActionButtons).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Edit in Dashboards' }),
        expect.objectContaining({ label: 'Save' }),
      ])
    );
  });

  it('registers disabled action buttons with an explanation when dashboard write access is unavailable', async () => {
    const { registerActionButtons } = await renderDashboardCanvasAttachment(
      {},
      { canWriteDashboards: false }
    );

    expect(registerActionButtons).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Edit in Dashboards',
          disabled: true,
          disabledReason: 'You need dashboard write permissions to edit or save dashboards.',
        }),
        expect.objectContaining({
          label: 'Save',
          disabled: true,
          disabledReason: 'You need dashboard write permissions to edit or save dashboards.',
        }),
      ])
    );
  });

  it('registers disabled action buttons for managed dashboards', async () => {
    const attachmentWithOrigin: DashboardAttachment = {
      ...mockAttachment,
      origin: 'managed-dashboard-id',
    };

    const { registerActionButtons } = await renderDashboardCanvasAttachment(
      {
        attachment: attachmentWithOrigin,
        checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
      },
      { mockApiOverrides: { isManaged: true } }
    );

    expect(registerActionButtons).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Edit in Dashboards',
          disabled: true,
          disabledReason: 'Managed dashboards are read-only.',
        }),
        expect.objectContaining({
          label: 'Save',
          disabled: true,
          disabledReason: 'Managed dashboards are read-only.',
        }),
      ])
    );
  });

  it('registers disabled action buttons for read-only linked dashboards', async () => {
    const attachmentWithOrigin: DashboardAttachment = {
      ...mockAttachment,
      origin: 'read-only-dashboard-id',
    };

    const { registerActionButtons } = await renderDashboardCanvasAttachment(
      {
        attachment: attachmentWithOrigin,
        checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
      },
      { mockApiOverrides: { isEditableByUser: false } }
    );

    expect(registerActionButtons).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Edit in Dashboards',
          disabled: true,
          disabledReason: 'You do not have permission to edit this dashboard.',
        }),
        expect.objectContaining({
          label: 'Save',
          disabled: true,
          disabledReason: 'You do not have permission to edit this dashboard.',
        }),
      ])
    );
  });

  describe('Edit in Dashboards disabled states', () => {
    it('should not navigate for managed dashboards', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'managed-dashboard-id',
      };
      const { registerActionButtons, mockApi, closeCanvas, openSidebarConversation } =
        await renderDashboardCanvasAttachment(
          {
            attachment: attachmentWithOrigin,
            checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
          },
          { mockApiOverrides: { isManaged: true } }
        );

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).not.toHaveBeenCalled();
      expect(closeCanvas).not.toHaveBeenCalled();
      expect(openSidebarConversation).not.toHaveBeenCalled();
    });

    it('should not navigate for read-only linked dashboards', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'read-only-dashboard-id',
      };
      const { registerActionButtons, mockApi, closeCanvas, openSidebarConversation } =
        await renderDashboardCanvasAttachment(
          {
            attachment: attachmentWithOrigin,
            checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
          },
          { mockApiOverrides: { isEditableByUser: false } }
        );

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).not.toHaveBeenCalled();
      expect(closeCanvas).not.toHaveBeenCalled();
      expect(openSidebarConversation).not.toHaveBeenCalled();
    });

    it('should not navigate when dashboard write access is unavailable', async () => {
      const { registerActionButtons, mockApi, closeCanvas, openSidebarConversation } =
        await renderDashboardCanvasAttachment({}, { canWriteDashboards: false });

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).not.toHaveBeenCalled();
      expect(closeCanvas).not.toHaveBeenCalled();
      expect(openSidebarConversation).not.toHaveBeenCalled();
    });
  });

  it('enables query input and filter pills for preview search', async () => {
    await renderDashboardCanvasAttachment();

    expect(getLatestSearchBarProps()).toEqual(
      expect.objectContaining({
        showQueryInput: true,
        showFilterBar: true,
        showDatePicker: true,
        showQueryMenu: false,
        useDefaultBehaviors: false,
      })
    );
  });

  it('configures Fast mode for the dashboard preview', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();

    expect(getLatestSearchBarProps()?.esqlApproximation).toEqual(
      expect.objectContaining({
        isApproximate: false,
        disabled: true,
      })
    );

    act(() => {
      mockApi.children$.next({
        'esql-panel': {
          esql$: new BehaviorSubject([{ esql: 'FROM logs | LIMIT 10' }]),
          approximationApplied$: new BehaviorSubject<boolean | undefined>(undefined),
        },
      });
    });

    await waitFor(() => {
      expect(getLatestSearchBarProps()?.esqlApproximation).toEqual(
        expect.objectContaining({ disabled: false })
      );
    });

    act(() => {
      getLatestSearchBarProps()?.esqlApproximation.onChange(true);
    });

    expect(mockApi.setEsqlApproximation).toHaveBeenCalledWith(true);
    expect(getLatestSearchBarProps()?.esqlApproximation).toEqual(
      expect.objectContaining({ isApproximate: true })
    );
  });

  it('updates dashboard query and time range from the preview search bar', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();

    act(() => {
      getLatestSearchBarProps()?.onQuerySubmit({
        dateRange: { from: 'now-1h', to: 'now' },
        query: { query: 'host.name: "web-01"', language: 'kuery' },
      });
    });

    expect(mockApi.setQuery).toHaveBeenCalledWith({
      query: 'host.name: "web-01"',
      language: 'kuery',
    });
    expect(mockApi.setTimeRange).toHaveBeenCalledWith({ from: 'now-1h', to: 'now' });
    expect(mockApi.forceRefresh).toHaveBeenCalled();
  });

  it('clears the dashboard query when the preview query input is submitted empty', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();

    act(() => {
      getLatestSearchBarProps()?.onQuerySubmit({
        dateRange: { from: 'now-1h', to: 'now' },
        query: { query: '   ', language: 'kuery' },
      });
    });

    expect(mockApi.setQuery).toHaveBeenCalledWith({ query: '', language: 'kuery' });
    expect(mockApi.forceRefresh).toHaveBeenCalled();
  });

  it('preserves non-string query payloads when submitted', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();
    const queryDsl = {
      query: { bool: { filter: [{ term: { 'host.name': 'web-01' } }] } },
      language: 'kuery',
    } as Query;

    act(() => {
      getLatestSearchBarProps()?.onQuerySubmit({
        dateRange: { from: 'now-1h', to: 'now' },
        query: queryDsl,
      });
    });

    expect(mockApi.setQuery).toHaveBeenCalledWith(queryDsl);
    expect(mockApi.forceRefresh).toHaveBeenCalled();
  });

  it('updates dashboard filters from the preview filter bar', async () => {
    const { mockApi, mockFilterManager } = await renderDashboardCanvasAttachment();
    const nextFilters = [{ meta: { key: 'host.name' } }] as Filter[];

    (mockApi.setFilters as jest.MockedFunction<typeof mockApi.setFilters>).mockClear();
    act(() => {
      getLatestSearchBarProps()?.onFiltersUpdated(nextFilters);
    });

    expect(mockFilterManager.setFilters).toHaveBeenCalledWith(nextFilters);
    expect(mockApi.setFilters).toHaveBeenCalledWith(nextFilters);
    expect(mockApi.setFilters).toHaveBeenCalledTimes(1);
  });

  it('updates query bar index patterns when dashboard data views are published', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();
    const nextDataViews = [{ id: 'logs-*', title: 'logs-*' }];

    expect(getLatestSearchBarProps()).toEqual(
      expect.objectContaining({
        indexPatterns: [],
      })
    );

    act(() => {
      mockApi.dataViews$.next(nextDataViews as any);
    });

    expect(getLatestSearchBarProps()).toEqual(
      expect.objectContaining({
        indexPatterns: nextDataViews,
      })
    );
  });

  it('updates the preview filter pills when filters are created through the filter manager API', async () => {
    const { mockApi, mockFilterManager } = await renderDashboardCanvasAttachment();
    const nextFilters = [{ meta: { key: 'extension' } }] as Filter[];
    const setFiltersMock = mockApi.setFilters as jest.Mock;

    setFiltersMock.mockClear();
    act(() => {
      mockFilterManager.emitFilters(nextFilters);
    });

    expect(mockApi.setFilters).toHaveBeenCalledWith(nextFilters);
    expect(mockApi.setFilters).toHaveBeenCalledTimes(1);
    expect(getLatestSearchBarProps()).toEqual(
      expect.objectContaining({
        filters: nextFilters,
      })
    );
  });

  it('updates the preview time range when timefilter emits (e.g. chart brush)', async () => {
    const { mockApi, mockTimefilter } = await renderDashboardCanvasAttachment();
    const nextTimeRange = { from: '2026-04-01T00:00:00Z', to: '2026-04-02T00:00:00Z' };
    const setTimeRangeMock = mockApi.setTimeRange as jest.Mock;

    setTimeRangeMock.mockClear();
    act(() => {
      mockTimefilter.emitTime(nextTimeRange);
    });

    expect(mockApi.setTimeRange).toHaveBeenCalledWith(nextTimeRange);
    expect(getLatestSearchBarProps()).toEqual(
      expect.objectContaining({
        dateRangeFrom: nextTimeRange.from,
        dateRangeTo: nextTimeRange.to,
      })
    );
  });

  it('refreshes the embedded dashboard from the preview search bar', async () => {
    const { mockApi } = await renderDashboardCanvasAttachment();

    act(() => {
      getLatestSearchBarProps()?.onRefresh();
    });

    expect(mockApi.forceRefresh).toHaveBeenCalled();
  });

  describe('Edit in Dashboards button', () => {
    it('should call closeCanvas and openSidebarConversation', async () => {
      const { registerActionButtons, closeCanvas, openSidebarConversation, mockApi } =
        await renderDashboardCanvasAttachment();

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).toHaveBeenCalled();
      expect(closeCanvas).toHaveBeenCalled();
      expect(openSidebarConversation).toHaveBeenCalled();
    });

    it('should navigate with correct dashboard state and time range', async () => {
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment();

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          viewMode: 'edit',
          title: 'Test Dashboard',
          description: 'Test Description',
        })
      );
    });

    it('should carry the live preview query, filters, and time range into dashboard navigation', async () => {
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment();
      const nextFilters = [{ meta: { key: 'host.name' } }] as Filter[];

      act(() => {
        getLatestSearchBarProps()?.onFiltersUpdated(nextFilters);
        getLatestSearchBarProps()?.onQuerySubmit({
          dateRange: { from: 'now-1h', to: 'now' },
          query: { query: 'host.name: "web-01"', language: 'kuery' },
        });
      });

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: nextFilters,
          query: { query: 'host.name: "web-01"', language: 'kuery' },
          time_range: { from: 'now-1h', to: 'now' },
        })
      );
    });

    it('should include existing dashboard ID when saved object exists', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'existing-dashboard-id',
      };

      const { registerActionButtons, mockApi, checkSavedDashboardExist } =
        await renderDashboardCanvasAttachment({
          attachment: attachmentWithOrigin,
          checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
        });

      expect(checkSavedDashboardExist).toHaveBeenCalledWith('existing-dashboard-id');
      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardId: 'existing-dashboard-id',
        })
      );
    });

    it('should not include dashboard ID when the linked saved object does not exist', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'deleted-dashboard-id',
      };

      const { registerActionButtons, mockApi, checkSavedDashboardExist } =
        await renderDashboardCanvasAttachment({
          attachment: attachmentWithOrigin,
          checkSavedDashboardExist: jest.fn().mockResolvedValue(false),
        });

      expect(checkSavedDashboardExist).toHaveBeenCalledWith('deleted-dashboard-id');
      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const editButton = buttons.find((b) => b.label === 'Edit in Dashboards');

      await act(async () => {
        await editButton?.handler();
      });

      expect(mockApi.locator?.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardId: undefined,
        })
      );
    });
  });

  describe('Save button', () => {
    it('should not run save handlers for managed dashboards', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'managed-dashboard-id',
      };
      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment(
        {
          attachment: attachmentWithOrigin,
          updateOrigin,
          checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
        },
        { mockApiOverrides: { isManaged: true } }
      );

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const saveButton = buttons.find((b) => b.label === 'Save');

      await act(async () => {
        await saveButton?.handler();
      });

      expect(mockApi.runQuickSave).not.toHaveBeenCalled();
      expect(mockApi.runInteractiveSave).not.toHaveBeenCalled();
      expect(updateOrigin).not.toHaveBeenCalled();
    });

    it('should not run save handlers for read-only linked dashboards', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'read-only-dashboard-id',
      };
      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment(
        {
          attachment: attachmentWithOrigin,
          updateOrigin,
          checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
        },
        { mockApiOverrides: { isEditableByUser: false } }
      );

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const saveButton = buttons.find((b) => b.label === 'Save');

      await act(async () => {
        await saveButton?.handler();
      });

      expect(mockApi.runQuickSave).not.toHaveBeenCalled();
      expect(mockApi.runInteractiveSave).not.toHaveBeenCalled();
      expect(updateOrigin).not.toHaveBeenCalled();
    });

    it('should not run save handlers when dashboard write access is unavailable', async () => {
      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment(
        {
          updateOrigin,
        },
        { canWriteDashboards: false }
      );

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const saveButton = buttons.find((b) => b.label === 'Save');

      await act(async () => {
        await saveButton?.handler();
      });

      expect(mockApi.runQuickSave).not.toHaveBeenCalled();
      expect(mockApi.runInteractiveSave).not.toHaveBeenCalled();
      expect(updateOrigin).not.toHaveBeenCalled();
    });

    it('should run quick save when linked saved object exists', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'existing-dashboard-id',
      };

      const { registerActionButtons, mockApi, updateOrigin } =
        await renderDashboardCanvasAttachment({
          attachment: attachmentWithOrigin,
          checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
        });

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const saveButton = buttons.find((b) => b.label === 'Save');

      await act(async () => {
        await saveButton?.handler();
      });

      expect(mockApi.runQuickSave).toHaveBeenCalled();
      expect(updateOrigin).toHaveBeenCalledWith('existing-dashboard-id');
      expect(mockApi.runInteractiveSave).not.toHaveBeenCalled();
    });

    it('should run interactive save when linked saved object no longer exists', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'deleted-dashboard-id',
      };

      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment({
        attachment: attachmentWithOrigin,
        updateOrigin,
        checkSavedDashboardExist: jest.fn().mockResolvedValue(false),
      });

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const saveButton = buttons.find((b) => b.label === 'Save');

      await act(async () => {
        await saveButton?.handler();
      });

      expect(mockApi.runQuickSave).not.toHaveBeenCalled();
      expect(mockApi.runInteractiveSave).toHaveBeenCalled();
      expect(updateOrigin).toHaveBeenCalledWith('new-dashboard-id');
    });

    it('should run interactive save and update origin for new dashboard', async () => {
      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const { registerActionButtons, mockApi } = await renderDashboardCanvasAttachment({
        updateOrigin,
      });

      const buttons: ActionButton[] = registerActionButtons.mock.calls.at(-1)?.[0] ?? [];
      const saveButton = buttons.find((b) => b.label === 'Save');

      await act(async () => {
        await saveButton?.handler();
      });

      expect(mockApi.runInteractiveSave).toHaveBeenCalled();
      expect(updateOrigin).toHaveBeenCalledWith('new-dashboard-id');
    });
  });

  describe('DashboardRenderer', () => {
    it('passes the existing saved object id when the linked dashboard exists', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'existing-dashboard-id',
      };

      await renderDashboardCanvasAttachment({
        attachment: attachmentWithOrigin,
        checkSavedDashboardExist: jest.fn().mockResolvedValue(true),
      });

      expect(DashboardRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          savedObjectId: 'existing-dashboard-id',
        }),
        {}
      );
    });

    it('renders by value when the linked dashboard does not exist', async () => {
      const attachmentWithOrigin: DashboardAttachment = {
        ...mockAttachment,
        origin: 'deleted-dashboard-id',
      };

      await renderDashboardCanvasAttachment({
        attachment: attachmentWithOrigin,
        checkSavedDashboardExist: jest.fn().mockResolvedValue(false),
      });

      expect(DashboardRenderer).toHaveBeenCalledWith(
        expect.objectContaining({
          savedObjectId: undefined,
        }),
        {}
      );
    });

    it('renders a fallback callout when the dashboard renderer throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (DashboardRenderer as jest.Mock).mockImplementation(() => {
        throw new Error('invalid dashboard state');
      });

      const registerActionButtons = jest.fn();
      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const closeCanvas = jest.fn();
      const checkSavedDashboardExist = jest.fn().mockResolvedValue(false);
      const filterManager = createMockFilterManager();
      const timefilter = createMockTimefilter();
      const data = createMockData(filterManager, timefilter);

      const { container } = renderWithKibanaRenderContext(
        <DashboardCanvasAttachment
          {...defaultProps}
          data={data}
          registerActionButtons={registerActionButtons}
          updateOrigin={updateOrigin}
          closeCanvas={closeCanvas}
          checkSavedDashboardExist={checkSavedDashboardExist}
          openSidebarConversation={jest.fn()}
          canWriteDashboards
        />
      );

      await waitFor(() => {
        expect(container.querySelector('[data-test-subj="dashboardRendererError"]')).not.toBeNull();
      });

      consoleErrorSpy.mockRestore();
    });

    it('renders a fallback callout when dashboard state conversion fails', async () => {
      const attachmentDataToDashboardStateMock = jest.mocked(
        agentBuilderDashboardsCommon.attachmentDataToDashboardState
      );
      attachmentDataToDashboardStateMock.mockImplementation(() => {
        throw new Error('unsupported chart type');
      });

      const registerActionButtons = jest.fn();
      const updateOrigin = jest.fn().mockResolvedValue(undefined);
      const closeCanvas = jest.fn();
      const checkSavedDashboardExist = jest.fn().mockResolvedValue(false);
      const filterManager = createMockFilterManager();
      const timefilter = createMockTimefilter();
      const data = createMockData(filterManager, timefilter);

      const { container } = renderWithKibanaRenderContext(
        <DashboardCanvasAttachment
          {...defaultProps}
          data={data}
          registerActionButtons={registerActionButtons}
          updateOrigin={updateOrigin}
          closeCanvas={closeCanvas}
          checkSavedDashboardExist={checkSavedDashboardExist}
          openSidebarConversation={jest.fn()}
          canWriteDashboards
        />
      );

      await waitFor(() => {
        expect(container.querySelector('[data-test-subj="dashboardRendererError"]')).not.toBeNull();
      });

      expect(DashboardRenderer).not.toHaveBeenCalled();
    });
  });
});
