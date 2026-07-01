/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import type { FtrProviderContext } from '../../ftr_provider_context';
import type { InternalRequestHeader, RoleCredentials } from '../../../shared/services';

export default function ({ getService }: FtrProviderContext) {
  const svlCommonApi = getService('svlCommonApi');
  const svlUserManager = getService('svlUserManager');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  let roleAuthc: RoleCredentials;
  let internalReqHeader: InternalRequestHeader;

  describe('encrypted saved objects', function () {
    before(async () => {
      roleAuthc = await svlUserManager.createM2mApiKeyWithRoleScope('admin');
      internalReqHeader = svlCommonApi.getInternalRequestHeader();
    });
    after(async () => {
      await svlUserManager.invalidateM2mApiKeyWithRoleScope(roleAuthc);
    });
    describe('route access', () => {
      describe('internal', () => {
        it('rotate key', async () => {
          let body: unknown;
          let status: number;

          ({ body, status } = await supertestWithoutAuth
            .post('/api/encrypted_saved_objects/_rotate_key')
            .set(roleAuthc.apiKeyHeader));
          // xsrf bypass exposes internal access denied without internal header
          expect(body).toEqual({
            statusCode: 400,
            error: 'Bad Request',
            message: expect.stringContaining(
              'exists but is not available with the current configuration'
            ),
          });
          expect(status).toBe(400);

          ({ body, status } = await supertestWithoutAuth
            .post('/api/encrypted_saved_objects/_rotate_key')
            .set(internalReqHeader)
            .set(roleAuthc.apiKeyHeader));
          // with the internal origin header the route is accessible; the config does
          // not contain decryptionOnlyKeys so the handler returns its own 400.
          expect(body).toEqual({
            statusCode: 400,
            error: 'Bad Request',
            message: expect.stringContaining(
              'Kibana is not configured to support encryption key rotation. Update `kibana.yml` to include `xpack.encryptedSavedObjects.keyRotation.decryptionOnlyKeys` to rotate your encryption keys.'
            ),
          });
          expect(status).toBe(400);
        });
      });
    });
  });
}
