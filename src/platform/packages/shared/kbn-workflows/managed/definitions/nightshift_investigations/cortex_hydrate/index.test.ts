/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW, NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW_ID } from '.';

const workflow = parse(NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW.yaml) as {
  name: string;
  steps: Array<{ name: string; type?: string; if?: string }>;
};

describe('cortex hydrate workflow', () => {
  it('is a beforeAgent workflow that hydrates the sandbox wiki', () => {
    expect(NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW.id).toBe(NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW_ID);
    expect(workflow.name).toBe('Cortex Hydrate');
    expect(workflow.steps).toEqual([
      expect.objectContaining({
        name: 'hydrate_cortex',
        type: 'nightshift.cortexHydrate',
        if: '${{ inputs.conversation_id != null }}',
      }),
    ]);
  });
});
