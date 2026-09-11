/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PiiRegexMatch } from '../workflow_anonymization/detection/types';
import type { PiiRegexWorkerService } from '../workflow_anonymization/detection/regex_worker_service';

export const createPiiRegexWorkerServiceMock = () => {
  const mock = {
    run: jest.fn((): Promise<PiiRegexMatch[]> => Promise.resolve([])),
    stop: jest.fn().mockResolvedValue(undefined),
  };
  return mock as unknown as PiiRegexWorkerService;
};
