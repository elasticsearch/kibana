/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';
import { TestProvidersComponent } from '../../../../threat_intelligence/mocks/test_providers';
import type { EntityToAttach } from '..';
import { AddToCase } from './add_to_case';

jest.mock('../../../../common/lib/kibana');

const ENTITY: EntityToAttach = {
  id: 'entity-store-id-abc',
  name: 'host-alice',
  type: 'host',
};

describe('AddToCase', () => {
  const mockOpen = jest.fn();
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana().services.cases.hooks.useCasesAddToExistingCaseModal = jest
      .fn()
      .mockReturnValue({ open: mockOpen });
  });

  it('renders the singular case action', () => {
    render(
      <TestProvidersComponent>
        <AddToCase entity={ENTITY} onClick={mockOnClick} />
      </TestProvidersComponent>
    );

    expect(screen.getByText('Add to case')).toBeInTheDocument();
  });

  it('opens the unified case modal with the entity attachment', () => {
    render(
      <TestProvidersComponent>
        <AddToCase entity={ENTITY} onClick={mockOnClick} />
      </TestProvidersComponent>
    );

    fireEvent.click(screen.getByRole('button', { name: /add to case/i }));

    expect(mockOnClick).toHaveBeenCalledTimes(1);
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

  it('forwards the test subject', () => {
    render(
      <TestProvidersComponent>
        <AddToCase entity={ENTITY} onClick={mockOnClick} data-test-subj="my-add-to-case" />
      </TestProvidersComponent>
    );

    expect(screen.getByTestId('my-add-to-case')).toBeInTheDocument();
  });
});
