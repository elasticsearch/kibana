/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTestingProviders } from '../../../../common/mock';
import { SavedObjectRow } from './saved_object_row';
import type { FoundSavedObject } from './types';

const savedObject: FoundSavedObject = {
  id: 'so-1',
  type: 'dashboard',
  meta: { title: 'My dashboard' },
  references: [],
  updated_at: '2025-01-01T00:00:00.000Z',
};

const baseProps = {
  savedObject,
  title: 'My dashboard',
  typeLabel: 'Dashboard',
  href: '/app/dashboards#/view/so-1',
  isAttached: false,
  isAttachInFlight: false,
  isAttachingAny: false,
  taggingApi: undefined,
  onAttach: jest.fn(),
};

describe('SavedObjectRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title link, type badge, and "Attach" action', () => {
    renderWithTestingProviders(<SavedObjectRow {...baseProps} />);

    const link = screen.getByTestId(`cases-attach-so-link-${savedObject.id}`);
    expect(link).toHaveAttribute('href', baseProps.href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('My dashboard');

    expect(screen.getByTestId('cases-attach-so-card-type')).toHaveTextContent('Dashboard');
    expect(screen.getByTestId(`cases-attach-so-button-${savedObject.id}`)).toHaveTextContent(
      'Attach'
    );
  });

  it('renders an updated-at row when present', () => {
    renderWithTestingProviders(<SavedObjectRow {...baseProps} />);
    expect(screen.getByTestId('cases-attach-so-card-updated')).toBeInTheDocument();
  });

  it('omits updated-at when the SO has no updated_at', () => {
    renderWithTestingProviders(
      <SavedObjectRow {...baseProps} savedObject={{ ...savedObject, updated_at: undefined }} />
    );
    expect(screen.queryByTestId('cases-attach-so-card-updated')).not.toBeInTheDocument();
  });

  it('invokes onAttach with the saved object when the button is clicked', async () => {
    const onAttach = jest.fn();
    renderWithTestingProviders(<SavedObjectRow {...baseProps} onAttach={onAttach} />);

    await userEvent.click(screen.getByTestId(`cases-attach-so-button-${savedObject.id}`));
    expect(onAttach).toHaveBeenCalledWith(savedObject);
  });

  it('shows the attached state (disabled + "Attached") when isAttached is true', () => {
    renderWithTestingProviders(<SavedObjectRow {...baseProps} isAttached />);
    const button = screen.getByTestId(`cases-attach-so-button-${savedObject.id}`);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Attached');
  });

  it('disables the button while another row is being attached', () => {
    renderWithTestingProviders(<SavedObjectRow {...baseProps} isAttachingAny />);
    expect(screen.getByTestId(`cases-attach-so-button-${savedObject.id}`)).toBeDisabled();
  });

  it('keeps the button disabled while its own attach request is in flight', async () => {
    const onAttach = jest.fn();
    renderWithTestingProviders(
      <SavedObjectRow {...baseProps} isAttachInFlight isAttachingAny onAttach={onAttach} />
    );
    const button = screen.getByTestId(`cases-attach-so-button-${savedObject.id}`);
    expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('renders the title as a disabled link when no href is provided', () => {
    renderWithTestingProviders(<SavedObjectRow {...baseProps} href={undefined} />);
    expect(screen.getByTestId(`cases-attach-so-link-${savedObject.id}`)).toBeDisabled();
  });
});
