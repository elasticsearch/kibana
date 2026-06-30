/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  httpServerMock,
  securityServiceMock,
  elasticsearchServiceMock,
} from '@kbn/core/server/mocks';
import { APPLICATION_PREFIX } from '@kbn/security-plugin/common/constants';
import { isAdminFromRequest, getAgentApiAccessFromRequest, getUserFromRequest } from './utils';
import { apiPrivileges } from '../../common/features';

const EXPECTED_ADMIN_HAS_PRIVILEGES_REQUEST = {
  application: [
    {
      application: `${APPLICATION_PREFIX}.kibana`,
      resources: ['*'],
      privileges: ['agent_builder:admin'],
    },
  ],
};

describe('getUserFromRequest', () => {
  let security: ReturnType<typeof securityServiceMock.createStart>;
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    security = securityServiceMock.createStart();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  it('returns user id and username from a real request when getCurrentUser succeeds', async () => {
    const request = httpServerMock.createKibanaRequest();

    security.authc.getCurrentUser.mockReturnValue({
      username: 'testuser',
      profile_uid: 'profile-123',
    } as any);

    const result = await getUserFromRequest({ request, security, esClient });

    expect(result).toEqual({ id: 'profile-123', username: 'testuser' });
    expect(security.authc.getCurrentUser).toHaveBeenCalledWith(request);
    expect(esClient.security.authenticate).not.toHaveBeenCalled();
  });

  it('falls back to ES authenticate API when getCurrentUser returns null for a real request', async () => {
    const request = httpServerMock.createKibanaRequest();

    security.authc.getCurrentUser.mockReturnValue(null);
    esClient.security.authenticate.mockResolvedValue({
      username: 'api-key-user',
    } as any);

    const result = await getUserFromRequest({ request, security, esClient });

    expect(result).toEqual({ username: 'api-key-user' });
    expect(security.authc.getCurrentUser).toHaveBeenCalledWith(request);
    expect(esClient.security.authenticate).toHaveBeenCalledTimes(1);
  });

  it('returns the enriched identity for a fake request without calling ES authenticate', async () => {
    const request = httpServerMock.createFakeKibanaRequest({});

    security.authc.getCurrentUser.mockReturnValue({
      username: 'originating-user',
      profile_uid: 'profile-123',
    } as any);

    const result = await getUserFromRequest({ request, security, esClient });

    expect(result).toEqual({ id: 'profile-123', username: 'originating-user' });
    expect(security.authc.getCurrentUser).toHaveBeenCalledWith(request);
    expect(esClient.security.authenticate).not.toHaveBeenCalled();
  });

  it('falls back to ES authenticate API for un-enriched fake requests', async () => {
    const request = httpServerMock.createFakeKibanaRequest({});

    security.authc.getCurrentUser.mockReturnValue(null);
    esClient.security.authenticate.mockResolvedValue({
      username: 'task-manager-user',
    } as any);

    const result = await getUserFromRequest({ request, security, esClient });

    expect(result).toEqual({ username: 'task-manager-user' });
    expect(security.authc.getCurrentUser).toHaveBeenCalledWith(request);
    expect(esClient.security.authenticate).toHaveBeenCalledTimes(1);
  });

  it('includes the id from getCurrentUser when falling back to ES authenticate for the username', async () => {
    const request = httpServerMock.createFakeKibanaRequest({});

    // getCurrentUser resolves a profile_uid but no username, so we still fall back to ES for the username
    security.authc.getCurrentUser.mockReturnValue({ profile_uid: 'profile-456' } as any);
    esClient.security.authenticate.mockResolvedValue({
      username: 'some-user',
    } as any);

    const result = await getUserFromRequest({ request, security, esClient });

    expect(result).toEqual({ id: 'profile-456', username: 'some-user' });
    expect(esClient.security.authenticate).toHaveBeenCalledTimes(1);
  });
});

describe('isAdminFromRequest', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  it('returns true when privilege check authorizes admin privilege', async () => {
    esClient.security.hasPrivileges.mockResolvedValue({
      application: {},
      cluster: {},
      has_all_requested: true,
      index: {},
      username: 'testuser',
    });

    const result = await isAdminFromRequest({ esClient });

    expect(result).toBe(true);
    expect(esClient.security.hasPrivileges).toHaveBeenCalledTimes(1);
    expect(esClient.security.hasPrivileges).toHaveBeenCalledWith(
      EXPECTED_ADMIN_HAS_PRIVILEGES_REQUEST
    );
  });

  it('returns false when privilege check does not authorize admin privilege', async () => {
    esClient.security.hasPrivileges.mockResolvedValue({
      application: {},
      cluster: {},
      has_all_requested: false,
      index: {},
      username: 'testuser',
    });

    const result = await isAdminFromRequest({ esClient });

    expect(result).toBe(false);
    expect(esClient.security.hasPrivileges).toHaveBeenCalledTimes(1);
    expect(esClient.security.hasPrivileges).toHaveBeenCalledWith(
      EXPECTED_ADMIN_HAS_PRIVILEGES_REQUEST
    );
  });

  it('returns false when privilege check throws (fail closed)', async () => {
    esClient.security.hasPrivileges.mockRejectedValue(new Error('Elasticsearch unavailable'));

    const result = await isAdminFromRequest({ esClient });

    expect(result).toBe(false);
    expect(esClient.security.hasPrivileges).toHaveBeenCalledWith(
      EXPECTED_ADMIN_HAS_PRIVILEGES_REQUEST
    );
  });
});

describe('getAgentApiAccessFromRequest', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  it('resolves read and manage privileges for the current space', async () => {
    esClient.security.hasPrivileges.mockResolvedValue({
      application: {
        'kibana-.kibana': {
          'space:default': {
            [apiPrivileges.readAgentBuilder]: true,
            [apiPrivileges.manageAgents]: false,
          },
        },
      },
      cluster: {},
      has_all_requested: false,
      index: {},
      username: 'testuser',
    });

    const result = await getAgentApiAccessFromRequest({ esClient, space: 'default' });

    expect(result).toEqual({
      canReadAgents: true,
      canManageAgents: false,
    });
    expect(esClient.security.hasPrivileges).toHaveBeenCalledTimes(1);
    expect(esClient.security.hasPrivileges).toHaveBeenCalledWith({
      application: [
        {
          application: 'kibana-.kibana',
          resources: ['space:default'],
          privileges: [apiPrivileges.readAgentBuilder, apiPrivileges.manageAgents],
        },
      ],
    });
  });
});
