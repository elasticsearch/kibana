/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidV4 } from 'uuid';
import type { Agent, Response } from 'supertest';
import type {
  CreateAgentPolicyRequest,
  CreateAgentPolicyResponse,
  CreatePackagePolicyResponse,
  GetAgentPoliciesResponse,
  GetAgentsResponse,
  GetOneAgentPolicyResponse,
  GetOneAgentResponse,
  GetOnePackagePolicyResponse,
  GetPackagePoliciesResponse,
  UpdatePackagePolicyResponse,
  CreateAgentlessPolicyRequest,
  DeleteAgentlessPolicyResponse,
} from '@kbn/fleet-plugin/common';
import type {
  GetEnrollmentAPIKeysResponse,
  GetOneEnrollmentAPIKeyResponse,
  PostEnrollmentAPIKeyResponse,
  PostEnrollmentAPIKeyRequest,
  GetEnrollmentSettingsResponse,
  GetInfoResponse,
  GetSpaceSettingsResponse,
  PutSpaceSettingsRequest,
  GetActionStatusResponse,
  PostNewAgentActionResponse,
  UpdateAgentPolicyResponse,
  UpdateAgentPolicyRequest,
  UpdatePackageResponse,
  UpdatePackageRequest,
  PostDownloadSourceRequest,
  GetOneDownloadSourceResponse,
  PostFleetServerHostsRequest,
  PostFleetServerHostsResponse,
  PostOutputRequest,
  GetOneOutputResponse,
  GetSettingsResponse,
  PutSettingsRequest,
  CreateAgentlessPolicyResponse,
  GetAgentlessPolicyResponse,
  ListAgentlessPoliciesRequest,
  ListAgentlessPoliciesResponse,
  PutDownloadSourceRequest,
} from '@kbn/fleet-plugin/common/types';
import type {
  GetUninstallTokenResponse,
  GetUninstallTokensMetadataResponse,
} from '@kbn/fleet-plugin/common/types/rest_spec/uninstall_token';
import type { SimplifiedPackagePolicy } from '@kbn/fleet-plugin/common/services/simplified_package_policy_helper';
import { type FleetUsage } from '@kbn/fleet-plugin/server/collectors/register';
import { testUsers } from '../test_users';

function expectStatusCode200(res: Response) {
  if (res.statusCode === 200) {
    return;
  }

  if (res.statusCode === 404) {
    throw new Error('404 "Not Found"');
  } else {
    throw new Error(
      `${res.statusCode}${res.body?.error ? ` "${res.body?.error}"` : ''}${
        res.body?.message ? ` ${res.body?.message}` : ''
      }`
    );
  }
}

export class SpaceTestApiClient {
  constructor(
    private readonly supertest: Agent,
    private readonly auth = testUsers.fleet_all_int_all
  ) {}
  private getBaseUrl(spaceId?: string) {
    return spaceId ? `/s/${spaceId}` : '';
  }
  async setup(spaceId?: string): Promise<CreateAgentPolicyResponse> {
    const { body: res } = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/setup`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send({})
      .expect(200);

    return res;
  }
  // Agent policies
  async createAgentPolicy(
    spaceId?: string,
    data: Partial<CreateAgentPolicyRequest['body']> = {},
    opts: CreateAgentPolicyRequest['query'] = {}
  ): Promise<CreateAgentPolicyResponse> {
    const queryString = opts.sys_monitoring ? `?sys_monitoring=true` : '';
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agent_policies${queryString}`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send({
        name: `test ${uuidV4()}`,
        description: '',
        namespace: 'default',
        inactivity_timeout: 24 * 1000,
        ...data,
      });

    expectStatusCode200(res);

    return res.body;
  }

  async createAgentlessPolicy(
    data: CreateAgentlessPolicyRequest['body'],
    spaceId?: string
  ): Promise<CreateAgentlessPolicyResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agentless_policies`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  async syncAgentlessPolicies(data: { dryRun?: boolean } = {}, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/internal/fleet/agentless_policies/_sync`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .set('elastic-api-version', '1')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  async deleteAgentlessPolicy(
    policyId: string,
    spaceId?: string
  ): Promise<DeleteAgentlessPolicyResponse> {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/agentless_policies/${policyId}`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send();

    expectStatusCode200(res);

    return res.body;
  }

  async getAgentlessPolicy(
    policyId: string,
    spaceId?: string
  ): Promise<GetAgentlessPolicyResponse> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/api/fleet/agentless_policies/${policyId}`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }

