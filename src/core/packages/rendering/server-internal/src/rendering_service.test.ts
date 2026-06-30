/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  registerBootstrapRouteMock,
  bootstrapRendererMock,
  getSettingValueMock,
  getCommonStylesheetPathsMock,
  getThemeStylesheetPathsMock,
  getScriptPathsMock,
  getBrowserLoggingConfigMock,
  getApmConfigMock,
  getIsThemeBundledMock,
  isRspackModeEnabledMock,
} from './rendering_service.test.mocks';

import { load } from 'cheerio';

import { mockRouter } from '@kbn/core-http-router-server-mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { uiSettingsServiceMock } from '@kbn/core-ui-settings-server-mocks';
import {
  mockRenderingServiceParams,
  mockRenderingPrebootDeps,
  mockRenderingSetupDeps,
  mockRenderingStartDeps,
} from './test_helpers/params';
import type {
  InternalRenderingServicePreboot,
  InternalRenderingServiceSetup,
  RenderingResponse,
} from './types';
import { RenderingService, DEFAULT_THEME_NAME_FEATURE_FLAG } from './rendering_service';
import { AuthStatus } from '@kbn/core-http-server';
import type { ThemeName } from '@kbn/core-ui-settings-common';
import { DEFAULT_THEME_NAME } from '@kbn/core-ui-settings-common';
import { BehaviorSubject } from 'rxjs';

const BUILD_DATE = '2023-05-15T23:12:09+0000';
const INJECTED_METADATA = {
  version: expect.any(String),
  branch: expect.any(String),
  buildNumber: expect.any(Number),
  logging: expect.any(Object),
  env: {
    mode: {
      name: expect.any(String),
      dev: expect.any(Boolean),
      prod: expect.any(Boolean),
    },
    packageInfo: {
      branch: expect.any(String),
      buildNum: expect.any(Number),
      buildSha: expect.any(String),
      dist: expect.any(Boolean),
      version: expect.any(String),
      buildDate: new Date(BUILD_DATE).toISOString(),
      buildFlavor: expect.any(String),
    },
    airgapped: expect.any(Boolean),
  },
};

const { createKibanaRequest } = httpServerMock;

