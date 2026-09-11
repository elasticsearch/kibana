/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import { agentBuilderDefaultAiIndexId } from '@kbn/agent-builder-common';
import { smlIndexName } from '@kbn/agent-builder-sml-plugin/server';
import { resolveAiIndexCatalog } from './resolve_ai_index_catalog';

const request = {} as KibanaRequest;

describe('resolveAiIndexCatalog', () => {
  it('returns an empty catalog for an agent with no AI Indices', async () => {
    expect(await resolveAiIndexCatalog({ aiIndices: [], request })).toEqual([]);
  });

  it('describes default AI Indices from the static map when no resolver is registered', async () => {
    const catalog = await resolveAiIndexCatalog({
      aiIndices: [agentBuilderDefaultAiIndexId],
      request,
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toEqual({
      id: agentBuilderDefaultAiIndexId,
      esqlTarget: smlIndexName,
      description: expect.any(String),
    });
  });

  it('describes custom AI Indices through the resolver', async () => {
    const resolver = jest
      .fn()
      .mockResolvedValue([
        { id: 'my-custom', esqlTarget: 'ai-index-idx-custom', description: 'Support tickets.' },
      ]);

    const catalog = await resolveAiIndexCatalog({ aiIndices: ['my-custom'], request, resolver });

    expect(catalog).toEqual([
      { id: 'my-custom', esqlTarget: 'ai-index-idx-custom', description: 'Support tickets.' },
    ]);
  });

  it('resolves default ids through the resolver, so the prompt agrees with the list', async () => {
    const resolver = jest.fn().mockResolvedValue([
      {
        id: agentBuilderDefaultAiIndexId,
        esqlTarget: smlIndexName,
        description: 'From registry',
      },
    ]);

    const catalog = await resolveAiIndexCatalog({
      aiIndices: [agentBuilderDefaultAiIndexId],
      request,
      resolver,
    });

    expect(catalog).toEqual([
      { id: agentBuilderDefaultAiIndexId, esqlTarget: smlIndexName, description: 'From registry' },
    ]);
  });

  it('renders a default the resolver omits bare, dropping it from the prompt', async () => {
    const resolver = jest.fn().mockResolvedValue([]);

    const catalog = await resolveAiIndexCatalog({
      aiIndices: [agentBuilderDefaultAiIndexId],
      request,
      resolver,
    });

    expect(catalog).toEqual([{ id: agentBuilderDefaultAiIndexId }]);
  });

  it('calls the resolver once, with every id and the request', async () => {
    const resolver = jest.fn().mockResolvedValue([]);

    await resolveAiIndexCatalog({
      aiIndices: [agentBuilderDefaultAiIndexId, 'custom-a', 'custom-b'],
      request,
      resolver,
    });

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith({
      ids: [agentBuilderDefaultAiIndexId, 'custom-a', 'custom-b'],
      request,
    });
  });

  it('does not call the resolver for an agent with no AI Indices', async () => {
    const resolver = jest.fn();

    expect(await resolveAiIndexCatalog({ aiIndices: [], request, resolver })).toEqual([]);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('degrades ids the resolver does not know to entries with no ES|QL target', async () => {
    const resolver = jest.fn().mockResolvedValue([]);

    const catalog = await resolveAiIndexCatalog({
      aiIndices: ['deleted-index'],
      request,
      resolver,
    });

    expect(catalog).toEqual([{ id: 'deleted-index' }]);
  });

  it('degrades all non-default ids to entries with no ES|QL target when no resolver is registered', async () => {
    const catalog = await resolveAiIndexCatalog({
      aiIndices: [agentBuilderDefaultAiIndexId, 'my-custom'],
      request,
    });

    expect(catalog).toEqual([
      expect.objectContaining({ id: agentBuilderDefaultAiIndexId, esqlTarget: smlIndexName }),
      { id: 'my-custom' },
    ]);
  });

  it('does not treat inherited object members as default AI Indices', async () => {
    const resolver = jest.fn().mockResolvedValue([]);

    const catalog = await resolveAiIndexCatalog({
      aiIndices: ['toString', 'constructor'],
      request,
      resolver,
    });

    expect(resolver).toHaveBeenCalledWith({ ids: ['toString', 'constructor'], request });
    expect(catalog).toEqual([{ id: 'toString' }, { id: 'constructor' }]);
  });

  it('preserves config order and dedupes repeated ids', async () => {
    const resolver = jest.fn().mockResolvedValue([
      { id: 'custom-b', esqlTarget: 'idx-b' },
      { id: 'custom-a', esqlTarget: 'idx-a' },
    ]);

    const catalog = await resolveAiIndexCatalog({
      aiIndices: ['custom-b', agentBuilderDefaultAiIndexId, 'custom-a', 'custom-b'],
      request,
      resolver,
    });

    expect(catalog.map(({ id }) => id)).toEqual([
      'custom-b',
      agentBuilderDefaultAiIndexId,
      'custom-a',
    ]);
  });

  it('falls back to the static default and bare ids when the resolver fails', async () => {
    const resolver = jest.fn().mockRejectedValue(new Error('boom'));
    const logger = { warn: jest.fn() } as unknown as Logger;

    const catalog = await resolveAiIndexCatalog({
      aiIndices: [agentBuilderDefaultAiIndexId, 'my-custom'],
      request,
      resolver,
      logger,
    });

    expect(catalog).toEqual([
      expect.objectContaining({ id: agentBuilderDefaultAiIndexId, esqlTarget: smlIndexName }),
      { id: 'my-custom' },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('swallows non-Error resolver failures without logging undefined', async () => {
    const resolver = jest.fn().mockRejectedValue('string failure');
    const logger = { warn: jest.fn() } as unknown as Logger;

    const catalog = await resolveAiIndexCatalog({
      aiIndices: ['my-custom'],
      request,
      resolver,
      logger,
    });

    expect(catalog).toEqual([{ id: 'my-custom' }]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('string failure'));
  });
});
