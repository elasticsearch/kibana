/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IUiSettingsMetadataClient } from '@kbn/core-ui-settings-browser';
import { clientMock } from './client.mock';
import { serviceContractMock } from './service_contract.mock';
import { lazyObject } from '@kbn/lazy-object';

const metadataClientMock = (): jest.Mocked<IUiSettingsMetadataClient> => ({
  getAll: jest.fn().mockResolvedValue({}),
});

const createSetupContractMock = () => {
  return lazyObject({
    client: clientMock(),
    globalClient: clientMock(),
    metadata: metadataClientMock(),
  });
};

const createStartContractMock = createSetupContractMock;

const createMock = () => {
  const mocked = serviceContractMock();
  mocked.setup.mockReturnValue(createSetupContractMock());
  mocked.start.mockReturnValue(createStartContractMock());
  return mocked;
};

export const settingsServiceMock = {
  create: createMock,
  createSetupContract: createSetupContractMock,
  createStartContract: createStartContractMock,
};
