/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolve } from 'path';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  MOCK_IDP_REALM_NAME,
  MOCK_IDP_ENTITY_ID,
  MOCK_IDP_ATTRIBUTE_PRINCIPAL,
  MOCK_IDP_ATTRIBUTE_ROLES,
  MOCK_IDP_ATTRIBUTE_NAME,
  MOCK_IDP_ATTRIBUTE_EMAIL,
  createMockIdpMetadata,
  MOCK_IDP_SP_BASE_URL,
} from '@kbn/mock-idp-utils';

import { STATEFUL_ROLES_ROOT_PATH } from '../paths';

export interface ConfigureMockIdpSamlRealmOptions {
  /** User-provided `-E` Elasticsearch args. */
  userEsArgs: string[];
  /** License the cluster is started with. SAML requires a `trial` (or higher) license. */
  license?: string;
  log: ToolingLog;
}

export interface ConfigureMockIdpSamlRealmResult {
  /** The Elasticsearch args to start the cluster with (SAML args prepended to user args). */
  esArgs: string[];
  /** Additional resources (e.g. `roles.yml`) to copy into the cluster's config directory. */
  resources: string[];
}

/**
 * Auto-configures a mock SAML realm so the Kibana Mock IdP works out-of-the-box, mirroring what we
 * do for snapshot-based clusters. The realm is only configured when the user hasn't already
 * provided SAML realm args via `-E` and the cluster is started with a `trial` (or higher) license.
 *
 * Returns the final Elasticsearch args (with SAML args prepended so user `-E` args can override
 * them) and any additional resources that must be copied into the cluster's config directory.
 */
export async function configureMockIdpSamlRealm({
  userEsArgs,
  license,
  log,
}: ConfigureMockIdpSamlRealmOptions): Promise<ConfigureMockIdpSamlRealmResult> {
  // Auto-configure SAML realm unless user has already provided SAML realm args via -E
  // or is using a basic license (SAML requires trial or higher)
  const hasSamlConfig = userEsArgs.some((arg) =>
    arg.includes(`authc.realms.saml.${MOCK_IDP_REALM_NAME}.`)
  );

  if (hasSamlConfig) {
    log.warning(
      `Skipping SAML Mock IdP realm auto-configuration because user-provided -E args already configure the "${MOCK_IDP_REALM_NAME}" SAML realm.`
    );
    return { esArgs: userEsArgs, resources: [] };
  }

  if (license === 'basic') {
    log.warning(
      `Skipping SAML Mock IdP realm auto-configuration because --license=basic does not support the SAML realm. ` +
        `Run Kibana with \`--mockIdpPlugin.enabled=false\` (or set it in kibana.dev.yml) so it doesn't try to enable the SAML provider.`
    );
    return { esArgs: userEsArgs, resources: [] };
  }

  log.info('Configuring SAML realm for Mock IdP ');

  const metadata = await createMockIdpMetadata();
  const metadataPath = resolve(tmpdir(), 'mock_idp_metadata.xml');
  writeFileSync(metadataPath, metadata);

  const samlEsArgs = [
    'xpack.security.authc.token.enabled=true',
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.order=0`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.metadata.path=${metadataPath}`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.idp.entity_id=${MOCK_IDP_ENTITY_ID}`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.entity_id=${MOCK_IDP_SP_BASE_URL}`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.acs=${MOCK_IDP_SP_BASE_URL}/api/security/saml/callback`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.sp.logout=${MOCK_IDP_SP_BASE_URL}/logout`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.principal=${MOCK_IDP_ATTRIBUTE_PRINCIPAL}`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.groups=${MOCK_IDP_ATTRIBUTE_ROLES}`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.name=${MOCK_IDP_ATTRIBUTE_NAME}`,
    `xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.attributes.mail=${MOCK_IDP_ATTRIBUTE_EMAIL}`,
  ];

  return {
    // SAML args go first so user -E args can override them
    esArgs: [...samlEsArgs, ...userEsArgs],
    // Copy stateful roles.yml so ES knows about viewer, editor, admin, system_indices_superuser
    resources: [resolve(STATEFUL_ROLES_ROOT_PATH, 'roles.yml')],
  };
}
