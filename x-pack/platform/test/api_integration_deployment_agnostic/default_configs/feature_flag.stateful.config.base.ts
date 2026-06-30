/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  MOCK_IDP_REALM_NAME,
  MOCK_IDP_ENTITY_ID,
  MOCK_IDP_ATTRIBUTE_PRINCIPAL,
  MOCK_IDP_ATTRIBUTE_ROLES,
  MOCK_IDP_ATTRIBUTE_EMAIL,
  MOCK_IDP_ATTRIBUTE_NAME,
  MOCK_IDP_SP_BASE_URL,
} from '@kbn/mock-idp-utils';
import type { FtrConfigProviderContext } from '@kbn/test';
import {
  esTestConfig,
  kbnTestConfig,
  systemIndicesSuperuser,
  defineDockerServersConfig,
  packageRegistryDocker,
  dockerRegistryPort,
} from '@kbn/test';
import { ScoutTestRunConfigCategory } from '@kbn/scout-info';
import path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import { STATEFUL_ROLES_ROOT_PATH } from '@kbn/es';
import type { DeploymentAgnosticCommonServices } from '../services';
import { services } from '../services';
import {
  AI_ASSISTANT_SNAPSHOT_REPO_PATH,
  STREAMS_SNAPSHOT_REPO_PATH,
  LOCAL_PRODUCT_DOC_PATH,
} from './common_paths';
import { updateKbnServerArguments } from './helpers';

interface CreateTestConfigOptions<T extends DeploymentAgnosticCommonServices> {
  esServerArgs?: string[];
  kbnServerArgs?: string[];
  services?: T;
  testFiles: string[];
  junit: { reportName: string };
  suiteTags?: { include?: string[]; exclude?: string[] };
}

export function createStatefulFeatureFlagTestConfig<T extends DeploymentAgnosticCommonServices>(
  options: CreateTestConfigOptions<T>
) {
  return async ({ readConfigFile }: FtrConfigProviderContext) => {
    let kbnServerArgs: string[] = [];

    if (options.kbnServerArgs) {
      kbnServerArgs = await updateKbnServerArguments(options.kbnServerArgs);
    }

    const xPackAPITestsConfig = await readConfigFile(
      require.resolve('../../api_integration/config.ts')
    );

    // TODO: move to kbn-es because currently metadata file has hardcoded entityID and Location
    const idpPath = require.resolve(
      '@kbn/security-api-integration-helpers/saml/idp_metadata_mock_idp.xml'
    );
    const samlIdPPlugin = path.resolve(
      __dirname,
      '../../security_api_integration/plugins/saml_provider'
    );

    const servers = {
      kibana: {
        ...kbnTestConfig.getUrlParts(systemIndicesSuperuser),
        protocol: process.env.TEST_CLOUD ? 'https' : 'http',
      },
      elasticsearch: {
        ...esTestConfig.getUrlParts(),
        protocol: process.env.TEST_CLOUD ? 'https' : 'http',
      },
    };

    return {
      servers,
      testConfigCategory: ScoutTestRunConfigCategory.API_TEST,
      dockerServers: defineDockerServersConfig({
        registry: packageRegistryDocker,
      }),
      testFiles: options.testFiles,
      security: { disableTestUser: true },
      // services can be customized, but must extend DeploymentAgnosticCommonServices
      services: options.services || services,
      junit: options.junit,
      suiteTags: {
        include: options.suiteTags?.include,
        exclude: [...(options.suiteTags?.exclude || []), 'skipStateful'],
      },

      esTestCluster: {
        ...xPackAPITestsConfig.get('esTestCluster'),
        serverArgs: [
          ...xPackAPITestsConfig.get('esTestCluster.serverArgs'),
          'xpack.security.authc.token.enabled=true',
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.order=0`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.metadata.path=${idpPath}`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.entity_id=${MOCK_IDP_ENTITY_ID}`,
          // SP args must match the fixed URL the mock IdP plugin embeds in SAML responses.
          // The plugin's `onPreResponse` rewrites IdP-bound redirects to the actual Kibana URL
          // (`server.publicBaseUrl` below) at runtime, so ES does not need to know that URL.
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.entity_id=${MOCK_IDP_SP_BASE_URL}`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.acs=${MOCK_IDP_SP_BASE_URL}/api/security/saml/callback`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.logout=${MOCK_IDP_SP_BASE_URL}/logout`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.principal=${MOCK_IDP_ATTRIBUTE_PRINCIPAL}`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.groups=${MOCK_IDP_ATTRIBUTE_ROLES}`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.name=${MOCK_IDP_ATTRIBUTE_NAME}`,
          `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.mail=${MOCK_IDP_ATTRIBUTE_EMAIL}`,
          `path.repo=${AI_ASSISTANT_SNAPSHOT_REPO_PATH},${STREAMS_SNAPSHOT_REPO_PATH}`,
          ...(options.esServerArgs || []),
        ],
        files: [
          // Passing the roles that are equivalent to the ones we have in serverless
          path.resolve(REPO_ROOT, STATEFUL_ROLES_ROOT_PATH, 'roles.yml'),
        ],
      },
      kbnTestServer: {
        ...xPackAPITestsConfig.get('kbnTestServer'),
        serverArgs: [
          ...xPackAPITestsConfig.get('kbnTestServer.serverArgs'),
          // This ensures that we register the Security SAML API endpoints.
          // In the real world the SAML config is injected by control plane.
          `--plugin-path=${samlIdPPlugin}`,
          '--xpack.cloud.id=ftr_fake_cloud_id',
          // Ensure that SAML is used as the default authentication method whenever a user navigates to Kibana. In other
          // words, Kibana should attempt to authenticate the user using the provider with the lowest order if the Login
          // Selector is disabled (replicating Serverless configuration). By declaring `cloud-basic` with a higher
          // order, we indicate that basic authentication can still be used, but only if explicitly requested when the
          // user navigates to `/login` page directly and enters username and password in the login form.
          '--xpack.security.authc.selector.enabled=false',
          `--xpack.security.authc.providers=${JSON.stringify({
            saml: { 'cloud-saml-kibana': { order: 0, realm: MOCK_IDP_REALM_NAME } },
            basic: { 'cloud-basic': { order: 1 } },
          })}`,
          `--server.publicBaseUrl=${servers.kibana.protocol}://${servers.kibana.hostname}:${servers.kibana.port}`,
          '--xpack.uptime.service.password=test',
          '--xpack.uptime.service.username=localKibanaIntegrationTestsUser',
          '--xpack.uptime.service.devUrl=mockDevUrl',
          '--xpack.uptime.service.manifestUrl=mockDevUrl',
          '--xpack.observabilityAIAssistant.disableKbSemanticTextMigration=true',
          `--xpack.productDocBase.artifactRepositoryUrl=file:///${LOCAL_PRODUCT_DOC_PATH}`,
          ...(dockerRegistryPort
            ? [`--xpack.fleet.registryUrl=http://localhost:${dockerRegistryPort}`]
            : []),
          ...kbnServerArgs,
        ],
      },
    };
  };
}
