/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PublicMethodsOf } from '@kbn/utility-types';
import type { I18nService, InternalI18nServicePreboot } from '@kbn/core-i18n-server-internal';
import type { I18nServiceSetup, I18nServiceStart, RequestI18nClient } from '@kbn/core-i18n-server';
import { lazyObject } from '@kbn/lazy-object';

const MOCK_TRANSLATION_HASHES: Record<string, string> = { en: 'MOCK_HASH' };
const MOCK_LOCALES: readonly string[] = ['en'];
const MOCK_AVAILABLE_LOCALES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'en', label: 'English' },
];

const createSetupContractMock = () => {
  const base = lazyObject({
    getLocale: jest.fn().mockReturnValue('en'),
    getLocales: jest.fn().mockReturnValue(MOCK_LOCALES),
    getAvailableLocales: jest.fn().mockReturnValue(MOCK_AVAILABLE_LOCALES),
    getTranslationFiles: jest.fn().mockReturnValue([]),
    getTranslationHash: jest.fn().mockReturnValue('MOCK_HASH'),
    getTranslationHashes: jest.fn().mockReturnValue(MOCK_TRANSLATION_HASHES),
  });

  return { ...base, allowLocaleCookie: true } as jest.Mocked<I18nServiceSetup>;
};

const createRequestClientMock = (): jest.Mocked<RequestI18nClient> => {
  const mock: jest.Mocked<RequestI18nClient> = {
    getLocale: jest.fn(),
    translate: jest.fn(),
    formatList: jest.fn(),
  };

  mock.getLocale.mockResolvedValue('en');
  // Fall back to the provided defaultMessage, like the real client.
  mock.translate.mockImplementation(async (_id, args) =>
    typeof args.defaultMessage === 'string' ? args.defaultMessage : ''
  );
  mock.formatList.mockResolvedValue('');

  return mock;
};

const createStartContractMock = (): jest.Mocked<I18nServiceStart> => {
  const mock: jest.Mocked<I18nServiceStart> = {
    asScopedToRequest: jest.fn(),
  };

  mock.asScopedToRequest.mockImplementation(() => createRequestClientMock());

  return mock;
};

const createInternalPrebootMock = () => {
  const base = lazyObject({
    getTranslationHash: jest.fn(),
    getTranslationHashes: jest.fn(),
    getAvailableLocales: jest.fn(),
  });

  const mock = { ...base, allowLocaleCookie: true } as jest.Mocked<InternalI18nServicePreboot>;

  mock.getTranslationHash.mockReturnValue('MOCK_HASH');
  mock.getTranslationHashes.mockReturnValue(MOCK_TRANSLATION_HASHES);
  mock.getAvailableLocales.mockReturnValue(MOCK_AVAILABLE_LOCALES);

  return mock;
};

type I18nServiceContract = PublicMethodsOf<I18nService>;

const createMock = () => {
  const mock: jest.Mocked<I18nServiceContract> = lazyObject({
    preboot: jest.fn(),
    setup: jest.fn().mockResolvedValue(createSetupContractMock()),
    start: jest.fn().mockReturnValue(createStartContractMock()),
  });

  return mock;
};

export const i18nServiceMock = {
  create: createMock,
  createSetupContract: createSetupContractMock,
  createStartContract: createStartContractMock,
  createRequestClient: createRequestClientMock,
  createInternalPrebootContract: createInternalPrebootMock,
};
