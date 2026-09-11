/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import type { AppDependencies } from '../../../app_context';
import type { DataStream } from '../../../../../common/types';
import { useAppContext } from '../../../app_context';
import { useIlmLocator } from '../../../services/use_ilm_locator';
import { DataRetentionValue } from './data_retention_value';

jest.mock('../../../app_context', () => ({
  useAppContext: jest.fn(),
}));

jest.mock('../../../services/use_ilm_locator', () => ({
  useIlmLocator: jest.fn(),
}));

const mockUseAppContext = jest.mocked(useAppContext);
const mockUseIlmLocator = jest.mocked(useIlmLocator);

const createDataStream = (overrides: Partial<DataStream> = {}): DataStream => ({
  name: 'my-data-stream',
  timeStampField: { name: '@timestamp' },
  indices: [
    {
      name: 'index-000001',
      uuid: 'uuid-1',
      preferILM: false,
      managedBy: 'Data stream lifecycle',
    },
  ],
  generation: 1,
  health: 'green',
  indexTemplateName: 'my-template',
  privileges: {
    delete_index: true,
    manage_data_stream_lifecycle: true,
    read_failure_store: true,
    manage: true,
  },
  hidden: false,
  nextGenerationManagedBy: 'Data stream lifecycle',
  lifecycle: { enabled: true, data_retention: '7d' },
  indexMode: 'standard',
  ...overrides,
});

