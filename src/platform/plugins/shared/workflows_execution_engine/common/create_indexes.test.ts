/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createIndexes } from './create_indexes';
import {
  WORKFLOWS_EXECUTIONS_INDEX,
  WORKFLOWS_STEP_EXECUTIONS_INDEX,
  WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS,
} from './mappings';

jest.mock('./create_index', () => ({
  createIndexWithMappings: jest.fn().mockResolvedValue(undefined),
  createOrUpdateIndex: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createIndexWithMappings, createOrUpdateIndex } = require('./create_index');

describe('createIndexes', () => {
  const esClient = {} as any;
  const logger = { debug: jest.fn(), error: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates all workflow indices via createOrUpdateIndex', async () => {
    await createIndexes({ esClient, logger });

    expect(createOrUpdateIndex).toHaveBeenCalledTimes(2);
    expect(createIndexWithMappings).not.toHaveBeenCalled();

    expect(createOrUpdateIndex).toHaveBeenCalledWith(
      expect.objectContaining({ indexName: WORKFLOWS_EXECUTIONS_INDEX })
    );
    expect(createOrUpdateIndex).toHaveBeenCalledWith(
      expect.objectContaining({ indexName: WORKFLOWS_STEP_EXECUTIONS_INDEX })
    );
  });

  it('passes esClient and logger to both calls', async () => {
    await createIndexes({ esClient, logger });

    expect(createOrUpdateIndex).toHaveBeenCalledWith(expect.objectContaining({ esClient, logger }));
    expect(createOrUpdateIndex).toHaveBeenCalledWith(expect.objectContaining({ esClient, logger }));
  });

  it('forwards WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS to the step-executions index unchanged', async () => {
    await createIndexes({ esClient, logger });

    const stepCall = createOrUpdateIndex.mock.calls.find(
      ([arg]: [{ indexName: string }]) => arg.indexName === WORKFLOWS_STEP_EXECUTIONS_INDEX
    );
    expect(stepCall).toBeDefined();
    const [{ mappings }] = stepCall;
    expect(mappings).toBe(WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS);
  });
});
