/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  CONTROL_CHARACTER_ERROR,
  ConditionEntryField,
  OperatingSystem,
} from '@kbn/securitysolution-utils';
import type { TrustedAppConditionEntry } from '../../../../../../../common/endpoint/types';

import type { ConditionEntryInputProps } from '.';
import { ConditionEntryInput } from '.';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { ENTRY_PROPERTY_TITLES, OPERATOR_TITLES } from '../../translations';

let onRemoveMock: jest.Mock;
let onChangeMock: jest.Mock;
let onVisitedMock: jest.Mock;

const baseEntry: Readonly<TrustedAppConditionEntry> = {
  field: ConditionEntryField.HASH,
  type: 'match',
  operator: 'included',
  value: 'trustedApp',
};

describe('Condition entry input', () => {
  const formPrefix = 'condition-entry-input';
  let props: jest.Mocked<ConditionEntryInputProps>;
  let mockedContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    onRemoveMock = jest.fn();
    onChangeMock = jest.fn();
    onVisitedMock = jest.fn();
    props = {
      os: OperatingSystem.WINDOWS,
      entry: baseEntry,
      showLabels: true,
      onRemove: onRemoveMock,
      onChange: onChangeMock,
      onVisited: onVisitedMock,
      'data-test-subj': formPrefix,
      isRemoveDisabled: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  const render = () => {
    return (renderResult = mockedContext.render(<ConditionEntryInput {...props} />));
  };

  it.each([
    { name: 'Hash md5, sha1, or sha256', expectedCall: ConditionEntryField.HASH },
    { name: 'Path The full path of the application', expectedCall: ConditionEntryField.PATH },
    { name: 'Signature The signer of the application', expectedCall: ConditionEntryField.SIGNER },
    {
      name: 'Signature The signer of the application',
      expectedCall: ConditionEntryField.SIGNER_MAC,
    },
  ])(
    'selecting `$name` should call onChange with `$expectedCall`',
    async ({ name, expectedCall }) => {
      if (expectedCall === ConditionEntryField.SIGNER_MAC) {
        props = { ...props, os: OperatingSystem.MAC };
      }
      render();
      expect(onChangeMock).toHaveBeenCalledTimes(0);
      const fieldOption = renderResult.getByTestId(`${formPrefix}-field`) as HTMLButtonElement;
      await userEvent.click(fieldOption);
      await waitForEuiPopoverOpen();
      await userEvent.click(screen.getByRole('option', { name }));
      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith({ ...baseEntry, field: expectedCall }, baseEntry);
    }
  );

  it('should call on remove for field input', async () => {
    render();
    expect(onRemoveMock).toHaveBeenCalledTimes(0);
    const removeButton = renderResult.getByTestId(`${formPrefix}-remove`) as HTMLButtonElement;
    await userEvent.click(removeButton);
    expect(onRemoveMock).toHaveBeenCalledTimes(1);
    expect(onRemoveMock).toHaveBeenCalledWith(baseEntry);
  });

  it('should not be able to call on remove for field input because disabled', async () => {
    props = { ...props, isRemoveDisabled: true };
    render();
    const removeButton = renderResult.getByTestId(`${formPrefix}-remove`) as HTMLButtonElement;

    expect(removeButton).toBeDisabled();
    expect(onRemoveMock).toHaveBeenCalledTimes(0);
  });

  it('should call on visited for field input', async () => {
    render();
    expect(onVisitedMock).toHaveBeenCalledTimes(0);
    const value = renderResult.getByTestId(`${formPrefix}-value`);
    await fireEvent.blur(value);
    expect(onVisitedMock).toHaveBeenCalledTimes(1);
    expect(onVisitedMock).toHaveBeenCalledWith(baseEntry);
  });

  it('trims a repairable value on blur through onChange', () => {
    props = { ...props, entry: { ...baseEntry, value: ' trustedApp\u00A0' } };
    render();

    fireEvent.blur(renderResult.getByTestId(`${formPrefix}-value`));

    expect(onChangeMock).toHaveBeenCalledWith({ ...baseEntry, value: 'trustedApp' }, props.entry);
  });

  it.each([
    ['a clean value', 'trustedApp'],
    ['an all-whitespace value', ' \t\n'],
    ['an interior control character', 'trusted\tApp'],
  ])('does not update %s on blur', (_, value) => {
    props = { ...props, entry: { ...baseEntry, value } };
    render();

    fireEvent.blur(renderResult.getByTestId(`${formPrefix}-value`));

    expect(onChangeMock).not.toHaveBeenCalled();
  });

  it('renders an inline warning without marking the value input invalid', () => {
    props = { ...props, validation: { errors: [], warnings: ['Path may be formed incorrectly'] } };
    render();

    const valueInput = renderResult.getByTestId(`${formPrefix}-value`);
    expect(renderResult.getByText('Path may be formed incorrectly')).toBeInTheDocument();
    expect(valueInput).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('renders an inline error and marks the value input invalid', () => {
    props = { ...props, validation: { errors: [CONTROL_CHARACTER_ERROR], warnings: [] } };
    render();

    const valueInput = renderResult.getByTestId(`${formPrefix}-value`);
    const error = renderResult.getByText(CONTROL_CHARACTER_ERROR);
    expect(error).toBeInTheDocument();
    expect(valueInput).toHaveAttribute('aria-invalid', 'true');
    expect(valueInput).toHaveAccessibleDescription(CONTROL_CHARACTER_ERROR);
  });

  it('renders feedback for a repeated row without adding a visible label', () => {
    props = {
      ...props,
      showLabels: false,
      validation: { errors: [CONTROL_CHARACTER_ERROR], warnings: [] },
    };
    render();

    expect(renderResult.getByText(CONTROL_CHARACTER_ERROR)).toBeInTheDocument();
    expect(renderResult.queryByText(ENTRY_PROPERTY_TITLES.value)).not.toBeInTheDocument();
    expect(renderResult.getByTestId(`${formPrefix}-value`)).toHaveAccessibleDescription(
      CONTROL_CHARACTER_ERROR
    );
  });

  it('should not call on visited for field change if value is empty', async () => {
    props = { ...props, entry: { ...baseEntry, value: '' } };
    render();
    expect(onVisitedMock).toHaveBeenCalledTimes(0);
    const field = renderResult.getByTestId(`${formPrefix}-field`);
    await fireEvent.change(field);
    await fireEvent.blur(field);
    expect(onVisitedMock).toHaveBeenCalledTimes(0);
  });

  it('should change value for field input', async () => {
    render();
    expect(onChangeMock).toHaveBeenCalledTimes(0);
    const value = renderResult.getByTestId(`${formPrefix}-value`);
    await fireEvent.change(value, { target: { value: 'new value' } });
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith(
      {
        ...baseEntry,
        value: 'new value',
      },
      baseEntry
    );
  });

  it.each([
    {
      os: OperatingSystem.WINDOWS,
      expectedNames: [
        'Hash md5, sha1, or sha256',
        'Path The full path of the application',
        'Signature The signer of the application',
      ],
    },
    {
      os: OperatingSystem.LINUX,
      expectedNames: ['Hash md5, sha1, or sha256', 'Path The full path of the application'],
    },
    {
      os: OperatingSystem.MAC,
      expectedNames: [
        'Hash md5, sha1, or sha256',
        'Path The full path of the application',
        'Signature The signer of the application',
      ],
    },
  ])('should expose the expected field options when OS is $os', async ({ os, expectedNames }) => {
    props = { ...props, os };
    render();
    await userEvent.click(screen.getByTestId(`${formPrefix}-field`));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(expectedNames.length);
    for (const name of expectedNames) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument();
    }
    if (os === OperatingSystem.LINUX) {
      expect(
        screen.queryByRole('option', { name: 'Signature The signer of the application' })
      ).not.toBeInTheDocument();
    }
  });

  it('should have operator value selected when field is HASH', () => {
    render();
    const operatorField = renderResult.getByTestId(`${formPrefix}-operator`);
    expect(operatorField).toHaveValue(OPERATOR_TITLES.is);
  });

  it('should show operator dropdown with two values when field is PATH', async () => {
    props = { ...props, entry: { ...baseEntry, field: ConditionEntryField.PATH } };
    render();
    await userEvent.click(screen.getByTestId(`${formPrefix}-operator`));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
  });
});
