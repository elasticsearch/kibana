/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SyntheticsServerSetup } from '../../types';
import { getAgentInfo } from './get_agent_info';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

interface FakeAgent {
  id?: string;
  last_checkin?: string;
  local_metadata?: { host?: { memory?: number } };
}

const agent = (over: FakeAgent = {}): FakeAgent => ({
  id: 'agent-1',
  last_checkin: '2026-08-01T00:00:00.000Z',
  local_metadata: { host: { memory: 2 * GIB } },
  ...over,
});

/** listAgents that serves the given pages by 1-based `page`, reporting `total`. */
const pagedListAgents = (pages: FakeAgent[][], total?: number) =>
  jest.fn(async ({ page }: { page: number }) => ({
    agents: pages[page - 1] ?? [],
    total: total ?? pages.flat().length,
  }));

const makeServer = (listAgents: jest.Mock): SyntheticsServerSetup =>
  ({
    fleet: { agentService: { asInternalUser: { listAgents } } },
  } as unknown as SyntheticsServerSetup);

const openSignal = () => new AbortController().signal;

const getInfo = (listAgents: jest.Mock, signal: AbortSignal = openSignal()) =>
  getAgentInfo(makeServer(listAgents), 'policy-1', signal);

describe('getAgentInfo', () => {
  it('maps enrolled agents by agent.id with check-in (epoch ms) and RAM (MiB)', async () => {
    const listAgents = pagedListAgents([
      [
        agent({ id: 'a', last_checkin: '2026-08-01T00:00:00.000Z', local_metadata: {} }),
        agent({ id: 'b', last_checkin: '2026-08-01T00:01:00.000Z' }),
      ],
    ]);

    const info = await getInfo(listAgents);

    expect(info.size).toBe(2);
    expect(info.get('a')).toEqual({
      lastCheckin: Date.parse('2026-08-01T00:00:00.000Z'),
      memoryMib: null,
    });
    expect(info.get('b')).toEqual({
      lastCheckin: Date.parse('2026-08-01T00:01:00.000Z'),
      memoryMib: 2048,
    });
  });

  it('converts host.memory bytes to MiB, rounding to the nearest MiB', async () => {
    const listAgents = pagedListAgents([
      [
        agent({ id: 'round-down', local_metadata: { host: { memory: 100 * MIB + 0.4 * MIB } } }),
        agent({ id: 'round-up', local_metadata: { host: { memory: 100 * MIB + 0.6 * MIB } } }),
      ],
    ]);

    const info = await getInfo(listAgents);

    expect(info.get('round-down')?.memoryMib).toBe(100);
    expect(info.get('round-up')?.memoryMib).toBe(101);
  });

  it('treats absent, zero, or negative host.memory as unknown capacity (null)', async () => {
    const listAgents = pagedListAgents([
      [
        agent({ id: 'absent', local_metadata: { host: {} } }),
        agent({ id: 'no-host', local_metadata: {} }),
        agent({ id: 'zero', local_metadata: { host: { memory: 0 } } }),
        agent({ id: 'negative', local_metadata: { host: { memory: -1 } } }),
      ],
    ]);

    const info = await getInfo(listAgents);

    expect(info.get('absent')?.memoryMib).toBeNull();
    expect(info.get('no-host')?.memoryMib).toBeNull();
    expect(info.get('zero')?.memoryMib).toBeNull();
    expect(info.get('negative')?.memoryMib).toBeNull();
  });

  it('skips agents with a missing or EQL-unsafe id (cannot be a shard target)', async () => {
    const listAgents = pagedListAgents([
      [
        agent({ id: undefined }),
        agent({ id: '' }),
        agent({ id: "has'quote" }),
        agent({ id: 'has\\backslash' }),
        agent({ id: 'good' }),
      ],
    ]);

    const info = await getInfo(listAgents);

    expect([...info.keys()]).toEqual(['good']);
  });

  it('skips agents without a parseable last_checkin (treated as never-online)', async () => {
    const listAgents = pagedListAgents([
      [
        agent({ id: 'no-checkin', last_checkin: undefined }),
        agent({ id: 'bad-checkin', last_checkin: 'not-a-date' }),
        agent({ id: 'ok', last_checkin: '2026-08-01T00:00:00.000Z' }),
      ],
    ]);

    const info = await getInfo(listAgents);

    expect([...info.keys()]).toEqual(['ok']);
  });

  it('paginates past a single page of 1000 agents', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => agent({ id: `a${i}` }));
    const page2 = Array.from({ length: 500 }, (_, i) => agent({ id: `b${i}` }));
    const listAgents = pagedListAgents([page1, page2], 1500);

    const info = await getInfo(listAgents);

    expect(info.size).toBe(1500);
    expect(listAgents).toHaveBeenCalledTimes(2);
    expect(listAgents).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showInactive: false,
        perPage: 1000,
        page: 2,
        kuery: 'policy_id:"policy-1"',
        includeStatusRuntimeField: false,
      })
    );
  });

  it('stops on an empty page even when `total` claims more (stale-total guard)', async () => {
    const listAgents = pagedListAgents([[]], 5);

    const info = await getInfo(listAgents);

    expect(info.size).toBe(0);
    expect(listAgents).toHaveBeenCalledTimes(1);
  });

  it('caps pagination at MAX_PAGES (10) so a misbehaving paginator cannot spin', async () => {
    // Always a full page with a total far larger than we will ever fetch.
    const listAgents = jest.fn(async ({ page }: { page: number }) => ({
      agents: Array.from({ length: 1000 }, (_, i) => agent({ id: `p${page}-a${i}` })),
      total: 1_000_000,
    }));

    const info = await getInfo(listAgents);

    expect(listAgents).toHaveBeenCalledTimes(10);
    expect(info.size).toBe(10_000);
  });

  it('stops paginating when the task signal aborts', async () => {
    const abortController = new AbortController();
    const listAgents = jest.fn(async ({ page }: { page: number }) => {
      if (page === 1) {
        abortController.abort();
      }
      return {
        agents: Array.from({ length: 1000 }, (_, i) => agent({ id: `p${page}-a${i}` })),
        total: 3000,
      };
    });

    await expect(getInfo(listAgents, abortController.signal)).rejects.toThrow();
    expect(listAgents).toHaveBeenCalledTimes(1);
  });
});