  async listAgentlessPolicies(
    query: ListAgentlessPoliciesRequest['query'] = {},
    spaceId?: string
  ): Promise<ListAgentlessPoliciesResponse> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/api/fleet/agentless_policies`)
      .query(query)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }

  async createPackagePolicy(
    spaceId?: string,
    data: Partial<SimplifiedPackagePolicy & { package: { name: string; version: string } }> = {}
  ): Promise<CreatePackagePolicyResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/package_policies`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  async updatePackagePolicy(
    packagePolicyId: string,
    data: Partial<SimplifiedPackagePolicy & { package: { name: string; version: string } }> = {},
    spaceId?: string
  ): Promise<UpdatePackagePolicyResponse> {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/package_policies/${packagePolicyId}`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  async deletePackagePolicy(packagePolicyId: string, spaceId?: string) {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/package_policies/${packagePolicyId}`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send();

    expectStatusCode200(res);
  }

  async upgradePackagePolicies(
    spaceId?: string,
    packagePolicyIds: string[] = []
  ): Promise<CreatePackagePolicyResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/package_policies/upgrade`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send({ packagePolicyIds });

    expectStatusCode200(res);

    return res.body;
  }

  async getPackagePolicy(
    packagePolicyId: string,
    spaceId?: string
  ): Promise<GetOnePackagePolicyResponse> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/api/fleet/package_policies/${packagePolicyId}`)
      .auth(this.auth.username, this.auth.password)
      .send();

    expectStatusCode200(res);

    return res.body;
  }
  async getPackagePolicies(spaceId?: string): Promise<GetPackagePoliciesResponse> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/api/fleet/package_policies`)
      .send();

    expectStatusCode200(res);

    return res.body;
  }
  async createFleetServerPolicy(spaceId?: string): Promise<CreateAgentPolicyResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agent_policies`)
      .set('kbn-xsrf', 'xxxx')
      .send({
        name: `test ${uuidV4()}`,
        description: '',
        namespace: 'default',
        inactivity_timeout: 24 * 1000,
        has_fleet_server: true,
        force: true,
      });

    expectStatusCode200(res);

    return res.body;
  }
  async deleteAgentPolicy(agentPolicyId: string, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agent_policies/delete`)
      .auth(this.auth.username, this.auth.password)
      .send({
        agentPolicyId,
      })
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);
  }
  async getAgentPolicy(policyId: string, spaceId?: string): Promise<GetOneAgentPolicyResponse> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/api/fleet/agent_policies/${policyId}`)
      .auth(this.auth.username, this.auth.password);

    expectStatusCode200(res);

    return res.body;
  }
  async putAgentPolicy(
    policyId: string,
    data: Partial<UpdateAgentPolicyRequest['body']>,
    spaceId?: string
  ): Promise<UpdateAgentPolicyResponse> {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/agent_policies/${policyId}`)
      .auth(this.auth.username, this.auth.password)
      .send({
        ...data,
      })
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async getAgentPolicies(spaceId?: string): Promise<GetAgentPoliciesResponse> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/api/fleet/agent_policies`)
      .auth(this.auth.username, this.auth.password);

    expectStatusCode200(res);

    return res.body;
  }

  async getAgentPoliciesSpaces(spaceId?: string) {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/internal/fleet/agent_policies_spaces`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .set('elastic-api-version', '1');

    expectStatusCode200(res);

    return res.body;
  }

  // Enrollment API Keys
  async getEnrollmentApiKey(
    keyId: string,
    spaceId?: string
  ): Promise<GetOneEnrollmentAPIKeyResponse> {
    const res = await this.supertest.get(
      `${this.getBaseUrl(spaceId)}/api/fleet/enrollment_api_keys/${keyId}`
    );

    expectStatusCode200(res);

    return res.body;
  }
  async getEnrollmentApiKeys(spaceId?: string): Promise<GetEnrollmentAPIKeysResponse> {
    const res = await this.supertest.get(
      `${this.getBaseUrl(spaceId)}/api/fleet/enrollment_api_keys`
    );

    expectStatusCode200(res);

    return res.body;
  }

  async deleteEnrollmentApiKey(
    keyId: string,
    spaceId?: string
  ): Promise<PostEnrollmentAPIKeyResponse> {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/enrollment_api_keys/${keyId}`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async postEnrollmentApiKeys(
    body: PostEnrollmentAPIKeyRequest['body'],
    spaceId?: string
  ): Promise<PostEnrollmentAPIKeyResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/enrollment_api_keys`)
      .set('kbn-xsrf', 'xxxx')
      .send(body);

    expectStatusCode200(res);

    return res.body;
  }

  // Uninstall tokens
  async getUninstallTokens(spaceId?: string): Promise<GetUninstallTokensMetadataResponse> {
    const res = await this.supertest.get(`${this.getBaseUrl(spaceId)}/api/fleet/uninstall_tokens`);

    expectStatusCode200(res);

    return res.body;
  }
  async getUninstallToken(tokenId: string, spaceId?: string): Promise<GetUninstallTokenResponse> {
    const res = await this.supertest.get(
      `${this.getBaseUrl(spaceId)}/api/fleet/uninstall_tokens/${tokenId}`
    );

    expectStatusCode200(res);

    return res.body;
  }
  // Agents
  async getAgent(agentId: string, spaceId?: string): Promise<GetOneAgentResponse> {
    const res = await this.supertest.get(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}`);

    expectStatusCode200(res);

    return res.body;
  }
  async getAgents(spaceId?: string): Promise<GetAgentsResponse> {
    const res = await this.supertest.get(`${this.getBaseUrl(spaceId)}/api/fleet/agents`);

    expectStatusCode200(res);

    return res.body;
  }
  async updateAgent(agentId: string, data: any, spaceId?: string) {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  async deleteAgent(agentId: string, spaceId?: string) {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async reassignAgent(agentId: string, policyId: string, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}/reassign`)
      .set('kbn-xsrf', 'xxx')
      .send({
        policy_id: policyId,
      });

    expectStatusCode200(res);

    return res.body;
  }
  async bulkReassignAgents(data: any, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/bulk_reassign`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  async upgradeAgent(agentId: string, data: any, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}/upgrade`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  async bulkUpgradeAgents(data: any, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/bulk_upgrade`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  async requestAgentDiagnostics(agentId: string, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}/request_diagnostics`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async bulkRequestDiagnostics(data: any, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/bulk_request_diagnostics`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  async unenrollAgent(agentId: string, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}/unenroll`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async bulkUnenrollAgents(data: any, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/bulk_unenroll`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  async bulkUpdateAgentTags(data: any, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/bulk_update_agent_tags`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  // Enrollment Settings
  async getEnrollmentSettings(spaceId?: string): Promise<GetEnrollmentSettingsResponse> {
    const res = await this.supertest.get(
      `${this.getBaseUrl(spaceId)}/internal/fleet/settings/enrollment`
    );
    expectStatusCode200(res);

    return res.body;
  }
  // Fleet Usage
  async getFleetUsage(spaceId?: string): Promise<{ usage: FleetUsage }> {
    const res = await this.supertest
      .get(`${this.getBaseUrl(spaceId)}/internal/fleet/telemetry/usage`)
      .set('kbn-xsrf', 'xxxx')
      .set('elastic-api-version', '1');

    expectStatusCode200(res);

    return res.body;
  }
  // Settings
  async getSettings(spaceId?: string): Promise<GetSettingsResponse> {
    const res = await this.supertest.get(`${this.getBaseUrl(spaceId)}/api/fleet/settings`);

    expectStatusCode200(res);

    return res.body;
  }
  async putSettings(
    data: PutSettingsRequest['body'],
    spaceId?: string
  ): Promise<GetSettingsResponse> {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/settings`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  // Space Settings
  async getSpaceSettings(spaceId?: string): Promise<GetSpaceSettingsResponse> {
    const res = await this.supertest.get(`${this.getBaseUrl(spaceId)}/api/fleet/space_settings`);

    expectStatusCode200(res);

    return res.body;
  }
  async putSpaceSettings(
    data: PutSpaceSettingsRequest['body'],
    spaceId?: string
  ): Promise<GetSpaceSettingsResponse> {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/space_settings`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  // Package install
  async getPackage(
    { pkgName, pkgVersion }: { pkgName: string; pkgVersion?: string },
    spaceId?: string
  ): Promise<GetInfoResponse> {
    const res = await this.supertest.get(
      pkgVersion
        ? `${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/${pkgVersion}`
        : `${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}`
    );

    expectStatusCode200(res);

    return res.body;
  }
  async updatePackage(
    {
      pkgName,
      pkgVersion,
      data,
    }: { pkgName: string; pkgVersion: string; data: UpdatePackageRequest['body'] },
    spaceId?: string
  ): Promise<UpdatePackageResponse> {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/${pkgVersion}`)
      .set('kbn-xsrf', 'xxxx')
      .send({ ...data });

    expectStatusCode200(res);

    return res.body;
  }
  async installPackage(
    { pkgName, pkgVersion, force }: { pkgName: string; pkgVersion: string; force?: boolean },
    spaceId?: string
  ) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/${pkgVersion}`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send({ force });

    expectStatusCode200(res);

    return res.body;
  }

  async rollbackPackage({ pkgName }: { pkgName: string }, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/rollback`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send({});

    expectStatusCode200(res);

    return res.body;
  }

  async uninstallPackage(
    { pkgName, pkgVersion, force }: { pkgName: string; pkgVersion: string; force?: boolean },
    spaceId?: string
  ) {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/${pkgVersion}`)
      .set('kbn-xsrf', 'xxxx')
      .send({ force });

    expectStatusCode200(res);

    return res.body;
  }
  async deletePackageKibanaAssets(
    { pkgName, pkgVersion }: { pkgName: string; pkgVersion: string },
    spaceId?: string
  ) {
    const res = await this.supertest
      .delete(
        `${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/${pkgVersion}/kibana_assets`
      )
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async installPackageKibanaAssets(
    { pkgName, pkgVersion, spaceIds }: { pkgName: string; pkgVersion: string; spaceIds?: string[] },
    spaceId?: string
  ) {
    const res = await this.supertest
      .post(
        `${this.getBaseUrl(spaceId)}/api/fleet/epm/packages/${pkgName}/${pkgVersion}/kibana_assets`
      )
      .set('kbn-xsrf', 'xxxx')
      .send(spaceIds ? { space_ids: spaceIds } : {});

    expectStatusCode200(res);

    return res.body;
  }
  // Actions
  async getActionStatus(spaceId?: string): Promise<GetActionStatusResponse> {
    const res = await this.supertest.get(
      `${this.getBaseUrl(spaceId)}/api/fleet/agents/action_status`
    );

    expectStatusCode200(res);

    return res.body;
  }
  async postNewAgentAction(agentId: string, spaceId?: string): Promise<PostNewAgentActionResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/${agentId}/actions`)
      .set('kbn-xsrf', 'xxxx')
      .send({ action: { type: 'UNENROLL' } });

    expectStatusCode200(res);

    return res.body;
  }
  async cancelAction(actionId: string, spaceId?: string): Promise<PostNewAgentActionResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agents/actions/${actionId}/cancel`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  // Enable space awareness
  async postEnableSpaceAwareness(spaceId?: string): Promise<any> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/internal/fleet/enable_space_awareness`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .set('elastic-api-version', '1');

    expectStatusCode200(res);

    return res.body;
  }
  // Download source
  async deleteDownloadSource(id: string, spaceId?: string) {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/agent_download_sources/${id}`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async postDownloadSource(
    data: PostDownloadSourceRequest['body'],
    spaceId?: string
  ): Promise<GetOneDownloadSourceResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/agent_download_sources`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);
    expectStatusCode200(res);

    return res.body;
  }
  async putDownloadSource(data: PutDownloadSourceRequest['body'], id: string, spaceId?: string) {
    const res = await this.supertest
      .put(`${this.getBaseUrl(spaceId)}/api/fleet/agent_download_sources/${id}`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);
    expectStatusCode200(res);

    return res.body;
  }
  // Fleet server hosts
  async deleteFleetServerHosts(id: string, spaceId?: string) {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/fleet_server_hosts/${id}`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async postFleetServerHosts(
    data: PostFleetServerHostsRequest['body'],
    spaceId?: string
  ): Promise<PostFleetServerHostsResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/fleet_server_hosts`)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }
  // Output
  async deleteOutput(id: string, spaceId?: string) {
    const res = await this.supertest
      .delete(`${this.getBaseUrl(spaceId)}/api/fleet/outputs/${id}`)
      .set('kbn-xsrf', 'xxxx');

    expectStatusCode200(res);

    return res.body;
  }
  async postOutput(
    data: PostOutputRequest['body'],
    spaceId?: string
  ): Promise<GetOneOutputResponse> {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/api/fleet/outputs`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .send(data);

    expectStatusCode200(res);

    return res.body;
  }

  async postStandaloneApiKey(name: string, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/internal/fleet/create_standalone_agent_api_key`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .set('elastic-api-version', '1')
      .send({ name });

    expectStatusCode200(res);

    return res.body;
  }

  async postManagedOtlpApiKey(name: string, spaceId?: string) {
    const res = await this.supertest
      .post(`${this.getBaseUrl(spaceId)}/internal/fleet/create_managed_otlp_api_key`)
      .auth(this.auth.username, this.auth.password)
      .set('kbn-xsrf', 'xxxx')
      .set('elastic-api-version', '1')
      .send({ name });

    expectStatusCode200(res);

    return res.body;
  }
}
