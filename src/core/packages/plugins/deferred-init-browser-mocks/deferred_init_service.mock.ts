/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';
import { lazyObject } from '@kbn/lazy-object';
import { serviceContractMock } from './service_contract.mock';

const createSetupContractMock = () => {
  return lazyObject({
    getStatus$: jest.fn().mockReturnValue(of({ status: 'available' })),
  });
};

const createStartContractMock = () => {
  return lazyObject({
    getStatus$: jest.fn().mockReturnValue(of({ status: 'available' })),
    refresh: jest.fn(),
  });
};

const createMock = () => {
  const mocked = serviceContractMock();
  mocked.setup.mockReturnValue(createSetupContractMock());
  mocked.start.mockReturnValue(createStartContractMock());
  return mocked;
};

export const deferredInitServiceMock = {
  create: createMock,
  createSetupContract: createSetupContractMock,
  createStartContract: createStartContractMock,
};
