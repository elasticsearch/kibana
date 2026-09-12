/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { ModeEnum } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { deleteAllRules } from '@kbn/detections-response-ftr-services';
import { setUpRuleUpgrade } from '../../../../utils/rules/prebuilt_rules/set_up_rule_upgrade';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import { deleteAllPrebuiltRuleAssets, performUpgradePrebuiltRules } from '../../../../utils';

export default ({ getService }: FtrProviderContext): void => {
  const es = getService('es');
  const supertest = getService('supertest');
  const detectionsApi = getService('detectionsApi');
  const log = getService('log');
  const deps = {
    es,
    supertest,
    log,
  };

  describe('@ess @serverless @skipInServerlessMKI Bulk upgrade selected prebuilt rules', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await deleteAllPrebuiltRuleAssets(es, log);
    });

    describe('with historical versions', () => {
      describe('without customizations', () => {
        beforeEach(async () => {
          await setUpRuleUpgrade({
            assets: [
              {
                installed: {
                  type: 'query',
                  name: 'Initial name',
                  tags: ['tagA'],
                  rule_id: 'rule_1',
                  version: 1,
                },
                patch: {},
                upgrade: {
                  type: 'query',
                  name: 'Updated name',
                  tags: ['tagC'],
                  rule_id: 'rule_1',
                  version: 2,
                },
              },
              {
                installed: {
                  type: 'query',
                  name: 'Initial name',
                  tags: ['tagA'],
                  rule_id: 'rule_2',
                  version: 1,
                },
                patch: {},
                upgrade: {
                  type: 'query',
                  name: 'Updated name',
                  tags: ['tagC'],
                  rule_id: 'rule_2',
                  version: 2,
                },
              },
              // Rule rule_id: 'rule_3' isn't selected for upgrade
              {
                installed: {
                  type: 'query',
                  name: 'Initial name',
                  tags: ['tagA'],
                  rule_id: 'rule_3',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_3',
                  name: 'Customized name',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  name: 'Updated name',
                  tags: ['tagC'],
                  rule_id: 'rule_3',
                  version: 2,
                },
              },
            ],
            deps,
          });
        });

        for (const { pickVersion, expectedName, expectedTags } of [
          {
            pickVersion: 'BASE',
            expectedName: 'Initial name',
            expectedTags: ['tagA'],
          },
          {
            pickVersion: 'CURRENT',
            expectedName: 'Initial name',
            expectedTags: ['tagA'],
          },
          {
            pickVersion: 'TARGET',
            expectedName: 'Updated name',
            expectedTags: ['tagC'],
          },
          {
            pickVersion: 'MERGED',
            expectedName: 'Updated name',
            expectedTags: ['tagC'],
          },
        ] as const) {
          it(`upgrades with <rulePickVersion> is MERGED`, async () => {
            const response = await performUpgradePrebuiltRules(es, supertest, {
              mode: ModeEnum.SPECIFIC_RULES,
              rules: [
                {
                  rule_id: 'rule_1',
                  revision: 0,
                  version: 2,
                  pick_version: pickVersion,
                },
                {
                  rule_id: 'rule_2',
                  revision: 0,
                  version: 2,
                  pick_version: pickVersion,
                },
              ],
            });
            const [{ body: upgradedRuleA }, { body: upgradedRuleB }] = await Promise.all([
              detectionsApi.readRule({
                query: { rule_id: 'rule_1' },
              }),
              detectionsApi.readRule({
                query: { rule_id: 'rule_2' },
              }),
            ]);

            expect(response.summary).toMatchObject({
              total: 2,
              succeeded: 2,
              skipped: 0,
              failed: 0,
            });
            expect(response.results.updated).toHaveLength(2);
            expect(response.results.updated).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  rule_id: 'rule_1',
                  version: 2,
                }),
                expect.objectContaining({
                  rule_id: 'rule_2',
                  version: 2,
                }),
              ])
            );

            expect([upgradedRuleA, upgradedRuleB]).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  rule_id: 'rule_1',
                  version: 2,
                  name: expectedName,
                  tags: expectedTags,
                }),
                expect.objectContaining({
                  rule_id: 'rule_2',
                  version: 2,
                  name: expectedName,
                  tags: expectedTags,
                }),
              ])
            );
          });
        }
      });

      describe('with customizations resulting in conflicts', () => {
        beforeEach(async () => {
          await setUpRuleUpgrade({
            assets: [
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_1',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_1',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_1',
                  version: 2,
                },
              },
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_2',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_2',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_2',
                  version: 2,
                },
              },
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_3',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_3',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_3',
                  version: 2,
                },
              },
            ],
            deps,
          });
        });

        const TEST_DATA = [
          {
            globalPickVersion: 'BASE',
            rulePickVersion: undefined,
            expectedTags: ['tagA'],
          },
          {
            globalPickVersion: 'CURRENT',
            rulePickVersion: undefined,
            expectedTags: ['tagB'],
          },
          {
            globalPickVersion: 'TARGET',
            rulePickVersion: undefined,
            expectedTags: ['tagC'],
          },
          {
            globalPickVersion: undefined,
            rulePickVersion: 'BASE',
            expectedTags: ['tagA'],
          },
          {
            globalPickVersion: undefined,
            rulePickVersion: 'CURRENT',
            expectedPickVersion: 'CURRENT',
            expectedTags: ['tagB'],
          },
          {
            globalPickVersion: undefined,
            rulePickVersion: 'TARGET',
            expectedTags: ['tagC'],
          },
          {
            globalPickVersion: 'BASE',
            rulePickVersion: 'CURRENT',
            expectedTags: ['tagB'],
          },
          {
            globalPickVersion: 'BASE',
            rulePickVersion: 'TARGET',
            expectedTags: ['tagC'],
          },
          {
            globalPickVersion: 'CURRENT',
            rulePickVersion: 'BASE',
            expectedTags: ['tagA'],
          },
          {
            globalPickVersion: 'CURRENT',
            rulePickVersion: 'TARGET',
            expectedTags: ['tagC'],
          },
          {
            globalPickVersion: 'TARGET',
            rulePickVersion: 'BASE',
            expectedTags: ['tagA'],
          },
          {
            globalPickVersion: 'TARGET',
            rulePickVersion: 'CURRENT',
            expectedTags: ['tagB'],
          },
        ] as const;

        for (const { globalPickVersion, rulePickVersion, expectedTags } of TEST_DATA) {
          it(`upgrades rule when "globalPickVersion is ${globalPickVersion}" and "rulePickVersion is ${rulePickVersion}"`, async () => {
            const response = await performUpgradePrebuiltRules(es, supertest, {
              mode: ModeEnum.SPECIFIC_RULES,
              pick_version: globalPickVersion,
              rules: [
                {
                  rule_id: 'rule_1',
                  revision: 1,
                  version: 2,
                  pick_version: rulePickVersion,
                },
                {
                  rule_id: 'rule_2',
                  revision: 1,
                  version: 2,
                  pick_version: rulePickVersion,
                },
              ],
            });
            const [{ body: upgradedRuleA }, { body: upgradedRuleB }] = await Promise.all([
              detectionsApi.readRule({
                query: { rule_id: 'rule_1' },
              }),
              detectionsApi.readRule({
                query: { rule_id: 'rule_2' },
              }),
            ]);

            expect(response.summary).toMatchObject({
              total: 2,
              succeeded: 2,
              skipped: 0,
              failed: 0,
            });
            expect(response.results.updated).toHaveLength(2);
            expect(response.results.updated).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  rule_id: 'rule_1',
                  version: 2,
                }),
                expect.objectContaining({
                  rule_id: 'rule_2',
                  version: 2,
                }),
              ])
            );

            expect([upgradedRuleA, upgradedRuleB]).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  rule_id: 'rule_1',
                  version: 2,
                  tags: expectedTags,
                }),
                expect.objectContaining({
                  rule_id: 'rule_2',
                  version: 2,
                  tags: expectedTags,
                }),
              ])
            );
          });
        }

        it(`UNABLE to upgrade rules when <rulePickVersion> is MERGED`, async () => {
          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.SPECIFIC_RULES,
            rules: [
              {
                rule_id: 'rule_1',
                revision: 0,
                version: 2,
                pick_version: 'MERGED',
              },
              {
                rule_id: 'rule_2',
                revision: 0,
                version: 2,
                pick_version: 'MERGED',
              },
            ],
          });

          expect(response.summary).toMatchObject({
            failed: 2,
          });
        });
      });
    });

    describe('without historical versions', () => {
      const TEST_DATA = [
        { pickVersion: 'CURRENT', expectedTags: ['tagB'] },
        { pickVersion: 'TARGET', expectedTags: ['tagC'] },
      ] as const;

      for (const { pickVersion, expectedTags } of TEST_DATA) {
        it(`upgrades to ${pickVersion} version`, async () => {
          await setUpRuleUpgrade({
            assets: [
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_1',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_1',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_1',
                  version: 2,
                },
              },
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_2',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_2',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_2',
                  version: 2,
                },
              },
            ],
            removeInstalledAssets: true,
            deps,
          });

          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.SPECIFIC_RULES,
            rules: [
              {
                rule_id: 'rule_1',
                revision: 1,
                version: 2,
                pick_version: pickVersion,
              },
            ],
          });
          const { body: upgradedRule } = await detectionsApi.readRule({
            query: { rule_id: 'rule_1' },
          });

          expect(response.summary).toMatchObject({
            total: 1,
            succeeded: 1,
            skipped: 0,
            failed: 0,
          });
          expect(response.results.updated).toEqual([
            expect.objectContaining({
              rule_id: 'rule_1',
              version: 2,
            }),
          ]);

          expect(upgradedRule).toEqual(
            expect.objectContaining({
              rule_id: 'rule_1',
              version: 2,
              tags: expectedTags,
            })
          );
        });
      }

      for (const pickVersion of ['BASE', 'MERGED'] as const) {
        it(`UNABLE to upgrade rules when <rulePickVersion> is ${pickVersion}`, async () => {
          await setUpRuleUpgrade({
            assets: [
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_1',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_1',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_1',
                  version: 2,
                },
              },
              {
                installed: {
                  type: 'query',
                  tags: ['tagA'],
                  rule_id: 'rule_2',
                  version: 1,
                },
                patch: {
                  rule_id: 'rule_2',
                  tags: ['tagB'],
                },
                upgrade: {
                  type: 'query',
                  tags: ['tagC'],
                  rule_id: 'rule_2',
                  version: 2,
                },
              },
            ],
            removeInstalledAssets: true,
            deps,
          });

          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.SPECIFIC_RULES,
            rules: [
              {
                rule_id: 'rule_1',
                revision: 1,
                version: 2,
                pick_version: pickVersion,
              },
            ],
          });

          expect(response.summary).toMatchObject({
            total: 1,
            succeeded: 0,
            skipped: 0,
            failed: 1,
          });
        });
      }
    });

    describe('with rule type changes', () => {
      beforeEach(async () => {
        await setUpRuleUpgrade({
          assets: [
            {
              installed: {
                type: 'query',
                name: 'Initial name',
                rule_id: 'rule_1',
                version: 1,
              },
              patch: {},
              upgrade: {
                type: 'saved_query',
                name: 'Initial name',
                rule_id: 'rule_1',
                version: 2,
              },
            },
            {
              installed: {
                type: 'query',
                name: 'Initial name',
                rule_id: 'rule_2',
                version: 1,
              },
              patch: {},
              upgrade: {
                type: 'query',
                name: 'Updated name',
                rule_id: 'rule_2',
                version: 2,
              },
            },
          ],
          deps,
        });
      });

      it('reports the non-customized type-changed rule as a SOLVABLE skip under a dry run', async () => {
        const response = await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.SPECIFIC_RULES,
          rules: [
            { rule_id: 'rule_1', revision: 0, version: 2, pick_version: 'MERGED' },
            { rule_id: 'rule_2', revision: 0, version: 2, pick_version: 'MERGED' },
          ],
          dry_run: true,
          on_conflict: 'SKIP',
        });

        expect(response.results.skipped).toContainEqual(
          expect.objectContaining({
            rule_id: 'rule_1',
            reason: 'CONFLICT',
            conflict: 'SOLVABLE',
            rule_type_change: { current: 'query', target: 'saved_query' },
          })
        );
      });

      it('upgrades the non-customized type-changed rule under UPGRADE_SOLVABLE, leaving the ordinary rule intact', async () => {
        const response = await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.SPECIFIC_RULES,
          rules: [
            { rule_id: 'rule_1', revision: 0, version: 2, pick_version: 'MERGED' },
            { rule_id: 'rule_2', revision: 0, version: 2, pick_version: 'MERGED' },
          ],
          on_conflict: 'UPGRADE_SOLVABLE',
        });

        expect(response.summary).toMatchObject({
          total: 2,
          succeeded: 2,
          skipped: 0,
          failed: 0,
        });

        const [{ body: upgradedRule1 }, { body: upgradedRule2 }] = await Promise.all([
          detectionsApi.readRule({ query: { rule_id: 'rule_1' } }),
          detectionsApi.readRule({ query: { rule_id: 'rule_2' } }),
        ]);

        expect(upgradedRule1).toMatchObject({ type: 'saved_query', version: 2 });
        expect(upgradedRule2).toMatchObject({ type: 'query', version: 2 });
      });

      describe('when the type-changed rule is customized', () => {
        beforeEach(async () => {
          await setUpRuleUpgrade({
            assets: {
              installed: {
                type: 'query',
                name: 'Initial name',
                rule_id: 'rule_1',
                version: 1,
              },
              patch: {
                rule_id: 'rule_1',
                name: 'Customized name',
              },
              upgrade: {
                type: 'saved_query',
                name: 'Updated name',
                rule_id: 'rule_1',
                version: 2,
              },
            },
            deps,
          });
        });

        it('reports it as a NON_SOLVABLE skip under a dry run', async () => {
          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.SPECIFIC_RULES,
            rules: [{ rule_id: 'rule_1', revision: 1, version: 2, pick_version: 'MERGED' }],
            dry_run: true,
            on_conflict: 'SKIP',
          });

          expect(response.results.skipped).toContainEqual(
            expect.objectContaining({
              rule_id: 'rule_1',
              reason: 'CONFLICT',
              conflict: 'NON_SOLVABLE',
              rule_type_change: { current: 'query', target: 'saved_query' },
            })
          );
        });

        it('still fails under UPGRADE_SOLVABLE, leaving the rule untouched', async () => {
          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.SPECIFIC_RULES,
            rules: [{ rule_id: 'rule_1', revision: 1, version: 2, pick_version: 'MERGED' }],
            on_conflict: 'UPGRADE_SOLVABLE',
          });

          expect(response.summary).toMatchObject({
            succeeded: 0,
            failed: 1,
          });
          expect(response.errors).toHaveLength(1);

          const { body: rule1 } = await detectionsApi.readRule({
            query: { rule_id: 'rule_1' },
          });
          expect(rule1).toMatchObject({ type: 'query', version: 1 });
        });
      });
    });
  });
};
