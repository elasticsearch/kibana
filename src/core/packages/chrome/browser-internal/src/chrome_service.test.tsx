/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { registerAnalyticsContextProviderMock } from './chrome_service.test.mocks';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import * as Rx from 'rxjs';
import { toArray, firstValueFrom } from 'rxjs';
import { injectedMetadataServiceMock } from '@kbn/core-injected-metadata-browser-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-browser-mocks';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { coreContextMock } from '@kbn/core-base-browser-mocks';
import type { App, PublicAppInfo } from '@kbn/core-application-browser';
import { applicationServiceMock } from '@kbn/core-application-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import { customBrandingServiceMock } from '@kbn/core-custom-branding-browser-mocks';
import { analyticsServiceMock } from '@kbn/core-analytics-browser-mocks';
import { i18nServiceMock } from '@kbn/core-i18n-browser-mocks';
import { themeServiceMock } from '@kbn/core-theme-browser-mocks';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import { getAppInfo } from '@kbn/core-application-browser-internal';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';

import {
  ChromeComponentsProvider,
  ChromelessHeader,
  ClassicHeader,
} from '@kbn/core-chrome-browser-components';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { CoreEnvContextProvider } from '@kbn/react-kibana-context-env';

import { ChromeService } from './chrome_service';
import { NavLinksService } from './services/nav_links';
import { ProjectNavigationService } from './services/project_navigation';

const mockhandleSystemColorModeChange = jest.fn();

jest.mock('./side_effects/handle_system_colormode_change', () => {
  return {
    handleSystemColorModeChange: (...args: any[]) => mockhandleSystemColorModeChange(...args),
  };
});

class FakeApp implements App {
  public title: string;
  public mount = () => () => {};

  constructor(public id: string, public chromeless?: boolean) {
    this.title = `${this.id} App`;
  }
}

const store = new Map();
const originalLocalStorage = window.localStorage;

Object.defineProperty(window, 'localStorage', {
  value: {
    setItem: (key: string, value: string) => store.set(String(key), String(value)),
    getItem: (key: string) => store.get(String(key)),
    removeItem: (key: string) => store.delete(String(key)),
  },
  writable: true,
});

function defaultStartDeps(availableApps?: App[], currentAppId?: string) {
  const notifications = notificationServiceMock.createStartContract();
  const deps = {
    i18n: i18nServiceMock.createStartContract(),
    theme: themeServiceMock.createStartContract(),
    userProfile: userProfileServiceMock.createStart(),
    application: applicationServiceMock.createInternalStartContract(currentAppId),
    docLinks: docLinksServiceMock.createStartContract(),
    http: httpServiceMock.createStartContract(),
    injectedMetadata: injectedMetadataServiceMock.createStartContract(),
    getNotifications: () => Promise.resolve(notifications),
    notifications, // Keep for test assertions
    uiSettings: uiSettingsServiceMock.createStartContract(),
    customBranding: customBrandingServiceMock.createStartContract(),
  };

  if (availableApps) {
    deps.application.applications$ = new Rx.BehaviorSubject<Map<string, PublicAppInfo>>(
      new Map(availableApps.map((app) => [app.id, getAppInfo(app) as PublicAppInfo]))
    );
  }

  return deps;
}

function defaultStartTestOptions({
  browserSupportsCsp = true,
  kibanaVersion = 'version',
}: {
  browserSupportsCsp?: boolean;
  kibanaVersion?: string;
}): any {
  return {
    browserSupportsCsp,
    kibanaVersion,
    coreContext: coreContextMock.create(),
  };
}

async function start({
  options = defaultStartTestOptions({}),
  cspConfigMock = { warnLegacyBrowsers: true },
  startDeps = defaultStartDeps(),
}: { options?: any; cspConfigMock?: any; startDeps?: ReturnType<typeof defaultStartDeps> } = {}) {
  const mergedOptions = { ...defaultStartTestOptions({}), ...options };
  const service = new ChromeService({
    ...mergedOptions,
    coreContext: mergedOptions.coreContext ?? coreContextMock.create(),
  });

  if (cspConfigMock) {
    startDeps.injectedMetadata.getCspConfig.mockReturnValue(cspConfigMock);
  }

  service.setup({ analytics: analyticsServiceMock.createAnalyticsServiceSetup() });
  const chromeStart = await service.start(startDeps);

  return {
    service,
    startDeps,
    chrome: chromeStart,
  };
}

