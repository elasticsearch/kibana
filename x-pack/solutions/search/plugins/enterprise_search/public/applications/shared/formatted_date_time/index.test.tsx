/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { render, screen } from '@testing-library/react';

import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';

import { FormattedDateTime } from '.';

const renderWithIntl = (ui: React.ReactElement) =>
  render(<IntlProvider locale="en">{ui}</IntlProvider>);

describe('FormattedDateTime', () => {
  it('renders a standard i18n-friendly combined date & time stamp', () => {
    const date = new Date('1970-01-01T12:00:00');
    renderWithIntl(<FormattedDateTime date={date} />);

    expect(screen.getByText(/Jan 1, 1970/)).toBeInTheDocument();
    expect(screen.getByText(/12:00 PM/)).toBeInTheDocument();
  });

  it('does not render time if hideTime is passed', () => {
    const date = new Date('1970-01-01T12:00:00');
    renderWithIntl(<FormattedDateTime date={date} hideTime />);

    expect(screen.getByText('Jan 1, 1970')).toBeInTheDocument();
    expect(screen.queryByText(/12:00 PM/)).not.toBeInTheDocument();
  });
});
