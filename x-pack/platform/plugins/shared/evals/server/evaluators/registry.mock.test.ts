/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createEvaluatorRegistryMock } from './registry.mock';
import type { EvaluatorDefinition } from './types';

const definition = ({
  name = 'quality',
  version,
  origin = 'user_defined',
}: {
  name?: string;
  version: string;
  origin?: EvaluatorDefinition['origin'];
}): EvaluatorDefinition => ({
  name,
  version,
  origin,
  kind: 'llm',
  direction: 'maximize',
  description: `${name} ${version}`,
  evaluate: jest.fn(),
});

describe('createEvaluatorRegistryMock', () => {
  it('resolves the latest or requested version', async () => {
    const registry = createEvaluatorRegistryMock([
      definition({ version: '1.0.0' }),
      definition({ version: '1.2.0' }),
      definition({ version: '1.1.0' }),
    ]).asScoped({ spaceId: 'default' });

    await expect(registry.get('quality')).resolves.toEqual(
      expect.objectContaining({ version: '1.2.0' })
    );
    await expect(registry.get('quality', '1.0.0')).resolves.toEqual(
      expect.objectContaining({ version: '1.0.0' })
    );
    await expect(registry.list()).resolves.toEqual([expect.objectContaining({ version: '1.2.0' })]);
  });

  it('keeps built-ins authoritative when definitions share a name', async () => {
    const registry = createEvaluatorRegistryMock([
      definition({ version: '2.0.0' }),
      definition({ version: '1.0.0', origin: 'built_in' }),
    ]);
    const scoped = registry.asScoped({ spaceId: 'default' });

    expect(registry.isBuiltIn('quality')).toBe(true);
    await expect(scoped.get('quality')).resolves.toEqual(
      expect.objectContaining({ version: '1.0.0', origin: 'built_in' })
    );
    await expect(scoped.get('quality', '2.0.0')).resolves.toBeUndefined();
    await expect(scoped.list()).resolves.toEqual([
      expect.objectContaining({ version: '1.0.0', origin: 'built_in' }),
    ]);
  });
});
