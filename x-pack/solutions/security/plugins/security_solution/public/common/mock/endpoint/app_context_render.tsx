/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactPortal } from 'react';
import React from 'react';
import type { MemoryHistory } from 'history';
import { createMemoryHistory } from 'history';
import type {
  RenderOptions,
  RenderResult,
  RenderHookResult,
  RenderHookOptions,
} from '@testing-library/react';
import {
  render as reactRender,
  waitFor,
  renderHook as reactRenderHook,
} from '@testing-library/react';
import type { Action, Reducer, Store } from 'redux';
import { QueryClient } from '@kbn/react-query';
import { coreMock } from '@kbn/core/public/mocks';
import { INTEGRATIONS_PLUGIN_ID, PLUGIN_ID } from '@kbn/fleet-plugin/common';
import type { UseBaseQueryResult } from '@kbn/react-query';
import ReactDOM from 'react-dom';
import type { DeepReadonly } from 'utility-types';
import { spacesPluginMock } from '@kbn/spaces-plugin/public/mocks';
import type { UserPrivilegesState } from '../../components/user_privileges/user_privileges_context';
import { getUserPrivilegesMockDefaultValue } from '../../components/user_privileges/__mocks__';
import type { AppLinkItems } from '../../links/types';
import { ExperimentalFeaturesService } from '../../experimental_features_service';
import { applyIntersectionObserverMock } from '../intersection_observer_mock';
import type { StartPlugins, StartServices } from '../../../types';
import { depsStartMock } from './dependencies_start_mock';
import type { MiddlewareActionSpyHelper } from '../../store/test_utils';
import { createSpyMiddleware } from '../../store/test_utils';
import type { State } from '../../store';
import { AppRootProvider } from './app_root_provider';
import { resetConsoleManagerStateForTesting } from '../../../management/components/console/components/console_manager/console_manager';
import { managementMiddlewareFactory } from '../../../management/store/middleware';
import { createStartServicesMock } from '../../lib/kibana/kibana_react.mock';
import { SUB_PLUGINS_REDUCER, mockGlobalState, createMockStore } from '..';
import type { ExperimentalFeatures } from '../../../../common/experimental_features';
import { APP_UI_ID, APP_PATH } from '../../../../common/constants';
import { KibanaServices } from '../../lib/kibana';
import { appLinks } from '../../../app/links';
import { fleetGetPackageHttpMock } from '../../../management/mocks';
import { allowedExperimentalValues } from '../../../../common/experimental_features';
import type { EndpointPrivileges } from '../../../../common/endpoint/types';

const REAL_REACT_DOM_CREATE_PORTAL = ReactDOM.createPortal;

/**
 * Resets the mock that is applied to `createPortal()` by default.
 * **IMPORTANT** : Make sure you call this function from a `before*()` or `after*()` callback
 *
 * @example
 *
 * // Turn off for test using Enzyme
 * beforeAll(() => resetReactDomCreatePortalMock());
 */
export const resetReactDomCreatePortalMock = () => {
  ReactDOM.createPortal = REAL_REACT_DOM_CREATE_PORTAL;
};

beforeAll(() => {
  // Mocks the React DOM module to ensure compatibility with react-testing-library and avoid
  // error like:
  // ```
  // TypeError: parentInstance.children.indexOf is not a function
  //       at appendChild (node_modules/react-test-renderer/cjs/react-test-renderer.development.js:7183:39)
  // ```
  // @see https://github.com/facebook/react/issues/11565
  ReactDOM.createPortal = jest.fn((...args) => {
    REAL_REACT_DOM_CREATE_PORTAL(...args);
    // Needed for react-Test-library. See:
    // https://github.com/facebook/react/issues/11565
    return args[0] as ReactPortal;
  });
});

afterAll(() => {
  resetReactDomCreatePortalMock();
});

export type UiRender = (ui: React.ReactElement, options?: RenderOptions) => RenderResult;

/**
 * Have the renderer wait for one of the ReactQuery state flag properties. Default is `isSuccess`.
 * To disable this `await`, the value `false` can be used.
 */
