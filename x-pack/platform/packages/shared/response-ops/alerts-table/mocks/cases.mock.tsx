/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { CaseStatuses } from '@kbn/cases-components';
import type { Case } from '../apis/bulk_get_cases';
import type { CasesService } from '../types';

export const theCase: Case = {
  id: 'test-id',
  created_at: '2023-02-16T18:13:37.058Z',
  created_by: { full_name: 'Elastic', username: 'elastic', email: 'elastic@elastic.co' },
  description: 'Test description',
  status: CaseStatuses.open,
  title: 'Test case',
  totalComment: 1,
  version: 'WzQ3LDFd',
  owner: 'cases',
};

export const getCasesMock = () => {
  return [theCase, { ...theCase, id: 'test-id-2', title: 'Test case 2' }];
};

export const getCasesMapMock = () =>
  getCasesMock().reduce((acc, val) => acc.set(val.id, val), new Map());

export const openAddToExistingCaseModalMock = jest.fn();
export const openAddToNewCaseFlyoutMock = jest.fn();

const uiMock: jest.MockedObject<CasesService['ui']> = {
  getCasesContext: jest
    .fn()
    .mockImplementation(() => ({ children }: PropsWithChildren) => <>{children}</>),
};

const hooksMock: jest.MockedObject<CasesService['hooks']> = {
  useCasesAddToNewCaseFlyout: jest.fn().mockImplementation(() => ({
    open: openAddToNewCaseFlyoutMock,
  })),
  useCasesAddToExistingCaseModal: jest.fn().mockImplementation(() => ({
    open: openAddToExistingCaseModalMock,
  })),
};

const helpersMock: jest.MockedObject<CasesService['helpers']> = {
  canUseCases: jest.fn(),
  groupAlertsByRule: jest.fn(),
  getRuleIdFromEvent: jest.fn(),
};

export const createCasesServiceMock = (): jest.MaybeMockedDeep<CasesService> => ({
  ui: uiMock,
  hooks: hooksMock,
  helpers: helpersMock,
});
