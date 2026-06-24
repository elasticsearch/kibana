/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  ENVIRONMENT_ALL,
  ENVIRONMENT_NOT_DEFINED,
} from '../../../common/environment_filter_values';
import { APM_SERVICE_MAP_EMBEDDABLE } from './constants';
import {
  getServiceMapEmbeddableFactory,
  type ServiceMapEmbeddableApi,
} from './service_map_embeddable_factory';
import type { EmbeddableDeps } from '../types';

const mockInitializeTitleManager = jest.fn();
const mockInitializeTimeRangeManager = jest.fn();
const mockInitializeStateManager = jest.fn();
const mockInitializeStateApi = jest.fn();
const mockUseBatchedPublishingSubjects = jest.fn();
const mockUseFetchContext = jest.fn();
const mockServiceMapEmbeddable = jest.fn();
const mockApmEmbeddableContext = jest.fn();
jest.mock('@kbn/presentation-publishing', () => ({
  initializeTitleManager: (...args: unknown[]) => mockInitializeTitleManager(...args),
  initializeTimeRangeManager: (...args: unknown[]) => mockInitializeTimeRangeManager(...args),
  initializeStateManager: (...args: unknown[]) => mockInitializeStateManager(...args),
  initializeStateApi: (...args: unknown[]) => mockInitializeStateApi(...args),
  titleComparators: { title: 'referenceEquality' },
  timeRangeComparators: { time_range: 'deepEquality' },
  useBatchedPublishingSubjects: (...args: unknown[]) => mockUseBatchedPublishingSubjects(...args),
  useFetchContext: (...args: unknown[]) => mockUseFetchContext(...args),
  apiHasParentApi: (api: unknown) =>
    Boolean((api as { parentApi?: unknown } | null)?.parentApi !== undefined),
  apiCanExpandPanels: (api: unknown) =>
    Boolean((api as { expandPanel?: unknown } | null)?.expandPanel !== undefined),
  getViewModeSubject: (api: unknown) => (api as { viewMode$?: unknown } | null)?.viewMode$,
}));

jest.mock('../embeddable_context', () => ({
  ApmEmbeddableContext: (props: Record<string, unknown>) => {
    mockApmEmbeddableContext(props);
    return <>{props.children as React.ReactNode}</>;
  },
}));

jest.mock('./service_map_embeddable', () => ({
  ServiceMapEmbeddable: (props: Record<string, unknown>) => {
    mockServiceMapEmbeddable(props);
    return null;
  },
}));

