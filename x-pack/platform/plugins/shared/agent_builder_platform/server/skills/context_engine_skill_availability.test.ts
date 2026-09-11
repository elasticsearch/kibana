/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AvailabilityContext } from '@kbn/agent-builder-server';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import { contextEngineSkillAvailability } from './context_engine_skill_availability';

const contextWith = (get: jest.Mock): AvailabilityContext =>
  ({ uiSettings: { get }, request: {}, spaceId: 'default' } as unknown as AvailabilityContext);

describe('contextEngineSkillAvailability', () => {
  it('caches per space', () => {
    expect(contextEngineSkillAvailability.cacheMode).toBe('space');
  });

  it('is available when Context Engine is enabled', async () => {
    const get = jest.fn().mockResolvedValue(true);

    await expect(contextEngineSkillAvailability.handler(contextWith(get))).resolves.toEqual({
      status: 'available',
    });
    expect(get).toHaveBeenCalledWith(CONTEXT_ENGINE_ENABLED_SETTING_ID);
  });

  it('is unavailable when Context Engine is disabled', async () => {
    const get = jest.fn().mockResolvedValue(false);

    await expect(contextEngineSkillAvailability.handler(contextWith(get))).resolves.toEqual({
      status: 'unavailable',
      reason: 'Context Engine is disabled in this space.',
    });
  });

  it('fails closed when the setting cannot be read', async () => {
    const get = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(contextEngineSkillAvailability.handler(contextWith(get))).resolves.toMatchObject({
      status: 'unavailable',
    });
  });
});
