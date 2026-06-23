/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { TextExpansionErrors } from './text_expansion_errors';

describe('TextExpansionErrors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({});
  });
  const error = {
    title: 'some-error-title',
    message: 'some-error-message',
  };
  it('extracts error panel with the given title and message', () => {
    renderWithKibanaRenderContext(<TextExpansionErrors error={error} />);
    expect(screen.getByText(error.title)).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });
});
