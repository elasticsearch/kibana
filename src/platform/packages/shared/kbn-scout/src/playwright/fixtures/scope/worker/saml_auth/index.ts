/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SamlSessionManager } from '@kbn/test-saml-auth';
import { createSamlSessionManager } from '../../../../../common/services';
import type { ElasticsearchRoleDescriptor, KibanaRole } from '../../../../../common/services';
import type { RoleSessionCredentials, BaseWorkerFixtures } from '../core_fixtures';
import { coreWorkerFixtures } from '../core_fixtures';
import { SamlAuthManager } from './saml_auth_manager';

/**
 * UI settings returns 400 when a key is locked by `uiSettings.globalOverrides`.
 * Collect message + Error.cause chain so we match reliably across clients/wrappers.
 */
function formatUnknownError(err: unknown): string {
  if (err == null) {
    return '';
  }
  if (typeof err === 'string') {
    return err;
  }
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 8 && current != null; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      try {
        parts.push(JSON.stringify(current));
      } catch {
        parts.push(String(current));
      }
      break;
    }
  }
  return parts.join('\n');
}

function isGlobalUiSettingOverrideConflict(err: unknown): boolean {
  const text = formatUnknownError(err);
  return (
    text.includes('because it is overridden') ||
    (text.includes('hideAnnouncements') && text.includes('overridden'))
  );
}

export interface SamlAuth {
  session: SamlSessionManager;
  customRoleName: string;
  /**
   * Provisions the worker's custom role slot with the given privileges.
   * @returns `true` if the role was created or its privileges overridden, `false` if an
   *          identical role already existed and was reused. Callers logging in interactively
   *          must force a fresh session when this returns `true`, since the cached session
   *          cookie for the reused role name would otherwise be stale.
   */
  setCustomRole(role: KibanaRole | ElasticsearchRoleDescriptor): Promise<boolean>;
  /**
   * Fetches the live descriptor of any named ES role and provisions it as the
   * worker's custom role slot. Works for built-in ES roles (e.g. `kibana_admin`,
   * `superuser`) and any other role present in Elasticsearch.
   *
   * Works on both local and Cloud because it delegates entirely to `setCustomRole`,
   * which already supports Cloud.
   *
   * @param roleName - The name of the role to look up in Elasticsearch.
   */
  setBuiltInRole(roleName: string): Promise<ElasticsearchRoleDescriptor>;
  /**
   * Fetches the privilege descriptor of a named ES role filtered to fields
   * accepted by the API key `role_descriptors` endpoint. Does **not** create
   * a role in Elasticsearch — use this when building an inline API key.
   */
  fetchBuiltInRoleDescriptor(roleName: string): Promise<ElasticsearchRoleDescriptor>;
  /**
   * Generates a SAML session cookie for an interactive user with the specified role.
   *
   * This method is ideal for testing internal APIs that are typically accessed via the UI.
   * It authenticates as an interactive user and returns session credentials including cookie
   * headers that can be used in API requests.
   *
   * @param role - Either a built-in Kibana role name (e.g., 'admin', 'editor', 'viewer') or
   *               a custom role descriptor with specific permissions (Kibana or Elasticsearch)
   * @returns Promise resolving to credentials with cookieValue and cookieHeader properties
   *
   * @example
   * // Using a built-in role
   * const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
   * const response = await apiClient.get('internal/endpoint', {
   *   headers: { ...cookieHeader }
   * });
   *
   * @example
   * // Using a custom role descriptor
   * const customRole = {
   *   kibana: [{ base: ['read'], spaces: ['*'] }],
   *   elasticsearch: { indices: [{ names: ['logs-*'], privileges: ['read'] }] }
   * };
   * const { cookieHeader } = await samlAuth.asInteractiveUser(customRole);
   * const response = await apiClient.get('internal/endpoint', {
   *   headers: { ...cookieHeader }
   * });
   */
  asInteractiveUser(
    role: string | KibanaRole | ElasticsearchRoleDescriptor
  ): Promise<RoleSessionCredentials>;
}

/**
 * Full worker fixture set: base fixtures + samlAuth.
 * Use this type when you need to reference the complete worker fixture surface.
 */
export interface CoreWorkerFixtures extends BaseWorkerFixtures {
  samlAuth: SamlAuth;
}

export const samlAuthFixture = coreWorkerFixtures.extend<{}, { samlAuth: SamlAuth }>({
  /**
   * Creates a SAML session manager, that handles authentication tasks for tests involving
   * SAML-based authentication. Exposes methods to set a custom role or a built-in ES role.
   *
   * Note: In order to speedup execution of tests, we cache the session cookies for each role
   * after first call. Custom roles are persisted for the worker lifetime and cleaned up when
   * the worker completes.
   */
  samlAuth: [
    async ({ log, config, esClient, kbnClient }, use, workerInfo) => {
      /**
       * When running tests against Cloud, ensure the `.ftr/role_users.json` file is populated with the required roles
       * and credentials. Each worker uses a unique custom role named `custom_role_worker_<index>`.
       * If running tests in parallel, make sure the file contains enough entries to accommodate all workers.
       * The file should be structured as follows:
       * {
       *   "custom_role_worker_1": { "username": ..., "password": ... },
       *   "custom_role_worker_2": { "username": ..., "password": ... },
       */
      const customRoleName = `custom_role_worker_${workerInfo.parallelIndex + 1}`;
      const session = createSamlSessionManager(config, log, customRoleName);
      const manager = new SamlAuthManager(
        session,
        customRoleName,
        esClient,
        kbnClient,
        log,
        config.serverless
      );

      // Hide the announcements (including the sidenav tour) in advance to prevent
      // it from interfering with test flows. Default Scout server config_sets do not set
      // globalOverrides (ECH/MKI parity); a plugin-specific config_set may add
      // `--uiSettings.globalOverrides.hideAnnouncements`, in which case this POST returns 400.
      try {
        await kbnClient.uiSettings.updateGlobal({ hideAnnouncements: true });
      } catch (err: unknown) {
        if (isGlobalUiSettingOverrideConflict(err)) {
          const detail = formatUnknownError(err);
          log.debug(
            `Skipping hideAnnouncements update — already enforced by server-level override: ${detail}`
          );
        } else {
          throw err;
        }
      }

      // Expose a plain object (not a class instance) so that consumers that
      // spread `samlAuth` (e.g. `{ ...samlAuth, extraMethod }`) get all methods
      // as own enumerable properties rather than losing prototype methods.
      await use({
        session: manager.session,
        customRoleName: manager.customRoleName,
        setCustomRole: (role) => manager.setCustomRole(role),
        setBuiltInRole: (roleName) => manager.setBuiltInRole(roleName),
        fetchBuiltInRoleDescriptor: (roleName) => manager.fetchBuiltInRoleDescriptor(roleName),
        asInteractiveUser: (role) => manager.asInteractiveUser(role),
      });
      await manager.cleanup();
    },
    { scope: 'worker' },
  ],
});

/**
 * Re-exported alias so worker-level fixtures that need samlAuth can import
 * `coreWorkerFixtures` from `./saml_auth` (the extended version) rather than
 * from `./core_fixtures` (the base version without samlAuth).
 */
export { samlAuthFixture as coreWorkerFixtures };
