/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFileSync } from 'fs';
import { CA_CERT_PATH } from '@kbn/dev-utils';
import {
  MOCK_IDP_ATTRIBUTE_EMAIL,
  MOCK_IDP_ATTRIBUTE_NAME,
  MOCK_IDP_ATTRIBUTE_PRINCIPAL,
  MOCK_IDP_ATTRIBUTE_ROLES,
  MOCK_IDP_ENTITY_ID,
  MOCK_IDP_REALM_NAME,
  MOCK_IDP_SP_BASE_URL,
} from '@kbn/mock-idp-utils';
import type { ScoutServerConfig } from '../../../../../types';
import { defaultConfig } from '../../default/stateful/base.config';
import { STATEFUL_IDP_METADATA_PATH } from '../../../constants';

const addOrReplaceArg = (serverArgs: string[], argName: string, newValue: string) => {
  const argPrefix = `--${argName}=`;
  const idx = serverArgs.findIndex((a) => a.startsWith(argPrefix));
  if (idx === -1) {
    serverArgs.push(`${argPrefix}${newValue}`);
  } else {
    serverArgs[idx] = `${argPrefix}${newValue}`;
  }
};

const kbnServerArgs = [...defaultConfig.kbnTestServer.serverArgs];

addOrReplaceArg(
  kbnServerArgs,
  'xpack.security.authc.providers',
  JSON.stringify({
    pki: { pki1: { order: 0 } },
    saml: { 'cloud-saml-kibana': { order: 1, realm: MOCK_IDP_REALM_NAME } },
    basic: { basic1: { order: 2 } },
  })
);
addOrReplaceArg(kbnServerArgs, 'xpack.security.authc.selector.enabled', 'false');
addOrReplaceArg(kbnServerArgs, 'elasticsearch.hosts', 'https://localhost:9220');
addOrReplaceArg(kbnServerArgs, 'elasticsearch.ssl.certificateAuthorities', CA_CERT_PATH);
addOrReplaceArg(kbnServerArgs, 'server.ssl.clientAuthentication', 'optional');

export const pkiConfig: ScoutServerConfig = {
  servers: {
    ...defaultConfig.servers,
    elasticsearch: {
      ...defaultConfig.servers.elasticsearch,
      protocol: 'https',
      certificateAuthorities: [readFileSync(CA_CERT_PATH)],
    },
  },
  dockerServers: defaultConfig.dockerServers,
  esTestCluster: {
    from: 'snapshot',
    license: 'trial',
    files: defaultConfig.esTestCluster.files,
    ssl: true,
    serverArgs: [
      'xpack.security.authc.token.enabled=true',
      'xpack.security.http.ssl.client_authentication=optional',
      'xpack.security.http.ssl.verification_mode=certificate',
      'xpack.security.authc.realms.native.native1.order=0',
      'xpack.security.authc.realms.pki.pki1.order=1',
      'xpack.security.authc.realms.pki.pki1.delegation.enabled=true',
      `xpack.security.authc.realms.pki.pki1.certificate_authorities=${CA_CERT_PATH}`,
      // SAML realm required by Scout's startup steps
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.order=2`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.metadata.path=${STATEFUL_IDP_METADATA_PATH}`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.entity_id=${MOCK_IDP_ENTITY_ID}`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.entity_id=${MOCK_IDP_SP_BASE_URL}`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.acs=${MOCK_IDP_SP_BASE_URL}/api/security/saml/callback`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.logout=${MOCK_IDP_SP_BASE_URL}/logout`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.principal=${MOCK_IDP_ATTRIBUTE_PRINCIPAL}`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.groups=${MOCK_IDP_ATTRIBUTE_ROLES}`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.name=${MOCK_IDP_ATTRIBUTE_NAME}`,
      `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.mail=${MOCK_IDP_ATTRIBUTE_EMAIL}`,
    ],
  },
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: kbnServerArgs,
  },
};
