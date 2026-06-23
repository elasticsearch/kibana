/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldDefinitionFlyout } from './field_definition_flyout';
import { renderWithTestingProviders } from '../../../common/mock';

jest.mock('./field_definition_yaml_editor', () => ({
  FieldDefinitionYamlEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-test-subj="fieldDefinitionYamlInput"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

jest.mock('./field_definition_preview', () => ({
  FieldDefinitionPreview: () => <div data-test-subj="fieldDefinitionPreview" />,
}));

const VALID_YAML = `name: my_field
label: "My Field"
control: INPUT_TEXT
type: keyword
`;

const defaultProps = {
  owner: 'securitySolution',
  onSave: jest.fn(),
  onClose: jest.fn(),
};

describe('FieldDefinitionFlyout — isGlobal checkbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the isGlobal checkbox unchecked by default', () => {
    renderWithTestingProviders(<FieldDefinitionFlyout {...defaultProps} />);

    const checkbox = screen.getByTestId('fieldDefinitionApplyToAllCasesCheckbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('renders the isGlobal checkbox checked when fieldDefinition has isGlobal: true', () => {
    const fieldDefinition = {
      fieldDefinitionId: 'fd-1',
      name: 'my_field',
      owner: 'securitySolution' as const,
      definition: VALID_YAML,
      isGlobal: true,
    };

    renderWithTestingProviders(
      <FieldDefinitionFlyout {...defaultProps} fieldDefinition={fieldDefinition} />
    );

    const checkbox = screen.getByTestId('fieldDefinitionApplyToAllCasesCheckbox');
    expect(checkbox).toBeChecked();
  });

  it('passes isGlobal: false to onSave when checkbox is unchecked', async () => {
    renderWithTestingProviders(<FieldDefinitionFlyout {...defaultProps} />);

    // Set a valid YAML so validation passes
    const yamlInput = screen.getByTestId('fieldDefinitionYamlInput');
    fireEvent.change(yamlInput, { target: { value: VALID_YAML } });

    fireEvent.click(screen.getByTestId('fieldDefinitionSaveButton'));

    expect(defaultProps.onSave).toHaveBeenCalledWith(expect.objectContaining({ isGlobal: false }));
  });

  it('passes isGlobal: true to onSave when checkbox is checked', async () => {
    renderWithTestingProviders(<FieldDefinitionFlyout {...defaultProps} />);

    const yamlInput = screen.getByTestId('fieldDefinitionYamlInput');
    fireEvent.change(yamlInput, { target: { value: VALID_YAML } });

    const checkbox = screen.getByTestId('fieldDefinitionApplyToAllCasesCheckbox');
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByTestId('fieldDefinitionSaveButton'));

    expect(defaultProps.onSave).toHaveBeenCalledWith(expect.objectContaining({ isGlobal: true }));
  });

  it('toggles isGlobal when checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderWithTestingProviders(<FieldDefinitionFlyout {...defaultProps} />);

    const checkbox = screen.getByTestId('fieldDefinitionApplyToAllCasesCheckbox');
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('displays the isGlobal label text', () => {
    renderWithTestingProviders(<FieldDefinitionFlyout {...defaultProps} />);

    expect(screen.getByText('Global field')).toBeInTheDocument();
  });
});
