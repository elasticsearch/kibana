/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { DEFAULT_SPACE_ID, resolveSpaceId } from './resolve_space_id';

describe('resolveSpaceId', () => {
  const request = httpServerMock.createKibanaRequest();

  it('returns the space id reported by the spaces service', () => {
    const spaces = {
      spacesService: { getSpaceId: jest.fn().mockReturnValue('marketing') },
    } as unknown as SpacesPluginStart;

    expect(resolveSpaceId(spaces, request)).toBe('marketing');
    expect(spaces.spacesService.getSpaceId).toHaveBeenCalledWith(request);
  });

  it('falls back to the default space when the spaces plugin is absent', () => {
    expect(resolveSpaceId(undefined, request)).toBe(DEFAULT_SPACE_ID);
  });
});
