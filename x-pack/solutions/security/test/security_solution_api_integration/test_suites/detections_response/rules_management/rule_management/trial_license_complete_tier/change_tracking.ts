/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { ModeEnum } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { BulkActionTypeEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_management';
import { DETECTION_ENGINE_RULES_IMPORT_URL } from '@kbn/security-solution-plugin/common/constants';
import { deleteAllRules } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  combineToNdJson,
  createHistoricalPrebuiltRuleAssetSavedObjects,
  createPrebuiltRuleAssetSavedObjects,
  createRuleAssetSavedObject,
  deleteAllPrebuiltRuleAssets,
  getCustomQueryRuleParams,
  installPrebuiltRules,
  performUpgradePrebuiltRules,
} from '../../../utils';
import { revertPrebuiltRule } from '../../../utils/rules/prebuilt_rules/revert_prebuilt_rule';

const CHANGE_HISTORY_DATA_STREAM = '.kibana_change_history';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const es = getService('es');
  const log = getService('log');

  const refreshHistory = async () => {
    await es.indices.refresh({ index: CHANGE_HISTORY_DATA_STREAM, ignore_unavailable: true });
  };

  const clearHistory = async () => {
    try {
      await es.deleteByQuery({
        index: CHANGE_HISTORY_DATA_STREAM,
        query: { match_all: {} },
        conflicts: 'proceed',
        refresh: true,
      });
    } catch {
      // Change history index may not exist yet
    }
  };

  // Skip in Serverless until "xpack.alerting.ruleChangeTracking.enabled" and
  // xpack.securitySolution.enableExperimental: [ruleChangesHistoryEnabled] feature flags
  // permanently enabled
  describe('@ess @skipInServerless rule change history', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await deleteAllPrebuiltRuleAssets(es, log);
      await clearHistory();
    });

    describe('history API', () => {
      it('returns the rule_create record for a newly-created rule', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.page).toBe(1);
        expect(body.per_page).toBe(20);
        expect(body.total).toBe(1);
        expect(body.items).toHaveLength(1);

        const [item] = body.items;
        expect(item.action).toBe('rule_create');
        expect(item.user).toEqual({ name: 'elastic' });
        expect(item.rule).toMatchObject({ id: rule.id, revision: 0 });
        expect(item.old_values).toBeNull();
      });

      it("returns 200 when rule doesn't exist (deleted rule)", async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshHistory();

        await detectionsApi.deleteRule({ query: { id: rule.id } }).expect(200);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.total).toBeGreaterThan(0);
      });

      it('rejects the request when the "ruleId" path parameter is missing', async () => {
        // @ts-expect-error testing missing id
        await detectionsApi.ruleChangesHistory({ params: {}, query: {} }).expect(400);
      });

      it('rejects the request when per_page exceeds the maximum', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: { per_page: 101 } })
          .expect(400);
      });

      describe('pagination', () => {
        let ruleId: string;

        beforeEach(async () => {
          // Create the rule (revision 0, rule_create) and update it four times
          // (revisions 1-4, rule_update) so there are 5 history records.
          const { body: rule } = await detectionsApi
            .createRule({ body: getCustomQueryRuleParams() })
            .expect(200);

          ruleId = rule.id;

          for (let i = 1; i <= 4; i++) {
            await detectionsApi
              .updateRule({
                body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: `name-${i}` }),
              })
              .expect(200);
          }

          await refreshHistory();
        });

        it('returns the requested page with the right size and total', async () => {
          const { body } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId }, query: { page: 1, per_page: 2 } })
            .expect(200);

          expect(body.total).toBe(5);
          expect(body.page).toBe(1);
          expect(body.per_page).toBe(2);
          expect(body.items).toHaveLength(2);
          expect(body.items[0].rule.revision).toBe(4);
          expect(body.items[1].rule.revision).toBe(3);
        });

        it('returns subsequent pages without overlap', async () => {
          const { body: page2 } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId }, query: { page: 2, per_page: 2 } })
            .expect(200);

          expect(page2.items).toHaveLength(2);
          expect(page2.items[0].rule.revision).toBe(2);
          expect(page2.items[1].rule.revision).toBe(1);
        });

        it('returns fewer items on the last partial page', async () => {
          const { body: page3 } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId }, query: { page: 3, per_page: 2 } })
            .expect(200);

          expect(page3.items).toHaveLength(1);
          expect(page3.items[0].rule.revision).toBe(0);
          expect(page3.items[0].old_values).toBeNull();
        });

        it('computes `old_values` against the next-older revision across page boundaries', async () => {
          // Oldest item on page 1 (revision 3) should still see revision 2 as
          // its predecessor — provided by the per_page+1 lookback fetch.
          const { body: page1 } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId }, query: { page: 1, per_page: 2 } })
            .expect(200);

          expect(page1.items[1].old_values).not.toBeNull();
          expect(page1.items[1].old_values.revision).toBe(2);
        });
      });

      describe('field-level changes (old_values merge patch)', () => {
        it('emits only the changed top-level field in `old_values`', async () => {
          const { body: rule } = await detectionsApi
            .createRule({ body: getCustomQueryRuleParams({ name: 'name-A' }) })
            .expect(200);

          await detectionsApi
            .updateRule({
              body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'name-B' }),
            })
            .expect(200);

          await refreshHistory();

          const { body } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
            .expect(200);

          expect(body.total).toBe(2);
          expect(body.items[0].rule.name).toBe('name-B');
          expect(body.items[0].old_values?.name).toBe('name-A');
        });

        it('emits multiple changed fields in a single patch', async () => {
          const { body: rule } = await detectionsApi
            .createRule({ body: getCustomQueryRuleParams({ name: 'name-A', tags: ['x'] }) })
            .expect(200);

          await detectionsApi
            .updateRule({
              body: getCustomQueryRuleParams({
                rule_id: rule.rule_id,
                name: 'name-B',
                tags: ['x', 'y'],
              }),
            })
            .expect(200);

          await refreshHistory();

          const { body } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
            .expect(200);

          expect(body.items[0].old_values?.name).toBe('name-A');
          expect(body.items[0].old_values?.tags).toEqual(['x']);
        });

        it('returns null `old_values` for the creation event', async () => {
          const { body: rule } = await detectionsApi
            .createRule({ body: getCustomQueryRuleParams() })
            .expect(200);

          await refreshHistory();

          const { body } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
            .expect(200);

          expect(body.items[0].old_values).toBeNull();
        });
      });
    });

    describe('action', () => {
      it('records rule_create when creating a custom rule', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].action).toBe('rule_create');
      });

      it('records rule_update when updating a rule', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await detectionsApi
          .updateRule({
            body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'updated name' }),
          })
          .expect(200);

        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items[0].action).toBe('rule_update');
      });

      it('records rule_import when importing a new rule', async () => {
        const ruleId = 'import-action-test-rule';
        const ndjson = combineToNdJson(getCustomQueryRuleParams({ rule_id: ruleId }));

        await detectionsApi
          .importRules({ query: { overwrite: true } })
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });

        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].action).toBe('rule_import');
      });

      it('records rule_import when overwriting an existing rule', async () => {
        const ruleId = 'overwrite-action-test-rule';
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams({ rule_id: ruleId }) })
          .expect(200);

        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({ rule_id: ruleId, name: 'overwritten name' })
        );

        await detectionsApi
          .importRules({ query: { overwrite: true } })
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the import overwrite; index 1 is the original create.
        expect(body.items[0].action).toBe('rule_import');
      });

      it('records rule_install when installing a prebuilt rule', async () => {
        const ruleId = 'install-action-test-rule';
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: ruleId, version: 1 }),
        ]);

        await installPrebuiltRules(es, supertest);

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });
        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].action).toBe('rule_install');
      });

      it('records rule_upgrade when upgrading a prebuilt rule', async () => {
        const ruleId = 'upgrade-action-test-rule';
        await createHistoricalPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: ruleId, version: 1 }),
        ]);

        await installPrebuiltRules(es, supertest);

        await createHistoricalPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: ruleId, version: 2 }),
        ]);

        await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.ALL_RULES,
          pick_version: 'TARGET',
        });

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });
        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the upgrade; index 1 is the original install.
        expect(body.items[0].action).toBe('rule_upgrade');
      });

      it('records rule_duplicate when duplicating a rule', async () => {
        const { body: original } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        const { body: bulkResponse } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              action: BulkActionTypeEnum.duplicate,
              duplicate: { include_exceptions: false, include_expired_exceptions: false },
            },
          })
          .expect(200);

        const duplicatedRuleId = bulkResponse.attributes.results.created[0].id;

        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: duplicatedRuleId }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].action).toBe('rule_duplicate');
        expect(body.items[0].metadata?.original_rule_so_id).toBe(original.id);
      });

      it('records rule_revert when reverting a prebuilt rule', async () => {
        const ruleId = 'revert-action-test-rule';
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: ruleId, version: 1 }),
        ]);

        await installPrebuiltRules(es, supertest);

        const { body: customized } = await detectionsApi
          .patchRule({ body: { rule_id: ruleId, name: 'customized name' } })
          .expect(200);

        await revertPrebuiltRule(supertest, {
          id: customized.id,
          version: customized.version,
          revision: customized.revision,
        });

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });
        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the revert.
        expect(body.items[0].action).toBe('rule_revert');
      });
    });

    describe('metadata.bulkCount', () => {
      it('records bulkCount equal to the number of imported rules', async () => {
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({ rule_id: 'bulk-import-count-1' }),
          getCustomQueryRuleParams({ rule_id: 'bulk-import-count-2' }),
          getCustomQueryRuleParams({ rule_id: 'bulk-import-count-3' })
        );

        await supertest
          .post(`${DETECTION_ENGINE_RULES_IMPORT_URL}?overwrite=true`)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        const { body: rule } = await detectionsApi.readRule({
          query: { rule_id: 'bulk-import-count-1' },
        });
        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items[0].metadata?.bulk_count).toBe(3);
      });

      it('records bulkCount equal to the number of installed prebuilt rules', async () => {
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'bulk-install-count-1', version: 1 }),
          createRuleAssetSavedObject({ rule_id: 'bulk-install-count-2', version: 1 }),
        ]);

        await installPrebuiltRules(es, supertest);

        const { body: rule } = await detectionsApi.readRule({
          query: { rule_id: 'bulk-install-count-1' },
        });
        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items[0].metadata?.bulk_count).toBe(2);
      });

      it('records bulkCount equal to the number of upgraded prebuilt rules', async () => {
        await createHistoricalPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'bulk-upgrade-count-1', version: 1 }),
          createRuleAssetSavedObject({ rule_id: 'bulk-upgrade-count-2', version: 1 }),
        ]);

        await installPrebuiltRules(es, supertest);

        await createHistoricalPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'bulk-upgrade-count-1', version: 2 }),
          createRuleAssetSavedObject({ rule_id: 'bulk-upgrade-count-2', version: 2 }),
        ]);

        await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.ALL_RULES,
          pick_version: 'TARGET',
        });

        const { body: rule } = await detectionsApi.readRule({
          query: { rule_id: 'bulk-upgrade-count-1' },
        });
        await refreshHistory();

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the upgrade with bulkCount = 2.
        expect(body.items[0].metadata?.bulk_count).toBe(2);
      });
    });
  });
};