function renderTestCases(
  getRender: () => Promise<
    [
      InternalRenderingServicePreboot['render'] | InternalRenderingServiceSetup['render'],
      typeof mockRenderingPrebootDeps | typeof mockRenderingSetupDeps
    ]
  >
) {
  describe('render()', () => {
    let uiSettings: {
      client: ReturnType<typeof uiSettingsServiceMock.createClient>;
      globalClient: ReturnType<typeof uiSettingsServiceMock.createClient>;
    };

    beforeEach(async () => {
      uiSettings = {
        client: uiSettingsServiceMock.createClient(),
        globalClient: uiSettingsServiceMock.createClient(),
      };
      uiSettings.client.getRegistered.mockReturnValue({
        registered: { name: 'title' },
      });
    });

    afterEach(() => {
      mockRenderingSetupDeps.featureFlags.getOverrides.mockReset();
    });

    it('renders "core" page', async () => {
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
    });

    it('renders "core" page for unauthenticated requests', async () => {
      mockRenderingSetupDeps.http.auth.get.mockReturnValueOnce({
        status: AuthStatus.unauthenticated,
        state: {},
      });

      const [render] = await getRender();
      const { body: content } = await render(
        createKibanaRequest({ auth: { isAuthenticated: false } }),
        uiSettings
      );
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
    });

    it('renders "core" page for blank basepath', async () => {
      const [render, deps] = await getRender();
      deps.http.basePath.get.mockReturnValueOnce('');

      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
    });

    it('renders "core" page driven by settings', async () => {
      const userSettings = { 'theme:darkMode': { userValue: true } };
      uiSettings.client.getUserProvided.mockResolvedValue(userSettings);
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
      expect(data.legacyMetadata.uiSettings.user).toEqual(userSettings); // user settings are injected
      expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
    });

    it('renders page with light color-scheme when dark mode is disabled', async () => {
      getSettingValueMock.mockImplementation((settingName: string) => {
        if (settingName === 'theme:darkMode') {
          return false;
        }
        return settingName;
      });

      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);

      expect(dom('meta[name="color-scheme"]').attr('content')).toBe('light');
    });

    it('renders page with dark color-scheme when dark mode is enabled', async () => {
      getSettingValueMock.mockImplementation((settingName: string) => {
        if (settingName === 'theme:darkMode') {
          return true;
        }
        return settingName;
      });

      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);

      expect(dom('meta[name="color-scheme"]').attr('content')).toBe('dark');
    });

    it('renders page with dual color-scheme when dark mode is set to system', async () => {
      getSettingValueMock.mockImplementation((settingName: string) => {
        if (settingName === 'theme:darkMode') {
          return 'system';
        }
        return settingName;
      });

      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);

      expect(dom('meta[name="color-scheme"]').attr('content')).toBe('light dark');
    });

    it('renders "core" page with global settings', async () => {
      const userSettings = { 'foo:bar': { userValue: true } };
      uiSettings.globalClient.getUserProvided.mockResolvedValue(userSettings);
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
      expect(data.legacyMetadata.globalUiSettings.user).toEqual(userSettings); // user settings are injected
      expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      expect(uiSettings.globalClient.getUserProvided).toHaveBeenCalledWith(true);
    });

    it('renders "core" with excluded user settings', async () => {
      const userSettings = { 'theme:darkMode': { userValue: true } };
      uiSettings.client.getUserProvided.mockResolvedValue(userSettings);
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: true,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
      expect(data.legacyMetadata.uiSettings.user).toEqual({}); // user settings are not injected
    });

    it('renders "core" with excluded global user settings', async () => {
      const userSettings = { 'foo:bar': { userValue: true } };
      uiSettings.globalClient.getUserProvided.mockResolvedValue(userSettings);
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: true,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

      expect(data).toMatchSnapshot(INJECTED_METADATA);
      expect(data.legacyMetadata.globalUiSettings.user).toEqual({}); // user settings are not injected
    });

    it('does not call getUserProvided for anonymous pages', async () => {
      const [render] = await getRender();
      await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: true,
      });

      expect(uiSettings.client.getUserProvided).not.toHaveBeenCalled();
      expect(uiSettings.globalClient.getUserProvided).not.toHaveBeenCalled();
    });

    it('does not resolve async default `getValue` for anonymous pages', async () => {
      const getValue = jest.fn().mockResolvedValue('async-default');
      uiSettings.client.getRegistered.mockReturnValue({
        registered: { name: 'title', getValue },
      });

      const [render] = await getRender();
      await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: true,
      });

      expect(getValue).not.toHaveBeenCalled();
    });

    it('resolves async default `getValue` for non-anonymous pages', async () => {
      const getValue = jest.fn().mockResolvedValue('async-default');
      uiSettings.client.getRegistered.mockReturnValue({
        registered: { name: 'title', getValue },
      });

      const [render] = await getRender();
      await render(createKibanaRequest(), uiSettings);

      expect(getValue).toHaveBeenCalledTimes(1);
    });

    it('calls `getCommonStylesheetPaths` with the correct parameters', async () => {
      getSettingValueMock.mockImplementation((settingName: string) => {
        if (settingName === 'theme:darkMode') {
          return true;
        }
        return settingName;
      });

      const [render] = await getRender();
      await render(createKibanaRequest(), uiSettings);

      expect(getCommonStylesheetPathsMock).toHaveBeenCalledTimes(1);
      expect(getCommonStylesheetPathsMock).toHaveBeenCalledWith({
        baseHref: '/mock-server-basepath',
      });
    });

    it('calls `getScriptPaths` with the correct parameters', async () => {
      getSettingValueMock.mockImplementation((settingName: string) => {
        if (settingName === 'theme:darkMode') {
          return true;
        }
        return settingName;
      });

      const [render] = await getRender();
      await render(createKibanaRequest(), uiSettings);

      expect(getScriptPathsMock).toHaveBeenCalledTimes(1);
      expect(getScriptPathsMock).toHaveBeenCalledWith({
        darkMode: true,
        baseHref: '/mock-server-basepath',
        themeName: 'borealis',
      });
    });

    it('calls `getThemeStylesheetPaths` with the correct parameters', async () => {
      getSettingValueMock.mockImplementation((settingName: string) => {
        if (settingName === 'theme:darkMode') {
          return true;
        }
        return settingName;
      });

      const [render] = await getRender();
      await render(createKibanaRequest(), uiSettings);

      expect(getThemeStylesheetPathsMock).toHaveBeenCalledTimes(2);
      expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
        darkMode: true,
        baseHref: '/mock-server-basepath',
      });
      expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
        darkMode: false,
        baseHref: '/mock-server-basepath',
      });
    });

    it('renders "core" CDN url injected', async () => {
      const userSettings = { 'theme:darkMode': { userValue: true } };
      uiSettings.client.getUserProvided.mockResolvedValue(userSettings);
      (mockRenderingPrebootDeps.http.staticAssets.getHrefBase as jest.Mock).mockImplementation(
        () => 'http://foo.bar:1773'
      );
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      expect(data).toMatchSnapshot(INJECTED_METADATA);
      expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
    });

    it('renders feature flags overrides', async () => {
      mockRenderingSetupDeps.featureFlags.getOverrides.mockReturnValueOnce({
        'my-overridden-flag': 1234,
      });
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      expect(data).toMatchSnapshot(INJECTED_METADATA);
    });

    it('renders initial feature flags', async () => {
      mockRenderingSetupDeps.featureFlags.getInitialFeatureFlags.mockResolvedValueOnce({
        'my-initial-flag': 1234,
      });
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      expect(data).toMatchSnapshot(INJECTED_METADATA);
    });

    it('renders "core" with logging config injected', async () => {
      const loggingConfig = {
        root: {
          level: 'info',
        },
      };
      getBrowserLoggingConfigMock.mockReturnValue(loggingConfig);
      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      expect(data.logging).toEqual(loggingConfig);
    });

    it('renders "core" with APM config injected', async () => {
      const someApmConfig = { someConfig: 9000 };
      getApmConfigMock.mockReturnValue(someApmConfig);

      const request = createKibanaRequest();

      const [render] = await getRender();
      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });

      expect(getApmConfigMock).toHaveBeenCalledTimes(1);
      expect(getApmConfigMock).toHaveBeenCalledWith(request.url.pathname);

      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      expect(data.apmConfig).toEqual(someApmConfig);
    });

    it('sets translationsUrl to null for the English locale (CDN enabled)', async () => {
      const userSettings = { 'theme:darkMode': { userValue: true } };
      uiSettings.client.getUserProvided.mockResolvedValue(userSettings);

      const [render, deps] = await getRender();

      (deps.http.staticAssets.getHrefBase as jest.Mock).mockReturnValueOnce('http://foo.bar:1773');
      (deps.http.staticAssets.isUsingCdn as jest.Mock).mockReturnValueOnce(true);

      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      // English is the default locale — no fetch is needed, so the URL must be null.
      expect(data.i18n.translationsUrl).toBeNull();
      expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
    });

    it('sets translationsUrl to null for the English locale (CDN disabled)', async () => {
      const userSettings = { 'theme:darkMode': { userValue: true } };
      uiSettings.client.getUserProvided.mockResolvedValue(userSettings);

      const [render, deps] = await getRender();

      (deps.http.staticAssets.getHrefBase as jest.Mock).mockReturnValueOnce('http://foo.bar:1773');
      (deps.http.staticAssets.isUsingCdn as jest.Mock).mockReturnValueOnce(false);

      const { body: content } = await render(createKibanaRequest(), uiSettings, {
        isAnonymousPage: false,
      });
      const dom = load(content);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      // English is the default locale — no fetch is needed, so the URL must be null.
      expect(data.i18n.translationsUrl).toBeNull();
      expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
    });
  });
}

