/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleMigrationsRetriever } from '..';

export const createRuleMigrationsRetrieverMock = () => {
  const mockResources = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getResources: jest.fn().mockResolvedValue({}),
  };

  const mockIntegrations = {
    populateIndex: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
  };

  const mockPrebuiltRules = {
    populateIndex: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
  };

  const mockRetriever = {
    resources: mockResources,
    integrations: mockIntegrations,
    prebuiltRules: mockPrebuiltRules,
    initialize: jest.fn().mockResolvedValue(undefined),
  };

  // RuleMigrationsRetriever has a private method, so a plain object literal can never structurally
  // satisfy it — cast through `unknown`, then intersect back with the mock's own literal type so
  // callers still get `resources`/`integrations`/`prebuiltRules`/`initialize` typed as jest mocks
  // (e.g. `.mockResolvedValue(...)`) rather than losing that to `RuleMigrationsRetriever`'s real
  // (unmocked) method signatures.
  return mockRetriever as unknown as RuleMigrationsRetriever & typeof mockRetriever;
};

export const MockRuleMigrationsRetriever = jest
  .fn()
  .mockImplementation(() => createRuleMigrationsRetrieverMock());
