/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setTimeout as setTimeoutAsync } from 'timers/promises';
import type { Cookie } from 'tough-cookie';

import expect from '@kbn/expect';
import { findSessionCookie } from '@kbn/security-api-integration-helpers';

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const config = getService('config');
  const es = getService('es');

  const kibanaServerConfig = config.get('servers.kibana');
  const validUsername = kibanaServerConfig.username;
  const validPassword = kibanaServerConfig.password;

  // Get `createdAt` values from all existing sessions. It's the easiest solution
  // to check that the values weren't modified since we cannot get the specific
  // session id used during a test run, and we might have lots of unrelated
  // sessions in the index created by the tests that didn't clean up the index.
  async function getSessionsCreatedAt() {
    await es.indices.refresh({ index: '.kibana_security_session*' });
    const searchResponse = await es.search<{ createdAt: number }>({
      index: '.kibana_security_session*',
    });

    return searchResponse.hits.hits.map((hit) => hit._source!.createdAt).sort();
  }

  describe('Session', () => {
    let sessionCookie: Cookie;

    const saveCookie = async (response: any) => {
      // save the response cookie, and pass back the result
      sessionCookie = findSessionCookie(response.headers['set-cookie']);
      return response;
    };
    const getSessionInfo = async () => {
      return supertestWithoutAuth
        .get('/internal/security/session')
        .set('kbn-xsrf', 'xxx')
        .set('kbn-system-request', 'true')
        .set('Cookie', sessionCookie.cookieString())
        .send()
        .expect(200);
    };
    const extendSession = async () => {
      return supertestWithoutAuth
        .post('/internal/security/session')
        .set('kbn-xsrf', 'xxx')
        .set('Cookie', sessionCookie.cookieString())
        .send()
        .expect(302)
        .then(saveCookie);
    };

    beforeEach(async () => {
      await supertestWithoutAuth
        .post('/internal/security/login')
        .set('kbn-xsrf', 'xxx')
        .send({
          providerType: 'basic',
          providerName: 'basic1',
          currentURL: '/',
          params: { username: validUsername, password: validPassword },
        })
        .expect(200)
        .then(saveCookie);
    });

    describe('GET /internal/security/session', () => {
      it('should return current session information', async () => {
        const { body } = await getSessionInfo();
        expect(body.expiresInMs).to.be.a('number');
        expect(body.canBeExtended).to.be(true);
        expect(body.provider).to.eql({ type: 'basic', name: 'basic1' });
      });

      it('should not extend the session', async () => {
        const { body } = await getSessionInfo();
        const { body: body2 } = await getSessionInfo();
        expect(body2.expiresInMs).to.be.lessThan(body.expiresInMs);
      });
    });

    describe('POST /internal/security/session', () => {
      it('should redirect to GET', async () => {
        const response = await extendSession();
        expect(response.headers.location).to.be('/internal/security/session');
      });

      it('should extend the session', async () => {
        // browsers will follow the redirect and return the new session info, but this testing framework does not
        // we simulate that behavior in this test by sending another GET request

        // Make sure that all sessions have populated `createdAt` field.
        const sessionsCreatedAtBeforeExtension = await getSessionsCreatedAt();
        expect(sessionsCreatedAtBeforeExtension.every((createdAt) => createdAt > 0)).to.be(true);

        // Make sure that the session time has somewhat elapsed to ensure
        // there is a noticable difference after extending the session
        await setTimeoutAsync(200);
        await getSessionInfo();
        await extendSession();
        const afterExtend = Date.now();
        const { body: body2 } = await getSessionInfo();
        const getOverhead = Date.now() - afterExtend;

        // POST resets the idle timer to now + idleTimeout (10s in this config).
        // After the follow-up GET, expiresInMs should be close to the full
        // idleTimeout, minus only that GET's round-trip overhead. This avoids
        // racing the two GETs' variable round-trips against each other.
        const idleTimeoutMs = 10_000;
        expect(body2.expiresInMs).to.be.greaterThan(idleTimeoutMs - getOverhead - 100);
        expect(body2.expiresInMs).to.be.lessThan(idleTimeoutMs + 100);

        // Check that session extension didn't alter `createdAt`.
        expect(await getSessionsCreatedAt()).to.eql(sessionsCreatedAtBeforeExtension);
      });
    });
  });
}
