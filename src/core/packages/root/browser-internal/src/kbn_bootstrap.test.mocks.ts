/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { applicationServiceMock } from '@kbn/core-application-browser-mocks';
import { fatalErrorsServiceMock } from '@kbn/core-fatal-errors-browser-mocks';

export const fatalErrorMock = fatalErrorsServiceMock.createSetupContract();
export const coreSystemMock = {
  setup: jest.fn().mockResolvedValue({
    fatalErrors: fatalErrorMock,
  }),
  start: jest.fn().mockResolvedValue({
    application: applicationServiceMock.createInternalStartContract(),
  }),
};
jest.doMock('./core_system', () => ({
  CoreSystem: jest.fn().mockImplementation(() => coreSystemMock),
}));

export const apmSystem = {
  setup: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
};
export const ApmSystemConstructor = jest.fn().mockImplementation(() => apmSystem);
jest.doMock('./apm_system', () => ({
  ApmSystem: ApmSystemConstructor,
}));

export const i18nLoad = jest.fn().mockResolvedValue(undefined);
export const i18nInitDefault = jest.fn().mockReturnValue(undefined);
export const i18nGetIsInitialized = jest.fn().mockReturnValue(false);
export const setAvailableLocalesMock = jest.fn();
jest.doMock('@kbn/i18n', () => ({
  i18n: {
    ...jest.requireActual('@kbn/i18n').i18n,
    load: i18nLoad,
    initDefault: i18nInitDefault,
    getIsInitialized: i18nGetIsInitialized,
  },
  setAvailableLocales: setAvailableLocalesMock,
}));
