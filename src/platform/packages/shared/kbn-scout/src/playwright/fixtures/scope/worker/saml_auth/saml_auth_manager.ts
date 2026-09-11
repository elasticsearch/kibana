/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SamlSessionManager } from '@kbn/test-saml-auth';
import type { Client as EsClient } from '@elastic/elasticsearch';
import type { KbnClient } from '@kbn/kbn-client';
import type { ElasticsearchRoleDescriptor, KibanaRole } from '../../../../../common/services';
import {
  createElasticsearchCustomRole,
  createCustomRole,
  isElasticsearchRole,
} from '../../../../../common/services';
import type { ScoutLogger } from '../../../../../common/services/logger';
import type { RoleSessionCredentials } from '../core_fixtures';

export class SamlAuthManager {
  private customRoleHash = '';
  private isCustomRoleCreated = false;

  constructor(
    public readonly session: SamlSessionManager,
    public readonly customRoleName: string,
    private readonly esClient: EsClient,
    private readonly kbnClient: KbnClient,
    private readonly log: ScoutLogger,
    private readonly isServerless: boolean
  ) {}

  async setCustomRole(role: KibanaRole | ElasticsearchRoleDescriptor): Promise<boolean> {
    const newRoleHash = JSON.stringify(role);

    if (newRoleHash === this.customRoleHash) {
      this.log.debug(
        `Custom role '${this.customRoleName}' with provided privileges already exists, reusing it`
      );
      return false;
    }

    this.log.debug(
      this.isCustomRoleCreated
        ? `Overriding existing custom role '${this.customRoleName}'`
        : `Creating custom role '${this.customRoleName}'`
    );

    this.isCustomRoleCreated = true;

    if (isElasticsearchRole(role)) {
      await createElasticsearchCustomRole(this.esClient, this.customRoleName, role);
      this.log.debug(`Created Elasticsearch custom role: ${this.customRoleName}`);
    } else {
      await createCustomRole(this.kbnClient, this.customRoleName, role);
      this.log.debug(`Created Kibana custom role: ${this.customRoleName}`);
    }

    this.customRoleHash = newRoleHash;
    return true;
  }

  private guardServerless(methodName: string): void {
    if (this.isServerless) {
      throw new Error(
        `${methodName} is not supported on Serverless projects. ` +
          `Use a native realm role (e.g. loginAs() / getApiKey()) or define a custom role ` +
          `with explicit privileges (loginWithCustomRole() / getApiKeyForCustomRole()) instead.`
      );
    }
  }

  private async getEsRoleData(roleName: string) {
    try {
      const response = await this.esClient.security.getRole({ name: roleName });
      const roleData = response[roleName];
      if (!roleData) {
        throw new Error(`Role '${roleName}' not found in Elasticsearch`);
      }
      return roleData;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.meta?.statusCode === 404) {
        throw new Error(`Role '${roleName}' not found in Elasticsearch`);
      }
      throw error;
    }
  }

  /**
   * Provisions the worker's custom role slot with the privileges of a named ES role.
   * Use for SAML-based login (`loginWithBuiltInRole`).
   */
  async setBuiltInRole(roleName: string): Promise<ElasticsearchRoleDescriptor> {
    this.guardServerless(`setBuiltInRole('${roleName}')`);
    const roleData = await this.getEsRoleData(roleName);
    // Strip non-privilege fields before creating the ES role.
    // metadata / transient_metadata are ES bookkeeping; description is a
    // human-readable label that the PUT /_security/role API accepts but that
    // the API key role_descriptors endpoint rejects.
    const {
      metadata: _metadata,
      transient_metadata: _transient,
      description: _description,
      ...descriptor
    } = roleData;
    await this.setCustomRole(descriptor as ElasticsearchRoleDescriptor);
    return descriptor as ElasticsearchRoleDescriptor;
  }

  /**
   * Fetches a named ES role's privileges filtered to API-key-safe fields.
   * Does not create a role in ES — use for inline API key descriptors.
   */
  async fetchBuiltInRoleDescriptor(roleName: string): Promise<ElasticsearchRoleDescriptor> {
    this.guardServerless(`fetchBuiltInRoleDescriptor('${roleName}')`);
    const roleData = await this.getEsRoleData(roleName);
    // Allow-list: only keep fields the API key role_descriptors endpoint accepts.
    // This is more forward-compatible than stripping individual known-bad fields.
    const { cluster, indices, applications, run_as: runAs } = roleData;
    return {
      ...(cluster !== undefined && { cluster }),
      ...(indices !== undefined && { indices: indices as ElasticsearchRoleDescriptor['indices'] }),
      ...(applications !== undefined && {
        applications: applications as ElasticsearchRoleDescriptor['applications'],
      }),
      ...(runAs !== undefined && { run_as: runAs }),
    };
  }

  async asInteractiveUser(
    role: string | KibanaRole | ElasticsearchRoleDescriptor
  ): Promise<RoleSessionCredentials> {
    let roleName: string;

    if (typeof role === 'string') {
      roleName = role;
    } else {
      await this.setCustomRole(role);
      roleName = this.customRoleName;
    }

    const cookieValue = await this.session.getInteractiveUserSessionCookieWithRoleScope(roleName);
    return { cookieValue, cookieHeader: { Cookie: `sid=${cookieValue}` } };
  }

  async cleanup(): Promise<void> {
    if (!this.isCustomRoleCreated) return;

    this.log.debug(`Deleting custom role ${this.customRoleName}`);
    try {
      await this.esClient.security.deleteRole({ name: this.customRoleName });
      this.log.debug(`Custom role '${this.customRoleName}' deleted`);
      this.customRoleHash = '';
    } catch (error: any) {
      this.log.error(
        `Failed to delete custom role '${this.customRoleName}' during worker cleanup: ${error.message}`
      );
    }
  }
}
