/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EFFECTIVE_BUILD_ID_METADATA_KEY } from './constants';
import { getEffectiveTargetBuildId } from './get_effective_target_build_id';

describe('getEffectiveTargetBuildId', () => {
  it('prefers kibana-effective-build-id metadata', () => {
    const buildId = getEffectiveTargetBuildId({
      getMetadata: (key) =>
        key === EFFECTIVE_BUILD_ID_METADATA_KEY ? 'effective-build-123' : null,
      buildkiteBuildId: 'current-build-456',
    });

    expect(buildId).toBe('effective-build-123');
  });

  it('falls back to BUILDKITE_BUILD_ID when metadata is missing', () => {
    const buildId = getEffectiveTargetBuildId({
      getMetadata: () => null,
      buildkiteBuildId: 'current-build-456',
    });

    expect(buildId).toBe('current-build-456');
  });

  it('throws when neither metadata nor build id is available', () => {
    expect(() =>
      getEffectiveTargetBuildId({
        getMetadata: () => null,
      })
    ).toThrow(/Could not resolve target build id/);
  });
});
