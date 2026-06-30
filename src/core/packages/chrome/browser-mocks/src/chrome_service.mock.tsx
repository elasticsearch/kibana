/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject, of } from 'rxjs';
import type { Observable } from 'rxjs';
import type { MountPoint } from '@kbn/core-mount-utils-browser';
import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';
import type { ReactNode } from 'react';
import type {
  AppHeaderConfig,
  ChromeBadge,
  ChromeBreadcrumb,
  GlobalSearchConfig,
} from '@kbn/core-chrome-browser';
import type {
  InternalChromeSetup,
  InternalChromeStart,
} from '@kbn/core-chrome-browser-internal-types';
import { lazyObject } from '@kbn/lazy-object';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { SidebarServiceProvider } from '@kbn/core-chrome-sidebar-context';
import { sidebarServiceMock } from '@kbn/core-chrome-sidebar-mocks';

const createSetupContractMock = (): DeeplyMockedKeys<InternalChromeSetup> => {
  return lazyObject({
    sidebar: lazyObject(sidebarServiceMock.createSetupContract()),
  });
};

const createStartContractMock = () => {
  const nextGlobalSearchState$ = new BehaviorSubject<GlobalSearchConfig | undefined>(undefined);
  const nextUserMenuState$ = new BehaviorSubject<ReactNode>(null);
  const nextContextSwitcherState$ = new BehaviorSubject<ReactNode>(null);
  const nextAppHeaderState$ = new BehaviorSubject<AppHeaderConfig | undefined>(undefined);
  const inlineAppHeaderState$ = new BehaviorSubject(false);
  let appHeaderRegistrationId = 0;

  const sidebar = sidebarServiceMock.createStartContract();

  const startContract: DeeplyMockedKeys<InternalChromeStart> = lazyObject({
    // Mirror the real `withProvider` (see browser-internal `createChromeApi`) so components that read
    // chrome via context render in tests just like in production, without per-test wrapping.
    withProvider: jest.fn((children: ReactNode) => (
      <ChromeServiceProvider value={{ chrome: startContract }}>
        <SidebarServiceProvider value={{ sidebar }}>{children}</SidebarServiceProvider>
      </ChromeServiceProvider>
    )),
    componentDeps: lazyObject({
      basePath: lazyObject({
        get: jest.fn().mockReturnValue(''),
        prepend: jest.fn((path: string) => path),
        remove: jest.fn(),
        serverBasePath: '/',
        assetsHrefBase: '/',
      }),
      legacyActionMenu$: new BehaviorSubject<MountPoint | undefined>(
        undefined
      ) as unknown as DeeplyMockedKeys<Observable<MountPoint | undefined>>,
    }),
    sidebar: lazyObject(sidebar),
    navLinks: lazyObject({
      getNavLinks$: jest.fn().mockReturnValue(new BehaviorSubject([])),
      has: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn().mockReturnValue([]),
    }),
    recentlyAccessed: lazyObject({
      add: jest.fn(),
      get: jest.fn(),
      get$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    }),
    docTitle: lazyObject({
      change: jest.fn(),
      reset: jest.fn(),
    }),
    navControls: lazyObject({
      registerLeft: jest.fn(),
      registerCenter: jest.fn(),
      registerRight: jest.fn(),
      getLeft$: jest.fn().mockReturnValue(new BehaviorSubject([])),
      getCenter$: jest.fn().mockReturnValue(new BehaviorSubject([])),
      getRight$: jest.fn().mockReturnValue(new BehaviorSubject([])),
      setHelpMenuLinks: jest.fn(),
      getHelpMenuLinks$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    }),
    setIsVisible: jest.fn(),
    getIsVisible$: jest.fn().mockReturnValue(new BehaviorSubject(false)),
    getBadge$: jest.fn().mockReturnValue(new BehaviorSubject<ChromeBadge | undefined>(undefined)),
    setBadge: jest.fn(),
    getBreadcrumbs$: jest.fn().mockReturnValue(new BehaviorSubject([{} as ChromeBreadcrumb])),
    getBreadcrumbs: jest.fn().mockReturnValue([]),
    setBreadcrumbs: jest.fn(),
    sideNav: lazyObject({
      getIsCollapsed$: jest.fn().mockReturnValue(new BehaviorSubject(false)),
      getIsCollapsed: jest.fn().mockReturnValue(false),
      setIsCollapsed: jest.fn(),
      getWidth: jest.fn().mockReturnValue(0),
      getWidth$: jest.fn().mockReturnValue(new BehaviorSubject(0)),
      setWidth: jest.fn(),
    }),
    getBreadcrumbsAppendExtensions$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    getBreadcrumbsAppendExtensionsWithBadges$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    getBreadcrumbsBadges$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    setBreadcrumbsAppendExtension: jest.fn(),
    getGlobalHelpExtensionMenuLinks$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    registerGlobalHelpExtensionMenuLink: jest.fn(),
    getHelpExtension$: jest.fn().mockReturnValue(new BehaviorSubject(undefined)),
    setHelpExtension: jest.fn(),
    getHelpMenuLinks$: jest.fn().mockReturnValue(new BehaviorSubject([])),
    setHelpMenuLinks: jest.fn(),
    setHelpSupportUrl: jest.fn(),
    getHelpSupportUrl$: jest.fn(() => of('https://www.elastic.co/support')),
    getCustomNavLink$: jest.fn().mockReturnValue(new BehaviorSubject(undefined)),
    setCustomNavLink: jest.fn(),
    setHeaderBanner: jest.fn(),
    getHeaderBanner$: jest.fn().mockReturnValue(new BehaviorSubject(undefined)),
    hasHeaderBanner$: jest.fn().mockReturnValue(new BehaviorSubject(false)),
    hasHeaderBanner: jest.fn().mockReturnValue(false),
    getChromeStyle$: jest.fn().mockReturnValue(new BehaviorSubject('classic')),
    getChromeStyle: jest.fn().mockReturnValue('classic'),
    setChromeStyle: jest.fn(),
    getActiveSolutionNavId$: jest.fn().mockReturnValue(new BehaviorSubject(null)),
    getActiveSolutionNavId: jest.fn().mockReturnValue(null),
    project: lazyObject({
      setCloudUrls: jest.fn(),
      setKibanaName: jest.fn(),
      initNavigation: jest.fn(),
      setBreadcrumbs: jest.fn(),
      getBreadcrumbs$: jest.fn().mockReturnValue(new BehaviorSubject([])),
      getNavigation$: jest.fn().mockReturnValue(new BehaviorSubject({} as any)),
      getProjectHome$: jest.fn().mockReturnValue(of('/')),
      setNavigationCustomization: jest.fn(),
      getCustomizeNavigationHandler$: jest.fn().mockReturnValue(new BehaviorSubject(null)),
      registerCustomizeNavigationHandler: jest.fn(),
    }),
    next: lazyObject({
      isEnabled: false,
      aiButton: lazyObject({
        get$: jest.fn().mockReturnValue(new BehaviorSubject([])),
        register: jest.fn().mockReturnValue(() => {}),
      }),
      globalSearch: lazyObject({
        set: jest.fn((config?: GlobalSearchConfig) => {
          nextGlobalSearchState$.next(config);
        }),
        get$: jest.fn().mockReturnValue(nextGlobalSearchState$),
      }),
      userMenu: lazyObject({
        get$: jest.fn().mockReturnValue(nextUserMenuState$),
        set: jest.fn((content?: ReactNode) => {
          nextUserMenuState$.next(content ?? null);
        }),
      }),
      contextSwitcher: lazyObject({
        get$: jest.fn().mockReturnValue(nextContextSwitcherState$),
        set: jest.fn((content?: ReactNode) => {
          nextContextSwitcherState$.next(content ?? null);
        }),
      }),
      inlineAppHeader: lazyObject({
        get$: jest.fn().mockReturnValue(inlineAppHeaderState$),
        set: jest.fn((value: boolean) => inlineAppHeaderState$.next(value)),
      }),
      appHeader: lazyObject({
        get$: jest.fn().mockReturnValue(nextAppHeaderState$),
        set: jest.fn((config: AppHeaderConfig) => {
          const registrationId = ++appHeaderRegistrationId;
          nextAppHeaderState$.next(config);
          return () => {
            if (registrationId === appHeaderRegistrationId) {
              nextAppHeaderState$.next(undefined);
            }
          };
        }),
      }),
      getFeedbackHandler$: jest.fn().mockReturnValue(new BehaviorSubject(undefined)),
      registerFeedbackHandler: jest.fn().mockReturnValue(() => {}),
      getNewsfeedHandler$: jest.fn().mockReturnValue(new BehaviorSubject(undefined)),
      registerNewsfeedHandler: jest.fn().mockReturnValue(() => {}),
    }),
    setGlobalFooter: jest.fn(),
    getGlobalFooter$: jest.fn().mockReturnValue(new BehaviorSubject(null)),
    getAppMenu$: jest.fn().mockReturnValue(new BehaviorSubject(undefined)),
    setAppMenu: jest.fn(),
    setBreadcrumbsBadges: jest.fn(),
  });

  return startContract;
};

export interface ChromeServiceContract {
  setup(): InternalChromeSetup;
  start(): Promise<InternalChromeStart>;
  stop(): void;
}
const createMock = () => {
  const mocked: jest.Mocked<ChromeServiceContract> = lazyObject({
    setup: jest.fn().mockReturnValue(createSetupContractMock()),
    start: jest.fn().mockResolvedValue(createStartContractMock()),
    stop: jest.fn(),
  });

  return mocked;
};

export const chromeServiceMock = {
  create: createMock,
  createSetupContract: createSetupContractMock,
  createStartContract: createStartContractMock,
};
