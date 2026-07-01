/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { deleteAllRules } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import {
  createPrebuiltRuleAssetSavedObjects,
  createRuleAssetSavedObject,
  createDeprecatedPrebuiltRuleAssetSavedObjects,
  deleteAllPrebuiltRuleAssets,
  fetchFirstPrebuiltRuleUpgradeReviewDiff,
  installPrebuiltRules,
  reviewPrebuiltRulesToUpgrade,
} from '../../../../utils';
import { setUpRuleUpgrade } from '../../../../utils/rules/prebuilt_rules/set_up_rule_upgrade';

export default ({ getService }: FtrProviderContext): void => {
  const es = getService('es');
  const supertest = getService('supertest');
  const log = getService('log');
  const deps = {
    es,
    supertest,
    log,
  };

  describe('@ess @serverless @skipInServerlessMKI review prebuilt rules upgrade', () => {
    beforeEach(async () => {
      await deleteAllRules(supertest, log);
      await deleteAllPrebuiltRuleAssets(es, log);
    });

    for (const withHistoricalVersions of [true, false]) {
      describe(
        withHistoricalVersions ? 'with historical versions' : 'without historical versions',
        () => {
          describe('fields diff stats', () => {
            it('returns num of fields with updates', async () => {
              await setUpRuleUpgrade({
                assets: [
                  {
                    installed: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Initial name',
                      tags: ['tabA'],
                      version: 1,
                    },
                    patch: {
                      rule_id: 'query-rule',
                      name: 'Customized name',
                    },
                    upgrade: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Updated name',
                      tags: ['tabC'],
                      version: 2,
                    },
                  },
                ],
                deps,
              });

              const fieldsDiff = await fetchFirstPrebuiltRuleUpgradeReviewDiff(supertest);

              expect(fieldsDiff).toMatchObject({
                num_fields_with_updates: 3, // name + tags + version = 3 fields
              });
            });

            it('returns num of fields with conflicts', async () => {
              await setUpRuleUpgrade({
                assets: [
                  {
                    installed: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Initial name',
                      tags: ['tabA'],
                      version: 1,
                    },
                    patch: {
                      rule_id: 'query-rule',
                      name: 'Customized name',
                      tags: ['tabB'],
                    },
                    upgrade: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Updated name',
                      tags: ['tabC'],
                      version: 2,
                    },
                  },
                ],
                deps,
              });

              const fieldsDiff = await fetchFirstPrebuiltRuleUpgradeReviewDiff(supertest);

              expect(fieldsDiff).toMatchObject({
                num_fields_with_conflicts: 2,
              });
            });

            it('returns num of fields with non-solvable conflicts', async () => {
              await setUpRuleUpgrade({
                assets: [
                  {
                    installed: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Initial name',
                      tags: ['tabA'],
                      version: 1,
                    },
                    patch: {
                      rule_id: 'query-rule',
                      name: 'Customized name',
                      tags: ['tabB'],
                    },
                    upgrade: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Updated name',
                      tags: ['tabC'],
                      version: 2,
                    },
                  },
                ],
                deps,
              });

              const fieldsDiff = await fetchFirstPrebuiltRuleUpgradeReviewDiff(supertest);

              expect(fieldsDiff).toMatchObject({
                num_fields_with_non_solvable_conflicts: 1,
              });
            });
          });

          describe('fields diff', () => {
            it('returns fields diff for fields with upgrades', async () => {
              await setUpRuleUpgrade({
                assets: [
                  // description - non-customized
                  // name - customized
                  // tags - customized
                  {
                    installed: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Initial name',
                      description: 'Initial description',
                      tags: ['tabA'],
                      version: 1,
                    },
                    patch: {
                      rule_id: 'query-rule',
                      name: 'Customized name',
                    },
                    upgrade: {
                      rule_id: 'query-rule',
                      type: 'query',
                      name: 'Updated name',
                      description: 'Updated description',
                      tags: ['tabC'],
                      version: 2,
                    },
                  },
                ],
                removeInstalledAssets: !withHistoricalVersions,
                deps,
              });

              const fieldsDiff = await fetchFirstPrebuiltRuleUpgradeReviewDiff(supertest);

              expect(fieldsDiff.fields).toMatchObject({
                name: {
                  has_update: true,
                },
                description: {
                  has_update: true,
                },
                tags: {
                  has_update: true,
                },
              });
            });

            it(`asserts "has_update" is ${!withHistoricalVersions} for customized fields without upgrades`, async () => {
              await setUpRuleUpgrade({
                assets: [
                  {
                    installed: {
                      rule_id: 'query-rule',
                      type: 'query',
                      alert_suppression: { group_by: ['fieldA'] },
                      index: ['indexA'],
                      interval: '5m',
                      from: 'now-20m',
                      to: 'now',
                      version: 1,
                    },
                    patch: {
                      rule_id: 'query-rule',
                      alert_suppression: { group_by: ['fieldB'] },
                      index: ['indexB'],
                      interval: '3m',
                      from: 'now-10m',
                    },
                    upgrade: {
                      rule_id: 'query-rule',
                      type: 'query',
                      alert_suppression: { group_by: ['fieldA'] },
                      index: ['indexA'],
                      interval: '5m',
                      from: 'now-20m',
                      to: 'now',
                      version: 2,
                    },
                  },
                ],
                removeInstalledAssets: !withHistoricalVersions,
                deps,
              });

              const fieldsDiff = await fetchFirstPrebuiltRuleUpgradeReviewDiff(supertest);

              expect(fieldsDiff.fields).toMatchObject({
                alert_suppression: {
                  has_update: !withHistoricalVersions,
                },
                data_source: {
                  has_update: !withHistoricalVersions,
                },
                rule_schedule: {
                  has_update: !withHistoricalVersions,
                },
              });
            });

            it('asserts returned fields diff have base version', async () => {
              await setUpRuleUpgrade({
                assets: [
                  {
                    installed: {
                      rule_id: 'query-rule',
                      type: 'query',
                      note: 'Initial note',
                      max_signals: 100,
                      risk_score: 10,
                    },
                    patch: {
                      rule_id: 'query-rule',
                      max_signals: 150,
                      risk_score: 20,
                    },
                    upgrade: {
                      rule_id: 'query-rule',
                      type: 'query',
                      note: 'Updated note',
                      max_signals: 100,
                      risk_score: 30,
                      version: 2,
                    },
                  },
                ],
                removeInstalledAssets: !withHistoricalVersions,
                deps,
              });

              const fieldsDiff = await fetchFirstPrebuiltRuleUpgradeReviewDiff(supertest);

              expect(fieldsDiff.fields).toMatchObject({
                note: {
                  has_base_version: withHistoricalVersions,
                },
                max_signals: {
                  has_base_version: withHistoricalVersions,
                },
                risk_score: {
                  has_base_version: withHistoricalVersions,
                },
              });
            });
          });
        }
      );
    }

    describe('Deprecated rule exclusion', () => {
      it('does not include deprecated rule assets in the upgrade review', async () => {
        // Install rule-a and rule-b at version 1
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'rule-a', version: 1 }),
          createRuleAssetSavedObject({ rule_id: 'rule-b', version: 1 }),
        ]);
        await installPrebuiltRules(es, supertest);

        // Replace assets: active upgrade for rule-a, deprecated asset for rule-b
        await deleteAllPrebuiltRuleAssets(es, log);
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'rule-a', version: 2 }),
        ]);
        await createDeprecatedPrebuiltRuleAssetSavedObjects(es, [
          { rule_id: 'rule-b', version: 2 },
        ]);

        const response = await reviewPrebuiltRulesToUpgrade(supertest);

        const ruleIds = response.rules.map((r: { rule_id: string }) => r.rule_id);
        expect(ruleIds).toContain('rule-a');
        expect(ruleIds).not.toContain('rule-b');
      });

      it('excludes a rule_id from upgrade review when the latest asset is deprecated but an older non-deprecated SO still exists', async () => {
        // Install rule-a and rule-b at version 1.
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'rule-a', version: 1 }),
          createRuleAssetSavedObject({ rule_id: 'rule-b', version: 1 }),
        ]);
        await installPrebuiltRules(es, supertest);

        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'rule-a', version: 2 }),
          createRuleAssetSavedObject({
            rule_id: 'rule-b',
            version: 2,
            name: 'Deprecated - Rule B',
          }),
        ]);
        await createDeprecatedPrebuiltRuleAssetSavedObjects(es, [
          { rule_id: 'rule-b', version: 3, name: 'Deprecated - Rule B' },
        ]);

        const response = await reviewPrebuiltRulesToUpgrade(supertest);

        const ruleIds = response.rules.map((r: { rule_id: string }) => r.rule_id);
        expect(ruleIds).toContain('rule-a');
        expect(ruleIds).not.toContain('rule-b');
      });
    });

    describe('Granular request shape (filter / search / aggregations / fields / sort)', () => {
      const setUpThreeUpgradeableRules = async () => {
        await setUpRuleUpgrade({
          assets: [
            {
              installed: {
                rule_id: 'rule-a',
                type: 'query',
                name: 'Phishing detection',
                tags: ['tag-a'],
                version: 1,
              },
              patch: {},
              upgrade: {
                rule_id: 'rule-a',
                type: 'query',
                name: 'Phishing detection v2',
                tags: ['tag-a'],
                version: 2,
              },
            },
            {
              installed: {
                rule_id: 'rule-b',
                type: 'query',
                name: 'Malware detection',
                tags: ['tag-a', 'tag-b'],
                version: 1,
              },
              patch: {},
              upgrade: {
                rule_id: 'rule-b',
                type: 'query',
                name: 'Malware detection v2',
                tags: ['tag-a', 'tag-b'],
                version: 2,
              },
            },
            {
              installed: {
                rule_id: 'rule-c',
                type: 'query',
                name: 'Unrelated rule',
                tags: ['tag-c'],
                version: 1,
              },
              patch: {},
              upgrade: {
                rule_id: 'rule-c',
                type: 'query',
                name: 'Unrelated rule v2',
                tags: ['tag-c'],
                version: 2,
              },
            },
          ],
          deps,
        });
      };

      it('filter narrows the upgradeable set by tags', async () => {
        await setUpThreeUpgradeableRules();

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          filter: { term: 'alert.attributes.tags: "tag-b"', mode: 'KQL' },
        });

        expect(response.total).toBe(1);
        expect(response.rules.map((r) => r.rule_id)).toEqual(['rule-b']);
      });

      it('returns 400 for a syntactically invalid KQL filter', async () => {
        const response = (await reviewPrebuiltRulesToUpgrade(
          supertest,
          { filter: { term: 'alert.attributes.name: (', mode: 'KQL' } },
          400
        )) as unknown as { status_code: number; message: string[] };
        expect(response.status_code).toBe(400);
        expect(response.message.some((m) => m.includes('invalid KQL filter'))).toBe(true);
      });

      it('search.term filters by free-text on rule name', async () => {
        await setUpThreeUpgradeableRules();

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          search: { term: 'phishing' },
        });

        expect(response.total).toBe(1);
        expect(response.rules.map((r) => r.rule_id)).toEqual(['rule-a']);
      });

      it('ANDs the KQL filter with the legacy search term', async () => {
        await setUpThreeUpgradeableRules();

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          filter: { term: 'alert.attributes.tags: "tag-a"', mode: 'KQL' },
          search: { term: 'malware', mode: 'legacy' },
        });

        expect(response.total).toBe(1);
        expect(response.rules.map((r) => r.rule_id)).toEqual(['rule-b']);
      });

      it('returns facet counts for tags when aggregations.counts is set', async () => {
        await setUpThreeUpgradeableRules();

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          aggregations: { counts: ['tags'] },
        });

        const tagsCounts = response.counts?.tags as Record<string, number> | undefined;
        expect(response.total).toBe(3);
        expect(tagsCounts?.['tag-a']).toBe(2);
        expect(tagsCounts?.['tag-b']).toBe(1);
        expect(tagsCounts?.['tag-c']).toBe(1);
      });

      it('aggregations.counts intersect with the KQL filter', async () => {
        await setUpThreeUpgradeableRules();

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          filter: { term: 'alert.attributes.tags: "tag-a"', mode: 'KQL' },
          aggregations: { counts: ['tags'] },
        });

        const tagsCounts = response.counts?.tags as Record<string, number> | undefined;
        expect(response.total).toBe(2);
        expect(tagsCounts?.['tag-a']).toBe(2);
        expect(tagsCounts?.['tag-b']).toBe(1);
        expect(tagsCounts?.['tag-c']).toBeUndefined();
      });

      it('aggregations.counts reflect the full upgradeable set, not just the current page', async () => {
        await setUpThreeUpgradeableRules();

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          per_page: 1,
          aggregations: { counts: ['tags'] },
        });

        const tagsCounts = response.counts?.tags as Record<string, number> | undefined;
        expect(response.rules).toHaveLength(1);
        expect(response.total).toBe(3);
        expect(tagsCounts?.['tag-a']).toBe(2);
        expect(tagsCounts?.['tag-b']).toBe(1);
        expect(tagsCounts?.['tag-c']).toBe(1);
      });

      it('fields narrows current_rule / target_rule while preserving baseline identity and the diff', async () => {
        await setUpRuleUpgrade({
          assets: [
            {
              installed: {
                rule_id: 'rule-a',
                type: 'query',
                name: 'Initial name',
                tags: ['tag-a'],
                description: 'Initial description',
                version: 1,
              },
              patch: {},
              upgrade: {
                rule_id: 'rule-a',
                type: 'query',
                name: 'Updated name',
                tags: ['tag-a'],
                description: 'Updated description',
                version: 2,
              },
            },
          ],
          deps,
        });

        const response = await reviewPrebuiltRulesToUpgrade(supertest, {
          fields: ['tags'],
        });

        expect(response.rules).toHaveLength(1);
        const [entry] = response.rules;
        const currentKeys = Object.keys(entry.current_rule);
        const targetKeys = Object.keys(entry.target_rule);

        // Requested field is present.
        expect(currentKeys).toContain('tags');
        expect(targetKeys).toContain('tags');

        // Baseline identity fields are always preserved on both sides.
        for (const baseline of ['rule_id', 'id', 'version', 'type', 'name']) {
          expect(currentKeys).toContain(baseline);
          expect(targetKeys).toContain(baseline);
        }

        // Non-requested, non-baseline fields are filtered out.
        expect(currentKeys).not.toContain('description');
        expect(targetKeys).not.toContain('description');

        // The three-way diff is preserved even when `fields` narrows the flat payloads.
        expect(Object.keys(entry.diff.fields)).toContain('description');
      });

      it('sort applies the first item as field/order to the upgradeable set', async () => {
        await setUpThreeUpgradeableRules();

        const ascResponse = await reviewPrebuiltRulesToUpgrade(supertest, {
          sort: [{ field: 'name', order: 'asc' }],
        });
        const descResponse = await reviewPrebuiltRulesToUpgrade(supertest, {
          sort: [{ field: 'name', order: 'desc' }],
        });

        const ascOrder = ascResponse.rules.map((r) => r.current_rule.name);
        const descOrder = descResponse.rules.map((r) => r.current_rule.name);

        expect(ascOrder).toEqual([...ascOrder].sort());
        expect(descOrder).toEqual([...ascOrder].sort().reverse());
      });
    });
  });
};
