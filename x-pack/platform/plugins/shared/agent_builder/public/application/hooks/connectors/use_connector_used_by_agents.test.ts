/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useConnectorUsedByAgents } from './use_connector_used_by_agents';

jest.mock('../agents/use_agents');

const { useAgentBuilderAgents } = jest.requireMock('../agents/use_agents');

const agent = (id: string, connectorIds: string[] | undefined | null) => ({
  id,
  name: `Agent ${id}`,
  configuration: { connector_ids: connectorIds },
});

describe('useConnectorUsedByAgents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setup = (
    connectorId: string,
    currentAgentId: string,
    agents: ReturnType<typeof agent>[]
  ) => {
    useAgentBuilderAgents.mockReturnValue({ agents, isLoading: false, error: null });
    return renderHook(() => useConnectorUsedByAgents({ connectorId, currentAgentId }));
  };

  it('excludes the current agent from results', () => {
    const { result } = setup('c1', 'agent-1', [agent('agent-1', ['c1']), agent('agent-2', ['c1'])]);
    expect(result.current.usedByAgents.map((a) => a.id)).toEqual(['agent-2']);
  });

  it('includes agents with connector_ids === undefined (means all connectors)', () => {
    const { result } = setup('c1', 'agent-1', [
      agent('agent-1', ['c1']),
      agent('agent-2', undefined),
    ]);
    expect(result.current.usedByAgents.map((a) => a.id)).toEqual(['agent-2']);
  });

  it('includes agents with connector_ids === null (means all connectors)', () => {
    const { result } = setup('c1', 'agent-1', [agent('agent-1', ['c1']), agent('agent-2', null)]);
    expect(result.current.usedByAgents.map((a) => a.id)).toEqual(['agent-2']);
  });

  it('excludes agents whose connector_ids list does not include the connector', () => {
    const { result } = setup('c1', 'agent-1', [
      agent('agent-1', ['c1']),
      agent('agent-2', ['c2', 'c3']),
    ]);
    expect(result.current.usedByAgents).toEqual([]);
  });

  it('returns empty array when no other agents use the connector', () => {
    const { result } = setup('c1', 'agent-1', [
      agent('agent-1', ['c1']),
      agent('agent-2', ['c2']),
      agent('agent-3', []),
    ]);
    expect(result.current.usedByAgents).toEqual([]);
  });

  it('returns multiple matching agents', () => {
    const { result } = setup('c1', 'agent-1', [
      agent('agent-1', ['c1']),
      agent('agent-2', ['c1', 'c2']),
      agent('agent-3', undefined),
      agent('agent-4', ['c2']),
    ]);
    expect(result.current.usedByAgents.map((a) => a.id)).toEqual(['agent-2', 'agent-3']);
  });

  it('passes through isLoading and error from useAgentBuilderAgents', () => {
    const error = new Error('fetch failed');
    useAgentBuilderAgents.mockReturnValue({ agents: [], isLoading: true, error });
    const { result } = renderHook(() =>
      useConnectorUsedByAgents({ connectorId: 'c1', currentAgentId: 'agent-1' })
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe(error);
  });
});
