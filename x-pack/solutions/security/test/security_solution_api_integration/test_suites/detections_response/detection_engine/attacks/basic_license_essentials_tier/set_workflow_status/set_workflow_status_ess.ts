/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';

import {
  API_VERSIONS,
  DETECTION_ENGINE_ATTACKS_STATUS_URL,
} from '@kbn/security-solution-plugin/common/constants';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import {
  noKibanaPrivileges,
  alertsReadUser,
  alertsAllUser,
  alertsUpdateLegacyUser,
} from '../../../unified_alerts/utils/auth/users';
import { getMissingAlertsUpdatePrivilegesError } from '../../../unified_alerts/utils/privileges_errors';

export default ({ getService }: FtrProviderContext) => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');

  describe('@ess Set Attacks Workflow Status - ESS', () => {
    describe('RBAC', () => {
      describe('Kibana privileges', () => {
        it('should update attacks with alerts all privileges', async () => {
          const { body } = await supertestWithoutAuth
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .auth(alertsAllUser.username, alertsAllUser.password)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(200);

          expect(body).toHaveProperty('updated');
        });

        it('should update attacks with legacy alerts update privileges', async () => {
          const { body } = await supertestWithoutAuth
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .auth(alertsUpdateLegacyUser.username, alertsUpdateLegacyUser.password)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(200);

          expect(body).toHaveProperty('updated');
        });

        it('should not update attacks without privileges', async () => {
          const { body } = await supertestWithoutAuth
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .auth(noKibanaPrivileges.username, noKibanaPrivileges.password)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(403);

          expect(body).toEqual(
            getMissingAlertsUpdatePrivilegesError({
              routeDetails: `POST ${DETECTION_ENGINE_ATTACKS_STATUS_URL}`,
            })
          );
        });

        it('should not update attacks with alerts read privileges', async () => {
          const { body } = await supertestWithoutAuth
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .auth(alertsReadUser.username, alertsReadUser.password)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(403);

          expect(body).toEqual(
            getMissingAlertsUpdatePrivilegesError({
              routeDetails: `POST ${DETECTION_ENGINE_ATTACKS_STATUS_URL}`,
            })
          );
        });
      });
    });
  });
};
