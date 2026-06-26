/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { RulesXMLFileUploadProps } from './rules_xml_file_upload';
import { RulesXMLFileUpload } from './rules_xml_file_upload';
import type { CreateMigration } from '../../../../../../service/hooks/use_create_migration';
import { TestProviders } from '../../../../../../../../common/mock';

const mockCreateMigration: CreateMigration = jest.fn();
const mockOnRulesFileChanged = jest.fn();
const migrationName = 'test migration name';

const defaultProps: RulesXMLFileUploadProps = {
  createMigration: mockCreateMigration,
  onRulesFileChanged: mockOnRulesFileChanged,
  apiError: undefined,
  isLoading: false,
  isCreated: false,
  migrationName,
};

const renderTestComponent = (props: Partial<RulesXMLFileUploadProps> = {}) => {
  return render(
    <TestProviders>
      <RulesXMLFileUpload {...defaultProps} {...props} />
    </TestProviders>
  );
};

describe('RulesXMLFileUpload', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render the upload button', () => {
    const { getByTestId } = renderTestComponent();

    expect(getByTestId('rulesFilePicker')).toBeInTheDocument();
    expect(getByTestId('uploadFileButton')).toBeDisabled();
  });

  it('should enable upload button when a valid XML file is selected', async () => {
    const validXml = '<rules><rule><name>Test</name></rule></rules>';
    const file = new File([validXml], 'rules.xml', { type: 'application/xml' });

    const { getByTestId } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByTestId('uploadFileButton')).not.toBeDisabled();
    });
  });

  it('should display inline error when invalid XML file is selected', async () => {
    const invalidXml = 'this is not xml at all <<<<';
    const file = new File([invalidXml], 'bad.xml', { type: 'application/xml' });

    const { getByTestId, getByText } = renderTestComponent();

    const filePicker = getByTestId('rulesFilePicker');
    await act(async () => {
      fireEvent.change(filePicker, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(getByText('The file does not contain valid XML')).toBeVisible();
    });

    expect(getByTestId('uploadFileButton')).toBeDisabled();
  });

  it('should display API error when provided', () => {
    const { getByText } = renderTestComponent({ apiError: 'Server error' });

    expect(getByText('Server error')).toBeVisible();
  });

  it('should call createMigration with XML content when upload button is clicked', async () => {
    const validXml = '<rules><rule><name>Test</name></rule></rules>';
    const file = new File([validXml], 'rules.xml', { type: 'application/xml' });

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
      rules: { xml: validXml },
      vendor: 'qradar',
    });
  });
});
