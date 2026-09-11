/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { DeviceControlAccessLevel } from '../../../../../../../common/endpoint/types';
import type { PerOsDeviceControlAccessLevelSelectProps } from './per_os_device_control_access_level_select';
import { PerOsDeviceControlAccessLevelSelect } from './per_os_device_control_access_level_select';

describe('PerOsDeviceControlAccessLevelSelect', () => {
  const testSubj = 'deviceControlAccessLevelSelect';
  let props: PerOsDeviceControlAccessLevelSelectProps;
  let render: (
    overrides?: Partial<PerOsDeviceControlAccessLevelSelectProps>
  ) => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;

  beforeEach(() => {
    const mockedContext = createAppRootMockRenderer();
    props = {
      accessLevel: DeviceControlAccessLevel.audit,
      onAccessLevelChange: jest.fn(),
      'data-test-subj': testSubj,
    };
    render = (overrides = {}) =>
      (renderResult = mockedContext.render(
        <PerOsDeviceControlAccessLevelSelect {...props} {...overrides} />
      ));
  });

  it('renders all four access-level options with their existing labels', async () => {
    render();

    await userEvent.click(renderResult.getByTestId(testSubj));

    expect(
      renderResult.getByRole('option', { name: 'Allow read, write and execute' })
    ).toBeInTheDocument();
    expect(renderResult.getByRole('option', { name: 'Read and write' })).toBeInTheDocument();
    expect(renderResult.getByRole('option', { name: 'Read only' })).toBeInTheDocument();
    expect(renderResult.getByRole('option', { name: 'Block all' })).toBeInTheDocument();
  });

  it('renders all four access-level options with translated labels in severity order', async () => {
    render();

    await userEvent.click(renderResult.getByTestId(testSubj));

    const optionLabels = renderResult.getAllByRole('option').map((option) => option.textContent);
    expect(optionLabels).toEqual([
      'Allow read, write and execute',
      'Read and write',
      'Read only',
      'Block all',
    ]);

    const allowAllOption = renderResult.getByRole('option', {
      name: /^Allow read, write and execute$/,
    });
    expect(allowAllOption.querySelector('[color="danger"]')).toBeInTheDocument();

    const blockAllOption = renderResult.getByRole('option', { name: /^Block all$/ });
    expect(blockAllOption.querySelector('[color="success"]')).toBeInTheDocument();
  });

  it.each([
    [DeviceControlAccessLevel.audit, 'Allow read, write and execute'],
    [DeviceControlAccessLevel.no_execute, 'Read and write'],
    [DeviceControlAccessLevel.read_only, 'Read only'],
    [DeviceControlAccessLevel.deny_all, 'Block all'],
  ])('displays the selected %s access level', (accessLevel, label) => {
    render({ accessLevel });

    expect(renderResult.getByTestId(testSubj)).toHaveTextContent(label);
  });

  it('fires onAccessLevelChange with the selected access level', async () => {
    render();

    await userEvent.click(renderResult.getByTestId(testSubj));
    await userEvent.click(renderResult.getByRole('option', { name: 'Read only' }));

    expect(props.onAccessLevelChange).toHaveBeenCalledTimes(1);
    expect(props.onAccessLevelChange).toHaveBeenCalledWith(DeviceControlAccessLevel.read_only);
  });

  it('renders disabled when disabled is true', () => {
    render({ disabled: true });

    expect(renderResult.getByTestId(testSubj)).toBeDisabled();
  });

  it('keeps a constant width across the shortest and longest access-level labels', () => {
    // "Allow read, write and execute" is much longer than "Block all"; the control must not
    // resize with the selection, and the popover inherits this width.
    const renderer = createAppRootMockRenderer();
    const result = renderer.render(
      <PerOsDeviceControlAccessLevelSelect
        accessLevel={DeviceControlAccessLevel.deny_all}
        onAccessLevelChange={jest.fn()}
        data-test-subj={testSubj}
      />
    );

    const widthSubj = `${testSubj}-fixedWidth`;
    const narrowest = getComputedStyle(result.getByTestId(widthSubj)).inlineSize;

    expect(narrowest).toBeTruthy();
    expect(result.getByTestId(widthSubj)).toHaveStyleRule('inline-size', narrowest);

    result.rerender(
      <PerOsDeviceControlAccessLevelSelect
        accessLevel={DeviceControlAccessLevel.audit}
        onAccessLevelChange={jest.fn()}
        data-test-subj={testSubj}
      />
    );

    expect(result.getByTestId(widthSubj)).toHaveStyleRule('inline-size', narrowest);
    expect(result.getByTestId(widthSubj)).toHaveStyleRule('max-inline-size', '100%');
  });
});