beforeEach(() => {
  store.clear();
  registerAnalyticsContextProviderMock.mockReset();
  window.history.pushState(undefined, '', '#/home?a=b');
  document.body.className = '';
});

afterAll(() => {
  (window as any).localStorage = originalLocalStorage;
});

describe('setup', () => {
  it('calls registerAnalyticsContextProvider with the correct parameters', async () => {
    const service = new ChromeService(defaultStartTestOptions({}));
    const analytics = analyticsServiceMock.createAnalyticsServiceSetup();
    service.setup({ analytics });

    expect(registerAnalyticsContextProviderMock).toHaveBeenCalledTimes(1);
    expect(registerAnalyticsContextProviderMock).toHaveBeenCalledWith(
      analytics,
      expect.any(Object)
    );
  });
});

describe('start', () => {
  it('adds legacy browser warning if browserSupportsCsp is disabled and warnLegacyBrowsers is enabled', async () => {
    const { startDeps } = await start({
      options: { browserSupportsCsp: false, kibanaVersion: '7.0.0' },
    });

    expect(startDeps.notifications.toasts.addWarning.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "title": [Function],
          },
        ],
      ]
    `);
  });

  it('adds the kibana versioned class to the document body', async () => {
    const { service } = await start({
      options: { browserSupportsCsp: false, kibanaVersion: '1.2.3' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.stop();

    expect(document.body.classList.contains('kbnBody')).toBe(true);
    expect(document.body.classList.contains('kbnBody--noHeaderBanner')).toBe(true);
    expect(document.body.classList.contains('kbnBody--chromeHidden')).toBe(true);
    expect(document.body.classList.contains('kbnVersion-1-2-3')).toBe(true);
  });

  it('strips off "snapshot" from the kibana version if present', async () => {
    const { service } = await start({
      options: { browserSupportsCsp: false, kibanaVersion: '8.0.0-SnAPshot' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.stop();

    expect(document.body.classList.contains('kbnVersion-8-0-0')).toBe(true);
  });

  it('does not add legacy browser warning if browser supports CSP', async () => {
    const { startDeps } = await start();

    expect(startDeps.notifications.toasts.addWarning).not.toHaveBeenCalled();
  });

  it('does not add legacy browser warning if warnLegacyBrowsers is disabled', async () => {
    const { startDeps } = await start({
      options: { browserSupportsCsp: false },
      cspConfigMock: { warnLegacyBrowsers: false },
    });

    expect(startDeps.notifications.toasts.addWarning).not.toHaveBeenCalled();
  });

  it('calls handleSystemColorModeChange() with the correct parameters', async () => {
    mockhandleSystemColorModeChange.mockReset();
    await start();
    expect(mockhandleSystemColorModeChange).toHaveBeenCalledTimes(1);

    const [firstCallArg] = mockhandleSystemColorModeChange.mock.calls[0];
    expect(Object.keys(firstCallArg).sort()).toEqual([
      'coreStart',
      'getNotifications',
      'http',
      'logger',
      'stop$',
      'uiSettings',
    ]);

    expect(mockhandleSystemColorModeChange).toHaveBeenCalledWith({
      http: expect.any(Object),
      coreStart: expect.any(Object),
      uiSettings: expect.any(Object),
      getNotifications: expect.any(Function),
      stop$: expect.any(Object),
      logger: expect.any(Object),
    });
  });

  describe('render smoke tests', () => {
    const buildComponentDeps = (startDeps: ReturnType<typeof defaultStartDeps>) => ({
      application: startDeps.application,
      http: startDeps.http,
      docLinks: startDeps.docLinks,
      customBranding: startDeps.customBranding,
    });

    it('ClassicHeader renders within ChromeComponentsProvider', async () => {
      const startDeps = defaultStartDeps();
      const { chrome } = await start({ startDeps });

      render(
        <KibanaRenderContextProvider {...startDeps}>
          <CoreEnvContextProvider value={coreContextMock.create().env}>
            <ChromeServiceProvider value={{ chrome }}>
              <ChromeComponentsProvider value={buildComponentDeps(startDeps)}>
                <ClassicHeader />
              </ChromeComponentsProvider>
            </ChromeServiceProvider>
          </CoreEnvContextProvider>
        </KibanaRenderContextProvider>
      );
    });

    it('ChromelessHeader renders within ChromeComponentsProvider', async () => {
      const startDeps = defaultStartDeps();
      await start({ startDeps });

      render(
        <KibanaRenderContextProvider {...startDeps}>
          <ChromeComponentsProvider value={buildComponentDeps(startDeps)}>
            <ChromelessHeader />
          </ChromeComponentsProvider>
        </KibanaRenderContextProvider>
      );

      expect(screen.getByTestId('kibanaHeaderChromeless')).toBeInTheDocument();
    });
  });

  describe('visibility', () => {
    it('emits false when no application is mounted', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(chrome.getIsVisible$().pipe(Rx.take(1), toArray()));

      chrome.setIsVisible(true);
      chrome.setIsVisible(false);
      chrome.setIsVisible(true);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
                      Array [
                        false,
                      ]
                  `);
    });

    it('emits false until manually overridden when in embed mode', async () => {
      window.history.pushState(undefined, '', '#/home?a=b&embed=true');
      const startDeps = defaultStartDeps([new FakeApp('alpha')]);
      const { navigateToApp } = startDeps.application;
      const { chrome, service } = await start({ startDeps });

      const promise = firstValueFrom(chrome.getIsVisible$().pipe(Rx.take(3), toArray()));

      await navigateToApp('alpha');

      chrome.setIsVisible(true);
      chrome.setIsVisible(false);

      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
                      Array [
                        false,
                        true,
                        false,
                      ]
                  `);
    });

    it('application-specified visibility on mount', async () => {
      const startDeps = defaultStartDeps([
        new FakeApp('alpha'), // An undefined `chromeless` is the same as setting to false.
        new FakeApp('beta', true),
        new FakeApp('gamma', false),
      ]);
      const { applications$, navigateToApp } = startDeps.application;
      const { chrome, service } = await start({ startDeps });
      const promise = firstValueFrom(chrome.getIsVisible$().pipe(Rx.take(4), toArray()));

      const availableApps = await Rx.firstValueFrom(applications$);
      [...availableApps.keys()].forEach((appId) => navigateToApp(appId));
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
                      Array [
                        false,
                        true,
                        false,
                        true,
                      ]
                  `);
    });

    it('changing visibility has no effect on chrome-hiding application', async () => {
      const startDeps = defaultStartDeps([new FakeApp('alpha', true)]);
      const { navigateToApp } = startDeps.application;
      const { chrome, service } = await start({ startDeps });
      const promise = firstValueFrom(chrome.getIsVisible$().pipe(Rx.take(1), toArray()));

      await navigateToApp('alpha');
      chrome.setIsVisible(true);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
                      Array [
                        false,
                      ]
                  `);
    });

    it('change visibility when EUI component in full screen', async () => {
      const body = document.body;
      const startDeps = defaultStartDeps([new FakeApp('foo')], 'foo');
      const { chrome } = await start({ startDeps });

      // Chrome is initially visible
      let isVisible = await Rx.lastValueFrom(chrome.getIsVisible$().pipe(Rx.take(1)));
      expect(isVisible).toBe(true);

      // Add EUI class that should hide the chrome
      body.classList.add('euiDataGrid__restrictBody');
      await new Promise((resolve) => setTimeout(resolve)); // wait next tick

      // Chrome should be hidden
      isVisible = await Rx.lastValueFrom(chrome.getIsVisible$().pipe(Rx.take(1)));
      expect(isVisible).toBe(false);
    });
  });

  describe('badge', () => {
    it('updates/emits the current badge', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(chrome.getBadge$().pipe(Rx.take(4), toArray()));

      chrome.setBadge({ text: 'foo', tooltip: `foo's tooltip` });
      chrome.setBadge({ text: 'bar', tooltip: `bar's tooltip` });
      chrome.setBadge(undefined);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
                      Array [
                        undefined,
                        Object {
                          "text": "foo",
                          "tooltip": "foo's tooltip",
                        },
                        Object {
                          "text": "bar",
                          "tooltip": "bar's tooltip",
                        },
                        undefined,
                      ]
                  `);
    });
  });

  describe('breadcrumbs', () => {
    it('updates/emits the current set of breadcrumbs', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(chrome.getBreadcrumbs$().pipe(Rx.take(5), toArray()));

      chrome.setBreadcrumbs([{ text: 'foo' }, { text: 'bar' }]);
      chrome.setBreadcrumbs([{ text: 'foo' }]);
      chrome.setBreadcrumbs([{ text: 'bar' }]);
      chrome.setBreadcrumbs([]);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
                      Array [
                        Array [],
                        Array [
                          Object {
                            "text": "foo",
                          },
                          Object {
                            "text": "bar",
                          },
                        ],
                        Array [
                          Object {
                            "text": "foo",
                          },
                        ],
                        Array [
                          Object {
                            "text": "bar",
                          },
                        ],
                        Array [],
                      ]
                  `);
    });

    it('allows the project breadcrumb to also be set', async () => {
      const { chrome } = await start();

      chrome.setChromeStyle('project');
      chrome.project.initNavigation('es', Rx.of({ body: [] }));

      chrome.project.setCloudUrls({
        deploymentUrl: 'my-deployment-url.com',
      });
      chrome.setBreadcrumbs([{ text: 'foo' }, { text: 'bar' }]); // only setting the classic breadcrumbs

      {
        const breadcrumbs = await firstValueFrom(chrome.project.getBreadcrumbs$());
        expect(breadcrumbs.length).toBe(1);
        expect(breadcrumbs[0]).toMatchObject({
          'data-test-subj': 'deploymentCrumb',
        });
      }

      chrome.setBreadcrumbs([{ text: 'foo' }, { text: 'bar' }], {
        project: { value: [{ text: 'baz' }] }, // also setting the project breadcrumb
      });

      {
        const breadcrumbs = await firstValueFrom(chrome.project.getBreadcrumbs$());
        expect(breadcrumbs.length).toBe(2);
        expect(breadcrumbs[0]).toMatchObject({
          'data-test-subj': 'deploymentCrumb',
        });
        expect(breadcrumbs[1]).toEqual({
          text: 'baz', // the project breadcrumb
        });
      }
    });
  });

  describe('breadcrumbsAppendExtension$', () => {
    it('updates the breadcrumbsAppendExtension$', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(
        chrome.getBreadcrumbsAppendExtensions$().pipe(Rx.take(6), toArray())
      );

      const ext1 = chrome.setBreadcrumbsAppendExtension({
        content: null,
      });
      chrome.setBreadcrumbsAppendExtension({
        order: 0,
        content: null,
      });
      const ext3 = chrome.setBreadcrumbsAppendExtension({
        order: 100,
        content: null,
      });
      ext3();
      ext1();
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
        Array [
          Array [],
          Array [
            Object {
              "content": null,
            },
          ],
          Array [
            Object {
              "content": null,
              "order": 0,
            },
            Object {
              "content": null,
            },
          ],
          Array [
            Object {
              "content": null,
              "order": 0,
            },
            Object {
              "content": null,
            },
            Object {
              "content": null,
              "order": 100,
            },
          ],
          Array [
            Object {
              "content": null,
              "order": 0,
            },
            Object {
              "content": null,
            },
          ],
          Array [
            Object {
              "content": null,
              "order": 0,
            },
          ],
        ]
      `);
    });
  });

  describe('custom nav link', () => {
    it('updates/emits the current custom nav link', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(chrome.getCustomNavLink$().pipe(Rx.take(3), toArray()));

      chrome.setCustomNavLink({ title: 'Manage cloud deployment' });
      chrome.setCustomNavLink(undefined);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                undefined,
                Object {
                  "title": "Manage cloud deployment",
                },
                undefined,
              ]
            `);
    });
  });

  describe('help extension', () => {
    it('updates/emits the current help extension', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(chrome.getHelpExtension$().pipe(Rx.take(3), toArray()));

      chrome.setHelpExtension({ appName: 'App name' });
      chrome.setHelpExtension(undefined);
      service.stop();

      await expect(promise).resolves.toMatchInlineSnapshot(`
              Array [
                undefined,
                Object {
                  "appName": "App name",
                },
                undefined,
              ]
            `);
    });
  });

  describe('header banner', () => {
    it('updates/emits the state of the header banner', async () => {
      const { chrome, service } = await start();
      const promise = firstValueFrom(chrome.hasHeaderBanner$().pipe(Rx.take(3), toArray()));

      chrome.setHeaderBanner({ content: <></> });
      chrome.setHeaderBanner(undefined);
      service.stop();

      await expect(promise).resolves.toEqual([false, true, false]);
    });
  });

  describe('erase chrome fields', () => {
    it('while switching an app', async () => {
      const startDeps = defaultStartDeps([new FakeApp('alpha')]);
      const { navigateToApp } = startDeps.application;
      const { chrome, service } = await start({ startDeps });

      const helpExtensionPromise = firstValueFrom(
        chrome.getHelpExtension$().pipe(Rx.take(3), toArray())
      );
      const breadcrumbsPromise = firstValueFrom(
        chrome.getBreadcrumbs$().pipe(Rx.take(3), toArray())
      );
      const badgePromise = firstValueFrom(chrome.getBadge$().pipe(Rx.take(3), toArray()));
      const docTitleResetSpy = jest.spyOn(chrome.docTitle, 'reset');

      const promises = Promise.all([helpExtensionPromise, breadcrumbsPromise, badgePromise]);

      chrome.setHelpExtension({ appName: 'App name' });
      chrome.setBreadcrumbs([{ text: 'App breadcrumb' }]);
      chrome.setBadge({ text: 'App badge', tooltip: 'App tooltip' });

      navigateToApp('alpha');

      service.stop();

      expect(docTitleResetSpy).toHaveBeenCalledTimes(1);
      await expect(promises).resolves.toMatchInlineSnapshot(`
                      Array [
                        Array [
                          undefined,
                          Object {
                            "appName": "App name",
                          },
                          undefined,
                        ],
                        Array [
                          Array [],
                          Array [
                            Object {
                              "text": "App breadcrumb",
                            },
                          ],
                          Array [],
                        ],
                        Array [
                          undefined,
                          Object {
                            "text": "App badge",
                            "tooltip": "App tooltip",
                          },
                          undefined,
                        ],
                      ]
                  `);
    });
  });

  describe('side nav', () => {
    describe('isCollapsed$', () => {
      it('should return false by default', async () => {
        const { chrome, service } = await start();
        const isCollapsed = await firstValueFrom(chrome.sideNav.getIsCollapsed$());
        service.stop();
        expect(isCollapsed).toBe(false);
      });

      it('should read the localStorage value', async () => {
        store.set('core.chrome.isSideNavCollapsed', 'true');
        const { chrome, service } = await start();
        const isCollapsed = await firstValueFrom(chrome.sideNav.getIsCollapsed$());
        service.stop();
        expect(isCollapsed).toBe(true);
      });
    });

    describe('setIsCollapsed', () => {
      it('should update the isCollapsed$ observable', async () => {
        const { chrome, service } = await start();
        const isCollapsed$ = chrome.sideNav.getIsCollapsed$();
        const isCollapsed = await firstValueFrom(isCollapsed$);

        chrome.sideNav.setIsCollapsed(!isCollapsed);

        const updatedIsCollapsed = await firstValueFrom(isCollapsed$);
        service.stop();
        expect(updatedIsCollapsed).toBe(!isCollapsed);
      });
    });

    describe('width', () => {
      it('should return 0 by default', async () => {
        const { chrome, service } = await start();

        expect(chrome.sideNav.getWidth()).toBe(0);
        expect(await firstValueFrom(chrome.sideNav.getWidth$())).toBe(0);

        service.stop();
      });

      it('should update the width observable', async () => {
        const { chrome, service } = await start();
        const widths: number[] = [];
        const subscription = chrome.sideNav.getWidth$().subscribe((width) => widths.push(width));

        chrome.sideNav.setWidth(120);

        expect(chrome.sideNav.getWidth()).toBe(120);
        expect(widths).toEqual([0, 120]);

        subscription.unsubscribe();
        service.stop();
      });
    });
  });

  describe('controls and help', () => {
    it('observes control registrations', async () => {
      const { chrome, service } = await start();
      const search = { onClick: () => {} };

      chrome.controls.globalSearch.set(search);
      expect(await firstValueFrom(chrome.controls.globalSearch.get$())).toBe(search);

      chrome.controls.globalSearch.set(undefined);
      expect(await firstValueFrom(chrome.controls.globalSearch.get$())).toBeUndefined();

      service.stop();
    });

    it('unregisters AI buttons', async () => {
      const { chrome, service } = await start();
      const button = { content: <div /> };

      const unregister = chrome.controls.aiButton.register(button);
      expect(await firstValueFrom(chrome.controls.aiButton.get$())).toEqual([button]);

      unregister();
      expect(await firstValueFrom(chrome.controls.aiButton.get$())).toEqual([]);

      service.stop();
    });

    it('unregisters help handlers', async () => {
      const { chrome, service } = await start();
      const feedback = () => {};
      const newsfeed = { open: () => {}, hasNew$: new Rx.BehaviorSubject(false) };

      const unregisterFeedback = chrome.help.registerFeedbackHandler(feedback);
      expect(await firstValueFrom(chrome.help.getFeedbackHandler$())).toBe(feedback);
      unregisterFeedback();
      expect(await firstValueFrom(chrome.help.getFeedbackHandler$())).toBeUndefined();

      const unregisterNewsfeed = chrome.help.registerNewsfeedHandler(newsfeed);
      expect(await firstValueFrom(chrome.help.getNewsfeedHandler$())).toBe(newsfeed);
      unregisterNewsfeed();
      expect(await firstValueFrom(chrome.help.getNewsfeedHandler$())).toBeUndefined();

      service.stop();
    });
  });

  describe('app header', () => {
    it('observes registrations', async () => {
      const { chrome, service } = await start();
      const config = { title: 'Dashboards' };

      const unregister = chrome.appHeader.set(config);
      expect(await firstValueFrom(chrome.appHeader.get$())).toEqual(config);

      unregister();
      expect(await firstValueFrom(chrome.appHeader.get$())).toBeUndefined();

      service.stop();
    });
  });
});

