/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { MultiFieldMapping, SelectedFieldMappings } from './multi_field_selector';

const DEFAULT_VALUES = {
  addInferencePipelineModal: {
    configuration: {},
  },
  sourceFields: ['my-source-field1', 'my-source-field2', 'my-source-field3'],
};

const DEFAULT_ACTIONS = {
  addSelectedFieldsToMapping: jest.fn(),
  removeFieldFromMapping: jest.fn(),
  selectFields: jest.fn(),
  setTargetField: jest.fn(),
};

describe('MultiFieldMapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({});
    setMockActions(DEFAULT_ACTIONS);
  });

  it('renders multi field selector with options', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<MultiFieldMapping />);
    expect(screen.getByText('Source text field')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();

    // All source fields are available as combobox options
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'my-source-field1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'my-source-field2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'my-source-field3' })).toBeInTheDocument();
  });

  it('renders multi field selector with options excluding mapped and selected fields', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: {
        configuration: {
          fieldMappings: [{ sourceField: 'my-source-field2', targetField: 'my-target-field2' }],
        },
        selectedSourceFields: ['my-source-field1'],
      },
    });
    renderWithKibanaRenderContext(<MultiFieldMapping />);

    // Open dropdown — only my-source-field3 should remain as an available option
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'my-source-field3' })).toBeInTheDocument();
    // my-source-field1 is already selected (rendered as a badge, not a dropdown option)
    // my-source-field2 is already mapped — must not appear as an option
    expect(screen.queryByRole('option', { name: 'my-source-field1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'my-source-field2' })).not.toBeInTheDocument();
  });

  it('disables add mapping button if no fields are selected', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<MultiFieldMapping />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('enables add mapping button if some fields are selected', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: {
        ...DEFAULT_VALUES.addInferencePipelineModal,
        selectedSourceFields: ['my-source-field1'],
      },
    });
    renderWithKibanaRenderContext(<MultiFieldMapping />);
    expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled();
  });

  it('disables target field text field if no source fields are selected', () => {
    setMockValues(DEFAULT_VALUES);
    const { container } = renderWithKibanaRenderContext(<MultiFieldMapping />);
    const targetInput = container.querySelector(
      'input[type="text"]:not([aria-autocomplete])'
    ) as HTMLInputElement;
    expect(targetInput).toBeDisabled();
  });

  it('disables target field text field if multiple source fields are selected', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: {
        ...DEFAULT_VALUES.addInferencePipelineModal,
        selectedSourceFields: ['my-source-field1', 'my-source-field2'],
      },
    });
    const { container } = renderWithKibanaRenderContext(<MultiFieldMapping />);
    const targetInput = container.querySelector(
      'input[type="text"]:not([aria-autocomplete])'
    ) as HTMLInputElement;
    expect(targetInput).toBeDisabled();
  });

  it('disables target field text field if text expansion model is selected', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      isTextExpansionModelSelected: true,
    });
    const { container } = renderWithKibanaRenderContext(<MultiFieldMapping />);
    const targetInput = container.querySelector(
      'input[type="text"]:not([aria-autocomplete])'
    ) as HTMLInputElement;
    expect(targetInput).toBeDisabled();
  });

  it('enables target field text field if a single source field is selected', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: {
        ...DEFAULT_VALUES.addInferencePipelineModal,
        selectedSourceFields: ['my-source-field1'],
      },
    });
    const { container } = renderWithKibanaRenderContext(<MultiFieldMapping />);
    const targetInput = container.querySelector(
      'input[type="text"]:not([aria-autocomplete])'
    ) as HTMLInputElement;
    expect(targetInput).not.toBeDisabled();
  });
});

describe('SelectedFieldMappings', () => {
  const mockValues = {
    ...DEFAULT_VALUES,
    addInferencePipelineModal: {
      configuration: {
        fieldMappings: [
          { sourceField: 'my-source-field1', targetField: 'my-target-field1' },
          { sourceField: 'my-source-field2', targetField: 'my-target-field2' },
        ],
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({});
    setMockActions(DEFAULT_ACTIONS);
  });

  it('renders field mapping list', () => {
    setMockValues(mockValues);
    renderWithKibanaRenderContext(<SelectedFieldMappings />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('my-source-field1')).toBeInTheDocument();
    expect(screen.getByText('my-target-field1')).toBeInTheDocument();
  });

  it('does not render action column in read-only mode', () => {
    setMockValues(mockValues);
    renderWithKibanaRenderContext(<SelectedFieldMappings isReadOnly />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source text field' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Target field' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });
});
