/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createRuleMigrationsRetrieverMock } from '../../retrievers/__mocks__/mocks';
import { getPrebuiltRulesSearchTool } from './prebuilt_rules_search';

describe('getPrebuiltRulesSearchTool', () => {
  it('searches prebuilt rules via the retriever and returns a compact content projection plus the full artifact', async () => {
    const ruleMigrationsRetriever = createRuleMigrationsRetrieverMock();
    const searchResult = {
      rule_id: 'rule-1',
      name: 'Suspicious MS Office Child Process',
      description: 'Detects suspicious child processes of MS Office',
      elser_embedding: 'name - description',
      current: { id: 'current-id' },
      target: { id: 'target-id' },
    };
    (ruleMigrationsRetriever.prebuiltRules.search as jest.Mock).mockResolvedValue([searchResult]);

    const { searchPrebuiltRules } = getPrebuiltRulesSearchTool({ ruleMigrationsRetriever });
    // Invoked as a `ToolCall` (as the real `ToolNode` invokes it), so the result is a `ToolMessage`
    // with both `content` (for the model) and `artifact` (the full search results).
    const result = await searchPrebuiltRules.invoke({
      type: 'tool_call',
      id: 'call-1',
      name: 'searchPrebuiltRules',
      args: { query: 'office macro child process', technique_ids: 'T1204' },
    });

    expect(ruleMigrationsRetriever.prebuiltRules.search).toHaveBeenCalledWith(
      'office macro child process',
      'T1204'
    );
    expect(result.content).toEqual(
      JSON.stringify([
        {
          name: 'Suspicious MS Office Child Process',
          description: 'Detects suspicious child processes of MS Office',
        },
      ])
    );
    expect(result.artifact).toEqual([searchResult]);
  });

  it('defaults technique_ids to an empty string', async () => {
    const ruleMigrationsRetriever = createRuleMigrationsRetrieverMock();
    (ruleMigrationsRetriever.prebuiltRules.search as jest.Mock).mockResolvedValue([]);

    const { searchPrebuiltRules } = getPrebuiltRulesSearchTool({ ruleMigrationsRetriever });
    const result = await searchPrebuiltRules.invoke({
      type: 'tool_call',
      id: 'call-1',
      name: 'searchPrebuiltRules',
      args: { query: 'linux account creation' },
    });

    expect(ruleMigrationsRetriever.prebuiltRules.search).toHaveBeenCalledWith(
      'linux account creation',
      ''
    );
    expect(result.content).toEqual('[]');
    expect(result.artifact).toEqual([]);
  });
});
