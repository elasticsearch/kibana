/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { setMockValues } from '../../../__mocks__';
import { FlashMessages } from './flash_messages';

describe('FlashMessages', () => {
  it('renders an array of callouts', () => {
    const mockMessages = [
      { type: 'success', message: 'Hello world!!' },
      {
        type: 'error',
        message: 'Whoa nelly!',
        description: <div data-test-subj="error">Something went wrong</div>,
      },
      { type: 'info', message: 'Everything is fine, nothing is ruined' },
      { type: 'warning', message: 'Uh oh' },
      { type: 'info', message: 'Testing multiples of same type' },
    ];
    setMockValues({ messages: mockMessages });

    const { container } = renderWithKibanaRenderContext(<FlashMessages />);

    const callouts = container.querySelectorAll('.euiCallOut');
    expect(callouts).toHaveLength(5);
    expect(callouts[0]).toHaveClass('euiCallOut--success');
    expect(screen.getByTestId('error')).toBeInTheDocument();
    expect(
      callouts[callouts.length - 1].querySelector('[data-euiicon-type="info"]')
    ).toBeInTheDocument();
  });

  it('renders any children', () => {
    setMockValues({ messages: [{ type: 'success' }] });

    renderWithKibanaRenderContext(
      <FlashMessages>
        <button data-test-subj="testing">
          Some action - you could even clear flash messages here
        </button>
      </FlashMessages>
    );

    expect(screen.getByTestId('testing')).toHaveTextContent('Some action');
  });
});
