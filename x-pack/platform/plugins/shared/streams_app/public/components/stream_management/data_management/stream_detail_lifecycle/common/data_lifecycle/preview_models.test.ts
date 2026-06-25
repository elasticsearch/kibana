/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';
import { buildIlmPreviewPhases } from './preview_models';

const ilmPhases = {
  hot: { color: '#ff0000', description: 'Hot phase' },
  warm: { color: '#ffaa00', description: 'Warm phase' },
  cold: { color: '#00aaff', description: 'Cold phase' },
  delete: { color: '#000000', description: 'Delete phase' },
};

describe('buildIlmPreviewPhases', () => {
  const policy: SerializedPolicy = {
    name: 'test-policy',
    phases: {
      hot: { min_age: '0ms', actions: {} },
      warm: { min_age: '2d', actions: {} },
      cold: { min_age: '30d', actions: {} },
      delete: { min_age: '90d', actions: {} },
    },
  };

  it('should use stream stats for hot and 0.0 B for other non-delete phases', () => {
    const phases = buildIlmPreviewPhases({
      policy,
      ilmPhases,
      stats: { size: '249.0 B', sizeBytes: 249, totalDocs: 0 },
    });

    expect(phases).toHaveLength(4);
    expect(phases[0]).toMatchObject({
      label: 'hot',
      size: '249.0 B',
      sizeInBytes: 249,
      docsCount: 0,
    });
    expect(phases[1]).toMatchObject({
      label: 'warm',
      size: '0.0 B',
      sizeInBytes: 0,
      docsCount: undefined,
    });
    expect(phases[2]).toMatchObject({
      label: 'cold',
      size: '0.0 B',
      sizeInBytes: 0,
      docsCount: undefined,
    });
    expect(phases[3]).toMatchObject({
      label: 'delete',
      isDelete: true,
      size: undefined,
      sizeInBytes: undefined,
    });
  });

  it('should default hot to 0.0 B when stats are missing', () => {
    const phases = buildIlmPreviewPhases({
      policy: {
        name: 'test-policy',
        phases: { hot: { actions: {} }, warm: { min_age: '2d', actions: {} } },
      },
      ilmPhases,
    });

    expect(phases[0]).toMatchObject({ label: 'hot', size: '0.0 B', sizeInBytes: 0 });
    expect(phases[1]).toMatchObject({ label: 'warm', size: '0.0 B', sizeInBytes: 0 });
  });
});
