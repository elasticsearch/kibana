/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CasesPermissions } from '@kbn/cases-plugin/common';
import { renderHook } from '@testing-library/react';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';
import { noCasesPermissions } from '../../../../cases_test_utils';
import { useEntityCasePermissions } from './use_case_permission';

jest.mock('../../../../common/lib/kibana');

describe('useEntityCasePermissions', () => {
  const mockedUseKibana = mockUseKibana();
  const mockCanUseCases = jest.fn();

  beforeEach(() => {
    mockedUseKibana.services.cases.helpers.canUseCases = mockCanUseCases;
  });

  const renderWithPermissions = (permissions: Partial<CasesPermissions>) => {
    mockCanUseCases.mockReturnValue({ ...noCasesPermissions(), ...permissions });
    return renderHook(() => useEntityCasePermissions()).result;
  };

  it('canAddToExistingCase is true when the user has update and createComment', () => {
    const { current } = renderWithPermissions({ update: true, createComment: true });
    expect(current.canAddToExistingCase).toEqual(true);
  });

  it('canAddToExistingCase is false when the user is missing update', () => {
    const { current } = renderWithPermissions({ update: false, createComment: true });
    expect(current.canAddToExistingCase).toEqual(false);
  });

  it('canAddToExistingCase is false when the user is missing createComment', () => {
    const { current } = renderWithPermissions({ update: true, createComment: false });
    expect(current.canAddToExistingCase).toEqual(false);
  });

  it('canAddToNewCase is true when the user has create and createComment', () => {
    const { current } = renderWithPermissions({ create: true, createComment: true });
    expect(current.canAddToNewCase).toEqual(true);
  });

  it('canAddToNewCase is false when the user is missing create', () => {
    const { current } = renderWithPermissions({ create: false, createComment: true });
    expect(current.canAddToNewCase).toEqual(false);
  });

  it('canAddToNewCase is false when the user is missing createComment', () => {
    const { current } = renderWithPermissions({ create: true, createComment: false });
    expect(current.canAddToNewCase).toEqual(false);
  });

  it('returns both flags as false when the user has no permissions', () => {
    const { current } = renderWithPermissions({});
    expect(current).toEqual({
      canAddToExistingCase: false,
      canAddToNewCase: false,
    });
  });
});
