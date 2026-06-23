/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';

import { TestProviders } from '../../../../common/mock';
import { LOCAL_STORAGE_KEYS } from '../../../../../common/constants';
import { useListFieldsSelection } from './use_list_fields_selection';
import { useCasesColumnsConfiguration } from '../../../all_cases/use_cases_columns_configuration';

jest.mock('../../../all_cases/use_cases_columns_configuration');

const useCasesColumnsConfigurationMock = useCasesColumnsConfiguration as jest.Mock;

const localStorageKey = `securitySolution.${LOCAL_STORAGE_KEYS.casesListFields}`;

const casesColumnsConfig = {
  title: {
    field: 'title',
    name: 'Name',
    canDisplay: true,
  },
  assignees: {
    field: 'assignees',
    name: 'Assignees',
    canDisplay: true,
  },
  createdBy: {
    field: 'createdBy',
    name: 'Reporter',
    canDisplay: true,
  },
  updatedAt: {
    field: 'updatedAt',
    name: 'Last updated',
    canDisplay: true,
  },
  status: {
    field: 'status',
    name: 'Status',
    canDisplay: true,
  },
  severity: {
    field: 'severity',
    name: 'Severity',
    canDisplay: true,
  },
  tags: {
    field: 'tags',
    name: 'Tags',
    canDisplay: true,
  },
  category: {
    field: 'category',
    name: 'Category',
    canDisplay: true,
    isCheckedDefault: true,
  },
};

describe('useListFieldsSelection', () => {
  const license = licensingMock.createLicense({
    license: { type: 'platinum' },
  });

  beforeEach(() => {
    useCasesColumnsConfigurationMock.mockReturnValue(casesColumnsConfig);
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns fields with isChecked false by default', () => {
    const { result } = renderHook(() => useListFieldsSelection(), {
      wrapper: (props) => <TestProviders {...props} license={license} />,
    });

    expect(result.current.selectedFields).toEqual([
      { field: 'tags', name: 'Tags', isChecked: false },
      { field: 'category', name: 'Category', isChecked: false },
    ]);
  });

  it('filters out always-visible list fields from the selection', () => {
    const { result } = renderHook(() => useListFieldsSelection(), {
      wrapper: (props) => <TestProviders {...props} license={license} />,
    });

    const fields = result.current.selectedFields.map(({ field }) => field);

    expect(fields).not.toContain('title');
    expect(fields).not.toContain('assignees');
    expect(fields).not.toContain('createdBy');
    expect(fields).not.toContain('updatedAt');
    expect(fields).not.toContain('status');
    expect(fields).not.toContain('severity');
  });

  it('persists selections to localStorage', () => {
    const selectedFields = [{ field: 'tags', name: 'Tags', isChecked: true }];

    const { result } = renderHook(() => useListFieldsSelection(), {
      wrapper: (props) => <TestProviders {...props} license={license} />,
    });

    act(() => {
      result.current.setSelectedFields(selectedFields);
    });

    expect(JSON.parse(localStorage.getItem(localStorageKey)!)).toEqual(selectedFields);
  });

  it('merges stored selections from localStorage', () => {
    const storedFields = [{ field: 'tags', name: 'Tags', isChecked: true }];

    localStorage.setItem(localStorageKey, JSON.stringify(storedFields));

    const { result } = renderHook(() => useListFieldsSelection(), {
      wrapper: (props) => <TestProviders {...props} license={license} />,
    });

    expect(result.current.selectedFields).toEqual([
      { field: 'tags', name: 'Tags', isChecked: true },
      { field: 'category', name: 'Category', isChecked: false },
    ]);
  });
});
