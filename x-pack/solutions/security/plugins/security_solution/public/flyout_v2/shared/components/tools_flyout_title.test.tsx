/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { ToolsFlyoutTitle } from './tools_flyout_title';
import { TOOLS_FLYOUT_HEADER_TITLE_TEST_ID } from './test_ids';

describe('<ToolsFlyoutTitle />', () => {
  it('renders the label', () => {
    const { getByTestId } = render(
      <ToolsFlyoutTitle onTitleClick={jest.fn()} label="my-host" iconType="storage" />
    );
    expect(getByTestId(TOOLS_FLYOUT_HEADER_TITLE_TEST_ID)).toHaveTextContent('my-host');
  });

  it('calls onTitleClick when clicked', () => {
    const onTitleClick = jest.fn();
    const { getByTestId } = render(
      <ToolsFlyoutTitle onTitleClick={onTitleClick} label="my-host" iconType="storage" />
    );
    fireEvent.click(getByTestId(TOOLS_FLYOUT_HEADER_TITLE_TEST_ID));
    expect(onTitleClick).toHaveBeenCalledTimes(1);
  });
});
