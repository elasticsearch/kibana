/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Rule } from '@kbn/alerting-plugin/common';
import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';
import { findRules } from '../../../logic/search/find_rules';
import { handleCoverageOverviewRequest } from './handle_coverage_overview_request';

jest.mock('../../../logic/search/find_rules');

const VALID_TACTIC_ID = 'TA0005';
const VALID_TECHNIQUE_ID = 'T1548';
const BOGUS_TACTIC_ID = 'TA9999';
const BOGUS_TECHNIQUE_ID = 'T9999';

describe('handleCoverageOverviewRequest', () => {
  beforeEach(() => {
    (findRules as jest.Mock).mockReset();
  });

  it('does not request more than 10k rules', async () => {
    (findRules as jest.Mock)
      .mockResolvedValueOnce({
        total: 25555,
        page: 1,
        perPage: 10000,
        data: generateRules(10000),
      })
      .mockResolvedValueOnce({
        total: 25555,
        page: 2,
        perPage: 10000,
        data: generateRules(10000),
      })
      .mockResolvedValueOnce({
        total: 25555,
        page: 3,
        perPage: 10000,
        data: generateRules(10000),
      });

    await handleCoverageOverviewRequest({
      params: {},
      deps: {
        rulesClient: rulesClientMock.create(),
      },
    });

    expect(findRules).toHaveBeenCalledTimes(1);
    expect(findRules).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        perPage: 10000,
      })
    );
  });

  it('populates invalid_mitre_ids for rules with unknown MITRE IDs', async () => {
    const ruleWithBogusIds: Rule = {
      id: 'rule-bogus-id',
      name: 'Rule with invalid MITRE',
      enabled: true,
      params: {
        threat: [
          {
            framework: 'MITRE ATT&CK',
            tactic: {
              id: BOGUS_TACTIC_ID,
              name: 'Fake Tactic',
              reference: 'https://attack.mitre.org/tactics/TA9999/',
            },
            technique: [
              {
                id: BOGUS_TECHNIQUE_ID,
                name: 'Fake Technique',
                reference: 'https://attack.mitre.org/techniques/T9999/',
              },
            ],
          },
        ],
      },
    } as unknown as Rule;

    (findRules as jest.Mock).mockResolvedValueOnce({
      total: 1,
      page: 1,
      perPage: 10000,
      data: [ruleWithBogusIds],
    });

    const result = await handleCoverageOverviewRequest({
      params: {},
      deps: { rulesClient: rulesClientMock.create() },
    });

    expect(result.invalid_mitre_ids['rule-bogus-id']).toEqual(
      expect.arrayContaining([BOGUS_TACTIC_ID, BOGUS_TECHNIQUE_ID])
    );
  });

  it('does not add rules with valid MITRE IDs to invalid_mitre_ids', async () => {
    const ruleWithValidIds: Rule = {
      id: 'rule-valid-id',
      name: 'Rule with valid MITRE',
      enabled: true,
      params: {
        threat: [
          {
            framework: 'MITRE ATT&CK',
            tactic: {
              id: VALID_TACTIC_ID,
              name: 'Defense Evasion',
              reference: 'https://attack.mitre.org/tactics/TA0005/',
            },
            technique: [
              {
                id: VALID_TECHNIQUE_ID,
                name: 'Abuse Elevation Control Mechanism',
                reference: 'https://attack.mitre.org/techniques/T1548/',
              },
            ],
          },
        ],
      },
    } as unknown as Rule;

    (findRules as jest.Mock).mockResolvedValueOnce({
      total: 1,
      page: 1,
      perPage: 10000,
      data: [ruleWithValidIds],
    });

    const result = await handleCoverageOverviewRequest({
      params: {},
      deps: { rulesClient: rulesClientMock.create() },
    });

    expect(result.invalid_mitre_ids['rule-valid-id']).toBeUndefined();
  });

  it('adds rules with no MITRE threat to unmapped_rule_ids but not invalid_mitre_ids', async () => {
    const unmappedRule: Rule = {
      id: 'rule-unmapped-id',
      name: 'Unmapped Rule',
      enabled: false,
      params: {},
    } as unknown as Rule;

    (findRules as jest.Mock).mockResolvedValueOnce({
      total: 1,
      page: 1,
      perPage: 10000,
      data: [unmappedRule],
    });

    const result = await handleCoverageOverviewRequest({
      params: {},
      deps: { rulesClient: rulesClientMock.create() },
    });

    expect(result.unmapped_rule_ids).toContain('rule-unmapped-id');
    expect(result.invalid_mitre_ids['rule-unmapped-id']).toBeUndefined();
  });
});

function generateRules(count: number): Rule[] {
  const result: Rule[] = [];

  for (let i = 1; i <= count; ++i) {
    result.push({
      name: `rule ${i}`,
      enabled: false,
      params: {},
    } as Rule);
  }

  return result;
}