export type WaitForReactHookState =
  | keyof Pick<
      UseBaseQueryResult,
      | 'isSuccess'
      | 'isLoading'
      | 'isError'
      | 'isLoadingError'
      | 'isStale'
      | 'isFetched'
      | 'isFetching'
      | 'isRefetching'
    >
  | false;

type HookRendererFunction<TResult, TProps> = (props: TProps) => TResult;

/**
 * A utility renderer for hooks that return React Query results
 */
export type ReactQueryHookRenderer<
  TProps = unknown,
  TResult extends UseBaseQueryResult = UseBaseQueryResult
> = (
  hookFn: HookRendererFunction<TResult, TProps>,
  /**
   * If defined (default is `isSuccess`), the renderer will wait for the given react
   * query response state value to be true
   */
  waitForHook?: WaitForReactHookState,
  options?: RenderHookOptions<TProps>,
  timeout?: number
) => Promise<TResult>;

export interface UserPrivilegesMockSetter {
  set: (privileges: Partial<EndpointPrivileges>) => void;
  reset: () => void;
}

/**
 * Mocked app root context renderer
 */
export interface AppContextTestRender {
  store: Store<State>;
  history: ReturnType<typeof createMemoryHistory>;
  coreStart: ReturnType<typeof coreMock.createStart>;
  depsStart: Pick<StartPlugins, 'data' | 'fleet' | 'unifiedSearch' | 'spaces'>;
  startServices: StartServices;
  middlewareSpy: MiddlewareActionSpyHelper;
  /**
   * A wrapper around `AppRootContext` component. Uses the mocked modules as input to the
   * `AppRootContext`
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AppWrapper: React.FC<any>;
  /**
   * Renders the given UI within the created `AppWrapper` providing the given UI a mocked
   * endpoint runtime context environment
   */
  render: UiRender;

  /**
   * Renders a hook within a mocked security solution app context
   */
  renderHook: <TResult, TProps>(
    hookFn: HookRendererFunction<TResult, TProps>,
    options?: RenderHookOptions<TProps>
  ) => RenderHookResult<TResult, TProps>;

  /**
   * Waits the return value of the callback provided to is truthy
   */
  waitFor: typeof waitFor;

  /**
   * A helper utility for rendering specifically hooks that wrap ReactQuery
   */
  renderReactQueryHook: ReactQueryHookRenderer;

  /**
   * Set technical preview features on/off. Calling this method updates the Store with the new values
   * for the given feature flags
   * @param flags
   */
  setExperimentalFlag: (flags: Partial<ExperimentalFeatures>) => void;

  /**
   * A helper method that will return an interface to more easily manipulate Endpoint related user authz.
   * Works in conjunction with `jest.mock()` at the test level.
   * @param useUserPrivilegesHookMock
   *
   * @example
   *
   * // in your test
   * import { useUserPrivileges as _useUserPrivileges } from 'path/to/user_privileges'
   *
   * jest.mock('path/to/user_privileges');
   *
   * const useUserPrivilegesMock = _useUserPrivileges as jest.Mock;
   *
   * // If you test - or more likely, in the `beforeEach` and `afterEach`
   * let authMockSetter: UserPrivilegesMockSetter;
   *
   * beforeEach(() => {
   *   const appTestSetup = createAppRootMockRenderer();
   *
   *   authMockSetter = appTestSetup.getUserPrivilegesMockSetter(useUserPrivilegesMock);
   * })
   *
   * afterEach(() => {
   *   authMockSetter.reset();
   * }
   *
   * // Manipulate the authz in your test
   * it('does something', () => {
   *   authMockSetter({ canReadPolicyManagement: false });
   * });
   */
  getUserPrivilegesMockSetter: (
    useUserPrivilegesHookMock: jest.MockedFn<() => DeepReadonly<UserPrivilegesState>>
  ) => UserPrivilegesMockSetter;

  /**
   * The React Query client (setup to support jest testing)
   */
  queryClient: QueryClient;
}

// Defined a private custom reducer that reacts to an action that enables us to update the
// store with new values for technical preview features/flags. Because the `action.type` is a `Symbol`,
// and its not exported the action can only be `dispatch`'d from this module
const UpdateExperimentalFeaturesTestActionType = Symbol('updateExperimentalFeaturesTestAction');

