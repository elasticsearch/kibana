/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockCasesContext } from './mocks/mock_cases_context';
import type { CasesPublicStart } from './types';

const apiMock: jest.Mocked<CasesPublicStart['api']> = {
  getRelatedCases: jest.fn(),
  cases: {
    find: jest.fn(),
    getCasesMetrics: jest.fn(),
    bulkGet: jest.fn(),
  },
};

const uiMock: jest.Mocked<CasesPublicStart['ui']> = {
  getCases: jest.fn(),
  getCasesContext: jest.fn().mockImplementation(() => mockCasesContext),
  getAllCasesSelectorModal: jest.fn(),
  getRecentCases: jest.fn(),
};

export const openAddToExistingCaseModalMock = jest.fn();
export const openAddToNewCaseFlyoutMock = jest.fn();
export const isAddToCaseOpenMock = jest.fn();

const hooksMock: jest.Mocked<CasesPublicStart['hooks']> = {
  useCasesAddToNewCaseFlyout: jest.fn().mockImplementation(() => ({
    open: openAddToNewCaseFlyoutMock,
  })),
  useCasesAddToExistingCaseModal: jest.fn().mockImplementation(() => ({
    open: openAddToExistingCaseModalMock,
  })),
  useIsAddToCaseOpen: isAddToCaseOpenMock,
};

const helpersMock: jest.Mocked<CasesPublicStart['helpers']> = {
  canUseCases: jest.fn(),
  getUICapabilities: jest.fn().mockReturnValue({
    all: false,
    create: false,
    read: false,
    update: false,
    delete: false,
    push: false,
    connectors: false,
    settings: false,
    createComment: false,
    reopenCase: false,
  }),
  getRuleIdFromEvent: jest.fn(),
  groupAlertsByRule: jest.fn(),
};

export interface CaseUiClientMock {
  api: jest.Mocked<CasesPublicStart['api']>;
  ui: jest.Mocked<CasesPublicStart['ui']>;
  hooks: jest.Mocked<CasesPublicStart['hooks']>;
  helpers: jest.Mocked<CasesPublicStart['helpers']>;
  config: CasesPublicStart['config'];
}

export const mockCasesContract = (): CaseUiClientMock => ({
  api: apiMock,
  ui: uiMock,
  hooks: hooksMock,
  helpers: helpersMock,
  config: {
    templatesEnabled: false,
    attachmentsEnabled: false,
    casesRedesign: { list: false, details: false, settings: false },
  },
});

export const casesPluginMock = {
  createStartContract: mockCasesContract,
};
