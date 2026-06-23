/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { MOCK_IDP_REALM_NAME } from '@kbn/mock-idp-utils';
import { ToolingLog } from '@kbn/tooling-log';

const mockWriteFileSync = jest.fn();
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

import { configureMockIdpSamlRealm } from './configure_mock_idp_saml_realm';

describe('configureMockIdpSamlRealm', () => {
  let log: ToolingLog;
  let warnings: string[];

  beforeEach(() => {
    mockWriteFileSync.mockReset();
    warnings = [];
    log = new ToolingLog();
    jest.spyOn(log, 'warning').mockImplementation((msg) => warnings.push(String(msg)));
    jest.spyOn(log, 'info').mockImplementation(() => {});
  });

  it('auto-configures the SAML realm for a trial license', async () => {
    const { esArgs, resources } = await configureMockIdpSamlRealm({
      userEsArgs: ['cluster.name=test'],
      license: 'trial',
      log,
    });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);

    // SAML args are prepended so user-provided args can still override them.
    expect(esArgs[esArgs.length - 1]).toBe('cluster.name=test');
    expect(esArgs).toContain('xpack.security.authc.token.enabled=true');
    expect(
      esArgs.some((arg) =>
        arg.startsWith(`xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.`)
      )
    ).toBe(true);

    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatch(/roles\.yml$/);
    expect(warnings).toHaveLength(0);
  });

  it('skips configuration and warns for a basic license', async () => {
    const { esArgs, resources } = await configureMockIdpSamlRealm({
      userEsArgs: ['cluster.name=test'],
      license: 'basic',
      log,
    });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(esArgs).toEqual(['cluster.name=test']);
    expect(resources).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('--license=basic');
    expect(warnings[0]).toContain('--mockIdpPlugin.enabled=false');
  });

  it('skips configuration and warns when the user already configured the SAML realm', async () => {
    const userEsArgs = [`xpack.security.authc.realms.saml.${MOCK_IDP_REALM_NAME}.order=0`];

    const { esArgs, resources } = await configureMockIdpSamlRealm({
      userEsArgs,
      license: 'trial',
      log,
    });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(esArgs).toEqual(userEsArgs);
    expect(resources).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(MOCK_IDP_REALM_NAME);
  });
});
