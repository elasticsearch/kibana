/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CasesPermissions } from '@kbn/cases-plugin/common';
import { renderHook } from '@testing-library/react';
import { useKibana as mockUseKibana } from '../../../common/lib/kibana/__mocks__';
import { noCasesPermissions } from '../../../cases_test_utils';
import { APP_ID } from '../../../../common/constants';
import { useCanAttachToCase } from './use_can_attach_to_case';

jest.mock('../../../common/lib/kibana');

describe('useCanAttachToCase', () => {
  const mockedUseKibana = mockUseKibana();
  const mockCanUseCases = jest.fn();

  beforeEach(() => {
    mockedUseKibana.services.cases.helpers.canUseCases = mockCanUseCases;
  });

  const renderWithPermissions = (permissions: Partial<CasesPermissions>) => {
    mockCanUseCases.mockReturnValue({ ...noCasesPermissions(), ...permissions });
    return renderHook(() => useCanAttachToCase()).result.current;
  };

  it('calls canUseCases scoped to the securitySolution owner', () => {
    renderWithPermissions({});
    expect(mockCanUseCases).toHaveBeenCalledWith([APP_ID]);
  });

  it('allows attaching when the user has createComment and read', () => {
    const result = renderWithPermissions({ createComment: true, read: true });
    expect(result).toBe(true);
  });

  it('denies attaching when createComment is missing', () => {
    const result = renderWithPermissions({ createComment: false, read: true });
    expect(result).toBe(false);
  });

  it('denies attaching when read is missing', () => {
    const result = renderWithPermissions({ createComment: true, read: false });
    expect(result).toBe(false);
  });

  // create/update live inside the base `all` privilege and cannot be held independently.
  // The gate must NOT require them — a Cases-Read + createComment sub-privilege role
  // must be allowed.
  it('allows attaching even when create and update are both false (sub-privilege role)', () => {
    const result = renderWithPermissions({
      createComment: true,
      read: true,
      create: false,
      update: false,
    });
    expect(result).toBe(true);
  });

  it('denies attaching with no permissions', () => {
    const result = renderWithPermissions({});
    expect(result).toBe(false);
  });
});
