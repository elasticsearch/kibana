/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { getAccessibleSpaceIds } from './get_accessible_space_ids';

describe('getAccessibleSpaceIds', () => {
  const request = httpServerMock.createKibanaRequest();

  const createMockPlugins = ({
    spaces,
    privileges,
  }: {
    spaces?: Array<{ id: string }>;
    privileges?: Array<{ resource: string; authorized: boolean }>;
  } = {}) => {
    const sloReadAction = 'api:slo_read';

    const mockPlugins: any = {
      security: {
        setup: {
          authz: {
            actions: {
              api: {
                get: (action: string) => `api:${action}`,
              },
            },
            checkPrivilegesWithRequest: () => ({
              atSpaces: async () => ({
                privileges: {
                  kibana: (privileges ?? []).map((p) => ({
                    ...p,
                    privilege: sloReadAction,
                  })),
                },
              }),
            }),
          },
        },
      },
    };

    if (spaces !== undefined) {
      mockPlugins.spaces = {
        start: async () => ({
          spacesService: {
            createSpacesClient: () => ({
              getAll: async () => spaces,
            }),
          },
        }),
      };
    }

    return mockPlugins;
  };

  it('returns activeSpaceId when spaces plugin is not available', async () => {
    const plugins = createMockPlugins();

    const result = await getAccessibleSpaceIds({
      plugins,
      request,
      activeSpaceId: 'my-space',
    });

    expect(result).toEqual(['my-space']);
  });

  it('returns activeSpaceId when getAll returns empty', async () => {
    const plugins = createMockPlugins({ spaces: [], privileges: [] });

    const result = await getAccessibleSpaceIds({
      plugins,
      request,
      activeSpaceId: 'fallback',
    });

    expect(result).toEqual(['fallback']);
  });

  it('returns only spaces where the user has slo_read privilege', async () => {
    const plugins = createMockPlugins({
      spaces: [{ id: 'space-a' }, { id: 'space-b' }, { id: 'space-c' }],
      privileges: [
        { resource: 'space-a', authorized: true },
        { resource: 'space-b', authorized: false },
        { resource: 'space-c', authorized: true },
      ],
    });

    const result = await getAccessibleSpaceIds({
      plugins,
      request,
      activeSpaceId: 'space-a',
    });

    expect(result).toEqual(['space-a', 'space-c']);
  });

  it('returns all spaces when user has slo_read in all', async () => {
    const plugins = createMockPlugins({
      spaces: [{ id: 'default' }, { id: 'space-b' }],
      privileges: [
        { resource: 'default', authorized: true },
        { resource: 'space-b', authorized: true },
      ],
    });

    const result = await getAccessibleSpaceIds({
      plugins,
      request,
      activeSpaceId: 'default',
    });

    expect(result).toEqual(['default', 'space-b']);
  });

  it('falls back to activeSpaceId when no spaces are authorized', async () => {
    const plugins = createMockPlugins({
      spaces: [{ id: 'space-a' }, { id: 'space-b' }],
      privileges: [
        { resource: 'space-a', authorized: false },
        { resource: 'space-b', authorized: false },
      ],
    });

    const result = await getAccessibleSpaceIds({
      plugins,
      request,
      activeSpaceId: 'space-a',
    });

    expect(result).toEqual(['space-a']);
  });
});
