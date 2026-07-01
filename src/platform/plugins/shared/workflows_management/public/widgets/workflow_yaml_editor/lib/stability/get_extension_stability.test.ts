/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StabilitySource } from './get_extension_stability';
import { getExtensionStability } from './get_extension_stability';

describe('getExtensionStability', () => {
  it('returns explicit beta stability', () => {
    const definition: StabilitySource = { stability: 'beta' };
    expect(getExtensionStability(definition)).toBe('beta');
  });

  it('returns undefined for stable extension definitions', () => {
    const definition: StabilitySource = { stability: 'stable' };
    expect(getExtensionStability(definition)).toBeUndefined();
  });

  it('defaults unmarked extension definitions to tech_preview', () => {
    const definition: StabilitySource = {};
    expect(getExtensionStability(definition)).toBe('tech_preview');
  });

  it('returns explicit tech_preview stability for triggers and steps', () => {
    const definition: StabilitySource = { stability: 'tech_preview' };
    expect(getExtensionStability(definition)).toBe('tech_preview');
  });
});
