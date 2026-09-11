/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { RuleDetails } from './rule_details';

jest.mock('../hooks', () => ({
  useRuleFormState: jest.fn(),
  useRuleFormDispatch: jest.fn(),
}));

const { useRuleFormState, useRuleFormDispatch } = jest.requireMock('../hooks');

const render = (toRender: React.ReactElement) =>
  rtlRender(toRender, {
    wrapper: ({ children }) => <IntlProvider>{children}</IntlProvider>,
  });

const mockOnChange = jest.fn();

describe('RuleDetails', () => {
  beforeEach(() => {
    useRuleFormState.mockReturnValue({
      plugins: {
        contentManagement: {} as ContentManagementPublicStart,
      },
      formData: {
        name: 'test',
        tags: [],
      },
    });
    useRuleFormDispatch.mockReturnValue(mockOnChange);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('Renders correctly', () => {
    render(<RuleDetails />);

    expect(screen.getByTestId('ruleDetails')).toBeInTheDocument();
  });

  test('shows related dashboards when uiActions is available', () => {
    useRuleFormState.mockReturnValue({
      plugins: {
        contentManagement: {} as ContentManagementPublicStart,
        uiActions: uiActionsPluginMock.createStartContract(),
      },
      formData: {
        name: 'test',
        tags: [],
      },
    });

    render(<RuleDetails />);

    const section = screen.getByTestId('ruleLinkedDashboards');
    expect(section).toBeVisible();
    expect(within(section).getByText('Related dashboards')).toBeVisible();
  });

  test('omits related dashboards when uiActions is unavailable', () => {
    render(<RuleDetails />);

    expect(screen.queryByTestId('ruleLinkedDashboards')).not.toBeInTheDocument();
  });

  test('Should allow name to be changed', () => {
    render(<RuleDetails />);

    fireEvent.change(screen.getByTestId('ruleDetailsNameInput'), { target: { value: 'hello' } });
    expect(mockOnChange).toHaveBeenCalledWith({
      type: 'setName',
      payload: 'hello',
    });
  });

  test('Should allow tags to be changed', async () => {
    render(<RuleDetails />);

    await userEvent.type(
      within(screen.getByTestId('ruleDetailsTagsInput')).getByTestId('comboBoxInput'),
      'tag{enter}'
    );
    expect(mockOnChange).toHaveBeenCalledWith({
      type: 'setTags',
      payload: ['tag'],
    });
  });

  test('Should split a typed comma-separated value into multiple tags', async () => {
    render(<RuleDetails />);

    await userEvent.type(
      within(screen.getByTestId('ruleDetailsTagsInput')).getByTestId('comboBoxInput'),
      'tag1, tag2 , tag3{enter}'
    );
    expect(mockOnChange).toHaveBeenCalledWith({
      type: 'setTags',
      payload: ['tag1', 'tag2', 'tag3'],
    });
  });

  test('Should split a pasted newline-separated value into multiple tags', async () => {
    render(<RuleDetails />);

    const input = within(screen.getByTestId('ruleDetailsTagsInput')).getByTestId('comboBoxInput');
    await userEvent.click(input);
    await userEvent.paste('tag1\ntag2\ntag3');

    expect(mockOnChange).toHaveBeenCalledWith({
      type: 'setTags',
      payload: ['tag1', 'tag2', 'tag3'],
    });
  });

  test('Should de-duplicate tags case-insensitively, keeping the first occurrence casing', async () => {
    render(<RuleDetails />);

    await userEvent.type(
      within(screen.getByTestId('ruleDetailsTagsInput')).getByTestId('comboBoxInput'),
      'Tag1, tag1 , TAG1{enter}'
    );
    expect(mockOnChange).toHaveBeenCalledWith({
      type: 'setTags',
      payload: ['Tag1'],
    });
  });

  test('Should disable the copy tags button when there are no tags', () => {
    render(<RuleDetails />);

    expect(screen.getByTestId('ruleDetailsTagsCopyButton')).toBeDisabled();
  });

  test('Should enable the copy tags button when tags exist', () => {
    useRuleFormState.mockReturnValue({
      plugins: {
        contentManagement: {} as ContentManagementPublicStart,
      },
      formData: {
        name: 'test',
        tags: ['tag1', 'tag2'],
      },
    });
    render(<RuleDetails />);

    expect(screen.getByTestId('ruleDetailsTagsCopyButton')).toBeEnabled();
  });

  test('Should display error', () => {
    useRuleFormState.mockReturnValue({
      plugins: {
        contentManagement: {} as ContentManagementPublicStart,
      },
      formData: {
        name: 'test',
        tags: [],
      },
      baseErrors: {
        name: 'name is invalid',
        tags: 'tags is invalid',
      },
    });
    render(<RuleDetails />);

    expect(screen.getByText('name is invalid')).toBeInTheDocument();
    expect(screen.getByText('tags is invalid')).toBeInTheDocument();
  });

  test('should call dispatch with artifacts object when investigation guide is added', async () => {
    useRuleFormState.mockReturnValue({
      plugins: {
        contentManagement: {} as ContentManagementPublicStart,
      },
      formData: {
        id: 'test-id',
        params: {},
        schedule: {
          interval: '1m',
        },
        alertDelay: {
          active: 5,
        },
        notifyWhen: null,
        consumer: 'stackAlerts',
        ruleTypeId: '.es-query',
      },
      canShowConsumerSelection: true,
      validConsumers: ['logs', 'stackAlerts'],
    });
    render(<RuleDetails />);

    const investigationGuideEditor = screen.getByTestId('investigationGuideEditor');
    const investigationGuideTextArea = screen.getByLabelText(
      'Add guidelines for addressing alerts created by this rule'
    );
    expect(investigationGuideEditor).toBeInTheDocument();
    expect(investigationGuideEditor).toBeVisible();
    expect(
      screen.getByPlaceholderText('Add guidelines for addressing alerts created by this rule')
    );

    fireEvent.change(investigationGuideTextArea, {
      target: {
        value: '# Example investigation guide',
      },
    });

    expect(mockOnChange).toHaveBeenCalledWith({
      type: 'setRuleProperty',
      payload: {
        property: 'artifacts',
        value: {
          investigation_guide: {
            blob: '# Example investigation guide',
          },
        },
      },
    });
    expect(mockOnChange).toHaveBeenCalledTimes(1);
  });
});
