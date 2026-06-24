/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import TestRenderer, { act } from 'react-test-renderer';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { createMemoryHistory } from 'history';
import { Router } from '@kbn/shared-ux-router';
import { createStore } from 'redux';
import { AlertFlyoutOverviewTab } from '.';
import type { StartServices } from '../../types';
import { noopCellActionRenderer } from '../../flyout_v2/shared/components/cell_actions';

jest.mock('../../common/components/user_privileges/user_privileges_context', () => ({
  UserPrivilegesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockOverviewTab = jest.fn((_: unknown) => <div>{'MockOverviewTab'}</div>);

jest.mock('../../flyout_v2/document/main/tabs/overview_tab', () => ({
  OverviewTab: (props: unknown) => mockOverviewTab(props),
}));

jest.mock('../../common/components/user_privileges/user_privileges_context', () => ({
  UserPrivilegesProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../common/components/discover_in_timeline/provider', () => ({
  DiscoverInTimelineContextProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('../../cases/components/provider/provider', () => ({
  CaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../assistant/provider', () => ({
  AssistantProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../common/components/ml/permissions/ml_capabilities_provider', () => ({
  MlCapabilitiesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseInitDataViewManager = jest.fn();
jest.mock('../../data_view_manager/hooks/use_init_data_view_manager', () => ({
  useInitDataViewManager: () => mockUseInitDataViewManager(),
}));

const mockUseIsExperimentalFeatureEnabled = jest.fn();
jest.mock('../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: (feature: string) =>
    mockUseIsExperimentalFeatureEnabled(feature),
}));

const mockUseIsInSecurityApp = jest.fn();
jest.mock('../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: () => mockUseIsInSecurityApp(),
}));

describe('AlertFlyoutOverviewTab', () => {
  const onAlertUpdated = jest.fn();
  const servicesMock = {
    core: { overlays: {} },
    uiActions: {
      getTriggerCompatibleActions: jest.fn().mockResolvedValue([]),
    },
    application: {
      capabilities: {
        securitySolution: { show: true, crud: true },
      },
    },
    upselling: {},
    data: {
      query: {
        timefilter: {
          timefilter: {
            getAbsoluteTime: jest.fn().mockReturnValue({
              from: '2023-01-01T00:00:00.000Z',
              to: '2023-12-31T23:59:59.999Z',
            }),
          },
        },
      },
    },
    notifications: {
      toasts: { addError: jest.fn(), addDanger: jest.fn(), addSuccess: jest.fn() },
    },
  } as unknown as StartServices;

  beforeEach(() => {
    mockOverviewTab.mockClear();
    mockUseInitDataViewManager.mockReset();
    mockUseInitDataViewManager.mockReturnValue(jest.fn());
    mockUseIsExperimentalFeatureEnabled.mockReset();
    mockUseIsInSecurityApp.mockReturnValue(false);
  });

  it('wraps the overview tab in KibanaContextProvider and ReactQueryClientProvider', async () => {
    const hit = {
      id: '1',
      raw: {},
      flattened: {
        'event.kind': 'signal',
      },
    } as unknown as DataTableRecord;

    let resolveServices: (services: StartServices) => void;
    const servicesPromise = new Promise<StartServices>((resolve) => {
      resolveServices = resolve;
    });

    mockUseIsExperimentalFeatureEnabled.mockReturnValue(false);
    mockUseInitDataViewManager.mockReturnValue(jest.fn());

    const store = createStore(() => ({
      dataViewManager: {
        shared: { status: 'pristine' },
      },
    }));
    const storePromise = Promise.resolve(store as never);

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={servicesPromise}
          storePromise={storePromise}
          onAlertUpdated={onAlertUpdated}
        />
      );
    });

    await act(async () => {
      resolveServices(servicesMock);
      await servicesPromise;
      await Promise.resolve();
    });

    const providers = tree.root.findAllByType(KibanaContextProvider);
    expect(providers).toHaveLength(1);

    // Ensure the nested provider preserves the react-query wrapper
    const reactQueryProviders = tree.root.findAll((node) => {
      const nodeType = node.type as React.ComponentType;
      return nodeType?.displayName === 'ReactQueryClientProvider';
    });
    expect(reactQueryProviders).toHaveLength(1);
  });

  it('initializes dataViewManager once when feature flag enabled and status is pristine', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsExperimentalFeatureEnabled.mockImplementation((feature: string) => {
      return feature === 'newDataViewPickerEnabled';
    });

    const initSpy = jest.fn();
    mockUseInitDataViewManager.mockReturnValue(initSpy);

    const store = createStore(() => ({
      dataViewManager: {
        shared: { status: 'pristine' },
      },
    }));

    const servicesPromise = Promise.resolve(servicesMock);
    const storePromise = Promise.resolve(store as never);

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={servicesPromise}
          storePromise={storePromise}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await servicesPromise;
      await storePromise;
      await Promise.resolve();
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith([]);
  });

  it('retries initialization when feature flag enabled and status is error', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsExperimentalFeatureEnabled.mockImplementation((feature: string) => {
      return feature === 'newDataViewPickerEnabled';
    });

    const initSpy = jest.fn();
    mockUseInitDataViewManager.mockReturnValue(initSpy);

    const store = createStore(() => ({
      dataViewManager: {
        shared: { status: 'error' },
      },
    }));

    const servicesPromise = Promise.resolve(servicesMock);
    const storePromise = Promise.resolve(store as never);

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={servicesPromise}
          storePromise={storePromise}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await Promise.resolve();
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith([]);
  });

  it('initializes when status is pristine', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsExperimentalFeatureEnabled.mockReturnValue(false);

    const initSpy = jest.fn();
    mockUseInitDataViewManager.mockReturnValue(initSpy);

    const store = createStore(() => ({
      dataViewManager: {
        shared: { status: 'pristine' },
      },
    }));

    const servicesPromise = Promise.resolve(servicesMock);
    const storePromise = Promise.resolve(store as never);

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={servicesPromise}
          storePromise={storePromise}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await Promise.resolve();
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(initSpy).toHaveBeenCalledWith([]);
  });

  it('does not initialize when status is loading or ready', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsExperimentalFeatureEnabled.mockImplementation((feature: string) => {
      return feature === 'newDataViewPickerEnabled';
    });

    const initSpy = jest.fn();
    mockUseInitDataViewManager.mockReturnValue(initSpy);

    const storeLoading = createStore(() => ({
      dataViewManager: {
        shared: { status: 'loading' },
      },
    }));
    const storeReady = createStore(() => ({
      dataViewManager: {
        shared: { status: 'ready' },
      },
    }));

    const servicesPromise = Promise.resolve(servicesMock);

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={servicesPromise}
          storePromise={Promise.resolve(storeLoading as never)}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await Promise.resolve();
    });

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={servicesPromise}
          storePromise={Promise.resolve(storeReady as never)}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await Promise.resolve();
    });

    expect(initSpy).not.toHaveBeenCalled();
  });

  it('renders under an existing parent router without nesting another router', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsExperimentalFeatureEnabled.mockReturnValue(false);
    mockUseInitDataViewManager.mockReturnValue(jest.fn());

    const store = createStore(() => ({
      dataViewManager: {
        shared: { status: 'pristine' },
      },
    }));

    const history = createMemoryHistory({ initialEntries: ['/discover'] });

    render(
      <Router history={history}>
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAlertUpdated={onAlertUpdated}
        />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText('MockOverviewTab')).toBeInTheDocument();
    });
  });

  it('passes a Discover-aware cell action renderer to the overview tab', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    const store = createStore(() => ({
      dataViewManager: {
        shared: { status: 'pristine' },
      },
    }));

    render(
      <AlertFlyoutOverviewTab
        hit={hit}
        servicesPromise={Promise.resolve(servicesMock)}
        storePromise={Promise.resolve(store as never)}
        onAlertUpdated={onAlertUpdated}
        columns={['host.name']}
        filter={jest.fn()}
        onAddColumn={jest.fn()}
        onRemoveColumn={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('MockOverviewTab')).toBeInTheDocument();
    });

    expect(mockOverviewTab).toHaveBeenCalledWith(
      expect.objectContaining({
        renderCellActions: expect.any(Function),
      })
    );

    const lastCall = mockOverviewTab.mock.calls[mockOverviewTab.mock.calls.length - 1];
    const lastProps = lastCall?.[0] as { renderCellActions?: unknown } | undefined;
    const renderCellActions = lastProps?.renderCellActions;
    expect(renderCellActions).not.toBe(noopCellActionRenderer);
  });

  it('renders DataViewManagerBootstrap when not in the Security app', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsInSecurityApp.mockReturnValue(false);
    mockUseIsExperimentalFeatureEnabled.mockImplementation(
      (feature: string) => feature === 'newDataViewPickerEnabled'
    );

    const initSpy = jest.fn();
    mockUseInitDataViewManager.mockReturnValue(initSpy);

    const store = createStore(() => ({ dataViewManager: { shared: { status: 'pristine' } } }));

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await Promise.resolve();
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it('does not render DataViewManagerBootstrap when in the Security app', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    mockUseIsInSecurityApp.mockReturnValue(true);
    mockUseIsExperimentalFeatureEnabled.mockImplementation(
      (feature: string) => feature === 'newDataViewPickerEnabled'
    );

    const initSpy = jest.fn();
    mockUseInitDataViewManager.mockReturnValue(initSpy);

    const store = createStore(() => ({ dataViewManager: { shared: { status: 'pristine' } } }));

    await act(async () => {
      TestRenderer.create(
        <AlertFlyoutOverviewTab
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAlertUpdated={onAlertUpdated}
        />
      );
      await Promise.resolve();
    });

    expect(initSpy).not.toHaveBeenCalled();
  });
});
