/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type {
  CoverageOverviewResponse,
  ThreatArray,
} from '@kbn/security-solution-plugin/common/api/detection_engine';
import {
  CoverageOverviewRuleActivity,
  CoverageOverviewRuleSource,
  RULE_MANAGEMENT_COVERAGE_OVERVIEW_URL,
} from '@kbn/security-solution-plugin/common/api/detection_engine';

/**
 * Strips the `invalid_mitre_ids` field from the coverage overview response body
 * so that existing test assertions for `coverage`, `unmapped_rule_ids`, and `rules_data`
 * continue to work without being affected by MITRE validation results.
 * Tests specifically covering `invalid_mitre_ids` use the full response body directly.
 */
const omitInvalidMitreIds = (
  body: CoverageOverviewResponse
): Omit<CoverageOverviewResponse, 'invalid_mitre_ids'> => {
  const { invalid_mitre_ids: _, ...rest } = body;
  return rest;
};
import { createRule, deleteAllRules } from '@kbn/detections-response-ftr-services';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  createPrebuiltRuleAssetSavedObjects,
  createRuleAssetSavedObject,
  installPrebuiltRulesAndTimelines,
  installPrebuiltRules,
  getCustomQueryRuleParams,
  createNonSecurityRule,
  deleteAllPrebuiltRuleAssets,
} from '../../../utils';
import { getCoverageOverview } from '../../../utils/rules/get_coverage_overview';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const log = getService('log');
  const es = getService('es');

  describe('coverage_overview', () => {
    beforeEach(async () => {
      await deleteAllPrebuiltRuleAssets(es, log);
      await deleteAllRules(supertest, log);
    });

    // ESS only
    describe('@ess specific tests', () => {
      it('does NOT error when there exist some stack rules in addition to security detection rules', async () => {
        await createNonSecurityRule(supertest);

        const rule1 = await createRule(
          supertest,
          log,
          getCustomQueryRuleParams({ threat: generateThreatArray(1) })
        );

        const body = await getCoverageOverview(supertest);

        expect(omitInvalidMitreIds(body)).to.eql({
          coverage: {
            T001: [rule1.id],
            TA001: [rule1.id],
            'T001.001': [rule1.id],
          },
          unmapped_rule_ids: [],
          rules_data: {
            [rule1.id]: {
              activity: 'disabled',
              name: 'Custom query rule',
            },
          },
        });
      });
    });

    // Both serverless and ESS
    describe('@ess @serverless @skipInServerlessMKI tests', () => {
      describe('base cases', () => {
        it('returns an empty response if there are no rules', async () => {
          const body = await getCoverageOverview(supertest);

          expect(omitInvalidMitreIds(body)).to.eql({
            coverage: {},
            unmapped_rule_ids: [],
            rules_data: {},
          });
        });

        it('returns response with a single rule mapped to MITRE categories', async () => {
          const rule1 = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({ threat: generateThreatArray(1) })
          );

          const body = await getCoverageOverview(supertest);

          expect(omitInvalidMitreIds(body)).to.eql({
            coverage: {
              T001: [rule1.id],
              TA001: [rule1.id],
              'T001.001': [rule1.id],
            },
            unmapped_rule_ids: [],
            rules_data: {
              [rule1.id]: {
                activity: 'disabled',
                name: 'Custom query rule',
              },
            },
          });
        });

        it('returns response with an unmapped rule', async () => {
          const rule1 = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({ threat: undefined })
          );

          const body = await getCoverageOverview(supertest);

          expect(omitInvalidMitreIds(body)).to.eql({
            coverage: {},
            unmapped_rule_ids: [rule1.id],
            rules_data: {
              [rule1.id]: {
                activity: 'disabled',
                name: 'Custom query rule',
              },
            },
          });
        });
      });

      describe('with filters', () => {
        describe('search_term', () => {
          it('returns response filtered by tactic', async () => {
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(1) })
            );
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest, {
              search_term: 'TA002',
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T002: [expectedRule.id],
                TA002: [expectedRule.id],
                'T002.002': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns response filtered by technique', async () => {
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(1) })
            );
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest, {
              search_term: 'T002',
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T002: [expectedRule.id],
                TA002: [expectedRule.id],
                'T002.002': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns response filtered by subtechnique', async () => {
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(1) })
            );
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest, {
              search_term: 'T002.002',
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T002: [expectedRule.id],
                TA002: [expectedRule.id],
                'T002.002': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns response filtered by rule name', async () => {
            await createRule(supertest, log, getCustomQueryRuleParams({ rule_id: 'rule-1' }));
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', name: 'rule-2' })
            );

            const body = await getCoverageOverview(supertest, {
              search_term: 'rule-2',
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule.id],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'rule-2',
                },
              },
            });
          });

          it('returns partial matches on rule name (when using a single term)', async () => {
            const expectedRule1 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-1',
                name: 'Linux SMP aarch64 GNU/Linux',
              })
            );
            const expectedRule2 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', name: 'Windows 10 x64:IA32-e' })
            );
            const expectedRule3 = await createRule(
              supertest,
              log,
              // here
              getCustomQueryRuleParams({ rule_id: 'rule-3', name: 'iOS Darwin x64:IA32-e' })
            );

            const body1 = await getCoverageOverview(supertest, {
              search_term: 'win',
            });

            expect(omitInvalidMitreIds(body1)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule2.id, expectedRule3.id],
              rules_data: {
                [expectedRule2.id]: {
                  activity: 'disabled',
                  name: 'Windows 10 x64:IA32-e',
                },
                [expectedRule3.id]: {
                  activity: 'disabled',
                  name: 'iOS Darwin x64:IA32-e',
                },
              },
            });

            const body2 = await getCoverageOverview(supertest, {
              search_term: '64:IA',
            });

            expect(omitInvalidMitreIds(body2)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule2.id, expectedRule3.id],
              rules_data: {
                [expectedRule2.id]: {
                  activity: 'disabled',
                  name: 'Windows 10 x64:IA32-e',
                },
                [expectedRule3.id]: {
                  activity: 'disabled',
                  name: 'iOS Darwin x64:IA32-e',
                },
              },
            });

            const body3 = await getCoverageOverview(supertest, {
              search_term: 'GNU/Linux',
            });

            expect(omitInvalidMitreIds(body3)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule1.id],
              rules_data: {
                [expectedRule1.id]: {
                  activity: 'disabled',
                  name: 'Linux SMP aarch64 GNU/Linux',
                },
              },
            });
          });

          it('returns exact term matches on rule name (when using multiple terms)', async () => {
            const expectedRule1 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-1',
                name: 'User-Agent rule1',
              })
            );

            const expectedRule2 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                name: 'User Agent rule2',
              })
            );

            const body1 = await getCoverageOverview(supertest, {
              search_term: 'User-Agent rule1',
            });

            expect(omitInvalidMitreIds(body1)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule1.id],
              rules_data: {
                [expectedRule1.id]: {
                  activity: 'disabled',
                  name: 'User-Agent rule1',
                },
              },
            });

            const body2 = await getCoverageOverview(supertest, {
              search_term: 'User Agent rule2',
            });

            expect(omitInvalidMitreIds(body2)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule2.id],
              rules_data: {
                [expectedRule2.id]: {
                  activity: 'disabled',
                  name: 'User Agent rule2',
                },
              },
            });

            const body3 = await getCoverageOverview(supertest, {
              search_term: 'User Agent rule',
            });

            expect(omitInvalidMitreIds(body3)).to.eql({
              coverage: {},
              unmapped_rule_ids: [],
              rules_data: {},
            });
          });

          it('returns special character matches on rule name', async () => {
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', name: 'Rule name without backslash' })
            );
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', name: 'Rule name with backslash(\\)' })
            );

            const body = await getCoverageOverview(supertest, {
              search_term: 'backslash(\\)',
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule.id],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Rule name with backslash(\\)',
                },
              },
            });
          });

          it('returns response filtered by index pattern', async () => {
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', index: ['index-pattern-1'] })
            );
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-2', index: ['index-pattern-2'] })
            );

            const body = await getCoverageOverview(supertest, {
              search_term: 'index-pattern-2',
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {},
              unmapped_rule_ids: [expectedRule.id],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });
        });

        describe('activity', () => {
          it('returns response filtered by disabled rules', async () => {
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(1) })
            );
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                enabled: true,
                threat: generateThreatArray(2),
              })
            );

            const body = await getCoverageOverview(supertest, {
              activity: [CoverageOverviewRuleActivity.Disabled],
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T001: [expectedRule.id],
                TA001: [expectedRule.id],
                'T001.001': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns response filtered by enabled rules', async () => {
            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(1) })
            );
            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                enabled: true,
                threat: generateThreatArray(2),
              })
            );

            const body = await getCoverageOverview(supertest, {
              activity: [CoverageOverviewRuleActivity.Enabled],
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T002: [expectedRule.id],
                TA002: [expectedRule.id],
                'T002.002': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'enabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns all rules if both enabled and disabled filters are specified in the request', async () => {
            const expectedRule1 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-1',
                enabled: false,
                name: 'Disabled rule',
                threat: generateThreatArray(1),
              })
            );
            const expectedRule2 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                enabled: true,
                name: 'Enabled rule',
                threat: generateThreatArray(2),
              })
            );

            const body = await getCoverageOverview(supertest, {
              activity: [
                CoverageOverviewRuleActivity.Enabled,
                CoverageOverviewRuleActivity.Disabled,
              ],
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T001: [expectedRule1.id],
                TA001: [expectedRule1.id],
                'T001.001': [expectedRule1.id],
                T002: [expectedRule2.id],
                TA002: [expectedRule2.id],
                'T002.002': [expectedRule2.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule1.id]: {
                  activity: 'disabled',
                  name: 'Disabled rule',
                },
                [expectedRule2.id]: {
                  activity: 'enabled',
                  name: 'Enabled rule',
                },
              },
            });
          });

          it('returns all rules if neither enabled and disabled filters are specified in the request', async () => {
            const expectedRule1 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-1',
                enabled: false,
                name: 'Disabled rule',
                threat: generateThreatArray(1),
              })
            );
            const expectedRule2 = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({
                rule_id: 'rule-2',
                enabled: true,
                name: 'Enabled rule',
                threat: generateThreatArray(2),
              })
            );

            const body = await getCoverageOverview(supertest);

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T001: [expectedRule1.id],
                TA001: [expectedRule1.id],
                'T001.001': [expectedRule1.id],
                T002: [expectedRule2.id],
                TA002: [expectedRule2.id],
                'T002.002': [expectedRule2.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule1.id]: {
                  activity: 'disabled',
                  name: 'Disabled rule',
                },
                [expectedRule2.id]: {
                  activity: 'enabled',
                  name: 'Enabled rule',
                },
              },
            });
          });
        });

        // https://github.com/elastic/kibana/issues/183240
        describe('@skipInServerlessMKI source', () => {
          it('returns response filtered by custom rules', async () => {
            await createPrebuiltRuleAssetSavedObjects(es, [
              createRuleAssetSavedObject({
                rule_id: 'prebuilt-rule-1',
                threat: generateThreatArray(1),
              }),
            ]);
            await installPrebuiltRulesAndTimelines(es, supertest);

            const expectedRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest, {
              source: [CoverageOverviewRuleSource.Custom],
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T002: [expectedRule.id],
                TA002: [expectedRule.id],
                'T002.002': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns response filtered by prebuilt rules', async () => {
            await createPrebuiltRuleAssetSavedObjects(es, [
              createRuleAssetSavedObject({
                rule_id: 'coverage-overview-prebuilt-rule-1',
                version: 1,
                threat: generateThreatArray(1),
              }),
            ]);
            const {
              results: { created },
            } = await installPrebuiltRules(es, supertest, [
              {
                rule_id: 'coverage-overview-prebuilt-rule-1',
                version: 1,
              },
            ]);
            const expectedRule = created[0];

            await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest, {
              source: [CoverageOverviewRuleSource.Prebuilt],
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T001: [expectedRule.id],
                TA001: [expectedRule.id],
                'T001.001': [expectedRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedRule.id]: {
                  activity: 'disabled',
                  name: 'Query with a rule id',
                },
              },
            });
          });

          it('returns all rules if both custom and prebuilt filters are specified in the request', async () => {
            await createPrebuiltRuleAssetSavedObjects(es, [
              createRuleAssetSavedObject({
                rule_id: 'prebuilt-rule-1',
                threat: generateThreatArray(1),
              }),
            ]);
            const {
              results: { created },
            } = await installPrebuiltRules(es, supertest);
            const expectedPrebuiltRule = created[0];

            const expectedCustomRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest, {
              source: [CoverageOverviewRuleSource.Prebuilt, CoverageOverviewRuleSource.Custom],
            });

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T001: [expectedPrebuiltRule.id],
                TA001: [expectedPrebuiltRule.id],
                'T001.001': [expectedPrebuiltRule.id],
                T002: [expectedCustomRule.id],
                TA002: [expectedCustomRule.id],
                'T002.002': [expectedCustomRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedPrebuiltRule.id]: {
                  activity: 'disabled',
                  name: 'Query with a rule id',
                },
                [expectedCustomRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });

          it('returns all rules if neither custom and prebuilt filters are specified in the request', async () => {
            await createPrebuiltRuleAssetSavedObjects(es, [
              createRuleAssetSavedObject({
                rule_id: 'prebuilt-rule-1',
                threat: generateThreatArray(1),
              }),
            ]);
            const {
              results: { created },
            } = await installPrebuiltRules(es, supertest);
            const expectedPrebuiltRule = created[0];

            const expectedCustomRule = await createRule(
              supertest,
              log,
              getCustomQueryRuleParams({ rule_id: 'rule-1', threat: generateThreatArray(2) })
            );

            const body = await getCoverageOverview(supertest);

            expect(omitInvalidMitreIds(body)).to.eql({
              coverage: {
                T001: [expectedPrebuiltRule.id],
                TA001: [expectedPrebuiltRule.id],
                'T001.001': [expectedPrebuiltRule.id],
                T002: [expectedCustomRule.id],
                TA002: [expectedCustomRule.id],
                'T002.002': [expectedCustomRule.id],
              },
              unmapped_rule_ids: [],
              rules_data: {
                [expectedPrebuiltRule.id]: {
                  activity: 'disabled',
                  name: 'Query with a rule id',
                },
                [expectedCustomRule.id]: {
                  activity: 'disabled',
                  name: 'Custom query rule',
                },
              },
            });
          });
        });
      });

      describe('invalid_mitre_ids', () => {
        it('returns empty invalid_mitre_ids when all rules have valid MITRE mappings or no mappings', async () => {
          await createRule(supertest, log, getCustomQueryRuleParams({ threat: undefined }));

          const body = await getCoverageOverview(supertest);

          expect(body.invalid_mitre_ids).to.eql({});
        });

        it('populates invalid_mitre_ids for rules with unknown tactic IDs', async () => {
          const rule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({
              threat: [
                {
                  framework: 'MITRE ATT&CK',
                  tactic: {
                    id: 'TA9999',
                    name: 'Nonexistent Tactic',
                    reference: 'https://attack.mitre.org/tactics/TA9999/',
                  },
                  technique: [],
                },
              ],
            })
          );

          const body = await getCoverageOverview(supertest);

          expect(body.invalid_mitre_ids[rule.id]).to.eql(['TA9999']);
        });

        it('populates invalid_mitre_ids for rules with unknown technique IDs', async () => {
          const rule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({
              threat: [
                {
                  framework: 'MITRE ATT&CK',
                  tactic: {
                    id: 'TA0005',
                    name: 'Defense Evasion',
                    reference: 'https://attack.mitre.org/tactics/TA0005/',
                  },
                  technique: [
                    {
                      id: 'T9999',
                      name: 'Nonexistent Technique',
                      reference: 'https://attack.mitre.org/techniques/T9999/',
                    },
                  ],
                },
              ],
            })
          );

          const body = await getCoverageOverview(supertest);

          expect(body.invalid_mitre_ids[rule.id]).to.eql(['T9999']);
        });

        it('does not add rules with valid MITRE IDs to invalid_mitre_ids', async () => {
          const rule = await createRule(
            supertest,
            log,
            getCustomQueryRuleParams({
              threat: [
                {
                  framework: 'MITRE ATT&CK',
                  tactic: {
                    id: 'TA0005',
                    name: 'Defense Evasion',
                    reference: 'https://attack.mitre.org/tactics/TA0005/',
                  },
                  technique: [
                    {
                      id: 'T1548',
                      name: 'Abuse Elevation Control Mechanism',
                      reference: 'https://attack.mitre.org/techniques/T1548/',
                    },
                  ],
                },
              ],
            })
          );

          const body = await getCoverageOverview(supertest);

          expect(body.invalid_mitre_ids[rule.id]).to.be(undefined);
        });
      });

      describe('error cases', () => {
        it('throws error when request body is not valid', async () => {
          const { body } = await supertest
            .post(RULE_MANAGEMENT_COVERAGE_OVERVIEW_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '1')
            .set('x-elastic-internal-origin', 'foo')
            .send({ filter: { source: ['give me all the rules'] } })
            .expect(400);

          expect(body).to.eql({
            statusCode: 400,
            error: 'Bad Request',
            message:
              '[request body]: Invalid value "give me all the rules" supplied to "filter,source"',
          });
        });
      });
    });
  });
};

function generateThreatArray(startIndex: number, count = 1): ThreatArray {
  const result: ThreatArray = [];

  for (let i = 0; i < count; ++i) {
    const indexName = (i + startIndex).toString().padStart(3, '0');

    result.push({
      framework: 'MITRE ATT&CK',
      tactic: {
        id: `TA${indexName}`,
        name: `Tactic ${indexName}`,
        reference: `http://some-link-${indexName}`,
      },
      technique: [
        {
          id: `T${indexName}`,
          name: `Technique ${indexName}`,
          reference: `http://some-technique-link-${indexName}`,
          subtechnique: [
            {
              id: `T${indexName}.${indexName}`,
              name: `Subtechnique ${indexName}`,
              reference: `http://some-sub-technique-link-${indexName}`,
            },
          ],
        },
      ],
    });
  }

  return result;
}