function renderDarkModeTestCases(
  getRender: () => Promise<
    [
      InternalRenderingServicePreboot['render'] | InternalRenderingServiceSetup['render'],
      typeof mockRenderingPrebootDeps | typeof mockRenderingSetupDeps
    ]
  >
) {
  describe('render() Dark Mode tests', () => {
    let uiSettings: {
      client: ReturnType<typeof uiSettingsServiceMock.createClient>;
      globalClient: ReturnType<typeof uiSettingsServiceMock.createClient>;
    };

    beforeEach(async () => {
      uiSettings = {
        client: uiSettingsServiceMock.createClient(),
        globalClient: uiSettingsServiceMock.createClient(),
      };
      uiSettings.client.getRegistered.mockReturnValue({
        registered: { name: 'title' },
      });
    });

    describe('Dark Mode', () => {
      it('UserSettings darkMode === true should override the space setting', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(true)
        );

        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return false;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: false } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);

        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: true,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });

      it('UserSettings darkMode === false should override the space setting', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(false)
        );

        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return true;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: false } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);

        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: false,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });

      it('Space setting value should be used if UsersSettings value is undefined', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(undefined)
        );
        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return false;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: false } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);
        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: false,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });

      it('config `theme:darkMode: true` setting should override User Settings theme `darkMode === false', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(false)
        );
        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return true;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: true, isOverridden: true } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);
        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: true,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });

      it('config `theme:darkMode: false` setting should override User Settings theme `darkMode === true', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(true)
        );
        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return false;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: false, isOverridden: true } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);
        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: false,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });

      it('config `theme:darkMode: false` setting should override User Settings theme `darkMode === undefined', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(undefined)
        );
        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return false;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: false, isOverridden: true } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);
        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: false,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });

      it('config `theme:darkMode: true` setting should override User Settings theme `darkMode === undefined', async () => {
        mockRenderingSetupDeps.userSettings.getUserSettingDarkMode.mockReturnValueOnce(
          Promise.resolve(undefined)
        );
        getSettingValueMock.mockImplementation((settingName: string) => {
          if (settingName === 'theme:darkMode') {
            return true;
          }
          return settingName;
        });

        const settings = { 'theme:darkMode': { userValue: true, isOverridden: true } };
        uiSettings.client.getUserProvided.mockResolvedValue(settings);
        const [render] = await getRender();
        await render(createKibanaRequest(), uiSettings);

        expect(getThemeStylesheetPathsMock).toHaveBeenCalledWith({
          darkMode: true,
          baseHref: '/mock-server-basepath',
        });
        expect(uiSettings.client.getUserProvided).toHaveBeenCalledWith(true);
      });
    });
  });
}

