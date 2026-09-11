/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rulesClientMock } from '@kbn/alerting-plugin/server/mocks';
import { getRuleMock } from '../../../../../routes/__mocks__/request_responses';
import { getQueryRuleParams } from '../../../../../rule_schema/mocks';
import { RULE_IMPORT_BULK_CREATE_BATCH_SIZE } from '../../../../api/constants';
import { findInstalledRulesByRuleIds } from './find_installed_rules_by_rule_ids';

/**
 * ES's `indices.query.bool.max_clause_count` defaults to 1024 on low-heap
 * hosts. This helper builds a KQL OR-list, so if the outer batch size ever
 * grows past that floor ES will start rejecting import batches with
 * "too many clauses". Guard against a future bump.
 */
const ES_MIN_MAX_CLAUSE_COUNT = 1024;

describe('findInstalledRulesByRuleIds', () => {
  let rulesClient: ReturnType<typeof rulesClientMock.create>;

  const noInstalled = () => {
    rulesClient.find.mockResolvedValue({ data: [], page: 1, perPage: 100, total: 0 });
  };

  const withInstalled = (ruleId: string) => {
    rulesClient.find.mockResolvedValue({
      data: [getRuleMock({ ...getQueryRuleParams(), ruleId })],
      page: 1,
      perPage: 100,
      total: 1,
    });
  };

  beforeEach(() => {
    rulesClient = rulesClientMock.create();
    noInstalled();
  });

  it('returns an empty map and skips ES for an empty ruleIds array', async () => {
    const result = await findInstalledRulesByRuleIds({ rulesClient, ruleIds: [] });
    expect(rulesClient.find).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('KQL filter wraps and OR-joins rule_ids', async () => {
    await findInstalledRulesByRuleIds({ rulesClient, ruleIds: ['id-a', 'id-b'] });

    const opts = rulesClient.find.mock.calls[0][0]?.options ?? {};
    expect(opts.filter).toContain('alert.attributes.params.ruleId: ("id-a" OR "id-b")');
  });

  it('a full outer batch stays under ES max_clause_count', async () => {
    const ruleIds = Array.from(
      { length: RULE_IMPORT_BULK_CREATE_BATCH_SIZE },
      (_, i) => `rule-${i}`
    );

    await findInstalledRulesByRuleIds({ rulesClient, ruleIds });

    const opts = rulesClient.find.mock.calls[0][0]?.options ?? {};
    const ruleIdGroup = opts.filter?.match(/alert\.attributes\.params\.ruleId: \(([^)]*)\)/)?.[1];
    expect(ruleIdGroup).toBeDefined();
    const ruleIdClauseCount = (ruleIdGroup?.match(/ OR /g) ?? []).length + 1;
    expect(ruleIdClauseCount).toBe(RULE_IMPORT_BULK_CREATE_BATCH_SIZE);
    expect(ruleIdClauseCount).toBeLessThanOrEqual(ES_MIN_MAX_CLAUSE_COUNT);
  });

  describe.each([
    ['embedded double-quote', 'foo"bar'],
    ['embedded backslash', 'foo\\bar'],
    ['parentheses', 'foo(bar)baz'],
    ['asterisk', 'foo*bar'],
    ['angle brackets', 'a<b>c'],
    ['and keyword', 'foo and bar'],
    ['or keyword', 'foo or bar'],
    ['not keyword', 'foo not bar'],
    ['a mix of everything', 'a"b\\c(d)*e<f>g and h'],
  ])('adversarial rule_id: %s (%p)', (_desc, ruleId) => {
    it('escapes `\\` and `"` in the KQL filter and returns the matching installed rule', async () => {
      withInstalled(ruleId);

      const result = await findInstalledRulesByRuleIds({ rulesClient, ruleIds: [ruleId] });

      expect(rulesClient.find).toHaveBeenCalledTimes(1);
      const opts = rulesClient.find.mock.calls[0][0]?.options ?? {};
      const filter = opts.filter ?? '';

      const expectedLiteral = `"${ruleId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      expect(filter).toContain(`alert.attributes.params.ruleId: (${expectedLiteral})`);

      // The quoted literal starts at exactly one `"`, so the number of raw
      // unescaped quotes inside it must be 2 (open + close). More would mean
      // the value broke out of the literal.
      const unescapedQuotes = filter.match(/(^|[^\\])"/g) ?? [];
      expect(unescapedQuotes.length).toBeGreaterThanOrEqual(2);

      expect(result[ruleId]?.rule_id).toBe(ruleId);
    });
  });
});
