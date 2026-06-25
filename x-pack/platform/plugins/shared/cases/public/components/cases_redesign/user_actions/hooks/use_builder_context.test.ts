/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useBuilderContext } from './use_builder_context';
import { useCasesContext } from '../../../cases_context/use_cases_context';
import { basicCase } from '../../../../containers/mock';
import { casesConfigurationsMock } from '../../../../containers/configure/mock';
import { getCaseConnectorsMockResponse } from '../../../../common/mock/connectors';

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  useEuiTheme: () => ({ euiTheme: { colors: {}, size: {} } }),
}));

jest.mock('../../../cases_context/use_cases_context');

const useCasesContextMock = useCasesContext as jest.Mock;

const mockExternalRefRegistry = { list: jest.fn() };
const mockPersistableRegistry = { list: jest.fn() };
const mockUnifiedRegistry = { list: jest.fn() };

const defaultArgs = {
  caseData: basicCase,
  casesConfiguration: casesConfigurationsMock,
  caseConnectors: getCaseConnectorsMockResponse(),
  userProfiles: new Map(),
  currentUserProfile: undefined,
  manageMarkdownEditIds: [],
  selectedOutlineCommentId: '',
  loadingCommentIds: [],
  handleOutlineComment: jest.fn(),
  handleDeleteComment: jest.fn(),
};

describe('useBuilderContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCasesContextMock.mockReturnValue({
      owner: ['securitySolution'],
      externalReferenceAttachmentTypeRegistry: mockExternalRefRegistry,
      persistableStateAttachmentTypeRegistry: mockPersistableRegistry,
      unifiedAttachmentTypeRegistry: mockUnifiedRegistry,
    });
  });

  it('returns context with appId from owner', () => {
    const { result } = renderHook(() => useBuilderContext(defaultArgs));

    expect(result.current.appId).toBe('securitySolution');
  });

  it('includes registries from cases context', () => {
    const { result } = renderHook(() => useBuilderContext(defaultArgs));

    expect(result.current.externalReferenceAttachmentTypeRegistry).toBe(mockExternalRefRegistry);
    expect(result.current.persistableStateAttachmentTypeRegistry).toBe(mockPersistableRegistry);
    expect(result.current.unifiedAttachmentTypeRegistry).toBe(mockUnifiedRegistry);
  });

  it('passes through input args', () => {
    const { result } = renderHook(() => useBuilderContext(defaultArgs));

    expect(result.current.caseData).toBe(defaultArgs.caseData);
    expect(result.current.manageMarkdownEditIds).toBe(defaultArgs.manageMarkdownEditIds);
    expect(result.current.handleOutlineComment).toBe(defaultArgs.handleOutlineComment);
    expect(result.current.handleDeleteComment).toBe(defaultArgs.handleDeleteComment);
  });

  it('includes euiTheme', () => {
    const { result } = renderHook(() => useBuilderContext(defaultArgs));

    expect(result.current.euiTheme).toBeDefined();
  });
});
