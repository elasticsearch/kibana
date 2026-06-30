/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { FtrService } from '../ftr_provider_context';
import type { Cookie } from '../cookie_auth';

const HOME_WELCOME_LOCAL_STORAGE_KEY = 'home:welcome:show';
const HOME_WELCOME_INTERSTITIAL_TEST_SUBJ = 'homeWelcomeInterstitial';

export interface LoginByCookieOptions {
  /** When provided, verifies GET /internal/security/me returns this username. */
  expectedUsername?: string;
  /** Whether to assert the userMenuButton test-subject is rendered after login. Defaults to true. */
  expectUserMenuButton?: boolean;
  /**
   * Where to navigate after injecting the cookie. Defaults to the Kibana root (`/`).
   * Pass the actual target app URL to avoid a second navigation in the caller.
   */
  targetUrl?: string;
}

/**
 * Browser-side cookie injection service.
 *
 * Mirrors the pattern used by the serverless `svl_common_page.loginWithRole()`:
 *   1. Navigate to /bootstrap-anonymous.js (no-auth endpoint to enter the Kibana origin)
 *   2. Clean all browser state (cookies, session storage, local storage)
 *   3. Set the `sid` cookie
 *   4. Navigate to Kibana home and optionally verify identity
 *
 * Consumed by SecurityPageObject.login() and TestUser.setRoles() when
 * `security.cookieLogin: true` is set in the FTR config.
 *
 * Note: `browser` and `testSubjects` are not part of the common FTR provider context type —
 * they come from @kbn/ftr-common-functional-ui-services, which functional test configs spread
 * on top. We use `hasService` + `as any` (same pattern as TestUser) to access them safely.
 */
export class BrowserAuthService extends FtrService {
  private readonly log = this.ctx.getService('log');
  private readonly deployment = this.ctx.getService('deployment');
  private readonly supertestWithoutAuth = this.ctx.getService('supertestWithoutAuth');

  // Browser-specific services — only present in functional (UI) test contexts.

  private readonly browser: any = this.ctx.hasService('browser')
    ? this.ctx.getService('browser' as any)
    : undefined;

  private readonly testSubjects: any = this.ctx.hasService('testSubjects')
    ? this.ctx.getService('testSubjects' as any)
    : undefined;

  /**
   * Clears all browser state (cookies, session storage, local storage).
   *
   * Navigates to `/bootstrap-anonymous.js` first only when the browser is not already on the
   * Kibana origin — e.g. when starting from `about:blank`. If the browser is already on a
   * Kibana page (e.g. `/login` after a redirect) the extra navigation is skipped.
   */
  async cleanBrowserState(): Promise<void> {
    if (!this.browser) {
      throw new Error(
        '[browserAuth] browser service is not available — ' +
          'cleanBrowserState() can only be called from functional UI test configs.'
      );
    }

    const hostPort = this.deployment.getHostPort();
    const currentUrl: string = await this.browser.getCurrentUrl();

    if (!currentUrl.startsWith(hostPort)) {
      // Not on the Kibana origin yet — navigate to a lightweight no-auth endpoint
      // so cookie operations target the correct domain.
      this.log.debug('[browserAuth] navigating to /bootstrap-anonymous.js for cookie domain');
      await this.browser.get(hostPort + '/bootstrap-anonymous.js');
      const alert = await this.browser.getAlert();
      if (alert) await alert.accept();
    }

    this.log.debug('[browserAuth] deleting all cookies and clearing storage');
    await this.browser.deleteAllCookies();
    await this.browser.clearSessionStorage();
    await this.browser.clearLocalStorage();
  }

  /**
   * Injects a Kibana `sid` session cookie into the browser context and navigates to
   * `options.targetUrl` (defaults to Kibana root `/`), verifying login succeeded.
   *
   * Pass `targetUrl` equal to the final app URL to avoid a second navigation in the caller.
   */
  async loginByCookie(cookie: Cookie, options: LoginByCookieOptions = {}): Promise<void> {
    if (!this.browser || !this.testSubjects) {
      throw new Error(
        '[browserAuth] browser services are not available — ' +
          'loginByCookie() can only be called from functional UI test configs.'
      );
    }

    const { expectUserMenuButton = true, targetUrl } = options;

    await this.cleanBrowserState();

    // cleanBrowserState() wipes localStorage. Restore the flag that suppresses the
    // welcome screen so it does not overlay the UI after the first navigation.
    await this.browser.setLocalStorageItem(HOME_WELCOME_LOCAL_STORAGE_KEY, 'false');

    this.log.debug(`[browserAuth] injecting 'sid' cookie`);
    await this.browser.setCookie('sid', cookie.value);

    const destination = targetUrl ?? this.deployment.getHostPort();
    this.log.debug(`[browserAuth] navigating to ${destination}`);
    await this.browser.get(destination);

    await this.skipHomeWelcomeInterstitial();

    if (options.expectedUsername) {
      const cookies = await this.browser.getCookies();
      const sidValue = (cookies as Array<{ name: string; value: string }>).find(
        (c) => c.name === 'sid'
      )?.value;

      if (sidValue) {
        const { body } = await this.supertestWithoutAuth
          .get('/internal/security/me')
          .set('kbn-xsrf', 'xxx')
          .set('Cookie', `sid=${sidValue}`)
          .expect(200);

        if (body.username !== options.expectedUsername) {
          throw new Error(
            `[browserAuth] expected username '${options.expectedUsername}' but got '${body.username}'`
          );
        }
        this.log.debug(`[browserAuth] verified session for '${options.expectedUsername}'`);
      }
    }

    if (expectUserMenuButton) {
      await this.testSubjects.existOrFail('userMenuButton', { timeout: 10_000 });
      this.log.debug('[browserAuth] login confirmed via userMenuButton');
    }
  }

  private async skipHomeWelcomeInterstitial(): Promise<void> {
    const currentUrl: string = await this.browser.getCurrentUrl();
    if (!currentUrl.includes('/app/home')) {
      return;
    }

    if (
      !(await this.testSubjects.exists(HOME_WELCOME_INTERSTITIAL_TEST_SUBJ, {
        timeout: 2_500,
      }))
    ) {
      return;
    }

    this.log.debug('[browserAuth] skipping home welcome interstitial after cookie login');
    await this.browser.setLocalStorageItem(HOME_WELCOME_LOCAL_STORAGE_KEY, 'false');
    await this.browser.refresh();
  }
}
