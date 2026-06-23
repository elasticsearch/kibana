/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '../../../common/__mocks__';
import '../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { MemoryRouter } from '@kbn/shared-ux-router';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { Analytics } from '.';

describe('EnterpriseSearchAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('always renders the overview', () => {
    renderWithKibanaRenderContext(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    expect(screen.getByText('Behavioral Analytics')).toBeInTheDocument();
  });
});
