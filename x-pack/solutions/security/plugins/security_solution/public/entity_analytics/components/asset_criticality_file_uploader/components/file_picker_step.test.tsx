/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { AssetCriticalityFilePickerStep } from './file_picker_step';
import { TestProviders } from '../../../../common/mock';

describe('AssetCriticalityFilePickerStep', () => {
  const mockOnFileChange = jest.fn();
  const mockErrorMessage = 'Sample error message';
  const mockIsLoading = false;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render without errors', () => {
    const { queryByTestId } = render(
      <AssetCriticalityFilePickerStep
        onFileChange={mockOnFileChange}
        errorMessage={mockErrorMessage}
        isLoading={mockIsLoading}
      />,
      { wrapper: TestProviders }
    );

    expect(queryByTestId('asset-criticality-file-picker')).toBeInTheDocument();
  });

  it('should call onFileChange when file is selected', () => {
    const { getByTestId } = render(
      <AssetCriticalityFilePickerStep
        onFileChange={mockOnFileChange}
        errorMessage={mockErrorMessage}
        isLoading={mockIsLoading}
      />,
      { wrapper: TestProviders }
    );

    const file = new File(['sample file content'], 'sample.csv', { type: 'text/csv' });
    fireEvent.change(getByTestId('asset-criticality-file-picker'), { target: { files: [file] } });

    expect(mockOnFileChange).toHaveBeenCalledWith([file]);
  });

  it('should display error message when errorMessage prop is provided', () => {
    const { getByText } = render(
      <AssetCriticalityFilePickerStep
        onFileChange={mockOnFileChange}
        errorMessage={mockErrorMessage}
        isLoading={mockIsLoading}
      />,
      { wrapper: TestProviders }
    );

    expect(getByText(mockErrorMessage)).toBeInTheDocument();
  });

  it('should display loading indicator when isLoading prop is true', () => {
    const { container } = render(
      <AssetCriticalityFilePickerStep
        onFileChange={mockOnFileChange}
        errorMessage={mockErrorMessage}
        isLoading={true}
      />,
      { wrapper: TestProviders }
    );

    expect(container.querySelector('.euiProgress')).not.toBeNull();
  });

  describe('CSV format guidance', () => {
    const renderStep = () =>
      render(
        <AssetCriticalityFilePickerStep
          onFileChange={mockOnFileChange}
          isLoading={mockIsLoading}
        />,
        { wrapper: TestProviders }
      );

    it('should display the header row description', () => {
      const { getByText } = renderStep();

      expect(
        getByText(/The first row of the file must contain a header/, { exact: false })
      ).toBeInTheDocument();
    });

    it('should display the entity type description with "type" column requirement', () => {
      const { getByText } = renderStep();

      expect(
        getByText(/The header for this column must be "type"/, { exact: false })
      ).toBeInTheDocument();
    });

    it('should display the identifier fields description', () => {
      const { getByText } = renderStep();

      expect(
        getByText(/Entities that match ALL of the identifiers specified in a row will be updated/, {
          exact: false,
        })
      ).toBeInTheDocument();
    });

    it('should display the criticality level description with "criticality_level" column requirement', () => {
      const { getByText } = renderStep();

      expect(
        getByText(/The header for this column must be "criticality_level"/, { exact: false })
      ).toBeInTheDocument();
    });

    it('should display the sample CSV with a header row', () => {
      const { getByText } = renderStep();

      expect(
        getByText(
          /type,user\.email,user\.name,user\.full_name,host\.name,host\.domain,service\.name,criticality_level/,
          { exact: false }
        )
      ).toBeInTheDocument();
    });
  });
});
