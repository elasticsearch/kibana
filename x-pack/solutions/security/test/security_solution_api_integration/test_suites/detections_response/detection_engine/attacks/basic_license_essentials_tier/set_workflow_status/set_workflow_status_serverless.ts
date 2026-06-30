/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';

import { ROLES } from '@kbn/security-solution-plugin/common/test';
import {
  API_VERSIONS,
  DETECTION_ENGINE_ATTACKS_STATUS_URL,
} from '@kbn/security-solution-plugin/common/constants';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import {
  noKibanaPrivileges,
  alertsAll,
  alertsUpdateLegacy,
} from '../../../unified_alerts/utils/auth/roles';
import { getMissingAlertsUpdatePrivilegesError } from '../../../unified_alerts/utils/privileges_errors';

export default ({ getService }: FtrProviderContext) => {
  const utils = getService('securitySolutionUtils');

  // @skipInServerlessMKI publicAttacksApiEnabled experimental flag is not applied in MKI serverless
  describe('@serverless @skipInServerlessMKI Set Attacks Workflow Status - Serverless', () => {
    describe('Happy path for predefined users', () => {
      const roles = [
        'editor',
        ROLES.t1_analyst,
        ROLES.t2_analyst,
        ROLES.t3_analyst,
        ROLES.rule_author,
        ROLES.soc_manager,
        ROLES.detections_admin,
        ROLES.platform_engineer,
      ];

      roles.forEach((role) => {
        it(`should update attacks with the role "${role}"`, async () => {
          const testAgent = await utils.createSuperTest(role);

          const { body } = await testAgent
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(200);

          expect(body).toHaveProperty('updated');
        });
      });
    });

    describe('RBAC', () => {
      describe('Kibana privileges', () => {
        it('should update attacks with alerts all privileges', async () => {
          const testAgent = await utils.createSuperTestWithCustomRole(alertsAll);

          const { body } = await testAgent
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(200);

          expect(body).toHaveProperty('updated');
        });

        it('should update attacks with legacy alerts update privileges', async () => {
          const testAgent = await utils.createSuperTestWithCustomRole(alertsUpdateLegacy);

          const { body } = await testAgent
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
            .set('kbn-xsrf', 'true')
            .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
            .send({ ids: ['test-id'], status: 'closed' })
            .expect(200);

          expect(body).toHaveProperty('updated');
        });

        it('should not update attacks without privileges', async () => {
          const testAgent = await utils.createSuperTestWithCustomRole(noKibanaPrivileges);

          const { body } = await testAgent
            .post(DETECTION_ENGINE_ATTACKS_STATUS_URL)
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
