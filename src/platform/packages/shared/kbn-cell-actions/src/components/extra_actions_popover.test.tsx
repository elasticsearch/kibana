/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { makeAction, makeActionContext } from '../mocks/helpers';
import { ExtraActionsPopOver, ExtraActionsPopOverWithAnchor } from './extra_actions_popover';

const actionContext = makeActionContext();
const defaultProps = {
  anchorPosition: 'rightCenter' as const,
  actionContext,
  isOpen: false,
  closePopOver: () => {},
  actions: [],
  button: <span />,
};
describe('ExtraActionsPopOver', () => {
  it('renders', () => {
    const { queryByTestId } = render(<ExtraActionsPopOver {...defaultProps} />);

    expect(queryByTestId('extraActionsPopOver')).toBeInTheDocument();
  });

  it('executes action and close popover when menu item is clicked', async () => {
    const executeAction = jest.fn();
    const closePopOver = jest.fn();
    const action = { ...makeAction('test-action'), execute: executeAction };
    const { getByTestId } = render(
      <ExtraActionsPopOver
        {...defaultProps}
        isOpen={true}
        closePopOver={closePopOver}
        actions={[action]}
      />
    );

    await act(async () => {
      await fireEvent.click(getByTestId('actionItem-test-action'));
    });

    expect(executeAction).toHaveBeenCalled();
    expect(closePopOver).toHaveBeenCalled();
  });
});

describe('ExtraActionsPopOverWithAnchor', () => {
  const anchorElement = document.createElement('span');
  document.body.appendChild(anchorElement);

  it('renders', () => {
    const { queryByTestId } = render(
      <ExtraActionsPopOverWithAnchor {...defaultProps} anchorRef={{ current: anchorElement }} />
    );

    expect(queryByTestId('extraActionsPopOverWithAnchor')).toBeInTheDocument();
  });

  it('executes action and close popover when menu item is clicked', () => {
    const executeAction = jest.fn();
    const closePopOver = jest.fn();
    const action = { ...makeAction('test-action'), execute: executeAction };
    const { getByTestId } = render(
      <ExtraActionsPopOverWithAnchor
        {...defaultProps}
        isOpen={true}
        closePopOver={closePopOver}
        actions={[action]}
        anchorRef={{ current: anchorElement }}
      />
    );

    fireEvent.click(getByTestId('actionItem-test-action'));

    expect(executeAction).toHaveBeenCalled();
    expect(closePopOver).toHaveBeenCalled();
  });
});
