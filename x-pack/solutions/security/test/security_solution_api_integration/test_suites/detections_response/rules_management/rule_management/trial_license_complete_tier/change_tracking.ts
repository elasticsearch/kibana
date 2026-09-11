/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { range } from 'lodash';
import { ModeEnum } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { BulkActionTypeEnum } from '@kbn/security-solution-plugin/common/api/detection_engine/rule_management';
import {
  DETECTION_ENGINE_RULES_IMPORT_URL,
  DETECTION_ENGINE_RULES_URL,
} from '@kbn/security-solution-plugin/common/constants';
import { deleteAllRules } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  clearChangeHistory,
  combineToNdJson,
  createHistoricalPrebuiltRuleAssetSavedObjects,
  createPrebuiltRuleAssetSavedObjects,
  createRuleAssetSavedObject,
  deleteAllPrebuiltRuleAssets,
  getCustomQueryRuleParams,
  importRulesWithSuccess,
  installPrebuiltRules,
  performUpgradePrebuiltRules,
  refreshChangeHistory,
} from '../../../utils';
import { revertPrebuiltRule } from '../../../utils/rules/prebuilt_rules/revert_prebuilt_rule';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const es = getService('es');
  const log = getService('log');
  const utils = getService('securitySolutionUtils');

  describe('@ess @serverless rule change history', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await deleteAllPrebuiltRuleAssets(es, log);
      await clearChangeHistory(es);
    });

    describe('history API', () => {
      it('returns the rule_create record for a newly-created rule', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.page).toBe(1);
        expect(body.per_page).toBe(20);
        expect(body.total).toBe(1);
        expect(body.items).toHaveLength(1);

        const username = await utils.getUsername();

        const [item] = body.items;
        expect(item.action).toBe('rule_create');
        expect(item.user).toEqual({ name: username });
        expect(item.rule).toMatchObject({ id: rule.id, revision: 0 });
        expect(item.old_values).toBeNull();
      });

      it("returns 200 when rule doesn't exist (deleted rule)", async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshChangeHistory(es);

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

          await refreshChangeHistory(es);
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

          await refreshChangeHistory(es);

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

          await refreshChangeHistory(es);

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

          await refreshChangeHistory(es);

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

        await refreshChangeHistory(es);

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

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items[0].action).toBe('rule_update');
      });

      it('records rule_import when importing a new rule', async () => {
        const ruleId = 'import-action-test-rule';
        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            rule_id: ruleId,
            name: 'Imported custom rule',
            enabled: false,
          })
        );

        await detectionsApi
          .importRules({ query: { overwrite: false } })
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);

        const [item] = body.items;
        expect(item.action).toBe('rule_import');
        expect(item.user).toEqual({ name: 'elastic' });
        expect(item.old_values).toBeNull();
        expect(item.metadata?.bulk_count).toBe(1);
        expect(item.rule).toMatchObject({
          id: rule.id,
          rule_id: ruleId,
          name: 'Imported custom rule',
          revision: 0,
          enabled: false,
          immutable: false,
          rule_source: { type: 'internal' },
        });
        // Fresh create/import stamps created_at === updated_at on the snapshot.
        expect(item.rule.created_at).toBe(item.rule.updated_at);
      });

      it('records rule_import when importing a prebuilt rule', async () => {
        const ruleId = 'import-prebuilt-action-test-rule';
        const asset = createRuleAssetSavedObject({
          rule_id: ruleId,
          version: 1,
          name: 'Prebuilt import history rule',
        });
        await createHistoricalPrebuiltRuleAssetSavedObjects(es, [asset]);

        const ndjson = combineToNdJson({
          ...asset['security-rule'],
          immutable: true,
          rule_source: {
            type: 'external',
            is_customized: false,
            customized_fields: [],
            has_base_version: true,
          },
        });

        await detectionsApi
          .importRules({ query: { overwrite: false } })
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);

        const [item] = body.items;
        expect(item.action).toBe('rule_import');
        expect(item.user).toEqual({ name: 'elastic' });
        expect(item.old_values).toBeNull();
        expect(item.metadata?.bulk_count).toBe(1);
        expect(item.rule).toMatchObject({
          id: rule.id,
          rule_id: ruleId,
          name: 'Prebuilt import history rule',
          revision: 0,
          immutable: true,
          rule_source: {
            type: 'external',
            is_customized: false,
            customized_fields: [],
            has_base_version: true,
          },
        });
        expect(item.rule.created_at).toBe(item.rule.updated_at);
      });

      it('records rule_import when overwriting an existing rule', async () => {
        const ruleId = 'overwrite-action-test-rule';
        const { body: rule } = await detectionsApi
          .createRule({
            body: getCustomQueryRuleParams({
              rule_id: ruleId,
              name: 'Before import overwrite',
              enabled: false,
            }),
          })
          .expect(200);

        const ndjson = combineToNdJson(
          getCustomQueryRuleParams({
            rule_id: ruleId,
            name: 'overwritten name',
            enabled: false,
          })
        );

        await detectionsApi
          .importRules({ query: { overwrite: true } })
          .attach('file', Buffer.from(ndjson), 'rules.ndjson')
          .expect(200);

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the import overwrite; index 1 is the original create.
        expect(body.total).toBe(2);
        expect(body.items).toHaveLength(2);

        const [imported, created] = body.items;
        expect(imported.action).toBe('rule_import');
        expect(imported.user).toEqual({ name: 'elastic' });
        expect(imported.metadata?.bulk_count).toBe(1);
        expect(imported.rule).toMatchObject({
          id: rule.id,
          rule_id: ruleId,
          name: 'overwritten name',
          revision: 1,
          enabled: false,
        });
        expect(imported.old_values).toMatchObject({
          name: 'Before import overwrite',
          revision: 0,
        });
        expect(imported.rule.created_at).not.toBe(imported.rule.updated_at);

        expect(created.action).toBe('rule_create');
        expect(created.old_values).toBeNull();
        expect(created.rule).toMatchObject({
          id: rule.id,
          rule_id: ruleId,
          name: 'Before import overwrite',
          revision: 0,
        });
      });

      it('records rule_install when installing a prebuilt rule', async () => {
        const ruleId = 'install-action-test-rule';
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: ruleId, version: 1 }),
        ]);

        await installPrebuiltRules(es, supertest);

        const { body: rule } = await detectionsApi.readRule({ query: { rule_id: ruleId } });
        await refreshChangeHistory(es);

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
        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the upgrade; index 1 is the original install.
        expect(body.items[0].action).toBe('rule_upgrade');
      });

      it('records a single rule_duplicate entry when duplicating a rule with exceptions', async () => {
        const { body: original } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        // A rule_default exception makes duplication actually clone and reattach a
        // list — the path that previously emitted a phantom second history entry.
        await supertest
          .post(`${DETECTION_ENGINE_RULES_URL}/${original.id}/exceptions`)
          .set('kbn-xsrf', 'true')
          .send({
            items: [
              {
                description: 'Sample exception item',
                name: 'Sample exception item',
                type: 'simple',
                entries: [
                  { field: 'some.field', operator: 'included', type: 'match', value: 'some value' },
                ],
              },
            ],
          })
          .expect(200);

        const { body: bulkResponse } = await detectionsApi
          .performRulesBulkAction({
            query: {},
            body: {
              action: BulkActionTypeEnum.duplicate,
              duplicate: { include_exceptions: true, include_expired_exceptions: true },
            },
          })
          .expect(200);

        const duplicatedRuleId = bulkResponse.attributes.results.created[0].id;

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: duplicatedRuleId }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);

        const [item] = body.items;
        expect(item.action).toBe('rule_duplicate');
        expect(item.old_values).toBeNull();
        expect(item.metadata?.original_rule_so_id).toBe(original.id);
        expect(item.rule).toMatchObject({
          id: duplicatedRuleId,
          revision: 0,
          name: 'Custom query rule [Duplicate]',
          enabled: false,
        });
        // The cloned rule_default list is a fresh container, so only its type is stable.
        expect(item.rule.exceptions_list).toHaveLength(1);
        expect(item.rule.exceptions_list[0]).toMatchObject({ type: 'rule_default' });
      });

      it('records a single rule_duplicate entry when duplicating a rule without exceptions', async () => {
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

        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: duplicatedRuleId }, query: {} })
          .expect(200);

        expect(body.items).toHaveLength(1);

        const [item] = body.items;
        expect(item.action).toBe('rule_duplicate');
        expect(item.old_values).toBeNull();
        expect(item.metadata?.original_rule_so_id).toBe(original.id);
        expect(item.rule).toMatchObject({
          id: duplicatedRuleId,
          revision: 0,
          name: 'Custom query rule [Duplicate]',
          enabled: false,
        });
        expect(item.rule.exceptions_list).toEqual([]);
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
        await refreshChangeHistory(es);

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
        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        const [item] = body.items;
        expect(item.action).toBe('rule_import');
        expect(item.old_values).toBeNull();
        expect(item.metadata?.bulk_count).toBe(3);
        expect(item.rule).toMatchObject({
          id: rule.id,
          rule_id: 'bulk-import-count-1',
          revision: 0,
        });
      });

      it('records bulkCount as the full import size for rules across chunk boundaries', async () => {
        // Above main import chunking (50) and planned rewrite batches (300–500).
        const ruleCount = 568;

        await importRulesWithSuccess({
          getService,
          rules: range(ruleCount).map((i) =>
            getCustomQueryRuleParams({
              rule_id: `bulk-import-chunk-${i}`,
              name: `Bulk chunk ${i}`,
              enabled: false,
            })
          ),
          overwrite: false,
        });

        await refreshChangeHistory(es);

        // First chunk, past main's 50-chunk, past planned 300/500 batches, and the final remainder.
        const sampleIndexes = [0, 50, 300, 500, ruleCount - 1];

        for (const i of sampleIndexes) {
          const { body: rule } = await detectionsApi
            .readRule({ query: { rule_id: `bulk-import-chunk-${i}` } })
            .expect(200);

          const { body } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
            .expect(200);

          expect(body.items[0].action).toBe('rule_import');
          expect(body.items[0].metadata?.bulk_count).toBe(ruleCount);
        }
      });

      it('records bulkCount as the full import size when overwriting across chunk boundaries', async () => {
        // Above main import chunking (50) and planned rewrite batches (300–500).
        const ruleCount = 568;

        await importRulesWithSuccess({
          getService,
          rules: range(ruleCount).map((i) =>
            getCustomQueryRuleParams({
              rule_id: `bulk-overwrite-chunk-${i}`,
              name: `Before overwrite ${i}`,
              enabled: false,
            })
          ),
          overwrite: false,
        });

        await clearChangeHistory(es);

        await importRulesWithSuccess({
          getService,
          rules: range(ruleCount).map((i) =>
            getCustomQueryRuleParams({
              rule_id: `bulk-overwrite-chunk-${i}`,
              name: `After overwrite ${i}`,
              enabled: false,
            })
          ),
          overwrite: true,
        });

        await refreshChangeHistory(es);

        const sampleIndexes = [0, 50, 300, 500, ruleCount - 1];

        for (const i of sampleIndexes) {
          const { body: rule } = await detectionsApi
            .readRule({ query: { rule_id: `bulk-overwrite-chunk-${i}` } })
            .expect(200);

          const { body } = await detectionsApi
            .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
            .expect(200);

          expect(body.items[0].action).toBe('rule_import');
          expect(body.items[0].metadata?.bulk_count).toBe(ruleCount);
        }
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
        await refreshChangeHistory(es);

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
        await refreshChangeHistory(es);

        const { body } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        // Most recent event (index 0) is the upgrade with bulkCount = 2.
        expect(body.items[0].metadata?.bulk_count).toBe(2);
      });
    });
  });
};
