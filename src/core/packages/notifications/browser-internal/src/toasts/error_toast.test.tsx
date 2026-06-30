/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getErrorToastActionProps } from './error_toast';
import { renderingServiceMock } from '@kbn/core-rendering-browser-mocks';
import { FormattedMessage } from '@kbn/i18n-react';

let openModal: jest.Mock;
const mockRendering = renderingServiceMock.create();

beforeEach(() => (openModal = jest.fn()));

it('returns actionProps with a primary action', () => {
  const props = getErrorToastActionProps({
    error: new Error('error message'),
    title: 'An error occured',
    openModal,
    rendering: mockRendering,
  });

  expect(props.primary).toMatchObject({
    'data-test-subj': 'errorToastBtn',
    children: expect.objectContaining({ type: FormattedMessage }),
    onClick: expect.any(Function),
  });
});

it('should open a modal when onClick is called', () => {
  const props = getErrorToastActionProps({
    error: new Error('error message'),
    title: 'An error occured',
    openModal,
    rendering: mockRendering,
  });

  expect(openModal).not.toHaveBeenCalled();
  props.primary.onClick();
  expect(openModal).toHaveBeenCalled();
});

afterAll(() => {
  // Cleanup document.body to cleanup any modals which might be left over from tests.
  document.body.innerHTML = '';
});