describe('DataRetentionValue', () => {
  const navigateToUrl = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppContext.mockReturnValue({
      core: { application: { navigateToUrl } },
    } as unknown as AppDependencies);
  });

  it('renders an ILM policy link and navigates when clicked', () => {
    mockUseIlmLocator.mockReturnValue('/test/my_policy');

    const dataStream = createDataStream({
      nextGenerationManagedBy: 'Index Lifecycle Management',
      ilmPolicyName: 'my_policy',
      lifecycle: undefined,
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} valueTestSubj="retentionValue" />);

    const link = screen.getByTestId('retentionValue');
    expect(link).toHaveTextContent('my_policy');
    expect(link).toHaveAttribute('href', '/test/my_policy');
    expect(screen.getByText('ILM')).toBeInTheDocument();

    fireEvent.click(link);
    expect(navigateToUrl).toHaveBeenCalledWith('/test/my_policy');
  });

  it('renders the data retention period when not ILM-managed', () => {
    mockUseIlmLocator.mockReturnValue('/test/my_policy');

    const dataStream = createDataStream({
      nextGenerationManagedBy: 'Data stream lifecycle',
      ilmPolicyName: 'my_policy',
      lifecycle: { enabled: true, data_retention: '2d' } as DataStream['lifecycle'],
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.queryByText('ILM')).not.toBeInTheDocument();
  });

  it('renders data retention for a DSL-managed stream with historical ILM indices', () => {
    mockUseIlmLocator.mockReturnValue('/test/my_policy');

    const dataStream = createDataStream({
      indices: [
        {
          name: 'index-000001',
          uuid: 'uuid-1',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
          ilmPolicyName: 'historical-policy',
        },
      ],
      nextGenerationManagedBy: 'Data stream lifecycle',
      ilmPolicyName: 'my_policy',
      lifecycle: { enabled: true, data_retention: '2d' } as DataStream['lifecycle'],
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.queryByText('ILM')).not.toBeInTheDocument();
  });

  it('prefers DSL for a lookup stream with both DSL and ILM-managed historical indices', () => {
    mockUseIlmLocator.mockReturnValue('/test/my_policy');

    const dataStream = createDataStream({
      indexMode: 'lookup',
      indices: [
        {
          name: 'index-000001',
          uuid: 'uuid-1',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
          ilmPolicyName: 'historical-policy',
        },
        {
          name: 'index-000002',
          uuid: 'uuid-2',
          preferILM: false,
          managedBy: 'Data stream lifecycle',
        },
      ],
      nextGenerationManagedBy: 'Index Lifecycle Management',
      ilmPolicyName: 'my_policy',
      lifecycle: { enabled: true, data_retention: '2d' } as DataStream['lifecycle'],
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.queryByText('ILM')).not.toBeInTheDocument();
  });

  it('renders "Not applicable" for a lookup data stream instead of the retention period', () => {
    const dataStream = createDataStream({
      indexMode: 'lookup',
      indices: [{ name: 'index-000001', uuid: 'uuid-1', preferILM: false, managedBy: 'Unmanaged' }],
      lifecycle: { enabled: true, data_retention: '7d' } as DataStream['lifecycle'],
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.getByTestId('lookupLifecycleNotApplicable')).toHaveTextContent('Not applicable');
    expect(screen.queryByText('7 days')).not.toBeInTheDocument();
  });

  it('renders "Not applicable" for a lookup data stream instead of the ILM policy badge', () => {
    mockUseIlmLocator.mockReturnValue('/test/my_policy');

    const dataStream = createDataStream({
      indexMode: 'lookup',
      indices: [{ name: 'index-000001', uuid: 'uuid-1', preferILM: false, managedBy: 'Unmanaged' }],
      nextGenerationManagedBy: 'Index Lifecycle Management',
      ilmPolicyName: 'my_policy',
      lifecycle: undefined,
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} valueTestSubj="retentionValue" />);

    expect(screen.getByTestId('lookupLifecycleNotApplicable')).toBeInTheDocument();
    expect(screen.queryByTestId('retentionValue')).not.toBeInTheDocument();
    expect(screen.queryByText('ILM')).not.toBeInTheDocument();
  });

  it('renders retention for a lookup data stream with a lifecycle-managed backing index', () => {
    const dataStream = createDataStream({ indexMode: 'lookup' });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.queryByTestId('lookupLifecycleNotApplicable')).not.toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  it('renders ILM for a lookup stream with ILM-managed history', () => {
    const dataStream = createDataStream({
      indexMode: 'lookup',
      indices: [
        {
          name: 'index-000001',
          uuid: 'uuid-1',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
          ilmPolicyName: 'historical-policy',
        },
        {
          name: 'index-000002',
          uuid: 'uuid-2',
          preferILM: false,
          managedBy: 'Unmanaged',
          ilmPolicyName: 'unmanaged-policy',
        },
      ],
      nextGenerationManagedBy: 'Unmanaged',
      ilmPolicyName: 'current-template-policy',
      lifecycle: undefined,
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.queryByTestId('lookupLifecycleNotApplicable')).not.toBeInTheDocument();
    expect(screen.getByText('historical-policy')).toBeInTheDocument();
    expect(screen.queryByText('current-template-policy')).not.toBeInTheDocument();
    expect(screen.getByText('ILM')).toBeInTheDocument();
  });

  it('does not fall back to the current template policy when historical policy is missing', () => {
    const dataStream = createDataStream({
      indexMode: 'lookup',
      indices: [
        {
          name: 'index-000001',
          uuid: 'uuid-1',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
        },
      ],
      nextGenerationManagedBy: 'Unmanaged',
      ilmPolicyName: 'current-template-policy',
      lifecycle: undefined,
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.getByText('Unknown policy')).toBeInTheDocument();
    expect(screen.queryByText('current-template-policy')).not.toBeInTheDocument();
    expect(screen.getByText('ILM')).toBeInTheDocument();
  });

  it('does not attribute multiple historical ILM policies to the current template policy', () => {
    const dataStream = createDataStream({
      indexMode: 'lookup',
      indices: [
        {
          name: 'index-000001',
          uuid: 'uuid-1',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
          ilmPolicyName: 'historical-policy-1',
        },
        {
          name: 'index-000002',
          uuid: 'uuid-2',
          preferILM: true,
          managedBy: 'Index Lifecycle Management',
          ilmPolicyName: 'historical-policy-2',
        },
      ],
      nextGenerationManagedBy: 'Unmanaged',
      ilmPolicyName: 'current-template-policy',
      lifecycle: undefined,
    });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.getByText('Unknown policy')).toBeInTheDocument();
    expect(screen.queryByText('current-template-policy')).not.toBeInTheDocument();
    expect(screen.getByText('ILM')).toBeInTheDocument();
  });

  it('does not render "Not applicable" for a standard data stream', () => {
    const dataStream = createDataStream({ indexMode: 'standard' });

    renderWithI18n(<DataRetentionValue dataStream={dataStream} />);

    expect(screen.queryByTestId('lookupLifecycleNotApplicable')).not.toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });
});
