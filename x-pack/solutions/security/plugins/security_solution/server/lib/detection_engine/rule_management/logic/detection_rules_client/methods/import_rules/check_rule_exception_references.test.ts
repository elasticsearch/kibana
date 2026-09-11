/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getExceptionListSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_schema.mock';
import { getImportRulesSchemaMock } from '../../../../../../../../common/api/detection_engine/rule_management/mocks';
import { checkRuleExceptionReferences } from './check_rule_exception_references';

describe('checkRuleExceptionReferences', () => {
  it('returns empty array if rule has no exception list references', () => {
    const result = checkRuleExceptionReferences({
      existingLists: {},
      rule: getImportRulesSchemaMock({ exceptions_list: [] }),
    });

    expect(result).toEqual([[], []]);
  });

  it('does not modify exceptions reference array if they match existing lists', () => {
    const result = checkRuleExceptionReferences({
      existingLists: {
        'my-list': {
          ...getExceptionListSchemaMock(),
          list_id: 'my-list',
          namespace_type: 'single',
          type: 'detection',
        },
      },
      rule: getImportRulesSchemaMock({
        exceptions_list: [
          { id: '123', list_id: 'my-list', namespace_type: 'single', type: 'detection' },
        ],
      }),
    });

    expect(result).toEqual([
      [],
      [
        {
          id: '1',
          list_id: 'my-list',
          namespace_type: 'single',
          type: 'detection',
        },
      ],
    ]);
  });

  it('removes an exception reference if list not found to exist', () => {
    const result = checkRuleExceptionReferences({
      existingLists: {},
      rule: getImportRulesSchemaMock({
        exceptions_list: [
          { id: '123', list_id: 'my-list', namespace_type: 'single', type: 'detection' },
        ],
      }),
    });

    expect(result).toEqual([
      [
        {
          error: {
            ruleId: 'rule-1',
            message:
              'Rule with rule_id: "rule-1" references a non existent exception list of list_id: "my-list". Reference has been removed.',
            type: 'unknown',
          },
        },
      ],
      [],
    ]);
  });

  it('removes an exception reference if list namespace_type does not match', () => {
    const result = checkRuleExceptionReferences({
      existingLists: {
        'my-list': {
          ...getExceptionListSchemaMock(),
          list_id: 'my-list',
          namespace_type: 'agnostic',
          type: 'detection',
        },
      },
      rule: getImportRulesSchemaMock({
        exceptions_list: [
          { id: '123', list_id: 'my-list', namespace_type: 'single', type: 'detection' },
        ],
      }),
    });
    expect(result).toEqual([
      [
        {
          error: {
            ruleId: 'rule-1',
            message:
              'Rule with rule_id: "rule-1" references a non existent exception list of list_id: "my-list". Reference has been removed.',
            type: 'unknown',
          },
        },
      ],
      [],
    ]);
  });

  it('removes an exception reference if list type does not match', () => {
    const result = checkRuleExceptionReferences({
      existingLists: {
        'my-list': {
          ...getExceptionListSchemaMock(),
          list_id: 'my-list',
          namespace_type: 'single',
          type: 'endpoint',
        },
      },
      rule: getImportRulesSchemaMock({
        exceptions_list: [
          { id: '123', list_id: 'my-list', namespace_type: 'single', type: 'detection' },
        ],
      }),
    });
    expect(result).toEqual([
      [
        {
          error: {
            message:
              'Rule with rule_id: "rule-1" references a non existent exception list of list_id: "my-list". Reference has been removed.',
            ruleId: 'rule-1',
            type: 'unknown',
          },
        },
      ],
      [],
    ]);
  });
});
