/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';

import {
  DEFAULT_DOWNLOAD_SOURCE_REFERENCE,
  DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
} from '../../constants';
import type { AgentPolicy } from '../../types';
import { appContextService } from '../../services/app_context';

import {
  getDownloadSourceForAgentPolicy,
  getDownloadSourcesForAgentPolicy,
} from './source_uri_utils';

jest.mock('../../services/app_context');
const mockedAppContextService = appContextService as jest.Mocked<typeof appContextService>;
mockedAppContextService.getSecuritySetup.mockImplementation(() => ({
  ...securityMock.createSetup(),
}));

function getMockedSoClient() {
  const soClientMock = savedObjectsClientMock.create();

  soClientMock.find.mockResolvedValue({
    saved_objects: [
      {
        id: 'default-download-source-id',
        is_default: true,
        attributes: {
          download_source_id: 'test-source-id',
        },
      },
      {
        id: 'test-ds-1',
        attributes: {
          download_source_id: 'test-ds-1',
        },
      },
    ],
  } as any);

  mockedAppContextService.getInternalUserSOClient.mockReturnValue(soClientMock);

  return soClientMock;
}

function getMockedEncryptedSoClient() {
  const esoClientMock: jest.Mocked<EncryptedSavedObjectsClient> = {
    getDecryptedAsInternalUser: jest.fn(),
    createPointInTimeFinderDecryptedAsInternalUser: jest.fn(),
  };

  esoClientMock.getDecryptedAsInternalUser.mockImplementation(async (type: string, id: string) => {
    switch (id) {
      case 'test-ds-1': {
        return mockDownloadSourceSO('test-ds-1', {
          is_default: false,
          name: 'Test',
          host: 'http://custom-registry-test',
        });
      }
      case 'default-download-source-id': {
        return mockDownloadSourceSO('default-download-source-id', {
          is_default: true,
          name: 'Default host',
          host: 'http://default-registry.co',
        });
      }
      default:
        throw new Error('not found: ' + id);
    }
  });

  mockedAppContextService.getEncryptedSavedObjects.mockReturnValue(esoClientMock);

  return esoClientMock;
}

function mockDownloadSourceSO(id: string, attributes: any = {}) {
  return {
    id,
    type: DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
    references: [],
    attributes: {
      source_id: id,
      ...attributes,
    },
  };
}
describe('helpers', () => {
  beforeEach(() => {});
  describe('getDownloadSourceForAgentPolicy', () => {
    it('should return the dowload source object set on an agent policy ', async () => {
      getMockedSoClient();
      getMockedEncryptedSoClient();
      const agentPolicy: AgentPolicy = {
        id: 'agent-policy-id',
        status: 'active',
        package_policies: [],
        is_managed: false,
        namespace: 'default',
        revision: 1,
        name: 'Policy',
        updated_at: '2022-01-01',
        updated_by: 'qwerty',
        download_source_id: 'test-ds-1',
        is_protected: false,
      };

      expect(await getDownloadSourceForAgentPolicy(agentPolicy)).toEqual({
        host: 'http://custom-registry-test',
        id: 'test-ds-1',
        is_default: false,
        name: 'Test',
      });
    });

    it('should return the default download source object if there is none set on the agent policy ', async () => {
      getMockedSoClient();
      getMockedEncryptedSoClient();
      const agentPolicy: AgentPolicy = {
        id: 'agent-policy-id',
        status: 'active',
        package_policies: [],
        is_managed: false,
        namespace: 'default',
        revision: 1,
        name: 'Policy',
        updated_at: '2022-01-01',
        updated_by: 'qwerty',
        is_protected: false,
      };

      expect(await getDownloadSourceForAgentPolicy(agentPolicy)).toEqual({
        host: 'http://default-registry.co',
        id: 'default-download-source-id',
        is_default: true,
        name: 'Default host',
      });
    });
  });

  describe('getDownloadSourcesForAgentPolicy', () => {
    it('should return all sources when download_source_ids is set', async () => {
      getMockedSoClient();
      getMockedEncryptedSoClient();
      const agentPolicy: AgentPolicy = {
        id: 'agent-policy-id',
        status: 'active',
        package_policies: [],
        is_managed: false,
        namespace: 'default',
        revision: 1,
        name: 'Policy',
        updated_at: '2022-01-01',
        updated_by: 'qwerty',
        download_source_ids: ['test-ds-1', 'default-download-source-id'],
        is_protected: false,
      };

      expect(await getDownloadSourcesForAgentPolicy(agentPolicy)).toEqual([
        { host: 'http://custom-registry-test', id: 'test-ds-1', is_default: false, name: 'Test' },
        {
          host: 'http://default-registry.co',
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
        },
      ]);
    });

    it('should resolve the default reference to whichever source is currently default', async () => {
      getMockedSoClient();
      getMockedEncryptedSoClient();
      const agentPolicy: AgentPolicy = {
        id: 'agent-policy-id',
        status: 'active',
        package_policies: [],
        is_managed: false,
        namespace: 'default',
        revision: 1,
        name: 'Policy',
        updated_at: '2022-01-01',
        updated_by: 'qwerty',
        download_source_ids: [DEFAULT_DOWNLOAD_SOURCE_REFERENCE, 'test-ds-1'],
        is_protected: false,
      };

      expect(await getDownloadSourcesForAgentPolicy(agentPolicy)).toEqual([
        {
          host: 'http://default-registry.co',
          id: 'default-download-source-id',
          is_default: true,
          name: 'Default host',
        },
        { host: 'http://custom-registry-test', id: 'test-ds-1', is_default: false, name: 'Test' },
      ]);
    });

    it('should fall back to download_source_id when download_source_ids is not set', async () => {
      getMockedSoClient();
      getMockedEncryptedSoClient();
      const agentPolicy: AgentPolicy = {
        id: 'agent-policy-id',
        status: 'active',
        package_policies: [],
        is_managed: false,
        namespace: 'default',
        revision: 1,
        name: 'Policy',
        updated_at: '2022-01-01',
        updated_by: 'qwerty',
        download_source_id: 'test-ds-1',
        is_protected: false,
      };

      expect(await getDownloadSourcesForAgentPolicy(agentPolicy)).toEqual([
        { host: 'http://custom-registry-test', id: 'test-ds-1', is_default: false, name: 'Test' },
      ]);
    });
  });
});
