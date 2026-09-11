/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core/server/mocks';
import { asSpaceId } from '@kbn/core-spaces-common';
import { spacesMock } from '@kbn/spaces-plugin/server/mocks';
import { DEFAULT_SPACE_ID, resolveSpaceId } from './resolve_space_id';

describe('resolveSpaceId', () => {
  const request = httpServerMock.createKibanaRequest();

  it('returns the default space id when the spaces plugin is unavailable', () => {
    expect(resolveSpaceId(undefined, request)).toBe(DEFAULT_SPACE_ID);
  });

  it('delegates to spacesService.getSpaceId when the spaces plugin is available', () => {
    const spaces = spacesMock.createStart();
    spaces.spacesService.getSpaceId.mockReturnValue(asSpaceId('marketing'));

    expect(resolveSpaceId(spaces, request)).toBe('marketing');
    expect(spaces.spacesService.getSpaceId).toHaveBeenCalledWith(request);
  });
});