describe('componentDeps.docTitleParts$', () => {
  it('exposes initial, changed, and reset title parts', async () => {
    document.title = 'Kibana';
    const { chrome, service } = await start();
    const titles: Array<readonly string[]> = [];
    const subscription = chrome.componentDeps.docTitleParts$.subscribe((parts) =>
      titles.push(parts)
    );

    chrome.docTitle.change('Dashboard');
    chrome.docTitle.reset();

    expect(titles).toEqual([['Kibana'], ['Dashboard', 'Kibana'], ['Kibana']]);

    subscription.unsubscribe();
    service.stop();
  });
});

describe('inline app header', () => {
  it('clears inline state on app change and ignores the previous registration', async () => {
    const startDeps = defaultStartDeps([new FakeApp('alpha')]);
    const { chrome, service } = await start({ startDeps });
    const values: Array<{ title?: unknown } | undefined> = [];
    const subscription = chrome.inlineAppHeader.get$().subscribe((value) => values.push(value));

    const registration = chrome.inlineAppHeader.register('First');
    startDeps.application.navigateToApp('alpha');
    registration.update('Stale');
    registration.unregister();

    expect(values).toContainEqual({ title: 'First' });
    expect(values).not.toContainEqual({ title: 'Stale' });
    expect(values[values.length - 1]).toBeUndefined();

    subscription.unsubscribe();
    service.stop();
  });

  it('does not let a stale registration update or clear a newer one', async () => {
    const { chrome, service } = await start();
    const first = chrome.inlineAppHeader.register('First');
    const second = chrome.inlineAppHeader.register('Second');

    first.update('Stale');
    first.unregister();

    await expect(firstValueFrom(chrome.inlineAppHeader.get$())).resolves.toEqual({
      title: 'Second',
    });

    second.unregister();
    await expect(firstValueFrom(chrome.inlineAppHeader.get$())).resolves.toBeUndefined();
    service.stop();
  });
});

describe('stop', () => {
  it('stops sub-services without relying on observable completion', async () => {
    const navLinksStopSpy = jest.spyOn(NavLinksService.prototype, 'stop');
    const projectNavigationStopSpy = jest.spyOn(ProjectNavigationService.prototype, 'stop');
    const { service } = await start();

    service.stop();

    expect(navLinksStopSpy).toHaveBeenCalledTimes(1);
    expect(projectNavigationStopSpy).toHaveBeenCalledTimes(1);

    navLinksStopSpy.mockRestore();
    projectNavigationStopSpy.mockRestore();
  });
});
