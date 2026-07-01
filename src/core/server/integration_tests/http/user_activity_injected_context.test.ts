/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import supertest from 'supertest';
import { BehaviorSubject } from 'rxjs';

import type { AuthenticatedUser } from '@kbn/core-security-common';
import { mockCoreContext } from '@kbn/core-base-server-mocks';
import { loggingServiceMock, loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import { contextServiceMock } from '@kbn/core-http-context-server-mocks';
import { docLinksServiceMock } from '@kbn/core-doc-links-server-mocks';
import type { HttpService } from '@kbn/core-http-server-internal';
import { UserActivityService } from '@kbn/core-user-activity-server-internal';
import type { InternalUserActivityServiceSetup } from '@kbn/core-user-activity-server-internal';

import { createInternalHttpService } from '../utilities';

let server: HttpService;

describe('user activity injected context', () => {
  let userActivity: InternalUserActivityServiceSetup;
  let userActivityCore: ReturnType<typeof mockCoreContext.create>;

  beforeEach(async () => {
    const logger = loggingSystemMock.create();
    server = createInternalHttpService({ logger });
    await server.preboot({
      context: contextServiceMock.createPrebootContract(),
      docLinks: docLinksServiceMock.createSetupContract(),
    });

    userActivityCore = mockCoreContext.create();
    userActivityCore.configService.atPath.mockReturnValue(
      new BehaviorSubject({
        enabled: true,
        appenders: new Map([['console', { type: 'console', layout: { type: 'json' } }]]),
        filters: [],
      })
    );
    const loggingService = loggingServiceMock.createInternalSetupContract();
    userActivity = new UserActivityService(userActivityCore).setup({ logging: loggingService });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('injects user/space/session/referrer into user activity logs', async () => {
    const authenticatedUser: AuthenticatedUser = {
      username: 'test_user',
      email: 'test_user@example.com',
      roles: ['superuser'],
      enabled: true,
      authentication_realm: { name: 'test_realm', type: 'test' },
      lookup_realm: { name: 'test_realm', type: 'test' },
      authentication_provider: { type: 'test', name: 'test' },
      authentication_type: 'realm',
      elastic_cloud_user: false,
      profile_uid: 'test_profile_uid',
      http_authentication_scheme: null,
    };

    const httpSetup = await server.setup({
      context: contextServiceMock.createSetupContract(),
      executionContext: executionContextServiceMock.createInternalSetupContract(),
      userActivity,
    });

    httpSetup.registerAuth((req, res, toolkit) => {
      return toolkit.authenticated({ state: authenticatedUser });
    });

    const router = httpSetup.createRouter('');
    router.post(
      {
        path: '/api/user_activity_injected_context/_track',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization (integration test)',
          },
        },
        validate: false,
      },
      async (context, request, response) => {
        userActivity.trackUserAction({
          message: 'ua-test',
          event: { action: 'ua_test_action' as any, type: 'user' },
          object: { id: 'obj-1', name: 'Test Object', type: 'test', tags: ['tag-a'] },
          metadata: { a: 1, b: '2', c: { d: true } },
        });
        return response.ok({ body: { ok: true } });
      }
    );

    const httpStart = await server.start();
    httpStart.setRedactedSessionIdGetter(() => Promise.resolve('some-redacted-sid'));

    const referrer = 'https://example.com/referrer';
    await supertest(httpSetup.server.listener)
      .post('/s/myspace/api/user_activity_injected_context/_track')
      .set('kbn-xsrf', 'true')
      .set('referer', referrer)
      .expect(200);

    const infoCalls = loggingSystemMock.collect(userActivityCore.logger).info;
    expect(infoCalls).toHaveLength(1);

    const [loggedMessage, meta] = infoCalls[0];
    expect(loggedMessage).toBe('ua-test');

    expect(meta).toMatchObject({
      message: 'ua-test',
      event: { action: 'ua_test_action', type: 'user' },
      object: { id: 'obj-1', name: 'Test Object', type: 'test', tags: ['tag-a'] },
      metadata: { a: 1, b: '2', c: { d: true } },
      kibana: { space: { id: 'myspace' } },
      http: { request: { referrer } },
      session: { id: 'some-redacted-sid' },
      client: {
        ip: expect.any(String),
        address: expect.any(String),
      },
      user: {
        id: 'test_profile_uid',
        name: 'test_user',
        email: 'test_user@example.com',
        roles: ['superuser'],
      },
    });
  });
});
