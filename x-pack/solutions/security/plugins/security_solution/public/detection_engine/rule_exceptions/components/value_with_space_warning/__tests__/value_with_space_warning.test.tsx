/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';

import { ValueWithSpaceWarning } from '..';

import * as useValueWithSpaceWarningMock from '../use_value_with_space_warning';

jest.mock('../use_value_with_space_warning');

describe('ValueWithSpaceWarning', () => {
  beforeEach(() => {
    // @ts-ignore
    useValueWithSpaceWarningMock.useValueWithSpaceWarning = jest
      .fn()
      .mockReturnValue({ showSpaceWarningIcon: true, warningText: 'Warning Text' });
  });
  it('should not render if value is falsy', () => {
    const container = render(
      <EuiProvider>
        <ValueWithSpaceWarning value="" />
      </EuiProvider>
    );
    expect(container.container).toMatchSnapshot();
  });
  it('should not render if showSpaceWarning is falsy', () => {
    // @ts-ignore
    useValueWithSpaceWarningMock.useValueWithSpaceWarning = jest
      .fn()
      .mockReturnValue({ showSpaceWarningIcon: false, warningText: '' });

    const container = render(
      <EuiProvider>
        <ValueWithSpaceWarning value="Test" />
      </EuiProvider>
    );
    expect(container.container).toMatchSnapshot();
  });
  it('should render if showSpaceWarning is truthy', () => {
    const container = render(
      <EuiProvider>
        <ValueWithSpaceWarning value="Test" />
      </EuiProvider>
    );
    expect(container.container).toMatchSnapshot();
  });
  it('should show the tooltip when the icon is hovered', async () => {
    const container = render(
      <EuiProvider>
        <ValueWithSpaceWarning value="Test" />
      </EuiProvider>
    );

    fireEvent.mouseOver(container.getByTestId('value_with_space_warning_tooltip'));
    expect(await container.findByText('Warning Text')).toBeInTheDocument();
  });
});