type UpdateExperimentalFeaturesTestAction = Action<
  typeof UpdateExperimentalFeaturesTestActionType
> & {
  payload: Partial<ExperimentalFeatures>;
};

const experimentalFeaturesReducer: Reducer<State['app'], UpdateExperimentalFeaturesTestAction> = (
  state = mockGlobalState.app,
  action
) => {
  if (action.type === UpdateExperimentalFeaturesTestActionType) {
    return {
      ...state,
      enableExperimental: {
        ...state.enableExperimental,
        ...action.payload,
      },
    };
  }
  return state;
};

/**
 * Creates a mocked endpoint app context custom renderer that can be used to render
 * component that depend upon the application's surrounding context providers.
 * Factory also returns the content that was used to create the custom renderer, allowing
 * for further customization.
 */
export const createAppRootMockRenderer = (): AppContextTestRender => {
  // The console manager keeps its running consoles in a module-level store that intentionally
  // outlives `<ConsoleManager>` unmounts (so console state survives navigation/flyouts in the app).
  // Reset it per renderer creation so console state does not leak between test cases.
  resetConsoleManagerStateForTesting();

  const history = createMemoryHistory<never>();
  const coreStart = createCoreStartMock(history);
  const middlewareSpy = createSpyMiddleware();
  const startServices: StartServices = createStartServicesMock(coreStart);
  const depsStart: AppContextTestRender['depsStart'] = {
    ...depsStartMock(),
    spaces: spacesPluginMock.createStartContract(),
  };

  (depsStart.spaces.getActiveSpace as jest.Mock).mockImplementation(async () => {
    return {
      id: 'default',
      name: 'default',
      disabledFeatures: [],
    };
  });

  const storeReducer = {
    ...SUB_PLUGINS_REDUCER,
    // This is ok here because the store created by this testing utility (see below) does
    // not pull in the non-sub-plugin reducers
    app: experimentalFeaturesReducer,
  };

  const store = createMockStore(undefined, storeReducer, undefined, undefined, [
    ...managementMiddlewareFactory(coreStart, depsStart),
    middlewareSpy.actionSpyMiddleware,
  ]);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // turns retries off
        retry: false,
        // prevent jest did not exit errors
        cacheTime: Infinity,
      },
    },
    // hide react-query output in console
    logger: {
      error: () => {},

      // eslint-disable-next-line no-console
      log: console.log,

      // eslint-disable-next-line no-console
      warn: console.warn,
    },
  });

  const AppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppRootProvider
      store={store}
      history={history}
      coreStart={coreStart}
      depsStart={depsStart}
      startServices={startServices}
      queryClient={queryClient}
    >
      {children}
    </AppRootProvider>
  );

  const render: UiRender = (ui, options) => {
    applyIntersectionObserverMock();

    return reactRender(ui, {
      wrapper: AppWrapper,
      ...options,
    });
  };

  const renderHook = <TResult, TProps>(
    hookFn: HookRendererFunction<TResult, TProps>,
    options: RenderHookOptions<TProps> = {}
  ) => {
    return reactRenderHook<TResult, TProps>(hookFn, {
      wrapper: AppWrapper as React.FC<React.PropsWithChildren>,
      ...options,
    });
  };

  const renderReactQueryHook: ReactQueryHookRenderer = async <
    TProps,
    TResult extends UseBaseQueryResult = UseBaseQueryResult
  >(
    hookFn: HookRendererFunction<TResult, TProps>,
    /**
     * If defined (default is `isSuccess`), the renderer will wait for the given react query to be truthy
     */
    waitForHook: WaitForReactHookState = 'isSuccess',
    options: RenderHookOptions<TProps> = {},
    timeout = 1000
  ) => {
    const { result: hookResult } = renderHook<TResult, TProps>(hookFn, options);

    if (waitForHook) {
      await waitFor(() => expect(hookResult.current[waitForHook]).toBe(true), { timeout });
    }

    return hookResult.current;
  };

  ExperimentalFeaturesService.init({ experimentalFeatures: allowedExperimentalValues });

  const setExperimentalFlag: AppContextTestRender['setExperimentalFlag'] = (flags) => {
    ExperimentalFeaturesService.init({
      experimentalFeatures: {
        ...allowedExperimentalValues,
        ...flags,
      },
    });

    store.dispatch({
      type: UpdateExperimentalFeaturesTestActionType,
      payload: flags,
    });
  };

  const getUserPrivilegesMockSetter: AppContextTestRender['getUserPrivilegesMockSetter'] = (
    useUserPrivilegesHookMock
  ) => {
    return {
      set: (authOverrides) => {
        const newAuthz = getUserPrivilegesMockDefaultValue();

        Object.assign(newAuthz.endpointPrivileges, authOverrides);
        useUserPrivilegesHookMock.mockReturnValue(newAuthz);
      },
      reset: () => {
        useUserPrivilegesHookMock.mockReset();
        useUserPrivilegesHookMock.mockReturnValue(getUserPrivilegesMockDefaultValue());
      },
    };
  };

  // Initialize the singleton `KibanaServices` with global services created for this test instance.
  // The module (`../../lib/kibana`) could have been mocked at the test level via `jest.mock()`,
  // and if so, then we set the return value of `KibanaServices.get` instead of calling `KibanaServices.init()`
  const globalKibanaServicesParams = {
    ...startServices,
    kibanaVersion: '8.0.0',
    kibanaBranch: 'main',
    buildFlavor: 'traditional',
  };

  if (jest.isMockFunction(KibanaServices.get)) {
    (KibanaServices.get as jest.Mock).mockReturnValue(globalKibanaServicesParams);
  } else {
    KibanaServices.init(globalKibanaServicesParams);
  }

  // Some APIs need to be mocked right from the start because they are called as soon as the store is initialized
  applyDefaultCoreHttpMocks(coreStart.http);

  return {
    store,
    history,
    coreStart,
    depsStart,
    startServices,
    middlewareSpy,
    AppWrapper,
    render,
    renderHook,
    renderReactQueryHook,
    setExperimentalFlag,
    getUserPrivilegesMockSetter,
    queryClient,
    waitFor,
  };
};

