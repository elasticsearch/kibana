/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Helpers shared by the `session_*` config sets. Not a config set itself: there are no servers here.

import { resolve } from 'path';

import { MOCK_IDP_REALM_NAME } from '@kbn/mock-idp-utils';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ScoutServerConfig } from '../../../../types';

const SAML1_IDP_METADATA_PATH = resolve(
  REPO_ROOT,
  'x-pack/platform/test/security_api_integration/packages/helpers/saml/idp_metadata.xml'
);

export const TEST_ENDPOINTS_PLUGIN_PATH = resolve(
  REPO_ROOT,
  'x-pack/platform/test/security_functional/plugins/test_endpoints'
);

export const addOrReplaceArg = (serverArgs: string[], argName: string, newValue: string) => {
  const argPrefix = `--${argName}=`;
  const idx = serverArgs.findIndex((a) => a.startsWith(argPrefix));
  if (idx === -1) {
    serverArgs.push(`${argPrefix}${newValue}`);
  } else {
    serverArgs[idx] = `${argPrefix}${newValue}`;
  }
};

/** SAML provider Scout needs for its `preCreateSecurityIndexesViaSamlAuth` step. */
export const preCreateSamlProvider = (order: number) => ({
  'cloud-saml-kibana': { order, realm: MOCK_IDP_REALM_NAME },
});

function saml1RealmEsArgs(config: ScoutServerConfig, order: number): string[] {
  const { hostname, port } = config.servers.kibana;
  return [
    `xpack.security.authc.realms.saml.saml1.order=${order}`,
    `xpack.security.authc.realms.saml.saml1.idp.metadata.path=${SAML1_IDP_METADATA_PATH}`,
    'xpack.security.authc.realms.saml.saml1.idp.entity_id=http://www.elastic.co/saml1',
    `xpack.security.authc.realms.saml.saml1.sp.entity_id=http://${hostname}:${port}`,
    `xpack.security.authc.realms.saml.saml1.sp.logout=http://${hostname}:${port}/logout`,
    `xpack.security.authc.realms.saml.saml1.sp.acs=http://${hostname}:${port}/api/security/saml/callback`,
    'xpack.security.authc.realms.saml.saml1.attributes.principal=urn:oid:0.0.7',
  ];
}

export function withSaml1Realm(
  config: ScoutServerConfig,
  options: { order: number; extraEsArgs?: string[] }
): ScoutServerConfig['esTestCluster'] {
  return {
    ...config.esTestCluster,
    serverArgs: [
      ...config.esTestCluster.serverArgs,
      ...(options.extraEsArgs ?? []),
      ...saml1RealmEsArgs(config, options.order),
    ],
  };
}
