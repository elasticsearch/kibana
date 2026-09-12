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

  describe('@ess @serverless @skipInServerlessMKI Bulk upgrade all prebuilt rules', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await deleteAllPrebuiltRuleAssets(es, log);
    });

    describe('with historical versions', () => {
      const TEST_DATA = [
        { pickVersion: 'BASE', expectedTags: ['tagA'] },
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
            deps,
          });

          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.ALL_RULES,
            pick_version: pickVersion,
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

      it(`upgrades to TARGET version when <pick version> is MERGED and there are no conflicts`, async () => {
        await setUpRuleUpgrade({
          assets: [
            {
              installed: {
                type: 'query',
                tags: ['tagA'],
                rule_id: 'rule_1',
                version: 1,
              },
              patch: {},
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
              patch: {},
              upgrade: {
                type: 'query',
                tags: ['tagC'],
                rule_id: 'rule_2',
                version: 2,
              },
            },
          ],
          deps,
        });

        const response = await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.ALL_RULES,
          pick_version: 'MERGED',
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
              tags: ['tagC'],
            }),
            expect.objectContaining({
              rule_id: 'rule_2',
              version: 2,
              tags: ['tagC'],
            }),
          ])
        );
      });

      it('UNABLE to upgrade in case of conflicts when <pick version> is MERGED', async () => {
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
          deps,
        });

        const response = await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.ALL_RULES,
          pick_version: 'MERGED',
        });

        expect(response.summary).toMatchObject({
          total: 2,
          succeeded: 0,
          skipped: 0,
          failed: 2,
        });
        expect(response.errors).toHaveLength(2);
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
            mode: ModeEnum.ALL_RULES,
            pick_version: pickVersion,
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

      for (const pickVersion of ['BASE', 'MERGED'] as const) {
        it(`UNABLE to upgrade to ${pickVersion} version`, async () => {
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
            mode: ModeEnum.ALL_RULES,
            pick_version: pickVersion,
          });

          expect(response.summary).toMatchObject({
            total: 2,
            succeeded: 0,
            skipped: 0,
            failed: 2,
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

      it('skips the non-customized type-changed rule with a SOLVABLE conflict under a dry run, upgrading the ordinary rule', async () => {
        const response = await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.ALL_RULES,
          pick_version: 'MERGED',
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
        expect(response.results.updated).toContainEqual(
          expect.objectContaining({ rule_id: 'rule_2' })
        );
      });

      it('upgrades both rules under UPGRADE_SOLVABLE, including the type-changed one', async () => {
        const response = await performUpgradePrebuiltRules(es, supertest, {
          mode: ModeEnum.ALL_RULES,
          pick_version: 'MERGED',
          on_conflict: 'UPGRADE_SOLVABLE',
        });

        expect(response.summary).toMatchObject({
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

        it('is the only failure under UPGRADE_SOLVABLE, while the ordinary rule still succeeds', async () => {
          const response = await performUpgradePrebuiltRules(es, supertest, {
            mode: ModeEnum.ALL_RULES,
            pick_version: 'MERGED',
            on_conflict: 'UPGRADE_SOLVABLE',
          });

          expect(response.summary).toMatchObject({
            succeeded: 1,
            failed: 1,
          });
          expect(response.errors).toHaveLength(1);
          expect(response.errors[0]).toMatchObject({
            rules: [expect.objectContaining({ rule_id: 'rule_1' })],
          });

          const { body: rule1 } = await detectionsApi.readRule({ query: { rule_id: 'rule_1' } });
          expect(rule1).toMatchObject({ type: 'query', version: 1 });
        });
      });
    });
  });
};