describe('RenderingService', () => {
  let service: RenderingService;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(BUILD_DATE));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RenderingService(mockRenderingServiceParams);

    getSettingValueMock.mockImplementation((settingName: string) => settingName);
    getCommonStylesheetPathsMock.mockReturnValue(['/common-1.css']);
    getThemeStylesheetPathsMock.mockReturnValue(['/style-1.css', '/style-2.css']);
    getScriptPathsMock.mockReturnValue(['/script-1.js']);
    getBrowserLoggingConfigMock.mockReset().mockReturnValue({});
    getApmConfigMock.mockReset().mockReturnValue({ stubApmConfig: true });
  });

  describe('preboot()', () => {
    it('calls `registerBootstrapRoute` with the correct parameters', async () => {
      const routerMock = mockRouter.create();
      mockRenderingPrebootDeps.http.registerRoutes.mockImplementation((_path, callback) =>
        callback(routerMock)
      );

      await service.preboot(mockRenderingPrebootDeps);

      expect(registerBootstrapRouteMock).toHaveBeenCalledTimes(1);
      expect(registerBootstrapRouteMock).toHaveBeenCalledWith({
        router: routerMock,
        renderer: bootstrapRendererMock,
      });
    });

    renderTestCases(async () => {
      return [(await service.preboot(mockRenderingPrebootDeps)).render, mockRenderingPrebootDeps];
    });
  });

  describe('setup()', () => {
    it('calls `registerBootstrapRoute` with the correct parameters', async () => {
      await service.setup(mockRenderingSetupDeps);

      expect(registerBootstrapRouteMock).toHaveBeenCalledTimes(1);
      expect(registerBootstrapRouteMock).toHaveBeenCalledWith({
        router: expect.any(Object),
        renderer: bootstrapRendererMock,
      });
    });

    renderTestCases(async () => {
      await service.preboot(mockRenderingPrebootDeps);
      return [(await service.setup(mockRenderingSetupDeps)).render, mockRenderingSetupDeps];
    });
    renderDarkModeTestCases(async () => {
      await service.preboot(mockRenderingPrebootDeps);
      return [(await service.setup(mockRenderingSetupDeps)).render, mockRenderingSetupDeps];
    });

    describe('translationsUrl for non-English locales', () => {
      let uiSettings: {
        client: ReturnType<typeof uiSettingsServiceMock.createClient>;
        globalClient: ReturnType<typeof uiSettingsServiceMock.createClient>;
      };

      beforeEach(() => {
        uiSettings = {
          client: uiSettingsServiceMock.createClient(),
          globalClient: uiSettingsServiceMock.createClient(),
        };
        uiSettings.client.getRegistered.mockReturnValue({});
      });

      it('constructs a CDN url for a non-English user locale', async () => {
        // setup() itself calls getHrefBase() once, so we do setup first and then
        // add our per-render mock afterward so render() sees the CDN base.
        await service.preboot(mockRenderingPrebootDeps);
        const { render } = await service.setup(mockRenderingSetupDeps);

        mockRenderingSetupDeps.i18n.getTranslationHashes.mockReturnValueOnce({
          en: 'MOCK_HASH',
          fr: 'MOCK_FR_HASH',
        });
        mockRenderingSetupDeps.userSettings.getUserSettingLocale.mockReturnValueOnce(
          Promise.resolve('fr')
        );
        (mockRenderingSetupDeps.http.staticAssets.getHrefBase as jest.Mock).mockReturnValueOnce(
          'http://cdn.example.com'
        );
        (mockRenderingSetupDeps.http.staticAssets.isUsingCdn as jest.Mock).mockReturnValueOnce(
          true
        );

        const { body: content } = await render(createKibanaRequest(), uiSettings);
        const dom = load(content);
        const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

        expect(data.i18n.translationsUrl).toEqual('http://cdn.example.com/translations/fr.json');
      });

      it('constructs a hashed url for a non-English user locale (CDN disabled)', async () => {
        await service.preboot(mockRenderingPrebootDeps);
        const { render } = await service.setup(mockRenderingSetupDeps);

        mockRenderingSetupDeps.i18n.getTranslationHashes.mockReturnValueOnce({
          en: 'MOCK_HASH',
          fr: 'MOCK_FR_HASH',
        });
        mockRenderingSetupDeps.userSettings.getUserSettingLocale.mockReturnValueOnce(
          Promise.resolve('fr')
        );
        (mockRenderingSetupDeps.http.staticAssets.isUsingCdn as jest.Mock).mockReturnValueOnce(
          false
        );

        const { body: content } = await render(createKibanaRequest(), uiSettings);
        const dom = load(content);
        const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');

        expect(data.i18n.translationsUrl).toEqual(
          '/mock-server-basepath/translations/MOCK_FR_HASH/fr.json'
        );
      });
    });

    describe('allowLocaleCookie', () => {
      let uiSettings: {
        client: ReturnType<typeof uiSettingsServiceMock.createClient>;
        globalClient: ReturnType<typeof uiSettingsServiceMock.createClient>;
      };

      beforeEach(() => {
        uiSettings = {
          client: uiSettingsServiceMock.createClient(),
          globalClient: uiSettingsServiceMock.createClient(),
        };
      });

      it('includes a set-cookie header when allowLocaleCookie is true', async () => {
        mockRenderingSetupDeps.i18n.allowLocaleCookie = true;
        await service.preboot(mockRenderingPrebootDeps);
        const { render } = await service.setup(mockRenderingSetupDeps);

        const result = await render(createKibanaRequest(), uiSettings);

        expect(result.headers).toHaveProperty('set-cookie');
      });

      it('omits the set-cookie header when allowLocaleCookie is false', async () => {
        mockRenderingSetupDeps.i18n.allowLocaleCookie = false;
        await service.preboot(mockRenderingPrebootDeps);
        const { render } = await service.setup(mockRenderingSetupDeps);

        const result = await render(createKibanaRequest(), uiSettings);

        expect(result.headers).not.toHaveProperty('set-cookie');
      });

      afterEach(() => {
        mockRenderingSetupDeps.i18n.allowLocaleCookie = true;
      });
    });
  });

  describe('start()', () => {
    it('subscribes to the featureFlags.setStringValue$', async () => {
      // setup and render added to assert the current theme name
      const { render } = await service.setup(mockRenderingSetupDeps);
      const themeName$ = new BehaviorSubject<ThemeName>(DEFAULT_THEME_NAME);
      const getStringValue$ = jest
        .fn()
        .mockImplementation((_, _fallback) => themeName$.asObservable());
      service.start({
        ...mockRenderingStartDeps,
        featureFlags: {
          ...mockRenderingStartDeps.featureFlags,
          getStringValue$,
        },
      });

      expect(getStringValue$).toHaveBeenCalledTimes(1);
      expect(getStringValue$).toHaveBeenCalledWith(
        DEFAULT_THEME_NAME_FEATURE_FLAG,
        DEFAULT_THEME_NAME
      );

      const uiSettings = {
        client: uiSettingsServiceMock.createClient(),
        globalClient: uiSettingsServiceMock.createClient(),
      };

      getIsThemeBundledMock.mockImplementation((name) => name === 'borealis');

      const { body: renderResult } = await render(createKibanaRequest(), uiSettings);
      expect(getIsThemeBundledMock).toHaveBeenCalledWith('borealis');
      expect(renderResult).toContain(',&quot;name&quot;:&quot;borealis&quot;');
    });

    it('falls back to the default theme if theme is not bundled', async () => {
      // setup and render added to assert the current theme name
      const { render } = await service.setup(mockRenderingSetupDeps);
      const themeName$ = new BehaviorSubject<ThemeName>('unknown' as any);
      const getStringValue$ = jest
        .fn()
        .mockImplementation((_, _fallback) => themeName$.asObservable());
      service.start({
        ...mockRenderingStartDeps,
        featureFlags: {
          ...mockRenderingStartDeps.featureFlags,
          getStringValue$,
        },
      });

      const uiSettings = {
        client: uiSettingsServiceMock.createClient(),
        globalClient: uiSettingsServiceMock.createClient(),
      };

      getIsThemeBundledMock.mockReturnValue(false);

      const { body: renderResult } = await render(createKibanaRequest(), uiSettings);
      expect(renderResult).toContain(',&quot;name&quot;:&quot;borealis&quot;');
    });
  });

  describe('userStorage injection', () => {
    const renderAndReadUserStorage = async (content: RenderingResponse) => {
      const dom = load(content.body);
      const data = JSON.parse(dom('kbn-injected-metadata').attr('data') ?? '""');
      return data.userStorage;
    };

    const buildUiSettings = () => ({
      client: uiSettingsServiceMock.createClient(),
      globalClient: uiSettingsServiceMock.createClient(),
    });

    it('injects values returned by userStorage.asScoped().getForInjection()', async () => {
      const { render } = await service.setup(mockRenderingSetupDeps);

      const getForInjection = jest
        .fn()
        .mockResolvedValue({ 'navigation:layout': { hidden: ['discover'] } });
      const asScoped = jest.fn().mockReturnValue({ getForInjection });
      service.start({ ...mockRenderingStartDeps, userStorage: { asScoped } });

      const content = await render(createKibanaRequest(), buildUiSettings());

      expect(asScoped).toHaveBeenCalledTimes(1);
      expect(getForInjection).toHaveBeenCalledTimes(1);
      expect(await renderAndReadUserStorage(content)).toEqual({
        values: { 'navigation:layout': { hidden: ['discover'] } },
      });
    });

    it('injects empty values when asScoped() returns null (no profile_uid)', async () => {
      const { render } = await service.setup(mockRenderingSetupDeps);

      const asScoped = jest.fn().mockReturnValue(null);
      service.start({ ...mockRenderingStartDeps, userStorage: { asScoped } });

      const content = await render(createKibanaRequest(), buildUiSettings());

      expect(asScoped).toHaveBeenCalledTimes(1);
      expect(await renderAndReadUserStorage(content)).toEqual({ values: {} });
    });

    it('injects empty values for anonymous pages without consulting userStorage', async () => {
      const { render } = await service.setup(mockRenderingSetupDeps);

      const asScoped = jest.fn();
      service.start({ ...mockRenderingStartDeps, userStorage: { asScoped } });

      const content = await render(createKibanaRequest(), buildUiSettings(), {
        isAnonymousPage: true,
      });

      expect(asScoped).not.toHaveBeenCalled();
      expect(await renderAndReadUserStorage(content)).toEqual({ values: {} });
    });

    it('throws when getForInjection() rejects', async () => {
      const { render } = await service.setup(mockRenderingSetupDeps);

      const getForInjection = jest.fn().mockRejectedValue(new Error('ES exploded'));
      const asScoped = jest.fn().mockReturnValue({ getForInjection });
      service.start({ ...mockRenderingStartDeps, userStorage: { asScoped } });

      await expect(render(createKibanaRequest(), buildUiSettings())).rejects.toThrow('ES exploded');
    });
  });

  describe('rspack mode metadata', () => {
    let rspackService: RenderingService;

    beforeEach(() => {
      rspackService = new RenderingService(mockRenderingServiceParams);
    });

    afterEach(() => {
      isRspackModeEnabledMock.mockReturnValue(false);
    });

    it('includes font preload links and font-display:swap when rspack mode is enabled', async () => {
      isRspackModeEnabledMock.mockReturnValue(true);

      const { render } = await rspackService.setup(mockRenderingSetupDeps);
      rspackService.start(mockRenderingStartDeps);

      const uiSettings = {
        client: uiSettingsServiceMock.createClient(),
        globalClient: uiSettingsServiceMock.createClient(),
      };
      uiSettings.client.getRegistered.mockReturnValue({});

      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);

      const preloadLinks = dom('link[rel="preload"][as="font"]');
      expect(preloadLinks.length).toBeGreaterThanOrEqual(3);

      preloadLinks.each((_i, el) => {
        const href = dom(el).attr('href');
        expect(href).toContain('.woff2');
      });

      expect(content).toContain('font-display: swap');
    });

    it('does not include font preload links when rspack mode is disabled', async () => {
      isRspackModeEnabledMock.mockReturnValue(false);

      const { render } = await rspackService.setup(mockRenderingSetupDeps);
      rspackService.start(mockRenderingStartDeps);

      const uiSettings = {
        client: uiSettingsServiceMock.createClient(),
        globalClient: uiSettingsServiceMock.createClient(),
      };
      uiSettings.client.getRegistered.mockReturnValue({});

      const { body: content } = await render(createKibanaRequest(), uiSettings);
      const dom = load(content);

      const preloadLinks = dom('link[rel="preload"][as="font"]');
      expect(preloadLinks.length).toBe(0);

      expect(content).not.toContain('font-display: swap');
    });
  });
});
