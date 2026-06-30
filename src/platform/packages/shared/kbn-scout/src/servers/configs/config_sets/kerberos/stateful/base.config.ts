/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolve } from 'path';

import { MOCK_IDP_REALM_NAME } from '@kbn/mock-idp-utils';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ScoutServerConfig } from '../../../../../types';
import { defaultConfig } from '../../default/stateful/base.config';

const addOrReplaceArg = (serverArgs: string[], argName: string, newValue: string) => {
  const argPrefix = `--${argName}=`;
  const idx = serverArgs.findIndex((a) => a.startsWith(argPrefix));
  if (idx === -1) {
    serverArgs.push(`${argPrefix}${newValue}`);
  } else {
    serverArgs[idx] = `${argPrefix}${newValue}`;
  }
};

// Kerberos test fixtures (pre-generated keytab + krb5.conf) are owned by the security
// API integration helpers. We reference them by repo-relative path so that this shared
// `kbn-scout` package does not need a dependency on that private, devOnly package — the
// Elasticsearch process simply reads the files from these absolute paths at startup.
const KERBEROS_HELPERS_PATH = resolve(
  REPO_ROOT,
  'x-pack/platform/test/security_api_integration/packages/helpers/kerberos'
);
const kerberosKeytabPath = resolve(KERBEROS_HELPERS_PATH, 'krb5.keytab');
const kerberosConfigPath = resolve(KERBEROS_HELPERS_PATH, 'krb5.conf');

const kbnServerArgs = [...defaultConfig.kbnTestServer.serverArgs];

// Enable the Kerberos provider (order 0) so SPNEGO `Negotiate` requests are handled first.
// The SAML provider is still required by Scout's startup steps, and basic remains as a fallback.
addOrReplaceArg(
  kbnServerArgs,
  'xpack.security.authc.providers',
  JSON.stringify({
    kerberos: { kerberos1: { order: 0 } },
    saml: { 'cloud-saml-kibana': { order: 1, realm: MOCK_IDP_REALM_NAME } },
    basic: { 'cloud-basic': { order: 2 } },
  })
);
addOrReplaceArg(kbnServerArgs, 'xpack.security.authc.selector.enabled', 'false');

export const kerberosConfig: ScoutServerConfig = {
  ...defaultConfig,
  esTestCluster: {
    ...defaultConfig.esTestCluster,
    serverArgs: [
      ...defaultConfig.esTestCluster.serverArgs,
      // The default config already registers the SAML realm at order 0; add Kerberos alongside it.
      'xpack.security.authc.realms.kerberos.kerb1.order=1',
      `xpack.security.authc.realms.kerberos.kerb1.keytab.path=${kerberosKeytabPath}`,
    ],
    // We reuse the same TGT/SPNEGO token across tests, so the replay cache must be disabled
    // or Elasticsearch rejects the repeated token (mirrors the FTR Kerberos config).
    esJavaOpts: `-Djava.security.krb5.conf=${kerberosConfigPath} -Dsun.security.krb5.rcache=none`,
  },
  kbnTestServer: {
    ...defaultConfig.kbnTestServer,
    serverArgs: kbnServerArgs,
  },
};
