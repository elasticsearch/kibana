/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { SentinelRulesJsonFileUploadProps } from './rules_json_file_upload';
import { SentinelRulesJsonFileUpload } from './rules_json_file_upload';
import type { CreateMigration } from '../../../../../../service/hooks/use_create_migration';
import { TestProviders } from '../../../../../../../../common/mock';

const mockCreateMigration: CreateMigration = jest.fn();
const mockOnRulesFileChanged = jest.fn();
const migrationName = 'test migration name';

const defaultProps: SentinelRulesJsonFileUploadProps = {
  createMigration: mockCreateMigration,
  onRulesFileChanged: mockOnRulesFileChanged,
  apiError: undefined,
  isLoading: false,
  isCreated: false,
  migrationName,
};

const renderTestComponent = (props: Partial<SentinelRulesJsonFileUploadProps> = {}) => {
  return render(
    <TestProviders>
      <SentinelRulesJsonFileUpload {...defaultProps} {...props} />
    </TestProviders>
  );
};

const validArmTemplate = JSON.stringify({
  resources: [
    {
      type: 'Microsoft.SecurityInsights/alertRules',
      name: 'test-rule',
      properties: {
        displayName: 'Test Rule',
        query: 'SecurityEvent | where EventID == 4625',
        queryFrequency: 'PT5H',
        queryPeriod: 'PT5H',
        severity: 'High',
        triggerOperator: 'GreaterThan',
        triggerThreshold: 0,
      },
    },
  ],
});

const validDirectArray = JSON.stringify([
  {
    type: 'Microsoft.SecurityInsights/alertRules',
    name: 'test-rule',
    properties: {
      displayName: 'Test Rule',
      query: 'SecurityEvent | where EventID == 4625',
      queryFrequency: 'PT5H',
      queryPeriod: 'PT5H',
      severity: 'High',
      triggerOperator: 'GreaterThan',
      triggerThreshold: 0,
    },
  },
]);

describe('SentinelRulesJsonFileUpload', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render the upload button', () => {
    const { getByTestId } = renderTestComponent();

    expect(getByTestId('rulesFilePicker')).toBeInTheDocument();
    expect(getByTestId('uploadFileButton')).toBeDisabled();
  });

  it('should enable upload button when a valid ARM template JSON is selected', async () => {
    const file = new File([validArmTemplate], 'sentinel_rules.json', {
      type: 'application/json',
    });

    const { getByTestId } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('uploadFileButton')).not.toBeDisabled();
    });
  });

  it('should enable upload button when a valid direct array JSON is selected', async () => {
    const file = new File([validDirectArray], 'sentinel_rules.json', {
      type: 'application/json',
    });

    const { getByTestId } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('uploadFileButton')).not.toBeDisabled();
    });
  });

  it('should display inline error when invalid JSON is selected', async () => {
    const invalidJson = 'this is not json {{{';
    const file = new File([invalidJson], 'bad.json', { type: 'application/json' });

    const { getByTestId, getByText } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByText('The file does not contain valid JSON')).toBeVisible();
    });

    expect(getByTestId('uploadFileButton')).toBeDisabled();
  });

  it('should display inline error when JSON has invalid Sentinel resource structure', async () => {
    const invalidResources = JSON.stringify({ resources: [] });
    const file = new File([invalidResources], 'empty_resources.json', {
      type: 'application/json',
    });

    const { getByTestId, getByText } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByText('The file does not contain valid Sentinel rule resources')).toBeVisible();
    });

    expect(getByTestId('uploadFileButton')).toBeDisabled();
  });

  it('should display API error when provided', () => {
    const { getByText } = renderTestComponent({ apiError: 'Server error' });

    expect(getByText('Server error')).toBeVisible();
  });

  it('should call createMigration with resources when upload button is clicked', async () => {
    const file = new File([validArmTemplate], 'sentinel_rules.json', {
      type: 'application/json',
    });

    const { getByTestId } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('uploadFileButton')).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(getByTestId('uploadFileButton'));
    });

    expect(mockCreateMigration).toHaveBeenCalledWith({
      migrationName,
      rules: { resources: JSON.parse(validArmTemplate).resources },
      vendor: 'microsoft-sentinel',
    });
  });
});
