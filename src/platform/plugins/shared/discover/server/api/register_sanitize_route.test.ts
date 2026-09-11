/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MAX_ID_LENGTH } from '@kbn/as-code-shared-schemas';
import type { Type } from '@kbn/config-schema';
import { httpServerMock, httpServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import {
  DISCOVER_SESSION_API_VERSION,
  DISCOVER_SESSION_INTERNAL_API_BASE_PATH,
} from '../../common/constants';
import { registerSanitizeRoute } from './register_sanitize_route';
import { MAX_DISCOVER_SESSION_TAGS } from '@kbn/discover-session-constants';
import type { DiscoverSessionSanitizeResponse } from './schema';
import type { DiscoverSessionSanitizeRequest } from './session_sanitize';
import {
  discoverSessionApiData,
  discoverSessionAttributes,
} from './transforms/transform_discover_session.fixtures';

const SANITIZE_PATH = `${DISCOVER_SESSION_INTERNAL_API_BASE_PATH}/_sanitize`;

describe('registerSanitizeRoute', () => {
  let router: ReturnType<typeof httpServiceMock.createRouter>;

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    registerSanitizeRoute(router.versioned, loggingSystemMock.createLogger());
  });

  const getVersion = () => {
    const version = router.versioned.getRoute('post', SANITIZE_PATH).versions[
      DISCOVER_SESSION_API_VERSION
    ];

    if (!version) {
      throw new Error(
        `No version [${DISCOVER_SESSION_API_VERSION}] registered for ${SANITIZE_PATH}`
      );
    }

    return version;
  };

  const getBodySchema = (): Type<unknown> => {
    const { validate } = getVersion().config;

    if (!validate || typeof validate === 'function' || !validate.request?.body) {
      throw new Error(`No request body validation registered for ${SANITIZE_PATH}`);
    }

    return validate.request.body as Type<unknown>;
  };

  const sanitize = async (body: DiscoverSessionSanitizeRequest) => {
    const response = httpServerMock.createResponseFactory();

    await getVersion().handler(
      {},
      httpServerMock.createKibanaRequest({ method: 'post', path: SANITIZE_PATH, body }),
      response
    );

    expect(response.ok).toHaveBeenCalledTimes(1);

    return response.ok.mock.calls[0][0]?.body as DiscoverSessionSanitizeResponse;
  };

  it('opts out of authorization because it only transforms request data', () => {
    const { config } = router.versioned.getRoute('post', SANITIZE_PATH);

    expect(config.access).toBe('internal');
    expect(config.security).toEqual({
      authz: { enabled: false, reason: expect.any(String) },
    });
  });

  it('returns sanitized session data without warnings for a valid session', async () => {
    const body = await sanitize({ attributes: discoverSessionAttributes });

    expect(body.data).toEqual(discoverSessionApiData);
    expect(body).not.toHaveProperty('warnings');
  });

  it('resolves the requested tag IDs into the sanitized session data', async () => {
    const body = await sanitize({
      attributes: discoverSessionAttributes,
      tags: ['tag-1', 'tag-2'],
    });

    expect(body.data.tags).toEqual(['tag-1', 'tag-2']);
  });

  it('surfaces the warnings emitted while transforming the session', async () => {
    const [firstTab, ...otherTabs] = discoverSessionAttributes.tabs;
    const body = await sanitize({
      attributes: {
        ...discoverSessionAttributes,
        tabs: [
          {
            ...firstTab,
            attributes: { ...firstTab.attributes, controlGroupJson: 'not-json' },
          },
          ...otherTabs,
        ],
      },
    });

    expect(body.warnings).toEqual([
      {
        type: 'dropped_property',
        tab_id: firstTab.id,
        key: 'control_panels',
        message: expect.stringContaining('controlGroupJson is not valid JSON'),
      },
    ]);
    expect(body.data.tabs).toHaveLength(discoverSessionAttributes.tabs.length);
  });

  it('rejects a request body with invalid session attributes', () => {
    const bodySchema = getBodySchema();

    expect(() => bodySchema.validate({ attributes: discoverSessionAttributes })).not.toThrow();
    expect(() => bodySchema.validate({ attributes: { title: 'Session' } })).toThrow(
      /\[attributes.tabs\]/
    );
    expect(() =>
      bodySchema.validate({ attributes: { ...discoverSessionAttributes, tabs: [] } })
    ).toThrow(/\[attributes.tabs\]/);
  });

  it('rejects a request body with oversized tags', () => {
    const bodySchema = getBodySchema();

    expect(() =>
      bodySchema.validate({
        attributes: discoverSessionAttributes,
        tags: new Array(MAX_DISCOVER_SESSION_TAGS + 1).fill('tag'),
      })
    ).toThrow(/\[tags\]: array size is/);
    expect(() =>
      bodySchema.validate({
        attributes: discoverSessionAttributes,
        tags: ['a'.repeat(MAX_ID_LENGTH + 1)],
      })
    ).toThrow(/\[tags.0\]: value has length/);
  });
});
