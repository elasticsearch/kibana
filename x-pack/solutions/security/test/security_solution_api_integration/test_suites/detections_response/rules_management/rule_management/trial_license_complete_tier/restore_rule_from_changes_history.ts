/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';
import { ModeEnum } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { ROLES } from '@kbn/security-solution-plugin/common/test';
import { deleteAllRules } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  createHistoricalPrebuiltRuleAssetSavedObjects,
  createPrebuiltRuleAssetSavedObjects,
  createRuleAssetSavedObject,
  deleteAllPrebuiltRuleAssets,
  getCustomQueryRuleParams,
  installPrebuiltRules,
  performUpgradePrebuiltRules,
} from '../../../utils';
import { createUserAndRole, deleteUserAndRole } from '../../../../../config/services/common';

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

  describe('@ess @skipInServerless rule restore from changes history', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await deleteAllPrebuiltRuleAssets(es, log);
      await clearHistory();
    });

    it('restores a custom rule to a previous state', async () => {
      const { body: rule } = await detectionsApi
        .createRule({ body: getCustomQueryRuleParams({ name: 'original name' }) })
        .expect(200);

      const { body: updatedRule } = await detectionsApi
        .updateRule({
          body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'updated name' }),
        })
        .expect(200);

      await refreshHistory();

      const { body: historyBody } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      const createEntry = historyBody.items.find(
        (item: { action: string }) => item.action === 'rule_create'
      );
      const changeId = createEntry.id;

      const { body } = await detectionsApi
        .restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId },
          body: { revision: updatedRule.revision },
        })
        .expect(200);

      expect(body.rule.name).toBe('original name');
      expect(body.rule.id).toBe(rule.id);

      await refreshHistory();

      const { body: body2 } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      expect(body2.items[0].action).toBe('rule_restore');
      expect(body2.items[0].metadata.restored_from_change_id).toBe(changeId);
    });

    it('restores a customized prebuilt rule to a previous state', async () => {
      await createPrebuiltRuleAssetSavedObjects(es, [
        createRuleAssetSavedObject({ rule_id: 'prebuilt-restore-customized', version: 1 }),
      ]);
      await installPrebuiltRules(es, supertest);

      const { body: rule } = await detectionsApi
        .readRule({ query: { rule_id: 'prebuilt-restore-customized' } })
        .expect(200);

      const { body: patchedRule } = await detectionsApi
        .patchRule({ body: { rule_id: 'prebuilt-restore-customized', name: 'customized name' } })
        .expect(200);

      await refreshHistory();

      const { body: historyBody } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      const installEntry = historyBody.items.find(
        (item: { action: string }) => item.action === 'rule_install'
      );
      const changeId = installEntry.id;

      const { body } = await detectionsApi
        .restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId },
          body: { revision: patchedRule.revision },
        })
        .expect(200);

      expect(body.rule.name).not.toBe('customized name');

      await refreshHistory();

      const { body: body2 } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      expect(body2.items[0].action).toBe('rule_restore');
      expect(body2.items[0].metadata.restored_from_change_id).toBe(changeId);
    });

    it('restores a non-customized prebuilt rule to a previous state', async () => {
      await createHistoricalPrebuiltRuleAssetSavedObjects(es, [
        createRuleAssetSavedObject({ rule_id: 'prebuilt-restore-pure', version: 1 }),
      ]);
      await installPrebuiltRules(es, supertest);

      await createHistoricalPrebuiltRuleAssetSavedObjects(es, [
        createRuleAssetSavedObject({ rule_id: 'prebuilt-restore-pure', version: 2 }),
      ]);
      await performUpgradePrebuiltRules(es, supertest, {
        mode: ModeEnum.ALL_RULES,
        pick_version: 'TARGET',
      });

      const { body: rule } = await detectionsApi
        .readRule({ query: { rule_id: 'prebuilt-restore-pure' } })
        .expect(200);

      await refreshHistory();

      const { body: historyBody } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      const installEntry = historyBody.items.find(
        (item: { action: string }) => item.action === 'rule_install'
      );
      const changeId = installEntry.id;

      const { body } = await detectionsApi
        .restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId },
          body: { revision: rule.revision },
        })
        .expect(200);

      expect(body.rule.version).toBe(1);

      await refreshHistory();

      const { body: body2 } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      expect(body2.items[0].action).toBe('rule_restore');
      expect(body2.items[0].metadata.restored_from_change_id).toBe(changeId);
    });

    it("returns 200 when rule doesn't exist (deleted rule)", async () => {
      const { body: rule } = await detectionsApi
        .createRule({ body: getCustomQueryRuleParams() })
        .expect(200);

      await refreshHistory();

      const { body: historyBody } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      const changeId = historyBody.items[0].id;

      await detectionsApi.deleteRule({ query: { id: rule.id } }).expect(200);

      const { body } = await detectionsApi
        .restoreRuleFromHistory({ params: { ruleId: rule.id, changeId }, body: {} })
        .expect(200);

      expect(body.rule.id).toBe(rule.id);
    });

    it('handles concurrent restores of an existing rule gracefully (200 or 409, never 500)', async () => {
      const { body: rule } = await detectionsApi
        .createRule({ body: getCustomQueryRuleParams({ name: 'original name' }) })
        .expect(200);

      const { body: updatedRule } = await detectionsApi
        .updateRule({
          body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'updated name' }),
        })
        .expect(200);

      await refreshHistory();

      const { body: historyBody } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      const createEntry = historyBody.items.find(
        (item: { action: string }) => item.action === 'rule_create'
      );
      const changeId = createEntry.id;

      // Both requests race to update the same existing rule via rulesClient.update.
      // One of two outcomes is valid:
      //   [200, 200] — requests executed serially; both updates succeeded
      //   [200, 409] — true race; both read the same saved-object version, second write conflicted
      const [res1, res2] = await Promise.all([
        detectionsApi.restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId },
          body: { revision: updatedRule.revision },
        }),
        detectionsApi.restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId },
          body: { revision: updatedRule.revision },
        }),
      ]);

      const statuses = [res1.status, res2.status];

      expect(statuses).toContain(200);
      expect(statuses.every((s: number) => s === 200 || s === 409)).toBe(true);
    });

    it('returns 404 when the changeId does not exist for a valid rule', async () => {
      const { body: rule } = await detectionsApi
        .createRule({ body: getCustomQueryRuleParams() })
        .expect(200);

      await detectionsApi
        .restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId: uuidv4() },
          body: { revision: rule.revision },
        })
        .expect(404);
    });

    it('make zero side effect when restoring the state equals to the current state', async () => {
      const { body: rule } = await detectionsApi
        .createRule({ body: getCustomQueryRuleParams() })
        .expect(200);

      await refreshHistory();

      const { body: historyBody } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      const changeId = historyBody.items[0].id;

      const { body } = await detectionsApi
        .restoreRuleFromHistory({
          params: { ruleId: rule.id, changeId },
          body: { revision: rule.revision },
        })
        .expect(200);

      expect(body.rule.id).toBe(rule.id);

      await refreshHistory();

      const { body: body2 } = await detectionsApi
        .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
        .expect(200);

      expect(body2.items.length).toBe(1);
      expect(body2.items[0].action).toBe('rule_create');
    });

    describe('concurrency control', () => {
      it('returns 409 when trying to restore the rule with outdated revision (revision bump due to edit)', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams({ name: 'original name' }) })
          .expect(200);

        // capture the stale revision
        const staleRevision = rule.revision;

        await refreshHistory();

        const { body: historyBody } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        const createEntry = historyBody.items.find(
          (item: { action: string }) => item.action === 'rule_create'
        );
        const changeId = createEntry.id;

        await detectionsApi
          .updateRule({
            body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'changed name' }),
          })
          .expect(200);

        await detectionsApi
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId },
            body: { revision: staleRevision },
          })
          .expect(409);
      });

      it('returns 409 when trying to restore the rule with outdated revision (revision bump due to restore)', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams({ name: 'original name' }) })
          .expect(200);

        const { body: updatedRule } = await detectionsApi
          .updateRule({
            body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'updated name' }),
          })
          .expect(200);

        await refreshHistory();

        const { body: historyBody } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        const createEntry = historyBody.items.find(
          (item: { action: string }) => item.action === 'rule_create'
        );
        const changeId = createEntry.id;

        await detectionsApi
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId },
            body: { revision: updatedRule.revision },
          })
          .expect(200);

        await detectionsApi
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId },
            body: { revision: rule.revision },
          })
          .expect(409);
      });

      it('returns 409 when trying to restore the deleted rule and providing the revision  (rule supposed to exist but it is deleted)', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshHistory();

        const { body: historyBody } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        const changeId = historyBody.items[0].id;

        await detectionsApi.deleteRule({ query: { id: rule.id } }).expect(200);

        await detectionsApi
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId },
            body: { revision: rule.revision },
          })
          .expect(409);
      });

      it('returns 409 when trying to restore a rule without providing revision (rule supposed to be deleted but it is not)', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams({ name: 'original name' }) })
          .expect(200);

        await detectionsApi
          .updateRule({
            body: getCustomQueryRuleParams({ rule_id: rule.rule_id, name: 'updated name' }),
          })
          .expect(200);

        await refreshHistory();

        const { body: historyBody } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        const createEntry = historyBody.items.find(
          (item: { action: string }) => item.action === 'rule_create'
        );
        const updateEntry = historyBody.items.find(
          (item: { action: string }) => item.action === 'rule_update'
        );

        await detectionsApi.deleteRule({ query: { id: rule.id } }).expect(200);

        await detectionsApi
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId: createEntry.id },
            body: {},
          })
          .expect(200);

        await detectionsApi
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId: updateEntry.id },
            body: {},
          })
          .expect(409);
      });
    });

    describe('@skipInServerless RBAC', () => {
      const role = ROLES.rules_read_exceptions_all;

      beforeEach(async () => {
        await createUserAndRole(getService, role);
      });

      afterEach(async () => {
        await deleteUserAndRole(getService, role);
      });

      it('returns 403 when caller lacks write privilege', async () => {
        const { body: rule } = await detectionsApi
          .createRule({ body: getCustomQueryRuleParams() })
          .expect(200);

        await refreshHistory();

        const { body: historyBody } = await detectionsApi
          .ruleChangesHistory({ params: { ruleId: rule.id }, query: {} })
          .expect(200);

        const changeId = historyBody.items[0].id;
        const restrictedApis = detectionsApi.withUser({ username: role, password: 'changeme' });

        await restrictedApis
          .restoreRuleFromHistory({
            params: { ruleId: rule.id, changeId },
            body: { revision: rule.revision },
          })
          .expect(403);
      });
    });
  });
};
