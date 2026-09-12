/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AttachmentActionType } from '../../client/attachment_framework/types';
import { renderAttachmentAction } from './attachment_action';
import { TestProviders } from '../../common/mock';

describe('renderAttachmentAction', () => {
  it('renders a BUTTON action with EuiButtonIcon inside EuiFlexItem', () => {
    const onClick = jest.fn();
    const action = {
      type: AttachmentActionType.BUTTON as const,
      isPrimary: true,
      label: 'Delete',
      iconType: 'trash',
      onClick,
    };

    render(
      <TestProviders>
        <div>{renderAttachmentAction(action, 'test-subj-1')}</div>
      </TestProviders>
    );

    const button = screen.getByLabelText('Delete');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-test-subj', 'test-subj-1-trash');
  });

  it('calls onClick when the BUTTON action button is clicked', async () => {
    const onClick = jest.fn();
    const action = {
      type: AttachmentActionType.BUTTON as const,
      isPrimary: true,
      label: 'Delete',
      iconType: 'trash',
      onClick,
    };

    render(
      <TestProviders>
        <div>{renderAttachmentAction(action, 'test-subj-1')}</div>
      </TestProviders>
    );

    await userEvent.click(screen.getByLabelText('Delete'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a CUSTOM action by calling its render function', () => {
    const action = {
      type: AttachmentActionType.CUSTOM as const,
      isPrimary: true,
      render: () => (
        <button type="button" data-test-subj="custom-action-button">
          {'Custom'}
        </button>
      ),
    };

    render(
      <TestProviders>
        <div>{renderAttachmentAction(action, 'test-subj-1')}</div>
      </TestProviders>
    );

    expect(screen.getByTestId('custom-action-button')).toBeInTheDocument();
    expect(screen.getByTestId('custom-action-button')).toHaveTextContent('Custom');
  });

  it('returns null for a CUSTOM action whose render returns null', () => {
    const action = {
      type: AttachmentActionType.CUSTOM as const,
      render: () => null,
    };

    render(
      <TestProviders>
        <div data-test-subj="wrapper">{renderAttachmentAction(action, 'test-subj-1')}</div>
      </TestProviders>
    );

    expect(screen.getByTestId('wrapper')).toBeEmptyDOMElement();
  });

  it('applies the testSubj to the BUTTON flex item', () => {
    const action = {
      type: AttachmentActionType.BUTTON as const,
      label: 'Delete',
      iconType: 'trash',
      onClick: jest.fn(),
    };

    render(
      <TestProviders>
        <div>{renderAttachmentAction(action, 'my-custom-subj')}</div>
      </TestProviders>
    );

    // The outer EuiFlexItem should carry the testSubj
    expect(screen.getByTestId('my-custom-subj')).toBeInTheDocument();
  });
});
