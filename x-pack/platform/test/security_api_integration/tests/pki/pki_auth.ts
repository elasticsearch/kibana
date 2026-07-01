/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect as jestExpect } from 'expect';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setTimeout as setTimeoutAsync } from 'timers/promises';
import type { Cookie } from 'tough-cookie';

import { CA_CERT_PATH } from '@kbn/dev-utils';
import expect from '@kbn/expect';
import { findSessionCookie } from '@kbn/security-api-integration-helpers';
import { adminTestUser } from '@kbn/test';

import type { FtrProviderContext } from '../../ftr_provider_context';
import { FileWrapper } from '../audit/file_wrapper';

const CA_CERT = readFileSync(CA_CERT_PATH);
const FIRST_CLIENT_CERT = readFileSync(
  require.resolve('@kbn/security-api-integration-helpers/pki/first_client.p12')
);
const SECOND_CLIENT_CERT = readFileSync(
  require.resolve('@kbn/security-api-integration-helpers/pki/second_client.p12')
);
const UNTRUSTED_CLIENT_CERT = readFileSync(
  require.resolve('@kbn/security-api-integration-helpers/pki/untrusted_client.p12')
);

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertestWithoutAuth');
  const retry = getService('retry');

  function checkCookieIsSet(cookie: Cookie) {
    expect(cookie.value).to.not.be.empty();

    expect(cookie.key).to.be('sid');
    expect(cookie.path).to.be('/');
    expect(cookie.httpOnly).to.be(true);
    expect(cookie.maxAge).to.be(null);
  }

  function checkCookieIsCleared(cookie: Cookie) {
    expect(cookie.value).to.be.empty();

    expect(cookie.key).to.be('sid');
    expect(cookie.path).to.be('/');
    expect(cookie.httpOnly).to.be(true);
    expect(cookie.maxAge).to.be(0);
  }

  describe('PKI authentication', () => {
    before(async () => {
      await getService('esSupertest')
        .post('/_security/role_mapping/first_client_pki')
        .ca(CA_CERT)
        .send({
          roles: ['kibana_admin'],
          enabled: true,
          rules: { field: { dn: 'CN=first_client' } },
        })
        .expect(200);
    });

    it('should reject API requests that use untrusted certificate', async () => {
      await supertest
        .get('/internal/security/me')
        .ca(CA_CERT)
        .pfx(UNTRUSTED_CLIENT_CERT)
        .set('kbn-xsrf', 'xxx')
        .expect(401, { statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' });
    });

    it('should fail and redirect if untrusted certificate is used', async () => {
      // Unlike the call to '/internal/security/me' above, this route can be redirected (see pre-response in `AuthenticationService`).
      const unauthenticatedResponse = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(UNTRUSTED_CLIENT_CERT)
        .expect(401);

      expect(unauthenticatedResponse.headers['content-security-policy']).to.be.a('string');
      expect(unauthenticatedResponse.text).to.contain('<h1>Unauthenticated</h1>');
    });

    it('does not prevent basic login', async () => {
      const response = await supertest
        .post('/internal/security/login')
        .ca(CA_CERT)
        .pfx(UNTRUSTED_CLIENT_CERT)
        .set('kbn-xsrf', 'xxx')
        .send({
          providerType: 'basic',
          providerName: 'basic',
          currentURL: '/',
          params: { username: adminTestUser.username, password: adminTestUser.password },
        })
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const cookie = findSessionCookie(cookies);
      checkCookieIsSet(cookie);

      const { body: user } = await supertest
        .get('/internal/security/me')
        .ca(CA_CERT)
        .pfx(UNTRUSTED_CLIENT_CERT)
        .set('kbn-xsrf', 'xxx')
        .set('Cookie', cookie.cookieString())
        .expect(200);

      expect(user.username).to.eql(adminTestUser.username);
      expect(user.authentication_provider).to.eql({ type: 'basic', name: 'basic' });
      // Do not assert on the `authentication_realm`, as the value differs for on-prem vs cloud
    });

    it('AJAX requests should not create a new session', async () => {
      const ajaxResponse = await supertest
        .get('/internal/security/me')
        .set('kbn-xsrf', 'xxx')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(401);

      expect(ajaxResponse.headers['set-cookie']).to.be(undefined);
    });

    it('should properly set cookie and authenticate user', async () => {
      let response = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const sessionCookie = findSessionCookie(cookies);
      checkCookieIsSet(sessionCookie);

      // Cookie should be accepted.
      response = await supertest
        .get('/internal/security/me')
        .set('kbn-xsrf', 'xxx')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .set('Cookie', sessionCookie.cookieString())
        .expect(200);

      jestExpect(response.body).toMatchObject({
        username: 'first_client',
        roles: ['kibana_admin'],
        full_name: null,
        email: null,
        enabled: true,
        metadata: {
          pki_delegated_by_realm: 'reserved',
          pki_delegated_by_user: 'kibana_system',
          pki_dn: 'CN=first_client',
        },
        authentication_realm: { name: 'pki1', type: 'pki' },
        lookup_realm: { name: 'pki1', type: 'pki' },
        authentication_provider: { name: 'pki', type: 'pki' },
        authentication_type: 'token',
        elastic_cloud_user: false,
        profile_uid: jestExpect.any(String),
      });
    });

    it('should update session if new certificate is provided', async () => {
      let response = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const sessionCookie = findSessionCookie(cookies);
      checkCookieIsSet(sessionCookie);

      response = await supertest
        .get('/internal/security/me')
        .ca(CA_CERT)
        .pfx(SECOND_CLIENT_CERT)
        .set('kbn-xsrf', 'xxx')
        .set('Cookie', sessionCookie.cookieString())
        .expect(200);

      jestExpect(response.body).toEqual({
        username: 'second_client',
        roles: [],
        full_name: null,
        email: null,
        enabled: true,
        metadata: {
          pki_delegated_by_realm: 'reserved',
          pki_delegated_by_user: 'kibana_system',
          pki_dn: 'CN=second_client',
        },
        authentication_realm: { name: 'pki1', type: 'pki' },
        lookup_realm: { name: 'pki1', type: 'pki' },
        authentication_provider: { name: 'pki', type: 'pki' },
        authentication_type: 'realm',
        elastic_cloud_user: false,
        profile_uid: jestExpect.any(String),
        http_authentication_scheme: null,
      });

      checkCookieIsSet(findSessionCookie(response.headers['set-cookie']));
    });

    it('should reject valid cookie if used with untrusted certificate', async () => {
      const response = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const sessionCookie = findSessionCookie(cookies);
      checkCookieIsSet(sessionCookie);

      await supertest
        .get('/internal/security/me')
        .ca(CA_CERT)
        .pfx(UNTRUSTED_CLIENT_CERT)
        .set('Cookie', sessionCookie.cookieString())
        .expect(401);
    });

    describe('API access with active session', () => {
      let sessionCookie: Cookie;

      beforeEach(async () => {
        const response = await supertest
          .get('/security/account')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .expect(200);

        const cookies = response.headers['set-cookie'];
        sessionCookie = findSessionCookie(cookies);
        checkCookieIsSet(sessionCookie);
      });

      it('should extend cookie on every successful non-system API call', async () => {
        const apiResponseOne = await supertest
          .get('/internal/security/me')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('kbn-xsrf', 'xxx')
          .set('Cookie', sessionCookie.cookieString())
          .expect(200);

        expect(apiResponseOne.headers['set-cookie']).to.not.be(undefined);
        const sessionCookieOne = findSessionCookie(apiResponseOne.headers['set-cookie']);

        checkCookieIsSet(sessionCookieOne);
        expect(sessionCookieOne.value).to.not.equal(sessionCookie.value);

        const apiResponseTwo = await supertest
          .get('/internal/security/me')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('kbn-xsrf', 'xxx')
          .set('Cookie', sessionCookie.cookieString())
          .expect(200);

        expect(apiResponseTwo.headers['set-cookie']).to.not.be(undefined);
        const sessionCookieTwo = findSessionCookie(apiResponseTwo.headers['set-cookie']);

        checkCookieIsSet(sessionCookieTwo);
        expect(sessionCookieTwo.value).to.not.equal(sessionCookieOne.value);
      });

      it('should not extend cookie for system API calls', async () => {
        const systemAPIResponse = await supertest
          .get('/internal/security/me')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('kbn-xsrf', 'xxx')
          .set('kbn-system-request', 'true')
          .set('Cookie', sessionCookie.cookieString())
          .expect(200);

        expect(systemAPIResponse.headers['set-cookie']).to.be(undefined);
      });

      it('should fail and preserve session cookie if unsupported authentication schema is used', async () => {
        const apiResponse = await supertest
          .get('/internal/security/me')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('kbn-xsrf', 'xxx')
          .set('Authorization', 'Basic a3JiNTprcmI1')
          .set('Cookie', sessionCookie.cookieString())
          .expect(401);

        expect(apiResponse.headers['set-cookie']).to.be(undefined);
      });
    });

    describe('logging out', () => {
      it('should redirect to `logged_out` page after successful logout', async () => {
        // First authenticate user to retrieve session cookie.
        const response = await supertest
          .get('/security/account')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .expect(200);

        let cookies = response.headers['set-cookie'];
        const sessionCookie = findSessionCookie(cookies);
        checkCookieIsSet(sessionCookie);

        // And then log user out.
        const logoutResponse = await supertest
          .get('/api/security/logout')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('Cookie', sessionCookie.cookieString())
          .expect(302);

        cookies = logoutResponse.headers['set-cookie'];
        checkCookieIsCleared(findSessionCookie(cookies));

        expect(logoutResponse.headers.location).to.be('/security/logged_out?msg=LOGGED_OUT');
      });

      it('should redirect to home page if session cookie is not provided', async () => {
        const logoutResponse = await supertest
          .get('/api/security/logout')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .expect(302);

        expect(logoutResponse.headers['set-cookie']).to.be(undefined);
        expect(logoutResponse.headers.location).to.be('/security/logged_out?msg=LOGGED_OUT');
      });
    });

    describe('API access with expired access token.', () => {
      let sessionCookie: Cookie;

      beforeEach(async () => {
        const response = await supertest
          .get('/security/account')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .expect(200);

        const cookies = response.headers['set-cookie'];
        sessionCookie = findSessionCookie(cookies);
        checkCookieIsSet(sessionCookie);
      });

      it('AJAX call should re-acquire token and update existing cookie', async function () {
        this.timeout(40000);

        // Access token expiration is set to 15s for API integration tests.
        // Let's wait for 20s to make sure token expires.
        await setTimeoutAsync(20000);

        // This api call should succeed and automatically refresh token. Returned cookie will contain
        // the new access token.
        const apiResponse = await supertest
          .get('/internal/security/me')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('kbn-xsrf', 'xxx')
          .set('Cookie', sessionCookie.cookieString())
          .expect(200);

        const cookies = apiResponse.headers['set-cookie'];
        const refreshedCookie = findSessionCookie(cookies);
        checkCookieIsSet(refreshedCookie);
      });

      it('non-AJAX call should re-acquire token and update existing cookie', async function () {
        this.timeout(40000);

        // Access token expiration is set to 15s for API integration tests.
        // Let's wait for 20s to make sure token expires.
        await setTimeoutAsync(20000);

        // This request should succeed and automatically refresh token. Returned cookie will contain
        // the new access and refresh token pair.
        const nonAjaxResponse = await supertest
          .get('/security/account')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('Cookie', sessionCookie.cookieString())
          .expect(200);

        const cookies = nonAjaxResponse.headers['set-cookie'];
        const refreshedCookie = findSessionCookie(cookies);
        checkCookieIsSet(refreshedCookie);
      });

      describe('post-authentication stage', () => {
        for (const client of ['start-contract', 'request-context', 'custom']) {
          it(`expired access token should be automatically refreshed by the ${client} client`, async function () {
            this.timeout(60000);

            // Access token expiration is set to 15s for API integration tests.
            // Let's tell test endpoint to wait 30s after authentication and try to make a request to Elasticsearch
            // triggering token refresh logic.
            const response = await supertest
              .post('/authentication/slow/me')
              .ca(CA_CERT)
              .pfx(FIRST_CLIENT_CERT)
              .set('kbn-xsrf', 'xxx')
              .set('Cookie', sessionCookie.cookieString())
              .send({ duration: '30s', client })
              .expect(200);

            const newSessionCookies = response.headers['set-cookie'];
            const refreshedCookie = findSessionCookie(newSessionCookies);
            checkCookieIsSet(refreshedCookie);

            // The second new cookie with fresh pair of access and refresh tokens should work.
            await supertest
              .get('/internal/security/me')
              .ca(CA_CERT)
              .pfx(FIRST_CLIENT_CERT)
              .set('kbn-xsrf', 'xxx')
              .set('Cookie', refreshedCookie.cookieString())
              .expect(200);
          });

          it(`expired access token should be automatically refreshed by the ${client} client even for multiple concurrent requests`, async function () {
            this.timeout(60000);

            // Send 5 concurrent requests with a cookie that contains an expired access token.
            await Promise.all(
              Array.from({ length: 5 }).map((value, index) =>
                supertest
                  .post(`/authentication/slow/me?a=${index}`)
                  .ca(CA_CERT)
                  .pfx(FIRST_CLIENT_CERT)
                  .set('kbn-xsrf', 'xxx')
                  .set('Cookie', sessionCookie.cookieString())
                  .send({ duration: '30s', client })
                  .expect(200)
              )
            );
          });
        }
      });
    });

    describe('Audit Log', function () {
      const logFilePath = resolve(__dirname, '../../packages/helpers/audit/pki.log');
      const logFile = new FileWrapper(logFilePath, retry);

      beforeEach(async () => {
        await logFile.reset();
      });

      it('should log a single `user_login` and `user_logout` event per session', async () => {
        this.timeout(60000);

        // Accessing Kibana without an existing session should create a `user_login` event.
        const response = await supertest
          .get('/security/account')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .expect(200);

        const cookies = response.headers['set-cookie'];
        const sessionCookie = findSessionCookie(cookies);

        // Accessing Kibana again using the same session should not create another `user_login` event.
        await supertest
          .get('/security/account')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('Cookie', sessionCookie.cookieString())
          .expect(200);

        // Clearing the session should create a `user_logout` event.
        await supertest
          .get('/api/security/logout')
          .ca(CA_CERT)
          .pfx(FIRST_CLIENT_CERT)
          .set('Cookie', sessionCookie.cookieString())
          .expect(302);

        await logFile.isWritten();
        const auditEvents = await logFile.readJSON();

        expect(auditEvents).to.have.length(2);

        expect(auditEvents[0]).to.be.ok();
        expect(auditEvents[0].event.action).to.be('user_login');
        expect(auditEvents[0].event.outcome).to.be('success');
        expect(auditEvents[0].trace.id).to.be.ok();
        expect(auditEvents[0].user.name).to.be('first_client');
        expect(auditEvents[0].kibana.authentication_provider).to.be('pki');

        expect(auditEvents[1]).to.be.ok();
        expect(auditEvents[1].event.action).to.be('user_logout');
        expect(auditEvents[1].event.outcome).to.be('unknown');
        expect(auditEvents[1].trace.id).to.be.ok();
        expect(auditEvents[1].user.name).to.be('first_client');
        expect(auditEvents[1].kibana.authentication_provider).to.be('pki');
      });

      it('should log authentication failure correctly', async () => {
        await supertest.get('/security/account').ca(CA_CERT).pfx(UNTRUSTED_CLIENT_CERT).expect(401);

        await logFile.isWritten();
        const auditEvents = await logFile.readJSON();

        expect(auditEvents).to.have.length(1);
        expect(auditEvents[0]).to.be.ok();
        expect(auditEvents[0].event.action).to.be('user_login');
        expect(auditEvents[0].event.outcome).to.be('failure');
        expect(auditEvents[0].trace.id).to.be.ok();
        expect(auditEvents[0].kibana.authentication_provider).to.be('pki');
      });
    });

    it('should support minimal authentication', async () => {
      const response = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(200);

      const cookies = response.headers['set-cookie'];
      const sessionCookie = findSessionCookie(cookies);
      checkCookieIsSet(sessionCookie);

      // Access the minimal and default auth endpoint with the session cookie.
      const minimalResponse = await supertest
        .get('/authentication/fast/me')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .set('Cookie', sessionCookie.cookieString())
        .expect(200);
      const defaultResponse = await supertest
        .get('/internal/security/me')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .set('Cookie', sessionCookie.cookieString())
        .expect(200);

      expect(minimalResponse.body.principal.username).to.eql(defaultResponse.body.username);
      expect(minimalResponse.body.principal.username).to.eql('first_client');

      expect(minimalResponse.body.principal.authentication_provider).to.eql(
        defaultResponse.body.authentication_provider
      );
      expect(minimalResponse.body.principal.authentication_provider).to.eql({
        type: 'pki',
        name: 'pki',
      });

      // In minimal authentication mode, unlike when in default authentication mode, we don't call ES Authenticate API,
      // so we don't have `authentication_realm` information available.
      expect(minimalResponse.body.principal).to.not.have.property('authentication_realm');
      expect(defaultResponse.body).to.have.property('authentication_realm');
    });

    it('should support minimal authentication even when access token is expired', async function () {
      this.timeout(60000);

      const response = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(200);

      const sessionCookie = findSessionCookie(response.headers['set-cookie']);
      checkCookieIsSet(sessionCookie);

      // Access token expiration is set to 15s for API integration tests.
      // Let's wait for 20s to make sure token expires.
      await setTimeoutAsync(20000);

      // Access the minimal auth endpoint with the session cookie. The minimal route relies on
      // Elasticsearch for credentials validation (e.g., via `_has_privileges` call), so the
      // expired access token must be transparently refreshed via the re-authentication flow.
      const minimalResponse = await supertest
        .get('/authentication/fast/me')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .set('Cookie', sessionCookie.cookieString())
        .expect(200);

      expect(minimalResponse.body.principal.username).to.eql('first_client');
      expect(minimalResponse.body.principal.authentication_provider).to.eql({
        type: 'pki',
        name: 'pki',
      });
    });

    it('should support minimal authentication with `kbn-auth-full` header forcing full authentication', async () => {
      const response = await supertest
        .get('/security/account')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .expect(200);

      const sessionCookie = findSessionCookie(response.headers['set-cookie']);
      checkCookieIsSet(sessionCookie);

      // Access the minimal auth endpoint with the `kbn-auth-full` header set to `true` to force
      // full authentication even on a route that otherwise supports the minimal authentication mode.
      const fullAuthResponse = await supertest
        .get('/authentication/fast/me')
        .ca(CA_CERT)
        .pfx(FIRST_CLIENT_CERT)
        .set('Cookie', sessionCookie.cookieString())
        .set('kbn-auth-full', 'true')
        .expect(200);

      expect(fullAuthResponse.body.principal.username).to.eql('first_client');
      expect(fullAuthResponse.body.principal.authentication_provider).to.eql({
        type: 'pki',
        name: 'pki',
      });

      // When `kbn-auth-full` header is set, Kibana calls ES `_authenticate` API, so full user
      // information (including `authentication_realm`) should be available.
      expect(fullAuthResponse.body.principal).to.have.property('authentication_realm');
      expect(fullAuthResponse.body.principal.authentication_realm).to.eql({
        name: 'pki1',
        type: 'pki',
      });
    });
  });
}
