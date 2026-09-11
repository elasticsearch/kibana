/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { DashboardStart } from './plugin';
import { getDashboardApi } from './dashboard_api/get_dashboard_api';
import { deserializeLayout } from './dashboard_api/layout_manager/deserialize_layout';
import type { DashboardReadResponseBody } from '../server';
import { DEFAULT_DASHBOARD_STATE } from '../common/default_dashboard_state';
import type { DashboardApi, DashboardInternalApi } from './dashboard_api/types';
import { DashboardContext } from './dashboard_api/use_dashboard_api';
import { DashboardInternalContext } from './dashboard_api/use_dashboard_internal_api';

export type Start = jest.Mocked<DashboardStart>;

const createStartContract = (): DashboardStart => {
  // @ts-ignore
  const startContract: DashboardStart = {};

  return startContract;
};

export const dashboardPluginMock = {
  createStartContract,
};

/**
 * Utility function that mocks the `IntersectionObserver` API. Necessary for components that rely
 * on it, otherwise the tests will crash. Recommended to execute inside `beforeEach`.
 *
 * @param intersectionObserverMock - Parameter that is sent to the `Object.defineProperty`
 * overwrite method. `jest.fn()` mock functions can be passed here if the goal is to not only
 * mock the intersection observer, but its methods.
 */
export function setupIntersectionObserverMock({
  root = null,
  rootMargin = '',
  thresholds = [],
  disconnect = () => null,
  observe = () => null,
  takeRecords = () => [],
  unobserve = () => null,
} = {}): void {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | null = root;
    readonly rootMargin: string = rootMargin;
    readonly thresholds: readonly number[] = thresholds;
    readonly scrollMargin: string = '';
    disconnect: () => void = disconnect;
    observe: (target: Element) => void = observe;
    takeRecords: () => IntersectionObserverEntry[] = takeRecords;
    unobserve: (target: Element) => void = unobserve;
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });

  Object.defineProperty(global, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
}

export function buildMockDashboardApi({
  overrides,
  savedObjectId,
}: {
  overrides?: Partial<DashboardState>;
  savedObjectId?: string;
} = {}) {
  const initialState = getSampleDashboardState(overrides);
  const results = getDashboardApi({
    initialState,
    incomingEmbeddables: undefined,
    savedObjectId,
    readResult: savedObjectId
      ? ({
          id: savedObjectId,
          data: initialState,
          meta: {
            managed: false,
          },
        } as unknown as DashboardReadResponseBody)
      : undefined,
  });
  return results;
}

/**
 * Creates a React wrapper component that provides both `DashboardContext` and
 * `DashboardInternalContext` for use with `renderHook` or `render` in tests.
 *
 * Builds a mock dashboard API from the given initial state and saved object ID,
 * then optionally merges in shallow overrides for either the public API or the
 * internal API before handing the contexts to the wrapped children.
 *
 * @param initialStateOverrides - Partial dashboard state merged on top of the default state.
 * @param savedObjectId - Optional saved object ID; when provided the mock API is initialized as a saved dashboard.
 * @param apiOverrides - Shallow overrides applied on top of the mock `DashboardApi`.
 * @param internalApiOverrides - Shallow overrides applied on top of the mock `DashboardInternalApi`.
 * @returns A React wrapper component suitable for passing to `renderHook({ wrapper })`.
 */
export function dashboardContextWrapper({
  initialStateOverrides,
  savedObjectId,
  apiOverrides,
  internalApiOverrides,
}: {
  initialStateOverrides?: Partial<DashboardState>;
  savedObjectId?: string;
  apiOverrides?: Partial<DashboardApi>;
  internalApiOverrides?: Partial<DashboardInternalApi>;
}) {
  const { api, internalApi } = buildMockDashboardApi({
    overrides: initialStateOverrides,
    savedObjectId,
  });

  return ({ children }: { children: React.ReactNode }) => (
    <I18nProvider>
      <DashboardContext.Provider
        value={{
          ...api,
          ...(apiOverrides ?? {}),
        }}
      >
        <DashboardInternalContext.Provider
          value={{
            ...internalApi,
            ...(internalApiOverrides ?? {}),
          }}
        >
          {children}
        </DashboardInternalContext.Provider>
      </DashboardContext.Provider>
    </I18nProvider>
  );
}

export function getSampleDashboardState(overrides?: Partial<DashboardState>): DashboardState {
  return {
    ...DEFAULT_DASHBOARD_STATE,
    tags: [],
    filters: [],
    title: 'My Dashboard',
    query: {
      language: 'kql',
      expression: 'hi',
    },
    time_range: {
      to: 'now',
      from: 'now-15m',
    },
    ...overrides,
  };
}

export function getMockPanels() {
  return [
    {
      grid: { x: 0, y: 0, w: 6, h: 6 },
      config: { title: 'panel One' },
      id: '1',
      type: 'testPanelType',
    },
    {
      grid: { x: 6, y: 0, w: 6, h: 6 },
      config: { title: 'panel Two' },
      id: '2',
      type: 'testPanelType',
    },
  ];
}

export function getMockPanelsWithSections() {
  return [
    ...getMockPanels(),
    {
      title: 'Section One',
      collapsed: true,
      grid: {
        y: 6,
      },
      id: 'section1',
      panels: [
        {
          grid: { x: 0, y: 0, w: 6, h: 6 },
          config: { title: 'panel Three' },
          id: '3',
          type: 'testPanelType',
        },
      ],
    },
    {
      title: 'Section Two',
      collapsed: false,
      grid: {
        y: 7,
      },
      id: 'section2',
      panels: [
        {
          grid: { x: 0, y: 0, w: 6, h: 6 },
          config: { title: 'panel Four' },
          id: '4',
          type: 'testPanelType',
        },
      ],
    },
  ];
}

export function getMockLayout() {
  return deserializeLayout(getMockPanels(), []).layout;
}

export function getMockLayoutWithSections() {
  return deserializeLayout(getMockPanelsWithSections(), []).layout;
}
