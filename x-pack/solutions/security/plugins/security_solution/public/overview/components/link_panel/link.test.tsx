/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Link } from './link';

describe('Link', () => {
  it('renders <a> tag when there is a path', () => {
    render(<Link copy="test_copy" path="/test-path" />);

    expect(screen.getByTestId('panel-link')).toBeInTheDocument();
    expect(screen.getByTestId('panel-link')).toHaveAttribute('href', '/test-path');
    expect(screen.getByTestId('panel-link')).toHaveTextContent('test_copy');
  });

  it('does not render <a> tag when there is no path', () => {
    render(<Link copy="test_copy" />);

    expect(screen.getByText('test_copy')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-link')).toBeNull();
  });
});
