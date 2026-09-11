/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRole } from '../../../../../common';
import { getPrivilegedRoleName } from '../../../../../common';
import { coreWorkerFixtures } from '../../worker';

export type LoginFunction = (role: string, forceNewSession?: boolean) => Promise<void>;

export interface BrowserAuthFixture {
  /**
   * Logs in as a user with viewer-only permissions.
   * @returns A Promise that resolves once the cookie in browser is set.
   */
  loginAsViewer: () => Promise<void>;
  /**
   * Logs in as a user with administrative privileges
   * @returns A Promise that resolves once the cookie in browser is set.
   */
  loginAsAdmin: () => Promise<void>;
  /**
   * Logs in as a user with elevated, but not admin, permissions.
   * @returns A Promise that resolves once the cookie in browser is set.
   */
  loginAsPrivilegedUser: () => Promise<void>;
  /**
   * Logs in as a user with a role.
   * @param role - A role object that defines the Kibana and ES previleges.
   * @returns A Promise that resolves once the cookie in browser is set.
   */
  loginAs: (role: string) => Promise<void>;
  /**
   * Logs in as a user with a custom role.
   * @param role - A role object that defines the Kibana and ES previleges. Role will re-created if it doesn't exist.
   * @returns A Promise that resolves once the cookie in browser is set.
   */
  loginWithCustomRole: (role: KibanaRole) => Promise<void>;
  /**
   * Logs in as a SAML user whose privileges match the named Elasticsearch role
   * (e.g. `'kibana_admin'`, `'superuser'`, `'monitoring_user'`).
   *
   * Fetches the role descriptor from Elasticsearch and provisions it into the
   * worker's custom role slot — works on both local and Cloud environments.
   * No entry in `roles.yml` is required.
   *
   * @param roleName - The name of the ES role to look up and log in as.
   * @returns A Promise that resolves once the cookie in browser is set.
   *
   * @example
   * test('kibana_admin cannot see CCR link', async ({ browserAuth, page }) => {
   *   await browserAuth.loginWithBuiltInRole('kibana_admin');
   *   await page.goto('/app/management');
   *   await expect(page.locator('[data-test-subj="cross_cluster_replication"]')).toBeHidden();
   * });
   */
  loginWithBuiltInRole: (roleName: string) => Promise<void>;
}

/**
 * The "browserAuth" fixture simplifies the process of logging into Kibana with
 * different roles during tests. It uses the "samlAuth" fixture to create an authentication session
 * for the specified role and the "context" fixture to update the cookie with the role-scoped session.
 *
 * Custom roles created via loginWithCustomRole are persisted for the worker lifetime and cleaned up
 * by the worker-scoped samlAuth fixture, avoiding unnecessary role creation/deletion overhead per test.
 */
export const browserAuthFixture = coreWorkerFixtures.extend<{ browserAuth: BrowserAuthFixture }>({
  browserAuth: async ({ log, context, samlAuth, config, kbnUrl }, use) => {
    const setSessionCookie = async (cookieValue: string) => {
      await context.clearCookies();
      await context.addCookies([
        {
          name: 'sid',
          value: cookieValue,
          path: '/',
          domain: kbnUrl.domain(),
        },
      ]);
    };

    const loginAs: LoginFunction = async (role: string, forceNewSession = false) => {
      const cookie = await samlAuth.session.getInteractiveUserSessionCookieWithRoleScope(role, {
        forceNewSession,
      });
      await setSessionCookie(cookie);
    };

    const loginWithCustomRole = async (role: KibanaRole) => {
      // the samlAuth fixture handles the custom role creation and deletion
      const roleChanged = await samlAuth.setCustomRole(role);
      // The custom role slot is a single fixed name per worker, so when its privileges
      // change the cached SAML session for that name is stale; force a fresh one.
      return loginAs(samlAuth.customRoleName, roleChanged);
    };

    const loginWithBuiltInRole = async (roleName: string) => {
      await samlAuth.setBuiltInRole(roleName);
      return loginAs(samlAuth.customRoleName);
    };

    const loginAsAdmin = () => loginAs('admin');
    const loginAsViewer = () => loginAs('viewer');
    const loginAsPrivilegedUser = () =>
      loginAs(
        getPrivilegedRoleName({ serverless: config.serverless, projectType: config.projectType! })
      );

    log.serviceLoaded('browserAuth');
    await use({
      loginAsAdmin,
      loginAsViewer,
      loginAsPrivilegedUser,
      loginAs,
      loginWithCustomRole,
      loginWithBuiltInRole,
    });
  },
});
