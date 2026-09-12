/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { Loading } from './loading';

describe('<Loading />', () => {
  it('uses EuiIcon by default', () => {
    const { container } = render(<Loading />);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="canvasLoading css-1bn8xt9-loadingStyles"
      >
        <span
          aria-hidden="true"
          color="ghost"
          data-euiicon-type="clock"
        />
      </div>
    `);
  });

  it('uses EuiLoadingSpinner when animating', () => {
    const { container } = render(<Loading animated />);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <div
        class="canvasLoading css-1bn8xt9-loadingStyles"
      >
        <span
          aria-label="Loading"
          class="euiLoadingSpinner emotion-euiLoadingSpinner-m"
          role="progressbar"
        />
      </div>
    `);
  });
});
