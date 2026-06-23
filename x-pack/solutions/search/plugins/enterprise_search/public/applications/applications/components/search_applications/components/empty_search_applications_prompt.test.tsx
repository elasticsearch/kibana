/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { EmptySearchApplicationsPrompt } from './empty_search_applications_prompt';

describe('EmptySearchApplicationsPrompt', () => {
  it('should pass children to prompt actions', () => {
    const dummyEl = <div>dummy</div>;

    renderWithKibanaRenderContext(
      <EmptySearchApplicationsPrompt>{dummyEl}</EmptySearchApplicationsPrompt>
    );

    expect(screen.getByText('dummy')).toBeInTheDocument();
  });
});