describe('getServiceMapEmbeddableFactory', () => {
  let titleAnyStateChange$: Subject<void>;
  let timeRangeAnyStateChange$: Subject<void>;
  let customStateAnyStateChange$: Subject<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    titleAnyStateChange$ = new Subject<void>();
    timeRangeAnyStateChange$ = new Subject<void>();
    customStateAnyStateChange$ = new Subject<void>();
    mockInitializeTitleManager.mockReturnValue({
      api: { titleApi: true },
      getLatestState: jest.fn(() => ({ title: 'Saved title' })),
      anyStateChange$: titleAnyStateChange$,
      reinitializeState: jest.fn(),
    });
    mockInitializeTimeRangeManager.mockReturnValue({
      api: {
        timeRange$: new BehaviorSubject({ from: 'now-15m', to: 'now' }),
        setTimeRange: jest.fn(),
      },
      getLatestState: jest.fn(() => ({ time_range: { from: 'now-15m', to: 'now' } })),
      anyStateChange$: timeRangeAnyStateChange$,
      reinitializeState: jest.fn(),
    });
    mockInitializeStateManager.mockReturnValue({
      api: {
        environment$: new BehaviorSubject(ENVIRONMENT_ALL.value),
        setEnvironment: jest.fn(),
        kuery$: new BehaviorSubject(undefined),
        setKuery: jest.fn(),
        serviceName$: new BehaviorSubject(undefined),
        setServiceName: jest.fn(),
        serviceGroupId$: new BehaviorSubject(undefined),
        setServiceGroupId: jest.fn(),
      },
      getLatestState: jest.fn(() => ({
        environment: ENVIRONMENT_ALL.value,
        kuery: undefined,
        service_name: undefined,
        service_group_id: undefined,
      })),
      anyStateChange$: customStateAnyStateChange$,
      reinitializeState: jest.fn(),
    });
    mockInitializeStateApi.mockImplementation(() => ({ stateApi: true }));
    mockUseBatchedPublishingSubjects.mockReturnValue([
      ENVIRONMENT_ALL.value,
      undefined,
      undefined,
      undefined,
    ]);
    mockUseFetchContext.mockReturnValue({ timeRange: { from: 'now-15m', to: 'now' } });
  });

  it('builds embeddable api and serializes default values', async () => {
    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: 'dashboard query' }) };
    const deps = { coreStart: { application: {} } } as unknown as EmbeddableDeps;
    const factory = getServiceMapEmbeddableFactory(deps);

    expect(factory.type).toBe(APM_SERVICE_MAP_EMBEDDABLE);

    await factory.buildEmbeddable({
      initialState: {},
      finalizeApi,
      uuid: 'panel-1',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    expect(finalizeApi).toHaveBeenCalledWith(
      expect.objectContaining({
        titleApi: true,
        stateApi: true,
        isEditingEnabled: expect.any(Function),
        onEdit: expect.any(Function),
        getTypeDisplayName: expect.any(Function),
        blockingError$: expect.any(Object),
      })
    );
    const stateApi = mockInitializeStateApi.mock.calls[0][0];
    expect(stateApi.serializeState()).toEqual({
      title: 'Saved title',
      time_range: { from: 'now-15m', to: 'now' },
      environment: ENVIRONMENT_ALL.value,
      kuery: undefined,
      service_name: undefined,
      service_group_id: undefined,
    });
  });

  it('exposes blockingError$ initialized to undefined', async () => {
    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: '' }) };
    const deps = { coreStart: { application: {} } } as unknown as EmbeddableDeps;
    const factory = getServiceMapEmbeddableFactory(deps);

    const embeddable = await factory.buildEmbeddable({
      initialState: {},
      finalizeApi,
      uuid: 'panel-1',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    expect(embeddable.api.blockingError$).toBeDefined();
    expect(embeddable.api.blockingError$.getValue()).toBeUndefined();
  });

  it('exposes edit capabilities', async () => {
    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: '' }) };
    const deps = { coreStart: { application: {} } } as unknown as EmbeddableDeps;
    const factory = getServiceMapEmbeddableFactory(deps);

    const embeddable = await factory.buildEmbeddable({
      initialState: {},
      finalizeApi,
      uuid: 'panel-1',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    expect(embeddable.api.isEditingEnabled()).toBe(true);
    expect(embeddable.api.getTypeDisplayName()).toBe('configuration');
    expect(typeof embeddable.api.onEdit).toBe('function');
  });

  it('passes panel kuery to rendered components (ignores dashboard query)', async () => {
    mockUseBatchedPublishingSubjects.mockReturnValue([
      'production',
      'service.name: api',
      'checkout',
      'group-1',
    ]);
    mockUseFetchContext.mockReturnValue({ timeRange: { from: 'now-1h', to: 'now' } });

    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: 'transaction.type: request' }) };
    const deps = {
      coreStart: { application: { getUrlForApp: jest.fn() } },
    } as unknown as EmbeddableDeps;
    const factory = getServiceMapEmbeddableFactory(deps);
    const embeddable = await factory.buildEmbeddable({
      initialState: {},
      finalizeApi,
      uuid: 'panel-1',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    render(<embeddable.Component />);

    expect(mockApmEmbeddableContext).toHaveBeenCalledWith(
      expect.objectContaining({
        deps,
        rangeFrom: 'now-1h',
        rangeTo: 'now',
        kuery: 'service.name: api',
      })
    );
    expect(mockServiceMapEmbeddable).toHaveBeenCalledWith(
      expect.objectContaining({
        rangeFrom: 'now-1h',
        rangeTo: 'now',
        environment: 'production',
        kuery: 'service.name: api',
        serviceName: 'checkout',
        serviceGroupId: 'group-1',
        core: deps.coreStart,
      })
    );
  });

  it('supports reset behavior', async () => {
    const timeRangeReinitialize = jest.fn();
    const customStateReinitialize = jest.fn();
    mockInitializeTimeRangeManager.mockReturnValue({
      api: {
        timeRange$: new BehaviorSubject({ from: 'now-15m', to: 'now' }),
        setTimeRange: jest.fn(),
      },
      getLatestState: jest.fn(() => ({ time_range: { from: 'now-15m', to: 'now' } })),
      anyStateChange$: timeRangeAnyStateChange$,
      reinitializeState: timeRangeReinitialize,
    });
    mockInitializeStateManager.mockReturnValue({
      api: {
        environment$: new BehaviorSubject(ENVIRONMENT_ALL.value),
        setEnvironment: jest.fn(),
        kuery$: new BehaviorSubject(undefined),
        setKuery: jest.fn(),
        serviceName$: new BehaviorSubject(undefined),
        setServiceName: jest.fn(),
        serviceGroupId$: new BehaviorSubject(undefined),
        setServiceGroupId: jest.fn(),
      },
      getLatestState: jest.fn(() => ({
        environment: ENVIRONMENT_ALL.value,
        kuery: undefined,
        service_name: undefined,
        service_group_id: undefined,
      })),
      anyStateChange$: customStateAnyStateChange$,
      reinitializeState: customStateReinitialize,
    });
    mockUseBatchedPublishingSubjects.mockReturnValue([
      ENVIRONMENT_ALL.value,
      '  host.name: app-1  ',
      null,
      null,
    ]);

    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: 'ignored' }) };
    const factory = getServiceMapEmbeddableFactory({ coreStart: {} } as unknown as EmbeddableDeps);
    await factory.buildEmbeddable({
      initialState: {
        time_range: { from: 'now-24h', to: 'now-1h' },
        environment: 'staging',
        kuery: 'service.environment: staging',
        service_name: 'service-a',
        service_group_id: 'group-a',
      },
      finalizeApi,
      uuid: 'panel-2',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    const stateApi = mockInitializeStateApi.mock.calls[0][0];
    const stateChangeNotifications: unknown[] = [];
    const subscription = stateApi.anyStateChange$.subscribe((value: unknown) => {
      stateChangeNotifications.push(value);
    });
    titleAnyStateChange$.next();
    expect(stateChangeNotifications).toEqual([undefined]);
    subscription.unsubscribe();

    expect(stateApi.getComparators()).toEqual(
      expect.objectContaining({
        title: 'referenceEquality',
        time_range: 'deepEquality',
        service_group_id: 'referenceEquality',
      })
    );

    stateApi.applySerializedState({
      time_range: { from: 'now-30m', to: 'now' },
      environment: 'qa',
      kuery: 'trace.id: 1',
      service_name: 'service-b',
      service_group_id: 'group-b',
      title: 'Reset title',
    });
    expect(timeRangeReinitialize).toHaveBeenCalledWith({
      time_range: { from: 'now-30m', to: 'now' },
    });
    expect(customStateReinitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'qa',
        kuery: 'trace.id: 1',
        service_name: 'service-b',
        service_group_id: 'group-b',
      })
    );
  });

  it('defaults to now-15m when initialState has undefined time range', async () => {
    mockUseBatchedPublishingSubjects.mockReturnValue([
      ENVIRONMENT_ALL.value,
      undefined,
      undefined,
      undefined,
    ]);

    const finalizeApi = jest.fn((api) => api);
    const parentApi = {
      query$: new BehaviorSubject({ query: '' }),
    };
    const factory = getServiceMapEmbeddableFactory({ coreStart: {} } as unknown as EmbeddableDeps);
    const embeddable = await factory.buildEmbeddable({
      initialState: {
        time_range: undefined,
      },
      finalizeApi,
      uuid: 'panel-3',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    expect(embeddable.api.timeRange$.getValue()).toEqual({
      from: 'now-15m',
      to: 'now',
    });
    const stateApi = mockInitializeStateApi.mock.calls[0][0];
    expect(stateApi.serializeState().time_range).toEqual({ from: 'now-15m', to: 'now' });
  });

  it('exposes setTimeRange to update time range', async () => {
    const setTimeRangeMock = jest.fn();
    const timeRange$ = new BehaviorSubject<{ from: string; to: string } | undefined>({
      from: 'now-15m',
      to: 'now',
    });
    mockInitializeTimeRangeManager.mockReturnValue({
      api: {
        timeRange$,
        setTimeRange: setTimeRangeMock,
      },
      getLatestState: jest.fn(() => ({ time_range: timeRange$.getValue() })),
      anyStateChange$: timeRangeAnyStateChange$,
      reinitializeState: jest.fn(),
    });

    const finalizeApi = jest.fn((api) => api);
    const parentApi = {
      query$: new BehaviorSubject({ query: '' }),
    };
    const factory = getServiceMapEmbeddableFactory({ coreStart: {} } as unknown as EmbeddableDeps);

    const embeddable = await factory.buildEmbeddable({
      initialState: {},
      finalizeApi,
      uuid: 'panel-4',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    // New panel defaults to custom time range
    expect(embeddable.api.timeRange$.getValue()).toEqual({
      from: 'now-15m',
      to: 'now',
    });

    // Update to new time range
    embeddable.api.setTimeRange({ from: 'now-1h', to: 'now' });
    expect(setTimeRangeMock).toHaveBeenCalledWith({ from: 'now-1h', to: 'now' });

    // setTimeRange(undefined) disables custom time range (inherits from parent)
    embeddable.api.setTimeRange(undefined);
    expect(setTimeRangeMock).toHaveBeenCalledWith(undefined);
  });

  it('waits (renders a spinner) instead of querying a guessed window when fetch context has no time range', async () => {
    mockUseFetchContext.mockReturnValue({ timeRange: undefined });
    mockUseBatchedPublishingSubjects.mockReturnValue([
      ENVIRONMENT_ALL.value,
      undefined,
      undefined,
      undefined,
    ]);

    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: '' }) };
    const deps = { coreStart: {} } as unknown as EmbeddableDeps;
    const factory = getServiceMapEmbeddableFactory(deps);
    const embeddable = await factory.buildEmbeddable({
      initialState: {},
      finalizeApi,
      uuid: 'panel-5',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    const { container } = render(<embeddable.Component />);

    // Don't render the map (which would query a guessed time window) — show a wait state instead.
    expect(mockServiceMapEmbeddable).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-test-subj="apmServiceMapEmbeddableWaitingForTimeRange"]')
    ).not.toBeNull();
  });

  describe('filter notification api', () => {
    async function buildEmbeddableWithApi(initialState = {}) {
      const finalizeApi = jest.fn((api) => api);
      const parentApi = { query$: new BehaviorSubject({ query: '' }) };
      const factory = getServiceMapEmbeddableFactory({
        coreStart: {},
      } as unknown as EmbeddableDeps);

      const embeddable = await factory.buildEmbeddable({
        initialState,
        finalizeApi,
        uuid: 'panel-1',
        parentApi,
        initializeDrilldownsManager: jest.fn(),
      } as never);

      return embeddable.api as ServiceMapEmbeddableApi;
    }

    it('exposes query$ with panel kuery', async () => {
      const api = await buildEmbeddableWithApi({ kuery: 'service.name: my-service' });

      expect(api.query$).toBeDefined();
      expect(api.query$.getValue()).toEqual({
        query: 'service.name: my-service',
        language: 'kuery',
      });
    });

    it('exposes empty query$ when no kuery is set', async () => {
      const api = await buildEmbeddableWithApi({});

      expect(api.query$.getValue()).toBeUndefined();
    });

    it('exposes filters$ with service name filter', async () => {
      const api = await buildEmbeddableWithApi({ service_name: 'checkout-service' });

      expect(api.filters$).toBeDefined();
      const filters = api.filters$.getValue();
      expect(filters).toHaveLength(1);
      expect(filters![0]).toMatchObject({
        meta: { key: 'service.name', type: 'phrase' },
        query: { match_phrase: { 'service.name': 'checkout-service' } },
      });
    });

    it('exposes filters$ with environment filter when not default', async () => {
      const api = await buildEmbeddableWithApi({ environment: 'production' });

      const filters = api.filters$.getValue();
      expect(filters).toHaveLength(1);
      expect(filters![0]).toMatchObject({
        meta: { key: 'service.environment', type: 'phrase' },
        query: { match_phrase: { 'service.environment': 'production' } },
      });
    });

    it('excludes environment filter for ENVIRONMENT_ALL', async () => {
      const api = await buildEmbeddableWithApi({ environment: ENVIRONMENT_ALL.value });

      const filters = api.filters$.getValue();
      expect(filters).toHaveLength(0);
    });

    it('handles ENVIRONMENT_NOT_DEFINED with missing field filter', async () => {
      const api = await buildEmbeddableWithApi({ environment: ENVIRONMENT_NOT_DEFINED.value });

      const filters = api.filters$.getValue();
      expect(filters).toHaveLength(1);
      expect(filters![0]).toMatchObject({
        meta: { key: 'service.environment', type: 'exists', negate: true },
        query: { exists: { field: 'service.environment' } },
      });
    });

    it('combines service name and environment filters', async () => {
      const api = await buildEmbeddableWithApi({
        service_name: 'api-gateway',
        environment: 'staging',
      });

      const filters = api.filters$.getValue();
      expect(filters).toHaveLength(2);
    });

    it('exposes empty filters$ when no filters are configured', async () => {
      const api = await buildEmbeddableWithApi({});

      expect(api.filters$.getValue()).toHaveLength(0);
    });
  });

  describe('showEmbeddedControls', () => {
    function buildWithExpandableParent(uuid: string, viewMode: 'view' | 'edit' = 'view') {
      const expandedPanelId$ = new BehaviorSubject<string | undefined>(undefined);
      const viewMode$ = new BehaviorSubject<string>(viewMode);
      const parentApi = {
        query$: new BehaviorSubject({ query: '' }),
        expandPanel: jest.fn(),
        expandedPanelId$,
        viewMode$,
      };
      const finalizeApi = jest.fn((apiRegistration: Record<string, unknown>) => ({
        ...apiRegistration,
        parentApi,
      }));
      const factory = getServiceMapEmbeddableFactory({
        coreStart: {},
      } as unknown as EmbeddableDeps);

      return { expandedPanelId$, factory, finalizeApi, parentApi, uuid };
    }

    it('is false when the panel is not expanded', async () => {
      const uuid = 'panel-not-expanded';
      const {
        expandedPanelId$: _,
        factory,
        finalizeApi,
        parentApi,
      } = buildWithExpandableParent(uuid);

      const embeddable = await factory.buildEmbeddable({
        initialState: {},
        finalizeApi,
        uuid,
        parentApi,
        initializeDrilldownsManager: jest.fn(),
      } as never);

      render(<embeddable.Component />);

      expect(mockServiceMapEmbeddable).toHaveBeenCalledWith(
        expect.objectContaining({ showEmbeddedControls: false })
      );
    });

    it('becomes true when expandedPanelId$ emits this panel uuid in view mode', async () => {
      const uuid = 'panel-maximize-view';
      const { expandedPanelId$, factory, finalizeApi, parentApi } = buildWithExpandableParent(
        uuid,
        'view'
      );

      const embeddable = await factory.buildEmbeddable({
        initialState: {},
        finalizeApi,
        uuid,
        parentApi,
        initializeDrilldownsManager: jest.fn(),
      } as never);

      render(<embeddable.Component />);

      act(() => {
        expandedPanelId$.next(uuid);
      });

      expect(mockServiceMapEmbeddable).toHaveBeenLastCalledWith(
        expect.objectContaining({ showEmbeddedControls: true })
      );
    });

    it('stays false when panel is expanded but dashboard is in edit mode', async () => {
      const uuid = 'panel-maximize-edit';
      const { expandedPanelId$, factory, finalizeApi, parentApi } = buildWithExpandableParent(
        uuid,
        'edit'
      );

      const embeddable = await factory.buildEmbeddable({
        initialState: {},
        finalizeApi,
        uuid,
        parentApi,
        initializeDrilldownsManager: jest.fn(),
      } as never);

      render(<embeddable.Component />);

      act(() => {
        expandedPanelId$.next(uuid);
      });

      expect(mockServiceMapEmbeddable).toHaveBeenLastCalledWith(
        expect.objectContaining({ showEmbeddedControls: false })
      );
    });

    it('resets to false when panel collapses again', async () => {
      const uuid = 'panel-collapse';
      const { expandedPanelId$, factory, finalizeApi, parentApi } = buildWithExpandableParent(
        uuid,
        'view'
      );

      const embeddable = await factory.buildEmbeddable({
        initialState: {},
        finalizeApi,
        uuid,
        parentApi,
        initializeDrilldownsManager: jest.fn(),
      } as never);

      render(<embeddable.Component />);

      act(() => {
        expandedPanelId$.next(uuid);
      });

      expect(mockServiceMapEmbeddable).toHaveBeenLastCalledWith(
        expect.objectContaining({ showEmbeddedControls: true })
      );

      act(() => {
        expandedPanelId$.next(undefined);
      });

      expect(mockServiceMapEmbeddable).toHaveBeenLastCalledWith(
        expect.objectContaining({ showEmbeddedControls: false })
      );
    });
  });

  it('cleans up subscriptions on unmount', async () => {
    const finalizeApi = jest.fn((api) => api);
    const parentApi = { query$: new BehaviorSubject({ query: '' }) };
    const deps = { coreStart: {} } as unknown as EmbeddableDeps;
    const factory = getServiceMapEmbeddableFactory(deps);
    const embeddable = await factory.buildEmbeddable({
      initialState: { service_name: 'test-service', environment: 'production', kuery: 'test' },
      finalizeApi,
      uuid: 'panel-cleanup',
      parentApi,
      initializeDrilldownsManager: jest.fn(),
    } as never);

    const { unmount } = render(<embeddable.Component />);

    expect(mockServiceMapEmbeddable).toHaveBeenCalled();

    expect(() => unmount()).not.toThrow();
  });
});
