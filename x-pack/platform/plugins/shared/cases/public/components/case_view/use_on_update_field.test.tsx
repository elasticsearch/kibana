/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';

import { useOnUpdateField } from './use_on_update_field';
import { basicCase } from '../../containers/mock';
import { useUpdateCase } from '../../containers/use_update_case';
import { TestProviders } from '../../common/mock';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';
import { CaseStatuses, CaseSeverity } from '../../../common/types/domain';
import type { CaseUI } from '../../../common';

jest.mock('../../containers/use_update_case');

const mockMutate = jest.fn();

(useUpdateCase as jest.Mock).mockReturnValue({
  isLoading: false,
  mutate: mockMutate,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TestProviders>{children}</TestProviders>
);

describe('useOnUpdateField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls updateCaseProperty with the title key', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'title', value: 'New title' });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'title',
        updateValue: 'New title',
        caseData: basicCase,
      }),
      expect.anything()
    );
  });

  it('does not call updateCaseProperty when title is empty', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'title', value: '' });
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls updateCaseProperty with the description key', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'description', value: 'New description' });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'description',
        updateValue: 'New description',
      }),
      expect.anything()
    );
  });

  it('calls updateCaseProperty with the tags key', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'tags', value: ['tag1', 'tag2'] });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'tags',
        updateValue: ['tag1', 'tag2'],
      }),
      expect.anything()
    );
  });

  it('calls updateCaseProperty with the category key', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'category', value: 'new-category' });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'category',
        updateValue: 'new-category',
      }),
      expect.anything()
    );
  });

  it('calls updateCaseProperty with the status key when status changes', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'status', value: CaseStatuses.closed });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'status',
        updateValue: CaseStatuses.closed,
      }),
      expect.anything()
    );
  });

  it('does not call updateCaseProperty when status is unchanged', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'status', value: basicCase.status });
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls updateCaseProperty with the severity key when severity changes', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'severity', value: CaseSeverity.CRITICAL });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'severity',
        updateValue: CaseSeverity.CRITICAL,
      }),
      expect.anything()
    );
  });

  it('calls updateCaseProperty with the settings key when settings change', () => {
    const newSettings = { syncAlerts: false, extractObservables: false };
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'settings', value: newSettings });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'settings',
        updateValue: newSettings,
      }),
      expect.anything()
    );
  });

  it('calls updateCaseProperty with the connector key', () => {
    const newConnector = { id: 'jira-1', name: 'Jira', type: '.jira' as const, fields: null };
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'connector', value: newConnector });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'connector',
        updateValue: newConnector,
      }),
      expect.anything()
    );
  });

  it('calls updateCaseProperty with the assignees key when assignees change', () => {
    const newAssignees = [{ uid: 'new-uid' }];
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'assignees', value: newAssignees });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'assignees',
        updateValue: newAssignees,
      }),
      expect.anything()
    );
  });

  it('does not call updateCaseProperty when assignees are unchanged', () => {
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'assignees', value: basicCase.assignees });
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('calls updateCaseProperty with the customFields key when custom fields change', () => {
    const newCustomFields = [{ key: 'field1', type: 'text' as const, value: 'hello' }];
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'customFields', value: newCustomFields });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateKey: 'customFields',
        updateValue: newCustomFields,
      }),
      expect.anything()
    );
  });

  describe('extended fields', () => {
    it('calls updateCaseProperty with extended_fields key and provided field update', () => {
      const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

      act(() => {
        result.current.onUpdateField({
          key: CASE_EXTENDED_FIELDS,
          value: { priority_as_number: '5' },
        });
      });

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          updateKey: CASE_EXTENDED_FIELDS,
          updateValue: { priority_as_number: '5' },
        }),
        expect.anything()
      );
    });

    it('sends only the incoming extended fields without client-side merge', () => {
      // The server merges extended_fields with existing values so that concurrent saves
      // from GlobalCaseFields and TemplateFields do not overwrite each other.
      // The client must send only its own section's fields — not the full merged object.
      const caseWithCamelCaseFields: CaseUI = {
        ...basicCase,
        extendedFields: { riskScoreAsKeyword: 'low' },
      };

      const { result } = renderHook(() => useOnUpdateField({ caseData: caseWithCamelCaseFields }), {
        wrapper,
      });

      act(() => {
        result.current.onUpdateField({
          key: CASE_EXTENDED_FIELDS,
          value: { severity_as_keyword: 'high' },
        });
      });

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          updateKey: CASE_EXTENDED_FIELDS,
          updateValue: { severity_as_keyword: 'high' },
        }),
        expect.anything()
      );
    });

    it('does not include existing extended fields from caseData in the update payload', () => {
      // Merge is done server-side; the client sends only the changed section's fields.
      const caseWithExtendedFields: CaseUI = {
        ...basicCase,
        extendedFields: { existing_field: 'existing_value' },
      };

      const { result } = renderHook(() => useOnUpdateField({ caseData: caseWithExtendedFields }), {
        wrapper,
      });

      act(() => {
        result.current.onUpdateField({
          key: CASE_EXTENDED_FIELDS,
          value: { impact_as_text: 'high' },
        });
      });

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          updateKey: CASE_EXTENDED_FIELDS,
          updateValue: { impact_as_text: 'high' },
        }),
        expect.anything()
      );
    });
  });

  it('calls onSuccess callback on successful update', () => {
    mockMutate.mockImplementation((_req: unknown, options: { onSuccess: () => void }) => {
      options.onSuccess();
    });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'title', value: 'New title', onSuccess });
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('calls onError callback on failed update', () => {
    mockMutate.mockImplementation((_req: unknown, options: { onError: () => void }) => {
      options.onError();
    });

    const onError = jest.fn();
    const { result } = renderHook(() => useOnUpdateField({ caseData: basicCase }), { wrapper });

    act(() => {
      result.current.onUpdateField({ key: 'title', value: 'New title', onError });
    });

    expect(onError).toHaveBeenCalled();
  });
});