const createCoreStartMock = (
  history: MemoryHistory<never>
): ReturnType<typeof coreMock.createStart> => {
  const coreStart = coreMock.createStart({ basePath: '/mock' });

  const linkPaths = getLinksPaths(appLinks);

  // Mock certain APP Ids returned by `application.getUrlForApp()`
  coreStart.application.getUrlForApp.mockImplementation((appId, { deepLinkId, path = '' } = {}) => {
    let appUrl: string = '';

    switch (appId) {
      case PLUGIN_ID:
        appUrl = '/app/fleet';
        break;
      case INTEGRATIONS_PLUGIN_ID:
        appUrl = '/app/integrations';
        break;

      case APP_UI_ID:
        appUrl = `${APP_PATH}${deepLinkId && linkPaths[deepLinkId] ? linkPaths[deepLinkId] : ''}`;
        break;

      default:
        appUrl = `app-id-${appId}-not-mocked!`;
        break;
    }

    return `${appUrl}${path}`;
  });

  coreStart.application.navigateToApp.mockImplementation((appId, { deepLinkId, path } = {}) => {
    if (appId === APP_UI_ID) {
      history.push(
        `${deepLinkId && linkPaths[deepLinkId] ? linkPaths[deepLinkId] : ''}${path ?? ''}`
      );
    }
    return Promise.resolve();
  });

  coreStart.application.navigateToUrl.mockImplementation((url) => {
    history.push(url.replace(APP_PATH, ''));
    return Promise.resolve();
  });

  return coreStart;
};

const getLinksPaths = (links: AppLinkItems): Record<string, string> => {
  return links.reduce((result: Record<string, string>, link) => {
    if (link.path) {
      result[link.id] = link.path;
    }
    if (link.links) {
      return { ...result, ...getLinksPaths(link.links) };
    }
    return result;
  }, {});
};

const applyDefaultCoreHttpMocks = (http: AppContextTestRender['coreStart']['http']) => {
  // Need to mock getting the endpoint package from the fleet API because it is used as soon
  // as the store middleware for Endpoint list is initialized, thus mocking it here would avoid
  // unnecessary errors being output to the console
  fleetGetPackageHttpMock(http, { ignoreUnMockedApiRouteErrors: true });
};
