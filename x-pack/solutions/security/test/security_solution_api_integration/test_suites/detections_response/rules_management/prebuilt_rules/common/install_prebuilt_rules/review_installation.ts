/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { deleteAllRules } from '@kbn/detections-response-ftr-services';
import { addSpaceIdToPath } from '@kbn/core-spaces-common';
import { REVIEW_RULE_INSTALLATION_URL } from '@kbn/security-solution-plugin/common/api/detection_engine/prebuilt_rules/urls';
import { RULES_FEATURE_ID } from '@kbn/security-solution-plugin/common/constants';
import { MAX_SEARCH_RULES_SEARCH_TERM_LENGTH } from '@kbn/security-solution-plugin/server/lib/detection_engine/rule_management/api/rules/search_rules/request_schema_validation';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';
import {
  createPrebuiltRuleAssetSavedObjects,
  createRuleAssetSavedObject,
  createDeprecatedPrebuiltRuleAssetSavedObjects,
  deleteAllPrebuiltRuleAssets,
  installPrebuiltRules,
  reviewPrebuiltRulesToInstall,
} from '../../../../utils';

export default ({ getService }: FtrProviderContext): void => {
  const es = getService('es');
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const log = getService('log');
  const spaces = getService('spaces');
  const security = getService('security');

  describe('@ess @serverless @skipInServerlessMKI Review installation using mocked prebuilt rule assets', () => {
    beforeEach(async () => {
      await deleteAllPrebuiltRuleAssets(es, log);
      await deleteAllRules(supertest, log);
    });

    describe('Base functionality', () => {
      it('returns only latest versions of prebuilt rules', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1', version: 1, name: 'Rule 1' }),
          createRuleAssetSavedObject({ rule_id: 'rule-1', version: 2, name: 'Rule 1, version 2' }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        expect(response).toMatchObject({
          rules: [
            expect.objectContaining({ rule_id: 'rule-1', version: 2, name: 'Rule 1, version 2' }),
          ],
          stats: {
            num_rules_to_install: 1,
          },
        });
      });

      it(`doesn't return rules that are already installed`, async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-1',
            name: 'Rule 1',
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-2',
            name: 'Rule 2',
          }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        await installPrebuiltRules(es, supertest, [{ rule_id: 'rule-1', version: 1 }]);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        expect(response).toMatchObject({
          rules: [expect.objectContaining({ rule_id: 'rule-2', name: 'Rule 2' })],
          stats: {
            num_rules_to_install: 1,
          },
        });
      });
    });

    describe('Parameters defaults', () => {
      it('called without parameters - defaults to page 1 and per_page 20', async () => {
        const response = await reviewPrebuiltRulesToInstall(supertest);

        expect(response).toMatchObject({
          page: 1,
          per_page: 20,
        });
      });

      it('called with an empty object - defaults to page 1 and per_page 20', async () => {
        const response = await reviewPrebuiltRulesToInstall(supertest, {});

        expect(response).toMatchObject({
          page: 1,
          per_page: 20,
        });
      });

      it('called with `per_page` only - respects `per_page` parameter', async () => {
        const response = await reviewPrebuiltRulesToInstall(supertest, {
          per_page: 100,
        });

        expect(response).toMatchObject({
          per_page: 100,
        });
      });
    });

    describe('Field selection', () => {
      it('returns a reduced rule payload when `fields` is set', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-fields-1',
            version: 1,
            name: 'Filtered fields rule',
            tags: ['keep-me'],
          }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          fields: ['name'],
        });

        expect(response.rules).toHaveLength(1);

        const rule = response.rules[0] as Record<string, unknown>;

        // Requested field is present.
        expect(rule.name).toBe('Filtered fields rule');
        // Baseline identity fields are always included.
        expect(rule).toHaveProperty('rule_id');
        expect(rule).toHaveProperty('type');
        expect(rule).toHaveProperty('version');
        // Non-requested, non-baseline fields are omitted.
        expect(rule).not.toHaveProperty('query');
        expect(rule).not.toHaveProperty('tags');
      });
    });

    describe('Pagination', () => {
      it('returns page and per_page passed in the request', async () => {
        const response = await reviewPrebuiltRulesToInstall(supertest, {
          page: 1,
          per_page: 5,
        });

        expect(response).toMatchObject({
          page: 1,
          per_page: 5,
        });

        const response2 = await reviewPrebuiltRulesToInstall(supertest, {
          page: 2,
          per_page: 20,
        });

        expect(response2).toMatchObject({
          page: 2,
          per_page: 20,
        });
      });

      it('returns correct number of rules per page', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1' }),
          createRuleAssetSavedObject({ rule_id: 'rule-2' }),
          createRuleAssetSavedObject({ rule_id: 'rule-3' }),
        ];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const page1Response = await reviewPrebuiltRulesToInstall(supertest, {
          page: 1,
          per_page: 2,
        });
        expect(page1Response.rules.length).toEqual(2);

        const page2Response = await reviewPrebuiltRulesToInstall(supertest, {
          page: 2,
          per_page: 2,
        });

        expect(page2Response.rules.length).toEqual(1);
      });

      it('returns correct rules for a page specified in the request', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ name: 'Rule 1', rule_id: 'rule-1' }),
          createRuleAssetSavedObject({ name: 'Rule 2', rule_id: 'rule-2' }),
          createRuleAssetSavedObject({ name: 'Rule 3', rule_id: 'rule-3' }),
          createRuleAssetSavedObject({ name: 'Rule 4', rule_id: 'rule-4' }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const page1Response = await reviewPrebuiltRulesToInstall(supertest, {
          page: 1,
          per_page: 2,
          sort: [{ field: 'name', order: 'asc' }],
        });

        expect(page1Response.rules).toHaveLength(2);
        expect(page1Response.rules).toEqual([
          expect.objectContaining({ name: 'Rule 1' }),
          expect.objectContaining({ name: 'Rule 2' }),
        ]);

        const page2Response = await reviewPrebuiltRulesToInstall(supertest, {
          page: 2,
          per_page: 2,
          sort: [{ field: 'name', order: 'asc' }],
        });

        expect(page2Response.rules).toHaveLength(2);
        expect(page2Response.rules).toEqual([
          expect.objectContaining({ name: 'Rule 3' }),
          expect.objectContaining({ name: 'Rule 4' }),
        ]);
      });

      it('returns correct number of rules for the last page', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1' }),
          createRuleAssetSavedObject({ rule_id: 'rule-2' }),
          createRuleAssetSavedObject({ rule_id: 'rule-3' }),
        ];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const lastPageResponse = await reviewPrebuiltRulesToInstall(supertest, {
          page: 2,
          per_page: 2,
        });

        expect(lastPageResponse.rules.length).toEqual(1);
      });

      describe('error handling', () => {
        it('rejects invalid "page" parameter', async () => {
          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                page: '' as unknown as number,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: page: Invalid input: expected number, received string',
          });

          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                page: 0,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: page: Too small: expected number to be >=1',
          });

          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                page: -1,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: page: Too small: expected number to be >=1',
          });
        });

        it('rejects invalid "per_page" parameter', async () => {
          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                per_page: '' as unknown as number,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: per_page: Invalid input: expected number, received string',
          });

          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                per_page: 0,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: per_page: Too small: expected number to be >=1',
          });

          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                per_page: -1,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: per_page: Too small: expected number to be >=1',
          });

          expect(
            await reviewPrebuiltRulesToInstall(
              supertest,
              {
                per_page: 10_001,
              },
              400
            )
          ).toMatchObject({
            message: '[request body]: per_page: Too big: expected number to be <=500',
          });
        });
      });
    });

    describe('Tags', () => {
      it('returns tags from all installable rules even if a filter is provided', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1', tags: ['tag-a', 'tag-b'] }),
          createRuleAssetSavedObject({ rule_id: 'rule-2', tags: ['tag-b'] }),
          createRuleAssetSavedObject({ rule_id: 'rule-3', tags: ['tag-c'] }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          filter: { term: 'security-rule.tags: "tag-a"', mode: 'KQL' },
        });

        expect(response.stats.tags).toEqual(['tag-a', 'tag-b', 'tag-c']);
      });

      it('tags are sorted alphabetically', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-1',
            tags: ['tag-b', 'tag-a', 'tag-c'],
          }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        expect(response.stats.tags).toEqual(['tag-a', 'tag-b', 'tag-c']);
      });
    });

    describe('Sorting', () => {
      describe('by rule name', () => {
        it('ascending', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Rule 1' }),
            createRuleAssetSavedObject({ rule_id: 'rule-3', name: 'Rule 3' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'Rule 2' }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const ascSortResponse = await reviewPrebuiltRulesToInstall(supertest, {
            sort: [{ field: 'name', order: 'asc' }],
          });

          expect(ascSortResponse.rules).toEqual([
            expect.objectContaining({ name: 'Rule 1' }),
            expect.objectContaining({ name: 'Rule 2' }),
            expect.objectContaining({ name: 'Rule 3' }),
          ]);
        });

        it('descending', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Rule 1' }),
            createRuleAssetSavedObject({ rule_id: 'rule-3', name: 'Rule 3' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'Rule 2' }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const descSortResponse = await reviewPrebuiltRulesToInstall(supertest, {
            sort: [{ field: 'name', order: 'desc' }],
          });

          expect(descSortResponse.rules).toEqual([
            expect.objectContaining({ name: 'Rule 3' }),
            expect.objectContaining({ name: 'Rule 2' }),
            expect.objectContaining({ name: 'Rule 1' }),
          ]);
        });
      });

      describe('by severity', () => {
        it('ascending', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', severity: 'medium' }),
            createRuleAssetSavedObject({ rule_id: 'rule-3', severity: 'critical' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', severity: 'low' }),
            createRuleAssetSavedObject({ rule_id: 'rule-4', severity: 'high' }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const ascSortResponse = await reviewPrebuiltRulesToInstall(supertest, {
            sort: [{ field: 'severity', order: 'asc' }],
          });

          expect(ascSortResponse.rules).toEqual([
            expect.objectContaining({ severity: 'low' }),
            expect.objectContaining({ severity: 'medium' }),
            expect.objectContaining({ severity: 'high' }),
            expect.objectContaining({ severity: 'critical' }),
          ]);
        });

        it('descending', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', severity: 'medium' }),
            createRuleAssetSavedObject({ rule_id: 'rule-3', severity: 'critical' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', severity: 'low' }),
            createRuleAssetSavedObject({ rule_id: 'rule-4', severity: 'high' }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const descSortResponse = await reviewPrebuiltRulesToInstall(supertest, {
            sort: [{ field: 'severity', order: 'desc' }],
          });

          expect(descSortResponse.rules).toEqual([
            expect.objectContaining({ severity: 'critical' }),
            expect.objectContaining({ severity: 'high' }),
            expect.objectContaining({ severity: 'medium' }),
            expect.objectContaining({ severity: 'low' }),
          ]);
        });
      });

      describe('by risk score', () => {
        it('ascending', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-3', risk_score: 11 }),
            createRuleAssetSavedObject({ rule_id: 'rule-1', risk_score: 1 }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', risk_score: 100 }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const ascSortResponse = await reviewPrebuiltRulesToInstall(supertest, {
            sort: [{ field: 'risk_score', order: 'asc' }],
          });

          expect(ascSortResponse.rules).toEqual([
            expect.objectContaining({ risk_score: 1 }),
            expect.objectContaining({ risk_score: 11 }),
            expect.objectContaining({ risk_score: 100 }),
          ]);
        });

        it('descending', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-3', risk_score: 11 }),
            createRuleAssetSavedObject({ rule_id: 'rule-1', risk_score: 1 }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', risk_score: 100 }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const descSortResponse = await reviewPrebuiltRulesToInstall(supertest, {
            sort: [{ field: 'risk_score', order: 'desc' }],
          });

          expect(descSortResponse.rules).toEqual([
            expect.objectContaining({ risk_score: 100 }),
            expect.objectContaining({ risk_score: 11 }),
            expect.objectContaining({ risk_score: 1 }),
          ]);
        });
      });

      it('only the latest versions of rules are used for sorting', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-3',
            version: 2, // Note that this is the latest version of this rule
            risk_score: 11,
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-3',
            version: 1, // Previous version of this rule, should not be returned in the response
            risk_score: 10,
          }),
          createRuleAssetSavedObject({ rule_id: 'rule-1', version: 1, risk_score: 1 }),
          createRuleAssetSavedObject({ rule_id: 'rule-2', version: 1, risk_score: 100 }),
        ];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const sortResponse = await reviewPrebuiltRulesToInstall(supertest, {
          sort: [{ field: 'risk_score', order: 'asc' }],
        });

        expect(sortResponse.rules).toEqual([
          expect.objectContaining({ risk_score: 1 }),
          expect.objectContaining({ risk_score: 11 }),
          expect.objectContaining({ risk_score: 100 }),
        ]);
      });
    });

    describe('Filtering', () => {
      it('no filter provided - returns unfiltered response', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Rule 1' }),
          createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'Rule 2' }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        expect(response.rules).toHaveLength(2);
        expect(response.rules).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ rule_id: 'rule-1', name: 'Rule 1' }),
            expect.objectContaining({ rule_id: 'rule-2', name: 'Rule 2' }),
          ])
        );
        expect(response).toMatchObject({
          total: 2,
          stats: {
            num_rules_to_install: 2,
          },
        });
      });

      describe('by name', () => {
        it('empty filter provided - returns unfiltered response', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Rule 1' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'Rule 2' }),
          ];
          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const emptyNameResponse = await reviewPrebuiltRulesToInstall(supertest, {
            filter: { term: '', mode: 'KQL' },
          });

          expect(emptyNameResponse.rules).toHaveLength(2);
          expect(emptyNameResponse.rules).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ rule_id: 'rule-1', name: 'Rule 1' }),
              expect.objectContaining({ rule_id: 'rule-2', name: 'Rule 2' }),
            ])
          );
        });

        describe('name matching', () => {
          it('matches exact name', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'My rule 1' }),
              createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'My rule 2' }),
              createRuleAssetSavedObject({ rule_id: 'rule-3', name: 'My rule 3' }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const response = await reviewPrebuiltRulesToInstall(supertest, {
              filter: { term: 'security-rule.name: "My rule 1"', mode: 'KQL' },
            });

            expect(response.rules).toEqual([
              expect.objectContaining({ rule_id: 'rule-1', name: 'My rule 1' }),
            ]);
          });

          it('wildcard matching - matches partial name via keyword wildcard', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'My rule 1' }),
              createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'My rule 2' }),
              createRuleAssetSavedObject({ rule_id: 'rule-3', name: 'My rule 3' }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const response = await reviewPrebuiltRulesToInstall(supertest, {
              filter: { term: 'security-rule.name.keyword: *rule*', mode: 'KQL' },
            });

            expect(response.rules).toHaveLength(3);
            expect(response.rules).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ rule_id: 'rule-1', name: 'My rule 1' }),
                expect.objectContaining({ rule_id: 'rule-2', name: 'My rule 2' }),
                expect.objectContaining({ rule_id: 'rule-3', name: 'My rule 3' }),
              ])
            );
          });

          it('matches case-insensitively via analyzed name field', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'My rule 1' }),
              createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'My rule 2' }),
              createRuleAssetSavedObject({ rule_id: 'rule-3', name: 'My rule 3' }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const response = await reviewPrebuiltRulesToInstall(supertest, {
              filter: { term: 'security-rule.name: "mY rulE 1"', mode: 'KQL' },
            });

            expect(response.rules).toEqual([
              expect.objectContaining({ rule_id: 'rule-1', name: 'My rule 1' }),
            ]);
          });
        });
      });

      describe('by tags', () => {
        describe('single tag', () => {
          it('matches all rules with a tag', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({
                rule_id: 'rule-1',
                tags: ['tag-a', 'tag-b'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-2',
                tags: ['tag-b', 'tag-c'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-3',
                tags: ['tag-c'],
              }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const singleTagResponse = await reviewPrebuiltRulesToInstall(supertest, {
              filter: { term: 'security-rule.tags: "tag-b"', mode: 'KQL' },
            });

            expect(singleTagResponse.rules).toHaveLength(2);
            expect(singleTagResponse.rules).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  rule_id: 'rule-1',
                  tags: ['tag-a', 'tag-b'],
                }),
                expect.objectContaining({
                  rule_id: 'rule-2',
                  tags: ['tag-b', 'tag-c'],
                }),
              ])
            );
          });

          it('returns empty array if no matches are found', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({
                rule_id: 'rule-1',
                tags: ['tag-a', 'tag-b'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-2',
                tags: ['tag-b', 'tag-c'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-3',
                tags: ['tag-c'],
              }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const singleTagResponse = await reviewPrebuiltRulesToInstall(supertest, {
              filter: { term: 'security-rule.tags: "tag-d"', mode: 'KQL' },
            });

            expect(singleTagResponse.rules).toEqual([]);
          });
        });

        describe('multiple tags use AND logic', () => {
          it('matches only rules with both tags present', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({
                rule_id: 'rule-1',
                tags: ['tag-a', 'tag-b'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-2',
                tags: ['tag-b', 'tag-c'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-3',
                tags: ['tag-c'],
              }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const multipleTagsResponse = await reviewPrebuiltRulesToInstall(supertest, {
              filter: {
                term: '(security-rule.tags: "tag-a") AND (security-rule.tags: "tag-b")',
                mode: 'KQL',
              },
            });

            expect(multipleTagsResponse.rules).toEqual([
              expect.objectContaining({
                rule_id: 'rule-1',
                tags: ['tag-a', 'tag-b'],
              }),
            ]);
          });

          it('returns empty array when no rule has both tags', async () => {
            const ruleAssets = [
              createRuleAssetSavedObject({
                rule_id: 'rule-1',
                tags: ['tag-a', 'tag-b'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-2',
                tags: ['tag-b', 'tag-c'],
              }),
              createRuleAssetSavedObject({
                rule_id: 'rule-3',
                tags: ['tag-c'],
              }),
            ];
            await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

            const multipleTagsResponse = await reviewPrebuiltRulesToInstall(supertest, {
              filter: {
                term: '(security-rule.tags: "tag-a") AND (security-rule.tags: "tag-c")',
                mode: 'KQL',
              },
            });

            expect(multipleTagsResponse.rules).toEqual([]);
          });
        });

        describe('tags with special characters', () => {
          [
            ' ',
            '%',
            '+',
            '-',
            '=',
            '&&',
            '||',
            '>',
            '<',
            '!',
            '(',
            ')',
            '{',
            '}',
            '[',
            ']',
            '^',
            '"',
            '~',
            '*',
            '?',
            ':',
            '\\',
            '/',
          ].forEach((specialChar, index) => {
            it(`matches tag with special character "${specialChar}"`, async () => {
              const tag = `tag-with-${specialChar}-in-it`;
              const ruleAsset = createRuleAssetSavedObject({
                rule_id: `rule-${index}`,
                tags: [tag],
              });
              await createPrebuiltRuleAssetSavedObjects(es, [ruleAsset]);

              const response = await reviewPrebuiltRulesToInstall(supertest, {
                filter: {
                  term: `security-rule.tags: "${tag.replace(/"/g, '\\"')}"`,
                  mode: 'KQL',
                },
              });
              expect(response.rules).toEqual([
                expect.objectContaining({
                  rule_id: `rule-${index}`,
                  tags: [tag],
                }),
              ]);
            });
          });
        });
      });

      describe('stats', () => {
        it('when filter matches all rules, number of installable rules is the same as the number of rules matching the filter', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Rule 1' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'Rule 2' }),
          ];

          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const response = await reviewPrebuiltRulesToInstall(supertest, {
            filter: { term: 'security-rule.name.keyword: *Rule*', mode: 'KQL' },
          });

          expect(response).toMatchObject({
            stats: {
              num_rules_to_install: 2,
            },
            total: 2,
          });
        });

        it('when filter is not provided, number of installable rules is the same as the number of rules matching the filter', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1' }),
            createRuleAssetSavedObject({ rule_id: 'rule-2' }),
          ];

          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const response = await reviewPrebuiltRulesToInstall(supertest);

          expect(response).toMatchObject({
            stats: {
              num_rules_to_install: 2,
            },
            total: 2,
          });
        });

        it('when filter matches some rules, number of installable rules is bigger than the number of rules matching the filter', async () => {
          const ruleAssets = [
            createRuleAssetSavedObject({ rule_id: 'rule-1', tags: ['tag-a', 'tag-b'] }),
            createRuleAssetSavedObject({ rule_id: 'rule-2', tags: ['tag-b'] }),
          ];

          await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

          const response = await reviewPrebuiltRulesToInstall(supertest, {
            filter: { term: 'security-rule.tags: "tag-a"', mode: 'KQL' },
          });

          expect(response).toMatchObject({
            stats: {
              num_rules_to_install: 2,
            },
            total: 1,
          });
        });
      });
    });

    describe('Sorting and filtering together', () => {
      it('correctly applies sorting and filtering when both are provided', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-1',
            name: 'Rule 1',
            tags: ['tag-a', 'tag-b'],
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-2',
            name: 'Rule 2',
            tags: ['tag-b', 'tag-c'],
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-3',
            name: 'Rule 3',
            tags: ['tag-c'],
          }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          sort: [{ field: 'name', order: 'desc' }],
          filter: { term: 'security-rule.tags: "tag-b"', mode: 'KQL' },
        });

        expect(response.rules).toEqual([
          expect.objectContaining({
            rule_id: 'rule-2',
          }),
          expect.objectContaining({
            rule_id: 'rule-1',
          }),
        ]);
      });
    });

    describe('Search term', () => {
      it('matches rules by name substring via the legacy search term', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Phishing detection' }),
          createRuleAssetSavedObject({ rule_id: 'rule-2', name: 'Malware alert' }),
          createRuleAssetSavedObject({ rule_id: 'rule-3', name: 'Unrelated rule' }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          search: { term: 'phishing' },
        });

        expect(response.rules).toEqual([
          expect.objectContaining({ rule_id: 'rule-1', name: 'Phishing detection' }),
        ]);
      });

      it('ANDs the filter with the legacy search term', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-1',
            name: 'Phishing detection',
            tags: ['tag-a'],
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-2',
            name: 'Phishing alert',
            tags: ['tag-b'],
          }),
        ];

        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          filter: { term: 'security-rule.tags: "tag-a"', mode: 'KQL' },
          search: { term: 'phishing', mode: 'legacy' },
        });

        expect(response.rules).toEqual([
          expect.objectContaining({ rule_id: 'rule-1', tags: ['tag-a'] }),
        ]);
      });

      it('returns 400 when search.term exceeds max length', async () => {
        const response = (await reviewPrebuiltRulesToInstall(
          supertest,
          {
            search: { term: 'x'.repeat(MAX_SEARCH_RULES_SEARCH_TERM_LENGTH + 1) },
          },
          400
        )) as unknown as { status_code: number; message: string[] };
        expect(response).toMatchObject({
          status_code: 400,
          message: expect.any(Array),
        });
        expect(
          response.message.some((m) =>
            m.includes(
              `search.term exceeds maximum length of ${MAX_SEARCH_RULES_SEARCH_TERM_LENGTH}`
            )
          )
        ).toBe(true);
      });
    });

    describe('KQL filter validation', () => {
      it('returns 400 for invalid KQL filter', async () => {
        const response = (await reviewPrebuiltRulesToInstall(
          supertest,
          {
            filter: { term: 'security-rule.name: (', mode: 'KQL' },
          },
          400
        )) as unknown as { status_code: number; message: string[] };
        expect(response).toMatchObject({
          status_code: 400,
          message: expect.any(Array),
        });
        expect(response.message.some((m) => m.includes('invalid KQL filter'))).toBe(true);
      });
    });

    describe('Aggregations', () => {
      it('returns facet counts for tags when aggregations.counts is set', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1', tags: ['tag-a'] }),
          createRuleAssetSavedObject({ rule_id: 'rule-2', tags: ['tag-a'] }),
          createRuleAssetSavedObject({ rule_id: 'rule-3', tags: ['tag-b'] }),
        ];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          aggregations: { counts: ['tags'] },
        });

        expect(response.total).toBe(3);
        expect(response.counts).toBeDefined();
        const tagsCounts = response.counts?.tags as Record<string, number> | undefined;
        expect(tagsCounts).toBeDefined();
        expect(tagsCounts?.['tag-a']).toBe(2);
        expect(tagsCounts?.['tag-b']).toBe(1);
      });

      it('filter intersects with aggregations.counts', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({ rule_id: 'rule-1', tags: ['tag-a'] }),
          createRuleAssetSavedObject({ rule_id: 'rule-2', tags: ['tag-a'] }),
          createRuleAssetSavedObject({ rule_id: 'rule-3', tags: ['tag-b'] }),
        ];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          filter: { term: 'security-rule.tags: "tag-a"', mode: 'KQL' },
          aggregations: { counts: ['tags'] },
        });

        expect(response.total).toBe(2);
        const tagsCounts = response.counts?.tags as Record<string, number> | undefined;
        expect(tagsCounts).toBeDefined();
        expect(tagsCounts?.['tag-a']).toBe(2);
        expect(tagsCounts?.['tag-b']).toBeUndefined();
      });

      it('facet tag counts exclude rules that are already installed', async () => {
        const ruleAssets = [
          createRuleAssetSavedObject({
            rule_id: 'rule-1',
            tags: ['tag-only-on-installed-rule'],
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-2',
            tags: ['tag-on-installable-rule'],
          }),
        ];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);

        await installPrebuiltRules(es, supertest, [{ rule_id: 'rule-1', version: 1 }]);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          aggregations: { counts: ['tags'] },
        });

        expect(response.total).toBe(1);
        expect(response.rules).toEqual([expect.objectContaining({ rule_id: 'rule-2' })]);
        expect(response.stats.num_rules_to_install).toBe(1);

        const tagsCounts = response.counts?.tags as Record<string, number> | undefined;
        expect(tagsCounts).toBeDefined();
        expect(tagsCounts?.['tag-only-on-installed-rule']).toBeUndefined();
        expect(tagsCounts?.['tag-on-installable-rule']).toBe(1);
      });

      it('returns 400 when aggregations.counts contains duplicates', async () => {
        const response = (await reviewPrebuiltRulesToInstall(
          supertest,
          {
            aggregations: { counts: ['tags', 'tags'] },
          },
          400
        )) as unknown as { status_code: number };
        expect(response.status_code).toBe(400);
      });
    });

    describe('Spaces', () => {
      const customSpaceId = 'custom-space-review-test';
      const customUser = {
        username: 'custom-space-user',
        roleName: 'custom-space-role',
        password: 'password123',
      };

      beforeEach(async () => {
        // Create custom space
        await spaces.create({
          id: customSpaceId,
          name: customSpaceId,
          disabledFeatures: [],
        });

        // Create role with access only to custom space
        await security.role.create(customUser.roleName, {
          kibana: [
            {
              feature: {
                [RULES_FEATURE_ID]: ['read'],
              },
              spaces: [customSpaceId],
            },
          ],
        });

        // Create user with that role
        await security.user.create(customUser.username, {
          password: customUser.password,
          roles: [customUser.roleName],
        });

        // Create prebuilt rule assets
        const ruleAssets = [createRuleAssetSavedObject({ rule_id: 'rule-1', name: 'Rule 1' })];
        await createPrebuiltRuleAssetSavedObjects(es, ruleAssets);
      });

      afterEach(async () => {
        // Cleanup: delete user, role, space
        await security.user.delete(customUser.username);
        await security.role.delete(customUser.roleName);
        await spaces.delete(customSpaceId);
      });

      it('users without access to default space can use the endpoint', async () => {
        const response = await supertestWithoutAuth
          .post(addSpaceIdToPath('/', customSpaceId, REVIEW_RULE_INSTALLATION_URL))
          .auth(customUser.username, customUser.password)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '1')
          .set('x-elastic-internal-origin', 'securitySolution')
          .send({})
          .expect(200);

        expect(response.body.rules.length).toBe(1);
      });
    });

    describe('Deprecated rule exclusion', () => {
      it('does not include deprecated rule assets in the install review', async () => {
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({ rule_id: 'active-rule-1', version: 1, name: 'Active 1' }),
          createRuleAssetSavedObject({ rule_id: 'active-rule-2', version: 1, name: 'Active 2' }),
        ]);
        await createDeprecatedPrebuiltRuleAssetSavedObjects(es, [
          { rule_id: 'deprecated-rule-1', version: 1, name: 'Deprecated 1' },
        ]);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        const ruleIds = response.rules.map((r: { rule_id: string }) => r.rule_id);
        expect(ruleIds).toContain('active-rule-1');
        expect(ruleIds).toContain('active-rule-2');
        expect(ruleIds).not.toContain('deprecated-rule-1');
        expect(response.stats.num_rules_to_install).toBe(2);
      });

      it('returns empty install review when only deprecated rule assets are present', async () => {
        await createDeprecatedPrebuiltRuleAssetSavedObjects(es, [
          { rule_id: 'deprecated-rule-1', version: 1 },
          { rule_id: 'deprecated-rule-2', version: 1 },
        ]);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        expect(response.rules).toHaveLength(0);
        expect(response.stats.num_rules_to_install).toBe(0);
      });

      it('excludes a rule_id when its latest version is a deprecated stub but an older non-deprecated SO still exists', async () => {
        // Stale non-deprecated SOs left over from earlier package versions.
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({
            rule_id: 'rule-going-away',
            version: 1,
            name: 'Deprecated - Going Away',
          }),
          createRuleAssetSavedObject({
            rule_id: 'rule-going-away',
            version: 2,
            name: 'Deprecated - Going Away',
          }),
          createRuleAssetSavedObject({
            rule_id: 'active-rule',
            version: 1,
            name: 'Active rule',
          }),
        ]);
        await createDeprecatedPrebuiltRuleAssetSavedObjects(es, [
          { rule_id: 'rule-going-away', version: 3, name: 'Deprecated - Going Away' },
        ]);

        const response = await reviewPrebuiltRulesToInstall(supertest);

        const ruleIds = response.rules.map((r: { rule_id: string }) => r.rule_id);
        expect(ruleIds).toContain('active-rule');
        expect(ruleIds).not.toContain('rule-going-away');
        expect(response.stats.num_rules_to_install).toBe(1);
      });

      it('excludes a rule_id whose latest version is a deprecated stub even when a user KQL filter is applied that the stub does not match', async () => {
        // Deprecated stubs carry only a minimal schema (no `tags`,
        // `severity`, etc.), so a naive single-query approach that
        // excludes deprecated SOs via the search filter would leak the
        // older non-deprecated SO whenever a user filter targets fields
        // the stub doesn't carry. The deprecated rule_id lookup runs as a
        // separate query that ignores the user filter, which keeps this
        // case correct.
        await createPrebuiltRuleAssetSavedObjects(es, [
          createRuleAssetSavedObject({
            rule_id: 'rule-going-away',
            version: 1,
            name: 'Deprecated - Going Away',
            tags: ['Tactic: Collection'],
          }),
          createRuleAssetSavedObject({
            rule_id: 'active-rule',
            version: 1,
            name: 'Active rule',
            tags: ['Tactic: Collection'],
          }),
        ]);
        await createDeprecatedPrebuiltRuleAssetSavedObjects(es, [
          { rule_id: 'rule-going-away', version: 3, name: 'Deprecated - Going Away' },
        ]);

        const response = await reviewPrebuiltRulesToInstall(supertest, {
          filter: { term: 'security-rule.tags: "Tactic: Collection"', mode: 'KQL' },
        });

        const ruleIds = response.rules.map((r: { rule_id: string }) => r.rule_id);
        expect(ruleIds).toContain('active-rule');
        expect(ruleIds).not.toContain('rule-going-away');
        expect(response.stats.num_rules_to_install).toBe(1);
      });
    });
  });
};
