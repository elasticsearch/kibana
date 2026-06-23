/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { basicCase } from '../../../containers/mock';

import { Description } from '.';

import { noUpdateCasesPermissions, renderWithTestingProviders } from '../../../common/mock';
import { MAX_DESCRIPTION_LENGTH } from '../../../../common/constants';

jest.mock('../../../common/lib/kibana');
jest.mock('../../../common/navigation/hooks');

const defaultProps = {
  appId: 'securitySolution',
  caseData: {
    ...basicCase,
  },
  isLoadingDescription: false,
};

describe('Description', () => {
  const onUpdateField = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders description correctly', async () => {
    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />);

    expect(await screen.findByTestId('description')).toBeInTheDocument();
    expect(await screen.findByText('Security banana Issue')).toBeInTheDocument();
  });

  it('hides and shows the description correctly when collapse button clicked', async () => {
    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />);

    await userEvent.click(await screen.findByTestId('description-collapse-icon'));

    await waitFor(() => {
      expect(screen.getByTestId('description-preview')).toHaveTextContent('Security banana Issue');
    });

    await userEvent.click(await screen.findByTestId('description-collapse-icon'));

    await waitFor(() => {
      expect(screen.queryByTestId('description-preview')).not.toBeInTheDocument();
    });

    expect(await screen.findByText('Security banana Issue')).toBeInTheDocument();
  });

  it('shows textarea on edit click', async () => {
    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />);

    await userEvent.click(await screen.findByTestId('description-edit-icon'));

    expect(await screen.findByTestId('euiMarkdownEditorTextArea')).toBeInTheDocument();
  });

  it('edits the description correctly when saved', async () => {
    const editedDescription = 'New updated description';
    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />);

    await userEvent.click(await screen.findByTestId('description-edit-icon'));

    await userEvent.clear(await screen.findByTestId('euiMarkdownEditorTextArea'));
    await userEvent.click(await screen.findByTestId('euiMarkdownEditorTextArea'));
    await userEvent.paste(editedDescription);

    await userEvent.click(await screen.findByTestId('editable-save-markdown'));

    await waitFor(() => {
      expect(onUpdateField).toHaveBeenCalledWith({
        key: 'description',
        value: editedDescription,
      });
    });
  });

  it('keeps the old description correctly when canceled', async () => {
    const editedDescription = 'New updated description';
    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />);

    await userEvent.click(await screen.findByTestId('description-edit-icon'));

    await userEvent.clear(await screen.findByTestId('euiMarkdownEditorTextArea'));
    await userEvent.click(await screen.findByTestId('euiMarkdownEditorTextArea'));
    await userEvent.paste(editedDescription);

    expect(await screen.findByText(editedDescription)).toBeInTheDocument();

    await userEvent.click(await screen.findByTestId('editable-cancel-markdown'));

    await waitFor(() => {
      expect(onUpdateField).not.toHaveBeenCalled();
    });

    expect(await screen.findByText('Security banana Issue')).toBeInTheDocument();
  });

  it('shows an error when description is too long', async () => {
    const longDescription = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);

    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />);

    await userEvent.click(await screen.findByTestId('description-edit-icon'));

    await userEvent.clear(await screen.findByTestId('euiMarkdownEditorTextArea'));
    await userEvent.click(await screen.findByTestId('euiMarkdownEditorTextArea'));
    await userEvent.paste(longDescription);

    expect(
      await screen.findByText(
        'The length of the description is too long. The maximum length is 30000 characters.'
      )
    ).toBeInTheDocument();

    expect(await screen.findByTestId('editable-save-markdown')).toHaveAttribute('disabled');
  });

  it('should hide the edit button when the user does not have update permissions', async () => {
    renderWithTestingProviders(<Description {...defaultProps} onUpdateField={onUpdateField} />, {
      wrapperProps: { permissions: noUpdateCasesPermissions() },
    });

    expect(await screen.findByText('Security banana Issue')).toBeInTheDocument();
    expect(screen.queryByTestId('description-edit-icon')).not.toBeInTheDocument();
  });

  it('should display description when case is loading', async () => {
    renderWithTestingProviders(
      <Description {...defaultProps} onUpdateField={onUpdateField} isLoadingDescription={true} />
    );

    expect(await screen.findByTestId('description')).toBeInTheDocument();
  });

  describe('draft message', () => {
    const draftStorageKey = `cases.securitySolution.basic-case-id.description.markdownEditor`;

    beforeEach(() => {
      sessionStorage.setItem(draftStorageKey, 'value set in storage');
    });

    it('should not show unsaved draft message when loading', async () => {
      renderWithTestingProviders(
        <Description {...defaultProps} onUpdateField={onUpdateField} isLoadingDescription={true} />
      );

      expect(screen.queryByTestId('description-unsaved-draft')).not.toBeInTheDocument();
    });

    it('should not show unsaved draft message when description and storage value are same', async () => {
      const props = {
        ...defaultProps,
        caseData: { ...defaultProps.caseData, description: 'value set in storage' },
      };

      renderWithTestingProviders(<Description {...props} onUpdateField={onUpdateField} />);

      expect(screen.queryByTestId('description-unsaved-draft')).not.toBeInTheDocument();
    });
  });
});
