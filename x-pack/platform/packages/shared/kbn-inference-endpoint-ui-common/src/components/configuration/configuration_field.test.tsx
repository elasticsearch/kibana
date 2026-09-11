/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigInputField, ConfigInputListField, ConfigNumberField } from './configuration_field';
import { FieldType } from '../../types/types';
import type { ConfigEntryView } from '../../types/types';

describe('ConfigInputField', () => {
  const createConfigEntry = (overrides: Partial<ConfigEntryView> = {}): ConfigEntryView => ({
    key: 'url',
    isValid: true,
    label: 'URL',
    description: 'The URL endpoint',
    validationErrors: [],
    required: false,
    sensitive: false,
    value: null,
    default_value: 'https://api.example.com/v1',
    updatable: true,
    type: FieldType.STRING,
    supported_task_types: ['text_embedding'],
    ...overrides,
  });

  const defaultProps = {
    isLoading: false,
    validateAndSetConfigValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default value when value is null', () => {
    const configEntry = createConfigEntry({ value: null });
    render(<ConfigInputField {...defaultProps} configEntry={configEntry} />);

    const input = screen.getByTestId('url-input');
    expect(input).toHaveValue('https://api.example.com/v1');
  });

  it('renders with actual value when value is provided', () => {
    const configEntry = createConfigEntry({ value: 'https://custom.url.com' });
    render(<ConfigInputField {...defaultProps} configEntry={configEntry} />);

    const input = screen.getByTestId('url-input');
    expect(input).toHaveValue('https://custom.url.com');
  });

  it('allows user to clear the field completely without resetting to default', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({
      value: null,
      default_value: 'https://api.example.com/v1',
    });

    render(
      <ConfigInputField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    const input = screen.getByTestId('url-input');

    // User clears the entire field
    fireEvent.change(input, { target: { value: '' } });

    // The input should be empty, not reset to default
    expect(input).toHaveValue('');
    expect(validateAndSetConfigValue).toHaveBeenCalledWith('');
  });

  it('does not reset to default after rerender when field is cleared', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({
      value: null,
      default_value: 'https://api.example.com/v1',
    });

    const { rerender } = render(
      <ConfigInputField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    const input = screen.getByTestId('url-input');

    // User clears the entire field
    fireEvent.change(input, { target: { value: '' } });

    // Simulate parent form updating value prop to null (as it converts '' to null)
    rerender(
      <ConfigInputField
        {...defaultProps}
        configEntry={{ ...configEntry, value: null }}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    // Should still be empty, not reset to default
    expect(input).toHaveValue('');
  });

  it('allows user to type a new value after clearing', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({
      value: null,
      default_value: 'https://api.example.com/v1',
    });

    render(
      <ConfigInputField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    const input = screen.getByTestId('url-input');

    // User clears and types new value
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: 'https://new.url.com' } });

    expect(input).toHaveValue('https://new.url.com');
    expect(validateAndSetConfigValue).toHaveBeenLastCalledWith('https://new.url.com');
  });

  it('is disabled when isLoading is true', () => {
    const configEntry = createConfigEntry();
    render(<ConfigInputField {...defaultProps} configEntry={configEntry} isLoading={true} />);

    const input = screen.getByTestId('url-input');
    expect(input).toBeDisabled();
  });

  it('is disabled in edit mode when field is not updatable', () => {
    const configEntry = createConfigEntry({ updatable: false });
    render(<ConfigInputField {...defaultProps} configEntry={configEntry} isEdit={true} />);

    const input = screen.getByTestId('url-input');
    expect(input).toBeDisabled();
  });

  it('shows invalid state when isValid is false', () => {
    const configEntry = createConfigEntry({ isValid: false });
    render(<ConfigInputField {...defaultProps} configEntry={configEntry} />);

    const input = screen.getByTestId('url-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('ConfigInputListField', () => {
  const createConfigEntry = (overrides: Partial<ConfigEntryView> = {}): ConfigEntryView => ({
    key: 'scopes',
    isValid: true,
    label: 'OAuth2 scopes',
    description: 'The permissions requested by the application.',
    validationErrors: [],
    required: false,
    sensitive: false,
    value: null,
    default_value: null,
    updatable: true,
    type: FieldType.LIST,
    supported_task_types: ['text_embedding'],
    ...overrides,
  });

  const defaultProps = {
    isLoading: false,
    validateAndSetConfigValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders existing list values', () => {
    render(
      <ConfigInputListField
        {...defaultProps}
        configEntry={createConfigEntry({ value: ['scope-a', 'scope-b'] })}
      />
    );

    expect(screen.getByText('scope-a')).toBeInTheDocument();
    expect(screen.getByText('scope-b')).toBeInTheDocument();
  });

  it('adds a trimmed list value', () => {
    const validateAndSetConfigValue = jest.fn();
    render(
      <ConfigInputListField
        {...defaultProps}
        configEntry={createConfigEntry()}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: ' scope-a ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(validateAndSetConfigValue).toHaveBeenCalledWith(['scope-a']);
  });

  it('emits null and does not restore the default when cleared', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({ default_value: ['default-scope'] });
    const { rerender } = render(
      <ConfigInputListField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    fireEvent.click(screen.getByTestId('comboBoxClearButton'));
    expect(validateAndSetConfigValue).toHaveBeenCalledWith(null);

    rerender(
      <ConfigInputListField
        {...defaultProps}
        configEntry={{ ...configEntry, value: null }}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );
    expect(screen.queryByText('default-scope')).not.toBeInTheDocument();
  });

  it('is disabled in edit mode when the field is not updatable', () => {
    render(
      <ConfigInputListField
        {...defaultProps}
        configEntry={createConfigEntry({ updatable: false })}
        isEdit
      />
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

describe('ConfigNumberField', () => {
  const createConfigEntry = (overrides: Partial<ConfigEntryView> = {}): ConfigEntryView => ({
    key: 'max_tokens',
    isValid: true,
    label: 'Max Tokens',
    description: 'Maximum number of tokens',
    validationErrors: [],
    required: false,
    sensitive: false,
    value: null,
    default_value: 1024,
    updatable: true,
    type: FieldType.INTEGER,
    supported_task_types: ['text_embedding'],
    ...overrides,
  });

  const defaultProps = {
    isLoading: false,
    validateAndSetConfigValue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default value when value is null', () => {
    const configEntry = createConfigEntry({ value: null });
    render(<ConfigNumberField {...defaultProps} configEntry={configEntry} />);

    const input = screen.getByTestId('max_tokens-number');
    expect(input).toHaveValue(1024);
  });

  it('renders with actual value when value is provided', () => {
    const configEntry = createConfigEntry({ value: 2048 });
    render(<ConfigNumberField {...defaultProps} configEntry={configEntry} />);

    const input = screen.getByTestId('max_tokens-number');
    expect(input).toHaveValue(2048);
  });

  it('allows user to clear the field using the clear button', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({
      value: null,
      default_value: 1024,
    });

    render(
      <ConfigNumberField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    // Find and click the clear button
    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    expect(validateAndSetConfigValue).toHaveBeenCalledWith('');
  });

  it('does not reset to default after rerender when field is cleared', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({
      value: null,
      default_value: 1024,
    });

    const { rerender } = render(
      <ConfigNumberField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    // Find and click the clear button
    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    // Simulate parent form updating value prop to null (as it converts '' to null)
    rerender(
      <ConfigNumberField
        {...defaultProps}
        configEntry={{ ...configEntry, value: null }}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    // Should still be empty, not reset to default
    const input = screen.getByTestId('max_tokens-number');
    expect(input).toHaveValue(null);
  });

  it('allows user to change the value', () => {
    const validateAndSetConfigValue = jest.fn();
    const configEntry = createConfigEntry({
      value: null,
      default_value: 1024,
    });

    render(
      <ConfigNumberField
        {...defaultProps}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    );

    const input = screen.getByTestId('max_tokens-number');
    fireEvent.change(input, { target: { value: '512' } });

    expect(input).toHaveValue(512);
    expect(validateAndSetConfigValue).toHaveBeenCalledWith('512');
  });

  it('is disabled when isLoading is true', () => {
    const configEntry = createConfigEntry();
    render(<ConfigNumberField {...defaultProps} configEntry={configEntry} isLoading={true} />);

    const input = screen.getByTestId('max_tokens-number');
    expect(input).toBeDisabled();
  });

  it('is disabled when isPreconfigured is true', () => {
    const configEntry = createConfigEntry();
    render(
      <ConfigNumberField {...defaultProps} configEntry={configEntry} isPreconfigured={true} />
    );

    const input = screen.getByTestId('max_tokens-number');
    expect(input).toBeDisabled();
  });

  it('is disabled in edit mode when field is not updatable', () => {
    const configEntry = createConfigEntry({ updatable: false });
    render(<ConfigNumberField {...defaultProps} configEntry={configEntry} isEdit={true} />);

    const input = screen.getByTestId('max_tokens-number');
    expect(input).toBeDisabled();
  });
});
