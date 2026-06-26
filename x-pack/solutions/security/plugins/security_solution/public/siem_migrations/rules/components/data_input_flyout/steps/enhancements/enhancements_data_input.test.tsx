/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { EnhancementsDataInput } from './enhancements_data_input';
import { getRuleMigrationStatsMock } from '../../../../__mocks__';
import { SiemMigrationTaskStatus } from '../../../../../../../common/siem_migrations/constants';
import { useEnhanceRules } from '../../../../service/hooks/use_enhance_rules';
import { MigrationSource, type MigrationStepProps } from '../../../../../common/types';
import { QradarDataInputStep } from '../../types';

jest.mock('../../../../service/hooks/use_enhance_rules');

const mockEnhanceRules = jest.fn();

describe('EnhancementsDataInput', () => {
  const defaultProps: MigrationStepProps = {
    dataInputStep: QradarDataInputStep.Enhancements,
    migrationStats: getRuleMigrationStatsMock({ status: SiemMigrationTaskStatus.READY }),
    migrationSource: MigrationSource.QRADAR,
    setDataInputStep: jest.fn(),
    onMigrationCreated: jest.fn(),
    onMissingResourcesFetched: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useEnhanceRules as jest.Mock).mockReturnValue({
      enhanceRules: mockEnhanceRules,
      isLoading: false,
      error: null,
    });
  });

  it('should render step number when component is mounted', () => {
    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    expect(getByTestId('enhancementsStepNumber')).toBeInTheDocument();
    expect(getByTestId('enhancementsStepNumber')).toHaveTextContent('3');
  });

  it('should render title when component is mounted', () => {
    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    expect(getByTestId('enhancementsTitle')).toBeInTheDocument();
    expect(getByTestId('enhancementsTitle')).toHaveTextContent('Add enhancements');
  });

  it('should render content when step is current and migrationStats is provided', () => {
    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    expect(getByTestId('enhancementTypeSelect')).toBeInTheDocument();
    expect(getByTestId('enhancementFilePicker')).toBeInTheDocument();
    expect(getByTestId('addEnhancementButton')).toBeInTheDocument();
  });

  it('should not render content when step is not current', () => {
    const { queryByTestId } = render(
      <EnhancementsDataInput {...defaultProps} dataInputStep={QradarDataInputStep.Rules} />
    );

    expect(queryByTestId('enhancementTypeSelect')).not.toBeInTheDocument();
    expect(queryByTestId('enhancementFilePicker')).not.toBeInTheDocument();
    expect(queryByTestId('addEnhancementButton')).not.toBeInTheDocument();
  });

  it('should not render content when migrationStats is undefined', () => {
    const { queryByTestId } = render(
      <EnhancementsDataInput {...defaultProps} migrationStats={undefined} />
    );

    expect(queryByTestId('enhancementTypeSelect')).not.toBeInTheDocument();
    expect(queryByTestId('enhancementFilePicker')).not.toBeInTheDocument();
    expect(queryByTestId('addEnhancementButton')).not.toBeInTheDocument();
  });

  it('should disable Add button when no file is selected', () => {
    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    expect(getByTestId('addEnhancementButton')).toBeDisabled();
  });

  it('should enable Add button when a valid JSON file is selected', async () => {
    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    const validJsonContent = JSON.stringify({
      'Test Rule': {
        id: '1',
        mapping: {
          TA0001: {
            enabled: true,
            name: 'Initial Access',
            techniques: {},
          },
        },
      },
    });
    const file = new File([validJsonContent], 'mitre_mappings.json', {
      type: 'application/json',
    });

    const filePicker = getByTestId('enhancementFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('addEnhancementButton')).not.toBeDisabled();
    });
  });

  it('should show error and keep Add button disabled when invalid JSON file is selected', async () => {
    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    const invalidJsonContent = 'not valid json {{{';
    const file = new File([invalidJsonContent], 'invalid.json', {
      type: 'application/json',
    });

    const filePicker = getByTestId('enhancementFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('addEnhancementButton')).toBeDisabled();
    });
  });

  it('should call enhanceRules when Add button is clicked', async () => {
    mockEnhanceRules.mockResolvedValue(true);

    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    const validJsonContent = JSON.stringify({
      'Test Rule': {
        id: '1',
        mapping: {
          TA0001: {
            enabled: true,
            name: 'Initial Access',
            techniques: {},
          },
        },
      },
    });
    const file = new File([validJsonContent], 'mitre_mappings.json', {
      type: 'application/json',
    });

    const filePicker = getByTestId('enhancementFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('addEnhancementButton')).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(getByTestId('addEnhancementButton'));
    });

    expect(mockEnhanceRules).toHaveBeenCalledWith({
      migrationId: defaultProps?.migrationStats?.id,
      body: {
        vendor: 'qradar',
        type: 'mitre',
        data: JSON.parse(validJsonContent),
      },
    });
  });

  it('should add enhancement to list when upload is successful', async () => {
    mockEnhanceRules.mockResolvedValue(true);

    const { getByTestId, getByText } = render(<EnhancementsDataInput {...defaultProps} />);

    const validJsonContent = JSON.stringify({
      'Test Rule': {
        id: '1',
        mapping: {},
      },
    });
    const file = new File([validJsonContent], 'my_mitre_export.json', {
      type: 'application/json',
    });

    const filePicker = getByTestId('enhancementFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('addEnhancementButton')).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(getByTestId('addEnhancementButton'));
    });

    await waitFor(() => {
      expect(getByText('MITRE ATT&CK Mappings - my_mitre_export.json')).toBeInTheDocument();
    });
  });

  it('should show empty state message when no enhancements are added', () => {
    const { getByText } = render(<EnhancementsDataInput {...defaultProps} />);

    expect(
      getByText(
        'No enhancements added yet. You can also start translations without any enhancements'
      )
    ).toBeInTheDocument();
  });

  it('should disable controls when loading', () => {
    (useEnhanceRules as jest.Mock).mockReturnValue({
      enhanceRules: mockEnhanceRules,
      isLoading: true,
      error: null,
    });

    const { getByTestId } = render(<EnhancementsDataInput {...defaultProps} />);

    expect(getByTestId('enhancementTypeSelect')).toBeDisabled();
  });

  it('should display inline error when JSON parsing fails', async () => {
    const { getByTestId, getByText } = render(<EnhancementsDataInput {...defaultProps} />);

    const invalidJsonContent = 'not valid json {{{';
    const file = new File([invalidJsonContent], 'invalid.json', {
      type: 'application/json',
    });

    const filePicker = getByTestId('enhancementFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByText('The file does not contain valid JSON')).toBeVisible();
    });

    await waitFor(() => {
      expect(getByTestId('addEnhancementButton')).toBeDisabled();
    });
  });
});
