/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core/server';
import { coreMock } from '@kbn/core/server/mocks';
import { SavedSearchType } from '@kbn/saved-search-plugin/common';
import { discoverSessionAttributes } from './transforms/transform_discover_session.fixtures';
import { getDiscoverSession } from './session_get';

describe('getDiscoverSession', () => {
  it('returns the session and resolution headers when resolving results in a conflict', async () => {
    const id = 'conflicting-session';
    const aliasTargetId = 'alias-target-session';
    const core = coreMock.createRequestHandlerContext();

    core.savedObjects.client.resolve.mockResolvedValue({
      outcome: 'conflict',
      alias_target_id: aliasTargetId,
      alias_purpose: 'savedObjectConversion',
      saved_object: {
        id,
        type: SavedSearchType,
        attributes: discoverSessionAttributes,
        references: [],
      },
    });

    const requestContext = {
      loadPluginContract: jest.fn(),
      resolve: jest.fn().mockResolvedValue({ core }),
    } as unknown as RequestHandlerContext;

    await expect(getDiscoverSession(requestContext, id)).resolves.toMatchObject({
      body: {
        id,
        data: { title: discoverSessionAttributes.title },
      },
      resolveHeaders: {
        'kbn-resolve-outcome': 'conflict',
        'kbn-resolve-alias-target-id': aliasTargetId,
        'kbn-resolve-purpose': 'savedObjectConversion',
      },
    });

    expect(core.savedObjects.client.resolve).toHaveBeenCalledWith(SavedSearchType, id);
  });
});
