/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
// Necessary until components being tested are migrated of styled-components https://github.com/elastic/kibana/issues/219037
import 'jest-styled-components';

import { TestProviders } from '../../../../common/mock';
import { KpiPanel, StackByComboBox } from './components';
import { useStackByFields } from './hooks';

jest.mock('./hooks');
jest.mock('react-router-dom', () => {
  const originalModule = jest.requireActual('react-router-dom');
  return {
    ...originalModule,
    createHref: jest.fn(),
    useHistory: jest.fn(),
    useLocation: jest.fn().mockReturnValue({ pathname: '' }),
  };
});

const mockNavigateToApp = jest.fn();
jest.mock('../../../../common/lib/kibana/kibana_react', () => {
  const original = jest.requireActual('../../../../common/lib/kibana/kibana_react');

  return {
    ...original,
    useKibana: () => ({
      services: {
        application: {
          navigateToApp: mockNavigateToApp,
          getUrlForApp: jest.fn(),
        },
        data: {
          search: {
            search: jest.fn(),
          },
        },
        uiSettings: {
          get: jest.fn(),
        },
        notifications: {
          toasts: {
            addWarning: jest.fn(),
            addError: jest.fn(),
            addSuccess: jest.fn(),
            remove: jest.fn(),
          },
        },
      },
    }),
  };
});

describe('components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStackByFields as jest.Mock).mockReturnValue(jest.fn());
  });

  describe('KpiPanel', () => {
    test('it has a hidden overflow-x', () => {
      render(
        <TestProviders>
          <KpiPanel data-test-subj="test" $toggleStatus={true}>
            {'test'}
          </KpiPanel>
        </TestProviders>
      );

      expect(screen.getByTestId('test')).toHaveStyleRule('overflow-x', 'hidden');
    });

    test('it has a hidden overflow-y by default', () => {
      render(
        <TestProviders>
          <KpiPanel data-test-subj="test" $toggleStatus={true}>
            {'test'}
          </KpiPanel>
        </TestProviders>
      );

      expect(screen.getByTestId('test')).toHaveStyleRule('overflow-y', 'hidden');
    });

    test('it uses the `$overflowY` prop for the value of overflow-y when provided', () => {
      render(
        <TestProviders>
          <KpiPanel data-test-subj="test" $overflowY="auto" $toggleStatus={true}>
            {'test'}
          </KpiPanel>
        </TestProviders>
      );

      expect(screen.getByTestId('test')).toHaveStyleRule('overflow-y', 'auto');
    });
  });

  describe('StackByComboBox', () => {
    test('it invokes onSelect when a field is selected', async () => {
      const onSelect = jest.fn();
      const optionToSelect = 'agent.hostname';

      const { getByTestId } = render(
        <TestProviders>
          <StackByComboBox
            data-test-subj="stackByComboBox"
            onSelect={onSelect}
            selected="agent.ephemeral_id"
            dropDownoptions={[
              { label: 'agent.ephemeral_id', value: 'agent.ephemeral_id' },
              { label: 'agent.hostname', value: 'agent.hostname' },
            ]}
          />
        </TestProviders>
      );

      const comboBox = getByTestId('comboBoxSearchInput');
      comboBox.focus(); // display the combo box options

      const option = await screen.findByText(optionToSelect);
      fireEvent.click(option);

      expect(onSelect).toBeCalledWith(optionToSelect);
    });

    test('it does NOT disable the combo box by default', () => {
      const { getByTestId } = render(
        <TestProviders>
          <StackByComboBox
            data-test-subj="stackByComboBox"
            onSelect={jest.fn()}
            selected="agent.ephemeral_id"
          />
        </TestProviders>
      );

      const comboBox = getByTestId('comboBoxSearchInput');
      expect(comboBox).not.toHaveAttribute('disabled');
    });

    test('it disables the combo box when `isDisabled` is true', () => {
      const { getByTestId } = render(
        <TestProviders>
          <StackByComboBox
            data-test-subj="stackByComboBox"
            isDisabled={true}
            onSelect={jest.fn()}
            selected="agent.ephemeral_id"
          />
        </TestProviders>
      );

      const comboBox = getByTestId('comboBoxSearchInput');
      expect(comboBox).toHaveAttribute('disabled');
    });

    test('overrides the default accessible name via the `aria-label` prop when provided', () => {
      const customAccessibleName = 'custom';

      const { getByTestId } = render(
        <TestProviders>
          <StackByComboBox
            aria-label={customAccessibleName}
            data-test-subj="stackByComboBox"
            isDisabled={true}
            onSelect={jest.fn()}
            selected="agent.ephemeral_id"
          />
        </TestProviders>
      );

      expect(getByTestId('comboBoxSearchInput')).toHaveAttribute(
        'aria-label',
        customAccessibleName
      );
    });

    test('it renders the default label', () => {
      const defaultLabel = 'Stack by';

      const { getByTestId } = render(
        <TestProviders>
          <StackByComboBox
            data-test-subj="stackByComboBox"
            onSelect={jest.fn()}
            selected="agent.ephemeral_id"
          />
        </TestProviders>
      );

      expect(getByTestId('stackByComboBox')).toHaveTextContent(defaultLabel);
    });

    test('it overrides the default label when `prepend` is specified', () => {
      const prepend = 'Group by';

      const { getByTestId } = render(
        <TestProviders>
          <StackByComboBox
            data-test-subj="stackByComboBox"
            onSelect={jest.fn()}
            prepend={prepend}
            selected="agent.ephemeral_id"
          />
        </TestProviders>
      );

      expect(getByTestId('stackByComboBox')).toHaveTextContent(prepend);
    });
  });
});
