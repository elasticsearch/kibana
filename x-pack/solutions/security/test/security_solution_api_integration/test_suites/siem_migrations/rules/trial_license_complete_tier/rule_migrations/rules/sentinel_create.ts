/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import {
  deleteAllRuleMigrations,
  expectedSentinelWatchlists,
  ruleMigrationResourcesRouteHelpersFactory,
  ruleMigrationRouteHelpersFactory,
  sentinelArmResourcesWithWatchlist,
} from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

export default ({ getService }: FtrProviderContext) => {
  const es = getService('es');
  const supertest = getService('supertest');
  const migrationRulesRoutes = ruleMigrationRouteHelpersFactory(supertest);
  const migrationResourcesRoutes = ruleMigrationResourcesRouteHelpersFactory(supertest);

  describe('@ess @serverless @serverlessQA @skipInServerlessMKI Create Sentinel Rules API', () => {
    let migrationId: string;
    beforeEach(async () => {
      await deleteAllRuleMigrations(es);
      const response = await migrationRulesRoutes.create({});
      migrationId = response.body.migration_id;
    });

    describe('Expected behavior', () => {
      it('should create Sentinel migrations and identify watchlists as missing resources', async () => {
        await migrationRulesRoutes.addSentinelRulesToMigration({
          migrationId,
          payload: sentinelArmResourcesWithWatchlist,
        });

        const rulesResponse = await migrationRulesRoutes.getRules({ migrationId });
        expect(rulesResponse.body.total).toEqual(1);

        const migrationRule = rulesResponse.body.data[0];
        expect(migrationRule.original_rule.vendor).toEqual('microsoft-sentinel');
        expect(migrationRule.original_rule.title).toEqual(
          'Suspicious sign-in from watchlisted account'
        );

        const resourcesResponse = await migrationResourcesRoutes.getMissingResources({
          migrationId,
        });

        expect(resourcesResponse.body).toEqual(expect.arrayContaining(expectedSentinelWatchlists));
        expect(resourcesResponse.body.length).toEqual(expectedSentinelWatchlists.length);
      });
    });

    describe('Error handling', () => {
      it('should return 404 if invalid migration id is provided', async () => {
        const { body } = await migrationRulesRoutes.addSentinelRulesToMigration({
          migrationId: 'non-existing-migration-id',
          payload: sentinelArmResourcesWithWatchlist,
          expectStatusCode: 404,
        });

        expect(body).toMatchObject({
          statusCode: 404,
          error: 'Not Found',
          message: 'No Migration found with id: non-existing-migration-id',
        });
      });

      it('should return a validation error when resources is missing', async () => {
        await migrationRulesRoutes.addSentinelRulesToMigration({
          migrationId,
          // @ts-expect-error intentionally invalid payload
          payload: {},
          expectStatusCode: 400,
        });
      });

      it('should return a validation error when resources is empty', async () => {
        await migrationRulesRoutes.addSentinelRulesToMigration({
          migrationId,
          payload: { resources: [] },
          expectStatusCode: 400,
        });
      });

      it('should return a bad request when no Scheduled rules are present', async () => {
        const response = await migrationRulesRoutes.addSentinelRulesToMigration({
          migrationId,
          payload: {
            resources: [
              {
                name: 'fusion-rule',
                kind: 'Fusion',
                type: 'Microsoft.SecurityInsights/alertRules',
                properties: {
                  displayName: 'Fusion rule that should be filtered out',
                  query: 'unused',
                },
              },
            ],
          },
          expectStatusCode: 400,
        });

        expect(response.body).toMatchObject({
          message: 'No Scheduled or NRT rules found in the provided JSON export',
        });
      });
    });
  });
};
