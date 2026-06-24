/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithTestingProviders } from '../../../../common/mock';
import { SavedObjectAddedEvent } from './saved_object_added_event';
import { useSavedObjectInAppUrl } from './use_saved_object_in_app_url';

jest.mock('./use_saved_object_in_app_url');

const useSavedObjectInAppUrlMock = useSavedObjectInAppUrl as jest.Mock;

describe('SavedObjectAddedEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title as a link when the in-app URL resolves', () => {
    useSavedObjectInAppUrlMock.mockReturnValue('/base/app/dashboards#/view/1');
    renderWithTestingProviders(
      <SavedObjectAddedEvent
        soType="dashboard"
        attachmentId="1"
        title="My dashboard"
        label="added dashboard"
        data-test-subj="ev"
      />
    );
    const link = screen.getByTestId('ev');
    expect(link).toHaveAttribute('href', '/base/app/dashboards#/view/1');
    expect(link).toHaveTextContent('My dashboard');
    expect(screen.getByText(/added dashboard/i)).toBeInTheDocument();
  });

  it('renders the title as plain text when no URL is available', () => {
    useSavedObjectInAppUrlMock.mockReturnValue(undefined);
    renderWithTestingProviders(
      <SavedObjectAddedEvent
        soType="dashboard"
        attachmentId="1"
        title="My dashboard"
        label="added dashboard"
        data-test-subj="ev"
      />
    );
    expect(screen.queryByTestId('ev')).not.toBeInTheDocument();
    expect(screen.getByText(/added dashboard\s+My dashboard/i)).toBeInTheDocument();
  });

  it('falls back to the "Untitled" label when no title is supplied', () => {
    useSavedObjectInAppUrlMock.mockReturnValue(undefined);
    renderWithTestingProviders(
      <SavedObjectAddedEvent soType="dashboard" attachmentId="fallback-id" label="added" />
    );
    expect(screen.getByText(/added\s+Untitled/i)).toBeInTheDocument();
  });
});
