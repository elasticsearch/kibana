/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { MonitorPage } from './monitor';
import { render } from '../lib/helper/rtl_helpers';

describe('MonitorPage', () => {
  it('renders', async () => {
    const { findByText, getByText } = render(<MonitorPage />);

    expect(await findByText('Up in 0 location')).toBeInTheDocument();
    expect(getByText('Overall availability')).toBeInTheDocument();
    expect(getByText('0.00 %')).toBeInTheDocument();
    expect(getByText('Url')).toBeInTheDocument();
    expect(getByText('Monitor ID')).toBeInTheDocument();
    expect(getByText('Tags')).toBeInTheDocument();
    expect(getByText('Set tags')).toBeInTheDocument();
    expect(getByText('Monitoring from')).toBeInTheDocument();
  }, 30_000);
});
