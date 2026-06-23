/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { AddAnalyticsCollection } from './add_analytics_collection';

describe('AddAnalyticsCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders', () => {
    renderWithKibanaRenderContext(<AddAnalyticsCollection />);

    expect(screen.getByText('Create collection')).toBeInTheDocument();
    expect(screen.queryByText('Name your Collection')).not.toBeInTheDocument();
  });

  it('show render modal after click on button', () => {
    renderWithKibanaRenderContext(<AddAnalyticsCollection />);

    fireEvent.click(screen.getByText('Create collection'));

    expect(screen.getByText('Name your Collection')).toBeInTheDocument();
  });
});
