/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  collectExpectedToolIds,
  findUnregisteredToolIds,
  findUnattachedToolIds,
  selectListAssertableBuiltins,
} from './tool_registration_check';
import type { KbnClient } from '@kbn/kbn-client';

describe('collectExpectedToolIds', () => {
  it('collects, dedupes, and sorts expectedTools across examples', () => {
    const dataset = [
      { metadata: { expectedTools: ['virustotal_lookup', 'platform.core.search'] } },
      { metadata: { expectedTools: ['on_call_lookup', 'virustotal_lookup'] } },
      { metadata: {} },
    ];
    expect(collectExpectedToolIds(dataset)).toEqual([
      'on_call_lookup',
      'platform.core.search',
      'virustotal_lookup',
    ]);
  });
});

describe('findUnregisteredToolIds', () => {
  const makeKbnClient = (tools: Array<{ id: string }>) =>
    ({
      request: jest.fn().mockResolvedValue({ data: { results: tools } }),
    } as unknown as KbnClient);

  it('returns tool ids not present in the registry', async () => {
    const kbnClient = makeKbnClient([{ id: 'virustotal_lookup' }]);
    await expect(
      findUnregisteredToolIds(kbnClient, ['virustotal_lookup', 'on_call_lookup'])
    ).resolves.toEqual(['on_call_lookup']);
  });

  it('lists tools with the date-formatted public API version (not "1")', async () => {
    const kbnClient = makeKbnClient([]);
    await findUnregisteredToolIds(kbnClient, ['virustotal_lookup']);
    const request = (kbnClient as unknown as { request: jest.Mock }).request;
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/agent_builder/tools',
        headers: expect.objectContaining({
          // 400 "Invalid version" regression: the public tools API expects a
          // YYYY-MM-DD version string, like the seed client.
          'elastic-api-version': '2023-10-31',
        }),
      })
    );
  });

  it('surfaces listing failures instead of silently passing the check', async () => {
    const kbnClient = {
      request: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as KbnClient;
    await expect(findUnregisteredToolIds(kbnClient, ['virustotal_lookup'])).rejects.toThrow(
      'tool-registration pre-flight'
    );
  });

  it('flags availability-gated built-ins the tools list does not expose', async () => {
    // Regression shape of the security.entity_risk_score bug: the tool is a
    // registered built-in, but its availability handler (skills flag on)
    // keeps it out of the public tools list, so the model can never call it.
    const kbnClient = makeKbnClient([
      { id: 'security.get_entity' },
      { id: 'platform.core.generate_esql' },
    ]);
    await expect(
      findUnregisteredToolIds(kbnClient, [
        'security.get_entity',
        'platform.core.generate_esql',
        'security.entity_risk_score',
      ])
    ).resolves.toEqual(['security.entity_risk_score']);
  });

  it('exempts conversation-scoped built-ins from the list assertion', () => {
    // attachments.* are injected into an agent run at execution time and never
    // appear in the registry tools list — flagging them as availability-gated
    // would fail every run spuriously (caught live on the first two-model
    // gate run, 2026-08-23).
    expect(
      selectListAssertableBuiltins(['attachments.read', 'security.get_entity', 'virustotal_lookup'])
    ).toEqual(['security.get_entity']);
  });
});

describe('findUnattachedToolIds', () => {
  const makeAgentClient = (tools: Array<{ tool_ids?: string[] }>) =>
    ({
      request: jest.fn().mockResolvedValue({ data: { configuration: { tools } } }),
    } as unknown as KbnClient);

  it('flags a registered tool that is not attached to the agent', async () => {
    // The 2026-08-22 defect: both tools existed in the registry, but the
    // default agent shipped `tools: []`, so the model never saw them and
    // ExpectedToolCalled scored 0 across every workflow-execution run.
    const kbnClient = makeAgentClient([]);
    await expect(
      findUnattachedToolIds(kbnClient, ['virustotal_lookup', 'on_call_lookup'])
    ).resolves.toEqual(['virustotal_lookup', 'on_call_lookup']);
  });

  it('returns nothing when every tool is attached', async () => {
    const kbnClient = makeAgentClient([{ tool_ids: ['virustotal_lookup', 'on_call_lookup'] }]);
    await expect(
      findUnattachedToolIds(kbnClient, ['virustotal_lookup', 'on_call_lookup'])
    ).resolves.toEqual([]);
  });

  it('flattens tool_ids across multiple selection entries', async () => {
    const kbnClient = makeAgentClient([
      { tool_ids: ['virustotal_lookup'] },
      { tool_ids: ['on_call_lookup'] },
    ]);
    await expect(
      findUnattachedToolIds(kbnClient, ['virustotal_lookup', 'on_call_lookup'])
    ).resolves.toEqual([]);
  });
});
