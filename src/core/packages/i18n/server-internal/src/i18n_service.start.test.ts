/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  getAllKibanaTranslationFilesMock,
  groupFilesByLocaleMock,
  computeLocaleFileHashMock,
} from './i18n_service.test.mocks';

import { BehaviorSubject } from 'rxjs';
import { i18nLoader } from '@kbn/i18n';
import { configServiceMock } from '@kbn/config-mocks';
import { mockCoreContext } from '@kbn/core-base-server-mocks';
import { httpServiceMock, httpServerMock } from '@kbn/core-http-server-mocks';
import type { InternalUserSettingsServiceSetup } from '@kbn/core-user-settings-server-internal';

import { I18nService } from './i18n_service';

const getConfigService = (defaultLocale = 'en', locales: string[] = ['en', 'fr-FR', 'ja-JP']) => {
  const configService = configServiceMock.create();
  configService.atPath.mockImplementation((path) => {
    if (path === 'i18n') {
      return new BehaviorSubject({ defaultLocale, locales });
    }
    return new BehaviorSubject({});
  });
  return configService;
};

const createUserSettings = (
  locale: string | undefined
): jest.Mocked<InternalUserSettingsServiceSetup> => ({
  getUserSettingDarkMode: jest.fn().mockResolvedValue(undefined),
  getUserSettingLocale: jest.fn().mockResolvedValue(locale),
  getUserSettingRememberSelectedSpace: jest.fn().mockResolvedValue(true),
});

describe('I18nService#start', () => {
  let service: I18nService;
  let configService: ReturnType<typeof configServiceMock.create>;
  let httpPreboot: ReturnType<typeof httpServiceMock.createInternalPrebootContract>;
  let httpSetup: ReturnType<typeof httpServiceMock.createInternalSetupContract>;
  let coreContext: ReturnType<typeof mockCoreContext.create>;
  let getTranslationsByLocaleSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    getAllKibanaTranslationFilesMock.mockResolvedValue([]);
    groupFilesByLocaleMock.mockReturnValue({});
    computeLocaleFileHashMock.mockResolvedValue('mock-file-hash');

    getTranslationsByLocaleSpy = jest
      .spyOn(i18nLoader, 'getTranslationsByLocale')
      .mockResolvedValue({ locale: 'fr-FR', messages: { greeting: 'Bonjour' } });

    configService = getConfigService();
    coreContext = mockCoreContext.create({ configService });
    service = new I18nService(coreContext);

    httpPreboot = httpServiceMock.createInternalPrebootContract();
    httpPreboot.registerRoutes.mockImplementation((type, callback) =>
      callback(httpServiceMock.createRouter())
    );
    httpSetup = httpServiceMock.createInternalSetupContract();

    await service.preboot({ pluginPaths: [], http: httpPreboot });
    await service.setup({ pluginPaths: [], http: httpSetup });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws if called before setup', () => {
    const freshService = new I18nService(mockCoreContext.create({ configService }));
    expect(() => freshService.start({ userSettings: createUserSettings('fr-FR') })).toThrow(
      'I18nService#start called before #setup'
    );
  });

  it('does not build any translator until a request method is called', () => {
    const { asScopedToRequest } = service.start({ userSettings: createUserSettings('fr-FR') });

    // Creating the scoped client must not resolve the locale or load files.
    asScopedToRequest(httpServerMock.createKibanaRequest());

    expect(getTranslationsByLocaleSpy).not.toHaveBeenCalled();
  });

  it('resolves the user profile locale and translates from that locale file', async () => {
    const userSettings = createUserSettings('fr-FR');
    const { asScopedToRequest } = service.start({ userSettings });

    const client = asScopedToRequest(httpServerMock.createKibanaRequest());

    await expect(client.getLocale()).resolves.toBe('fr-FR');
    await expect(client.translate('greeting', { defaultMessage: 'Hello' })).resolves.toBe(
      'Bonjour'
    );
    expect(userSettings.getUserSettingLocale).toHaveBeenCalledTimes(1);
    expect(getTranslationsByLocaleSpy).toHaveBeenCalledWith('fr-FR');
  });

  it('reuses the cached translator across requests for the same locale', async () => {
    const { asScopedToRequest } = service.start({ userSettings: createUserSettings('fr-FR') });

    const first = asScopedToRequest(httpServerMock.createKibanaRequest());
    const second = asScopedToRequest(httpServerMock.createKibanaRequest());

    await first.translate('greeting', { defaultMessage: 'Hello' });
    await second.translate('greeting', { defaultMessage: 'Hello' });

    // The translator for 'fr-FR' is built once and shared across requests.
    expect(getTranslationsByLocaleSpy).toHaveBeenCalledTimes(1);
  });

  it('memoises the resolved locale per request', async () => {
    const userSettings = createUserSettings('fr-FR');
    const { asScopedToRequest } = service.start({ userSettings });

    const client = asScopedToRequest(httpServerMock.createKibanaRequest());

    await client.getLocale();
    await client.translate('greeting', { defaultMessage: 'Hello' });
    await client.formatList('conjunction', ['a', 'b']);

    // The (async) profile lookup happens at most once per request.
    expect(userSettings.getUserSettingLocale).toHaveBeenCalledTimes(1);
  });

  it('uses the singleton messages for the default locale without hitting the loader', async () => {
    const { asScopedToRequest } = service.start({ userSettings: createUserSettings('en') });

    const client = asScopedToRequest(httpServerMock.createKibanaRequest());

    await expect(client.getLocale()).resolves.toBe('en');
    // No file in the test, so the default-locale translator falls back to the
    // provided defaultMessage — and crucially never calls the loader.
    await expect(client.translate('greeting', { defaultMessage: 'Hello' })).resolves.toBe('Hello');
    expect(getTranslationsByLocaleSpy).not.toHaveBeenCalled();
  });
});
