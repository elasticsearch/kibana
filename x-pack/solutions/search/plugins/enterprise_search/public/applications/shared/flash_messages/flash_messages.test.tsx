/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

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

    renderWithKibanaRenderContext(<FlashMessages />);

    const callouts = screen.getAllByTestId('flashMessageCallout');
    expect(callouts).toHaveLength(5);
    // success type maps to iconType='check'
    expect(callouts[0].querySelector('[data-euiicon-type="check"]')).not.toBeNull();
    expect(screen.getByTestId('error')).toBeInTheDocument();
    // info type maps to iconType='info'
    expect(
      callouts[callouts.length - 1].querySelector('[data-euiicon-type="info"]')
    ).not.toBeNull();
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
