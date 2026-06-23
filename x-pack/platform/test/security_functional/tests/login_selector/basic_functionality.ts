/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'url';

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const security = getService('security');
  const deployment = getService('deployment');
  const PageObjects = getPageObjects(['security', 'common']);
  const toasts = getService('toasts');

  describe('Basic functionality', function () {
    this.tags('includeFirefox');

    const testCredentials = { username: 'admin_user', password: 'change_me' };
    before(async () => {
      await getService('esSupertest')
        .post('/_security/role_mapping/saml1')
        .send({ roles: ['superuser'], enabled: true, rules: { field: { 'realm.name': 'saml1' } } })
        .expect(200);

      await security.user.create(testCredentials.username, {
        password: testCredentials.password,
        roles: ['kibana_admin'],
        full_name: 'Admin',
      });
      await PageObjects.security.forceLogout();
    });

    after(async () => {
      await security.user.delete(testCredentials.username);
    });

    beforeEach(async () => {
      await browser.get(`${deployment.getHostPort()}/login`);
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
    });

    afterEach(async () => {
      // NOTE: Logout needs to happen before anything else to avoid flaky behavior
      await PageObjects.security.forceLogout();
    });

    it('can login with Login Form preserving original URL', async () => {
      await PageObjects.common.navigateToUrl('management', 'security/users', {
        ensureCurrentUrl: false,
        shouldLoginIfPrompted: false,
        shouldUseHashForSubUrl: false,
      });
      await PageObjects.common.waitUntilUrlIncludes('next=');

      await PageObjects.security.loginSelector.login('basic', 'basic1');

      // We need to make sure that both path and hash are respected.
      const currentURL = parse(await browser.getCurrentUrl());

      expect(currentURL.pathname).to.eql('/app/management/security/users');
    });

    it('can login with Login Form resetting target URL', async () => {
      this.timeout(120000);

      for (const targetURL of [
        '///example.com',
        '//example.com',
        'https://example.com',

        '/\t/example.com',
        '/\n/example.com',
        '/\r/example.com',

        '/\t//example.com',
        '/\n//example.com',
        '/\r//example.com',

        '//\t/example.com',
        '//\n/example.com',
        '//\r/example.com',

        'ht\ttps://example.com',
        'ht\ntps://example.com',
        'ht\rtps://example.com',
      ]) {
        await browser.get(
          `${deployment.getHostPort()}/login?next=${encodeURIComponent(targetURL)}`
        );

        await PageObjects.common.waitUntilUrlIncludes('next=');
        await PageObjects.security.loginSelector.login('basic', 'basic1');
        // We need to make sure that both path and hash are respected.
        const currentURL = parse(await browser.getCurrentUrl());

        expect(currentURL.pathname).to.eql('/app/home');
        await PageObjects.security.forceLogout();
      }
    });

    it('can login with SSO preserving original URL', async () => {
      await PageObjects.common.navigateToUrl('management', 'security/users', {
        ensureCurrentUrl: false,
        shouldLoginIfPrompted: false,
        shouldUseHashForSubUrl: false,
      });
      await PageObjects.common.waitUntilUrlIncludes('next=');

      await PageObjects.security.loginSelector.login('saml', 'saml1');

      // We need to make sure that both path and hash are respected.
      const currentURL = parse(await browser.getCurrentUrl());
      expect(currentURL.pathname).to.eql('/app/management/security/users');
    });

    it('can login anonymously preserving original URL', async () => {
      await PageObjects.common.navigateToUrl('management', 'security/users', {
        ensureCurrentUrl: false,
        shouldLoginIfPrompted: false,
        shouldUseHashForSubUrl: false,
      });
      await PageObjects.common.waitUntilUrlIncludes('next=');

      await security.user.create('anonymous_user', {
        password: 'changeme',
        roles: ['superuser'],
        full_name: 'Guest',
      });
      await PageObjects.security.loginSelector.login('anonymous', 'anonymous1');

      // We need to make sure that both path and hash are respected.
      const currentURL = parse(await browser.getCurrentUrl());
      expect(currentURL.pathname).to.eql('/app/management/security/users');

      await PageObjects.security.forceLogout();
      await security.user.delete('anonymous_user');
    });

    it('can login after `Unauthorized` error after request authentication preserving original URL', async () => {
      await getService('supertest')
        .post('/authentication/app/setup')
        .send({ simulateUnauthorized: true })
        .expect(200);
      await PageObjects.security.loginSelector.login('basic', 'basic1');
      await browser.get(`${deployment.getHostPort()}/authentication/app?one=two`);

      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
      expect(await PageObjects.security.loginPage.getErrorMessage()).to.be.ok();

      await getService('supertest')
        .post('/authentication/app/setup')
        .send({ simulateUnauthorized: false })
        .expect(200);
      await PageObjects.security.loginSelector.login('basic', 'basic1', {
        // By default, login waits till chrome appears, but the test authentication app is a chromeless app.
        expectedLoginResult: () => testSubjects.waitForEnabled('testEndpointsAuthenticationApp'),
      });

      const currentURL = parse(await browser.getCurrentUrl());
      expect(currentURL.path).to.eql('/authentication/app?one=two');
    });

    it('can login after `Unauthorized` error during request authentication preserving original URL', async () => {
      // 1. Navigate to Kibana to make sure user is properly authenticated.
      await browser.get(`${deployment.getHostPort()}/authentication/app?one=two`);
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
      await PageObjects.security.loginSelector.login('basic', 'basic1', {
        ...testCredentials,
        // By default, login waits till chrome appears, but the test authentication app is a chromeless app.
        expectedLoginResult: () => testSubjects.waitForEnabled('testEndpointsAuthenticationApp'),
      });
      expect(parse(await browser.getCurrentUrl()).pathname).to.eql('/authentication/app');

      // 2. Now disable user and try to refresh page causing authentication to fail.
      await security.user.disable(testCredentials.username);
      await browser.refresh();
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
      expect(await PageObjects.security.loginPage.getErrorMessage()).to.be.ok();

      // 3. Re-enable user and try to login again.
      await security.user.enable(testCredentials.username);
      await PageObjects.security.loginSelector.login('basic', 'basic1', {
        ...testCredentials,
        // By default, login waits till chrome appears, but the test authentication app is a chromeless app.
        expectedLoginResult: () => testSubjects.waitForEnabled('testEndpointsAuthenticationApp'),
      });
      expect(parse(await browser.getCurrentUrl()).pathname).to.eql('/authentication/app');
    });

    it('should show toast with error if SSO fails', async () => {
      await PageObjects.security.loginSelector.selectLoginMethod('saml', 'unknown_saml');

      const toastTitle = await toasts.getTitleAndDismiss();
      expect(toastTitle).to.eql('Could not perform login.');

      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
    });

    it('should show toast with error if anonymous login fails', async () => {
      await PageObjects.security.loginSelector.selectLoginMethod('anonymous', 'anonymous1');

      const toastTitle = await toasts.getTitleAndDismiss();
      expect(toastTitle).to.eql('Could not perform login.');

      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
    });

    it('can go to Login Form and return back to Selector', async () => {
      await PageObjects.security.loginSelector.selectLoginMethod('basic', 'basic1');
      await PageObjects.security.loginSelector.verifyLoginFormIsVisible();

      await testSubjects.click('loginBackToSelector');
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();

      await PageObjects.security.loginSelector.login('saml', 'saml1');
    });

    it('can show Login Help from both Login Selector and Login Form', async () => {
      // Show Login Help from Login Selector.
      await testSubjects.click('loginHelpLink');
      await PageObjects.security.loginSelector.verifyLoginHelpIsVisible('Some-login-help.');

      // Go back to Login Selector.
      await testSubjects.click('loginBackToLoginLink');
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();

      // Go to Login Form and show Login Help there.
      await PageObjects.security.loginSelector.selectLoginMethod('basic', 'basic1');
      await PageObjects.security.loginSelector.verifyLoginFormIsVisible();
      await testSubjects.click('loginHelpLink');
      await PageObjects.security.loginSelector.verifyLoginHelpIsVisible('Some-login-help.');

      // Go back to Login Form.
      await testSubjects.click('loginBackToLoginLink');
      await PageObjects.security.loginSelector.verifyLoginFormIsVisible();

      // Go back to Login Selector and show Login Help there again.
      await testSubjects.click('loginBackToSelector');
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
      await testSubjects.click('loginHelpLink');
      await PageObjects.security.loginSelector.verifyLoginHelpIsVisible('Some-login-help.');

      // Go back to Login Selector.
      await testSubjects.click('loginBackToLoginLink');
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
    });

    it('correctly handles unexpected post-authentication errors', async () => {
      const supertest = getService('supertest');
      await PageObjects.security.loginSelector.login('basic', 'basic1');

      await supertest.get('/authentication/app/not_auth_flow').expect(200);
      await supertest.get('/authentication/app/not_auth_flow?statusCode=400').expect(400);
      await supertest.get('/authentication/app/not_auth_flow?statusCode=500').expect(500);
      await browser.navigateTo(
        `${deployment.getHostPort()}/authentication/app/not_auth_flow?statusCode=401`
      );
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();

      await supertest.get('/authentication/app/auth_flow').expect(200);
      await browser.navigateTo(
        `${deployment.getHostPort()}/authentication/app/auth_flow?statusCode=400`
      );
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();

      await browser.navigateTo(
        `${deployment.getHostPort()}/authentication/app/auth_flow?statusCode=500`
      );
      await PageObjects.security.loginSelector.verifyLoginSelectorIsVisible();
    });

    it('correctly hides login selector with different origin configuration', async () => {
      expect(await testSubjects.exists(`loginCard-saml/saml1`)).to.be(true);
      expect(await testSubjects.exists(`loginCard-saml/unknown_saml`)).to.be(true);

      expect(await testSubjects.exists(`loginCard-saml/saml_hidden`)).to.be(false);
      expect(await testSubjects.exists(`loginCard-saml/saml_hidden_2`)).to.be(false);
    });
  });
}
