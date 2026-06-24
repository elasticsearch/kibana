/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';

import { basicCase, alertComment } from '../../containers/mock';
import type { CaseUI } from '../../../common';
import { TestProviders } from '../../common/mock';
import { useCaseAttachmentsTotal } from './use_case_attachment_tabs';
import { useGetCaseFileStats } from '../../containers/use_get_case_file_stats';
import { useCaseObservables } from './use_case_observables';
import { UnifiedAttachmentTypeRegistry } from '../../client/attachment_framework/unified_attachment_registry';

jest.mock('../../containers/use_get_case_file_stats');
jest.mock('./use_case_observables');

const useGetCaseFileStatsMock = useGetCaseFileStats as jest.Mock;
const useCaseObservablesMock = useCaseObservables as jest.Mock;

const platinumLicense = licensingMock.createLicense({ license: { type: 'platinum' } });
const basicLicense = licensingMock.createLicense({ license: { type: 'basic' } });

const buildRegistry = () => {
  const registry = new UnifiedAttachmentTypeRegistry();
  registry.register({
    id: 'security.alert',
    displayName: 'Alerts',
    icon: 'bell',
    getAttachmentViewObject: () => ({ event: 'added an alert' }),
    getAttachmentTabViewObject: () => ({
      children: () => <div data-test-subj="test-alerts-table">{'Alerts'}</div>,
    }),
    schemaValidator: () => {},
  });
  // File type is intentionally registered: the hook must NOT count it from
  // comments — files are counted via the file stats API instead.
  registry.register({
    id: 'file',
    displayName: 'Files',
    icon: 'document',
    getAttachmentViewObject: () => ({ event: 'added a file' }),
    getAttachmentTabViewObject: () => ({
      children: () => <div />,
    }),
    schemaValidator: () => {},
  });
  return registry;
};

describe('useCaseAttachmentsTotal', () => {
  beforeEach(() => {
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 3 } });
    useCaseObservablesMock.mockReturnValue({ observables: [], isLoading: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sums comments matching registered types (with a tab view) + file stats', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    const caseWithAlert: CaseUI = { ...basicCase, comments: [alertComment] };

    const { result } = renderHook(() => useCaseAttachmentsTotal({ caseData: caseWithAlert }), {
      wrapper: ({ children }) => (
        <TestProviders unifiedAttachmentTypeRegistry={unifiedAttachmentTypeRegistry}>
          {children}
        </TestProviders>
      ),
    });

    // 1 alert comment (via security.alert) + 3 files = 4
    expect(result.current).toBe(4);
  });

  it('counts bulk-added alerts by id length', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    const bulkAlertComment = {
      ...alertComment,
      alertId: ['a-1', 'a-2', 'a-3'],
      index: ['i-1', 'i-2', 'i-3'],
    };
    const caseWithBulkAlerts: CaseUI = { ...basicCase, comments: [bulkAlertComment] };

    const { result } = renderHook(() => useCaseAttachmentsTotal({ caseData: caseWithBulkAlerts }), {
      wrapper: ({ children }) => (
        <TestProviders unifiedAttachmentTypeRegistry={unifiedAttachmentTypeRegistry}>
          {children}
        </TestProviders>
      ),
    });

    // 3 alerts (from bulk comment) + 3 files = 6
    expect(result.current).toBe(6);
  });

  it('does not double-count file comments — files come from fileStats only', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();

    const { result } = renderHook(() => useCaseAttachmentsTotal({ caseData: basicCase }), {
      wrapper: ({ children }) => (
        <TestProviders unifiedAttachmentTypeRegistry={unifiedAttachmentTypeRegistry}>
          {children}
        </TestProviders>
      ),
    });

    // basicCase has only a user comment (no registered type with tab view).
    // File comments would otherwise be tempting to count, but only fileStats contributes.
    expect(result.current).toBe(3);
  });

  it('adds observables when the feature is enabled and license is platinum', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    useCaseObservablesMock.mockReturnValue({
      observables: [{ id: '1' }, { id: '2' }],
      isLoading: false,
    });

    const { result } = renderHook(() => useCaseAttachmentsTotal({ caseData: basicCase }), {
      wrapper: ({ children }) => (
        <TestProviders
          features={{ observables: { enabled: true } }}
          license={platinumLicense}
          unifiedAttachmentTypeRegistry={unifiedAttachmentTypeRegistry}
        >
          {children}
        </TestProviders>
      ),
    });

    // 0 from comments + 3 files + 2 observables = 5
    expect(result.current).toBe(5);
  });

  it('excludes observables when the license is not platinum', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    useCaseObservablesMock.mockReturnValue({
      observables: [{ id: '1' }, { id: '2' }],
      isLoading: false,
    });

    const { result } = renderHook(() => useCaseAttachmentsTotal({ caseData: basicCase }), {
      wrapper: ({ children }) => (
        <TestProviders
          features={{ observables: { enabled: true } }}
          license={basicLicense}
          unifiedAttachmentTypeRegistry={unifiedAttachmentTypeRegistry}
        >
          {children}
        </TestProviders>
      ),
    });

    expect(result.current).toBe(3);
  });
});
