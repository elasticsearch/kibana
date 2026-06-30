/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';
import { AddToExistingCase } from './add_to_existing_case';
import { TestProvidersComponent } from '../../../../threat_intelligence/mocks/test_providers';
import type { EntityToAttach } from '..';

jest.mock('../../../../common/lib/kibana');

const ENTITY: EntityToAttach = {
  id: 'entity-store-id-abc',
  name: 'host-alice',
  type: 'host',
};

describe('AddToExistingCase', () => {
  const mockOpen = jest.fn();
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana().services.cases.hooks.useCasesAddToExistingCaseModal = jest
      .fn()
      .mockReturnValue({ open: mockOpen });
  });

  it('renders the menu item with the correct label', () => {
    render(
      <TestProvidersComponent>
        <AddToExistingCase entity={ENTITY} onClick={mockOnClick} />
      </TestProvidersComponent>
    );

    expect(screen.getByText('Add to existing case')).toBeInTheDocument();
  });

  it('calls onClick and opens the existing-case modal on click', () => {
    render(
      <TestProvidersComponent>
        <AddToExistingCase entity={ENTITY} onClick={mockOnClick} />
      </TestProvidersComponent>
    );

    fireEvent.click(screen.getByRole('button', { name: /add to existing case/i }));

    expect(mockOnClick).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        getAttachments: expect.any(Function),
      })
    );

    // Verify the getAttachments callback returns the correct payload.
    const { getAttachments } = mockOpen.mock.calls[0][0];
    expect(getAttachments()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'security.entity',
          metadata: expect.objectContaining({
            entityName: 'host-alice',
            entityType: 'host',
          }),
        }),
      ])
    );
  });

  it('forwards a data-test-subj to the menu item', () => {
    render(
      <TestProvidersComponent>
        <AddToExistingCase
          entity={ENTITY}
          onClick={mockOnClick}
          data-test-subj="my-add-to-existing-case"
        />
      </TestProvidersComponent>
    );

    expect(screen.getByTestId('my-add-to-existing-case')).toBeInTheDocument();
  });
});
