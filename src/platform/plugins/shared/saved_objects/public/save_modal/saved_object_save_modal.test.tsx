/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { SavedObjectSaveModal } from './saved_object_save_modal';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';

jest.mock('@elastic/eui', () => {
  const actualEui = jest.requireActual('@elastic/eui');
  return {
    ...actualEui,
    withEuiTheme: (Component: any) => (props: any) =>
      (
        <Component
          {...props}
          theme={{
            euiTheme: {
              size: { xxl: '32px' },
            },
          }}
        />
      ),
  };
});

const mockSave = jest.fn();
const mockHasLibraryItemWithTitle = jest.fn().mockResolvedValue(false);
const mockClose = jest.fn();

describe('SavedObjectSaveModal', () => {
  it('should render', async () => {
    const { findByTestId, getByText } = render(
      <I18nProvider>
        <SavedObjectSaveModal
          hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
          onSave={mockSave}
          onClose={mockClose}
          lastSavedTitle={''}
          title={'Saved Object title'}
          showCopyOnSave={false}
          objectType="visualization"
          showDescription={true}
        />
      </I18nProvider>
    );
    const modal = await findByTestId('savedObjectSaveModal');
    expect(modal).toBeVisible();
    expect(getByText('Save visualization')).toBeInTheDocument();
  });

  it('should render when given options', () => {
    const { getByText } = render(
      <I18nProvider>
        <SavedObjectSaveModal
          hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
          onSave={mockSave}
          onClose={mockClose}
          lastSavedTitle={''}
          title={'Saved Object title'}
          showCopyOnSave={false}
          objectType="visualization"
          showDescription={true}
          options={<div>Hello! Main options</div>}
          rightOptions={<div>Hey there! Options on the right</div>}
        />
      </I18nProvider>
    );
    expect(getByText('Hello! Main options')).toBeInTheDocument();
    expect(getByText('Hey there! Options on the right')).toBeInTheDocument();
  });

  it('should render when custom isValid is set', () => {
    const { getByText, rerender } = render(
      <I18nProvider>
        <SavedObjectSaveModal
          hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
          onSave={mockSave}
          onClose={mockClose}
          lastSavedTitle={''}
          title={'Saved Object title'}
          showCopyOnSave={false}
          objectType="visualization"
          showDescription={true}
          isValid={false}
        />
      </I18nProvider>
    );
    expect(getByText('Save visualization')).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <SavedObjectSaveModal
          hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
          onSave={mockSave}
          onClose={mockClose}
          lastSavedTitle={''}
          title={'Saved Object title'}
          showCopyOnSave={false}
          objectType="visualization"
          showDescription={true}
          isValid={true}
        />
      </I18nProvider>
    );
    expect(getByText('Save visualization')).toBeInTheDocument();
  });

  it('allows specifying custom save button label', () => {
    const confirmButtonLabel = 'Save and done';

    render(
      <I18nProvider>
        <SavedObjectSaveModal
          hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
          onSave={mockSave}
          onClose={mockClose}
          lastSavedTitle={''}
          title={'Saved Object title'}
          showCopyOnSave={false}
          objectType="visualization"
          showDescription={true}
          confirmButtonLabel={confirmButtonLabel}
        />
      </I18nProvider>
    );

    expect(screen.queryByText(confirmButtonLabel)).toBeInTheDocument();
  });

  it('enforces copy on save', async () => {
    const onSave = jest.fn();

    render(
      <EuiProvider>
        <I18nProvider>
          <SavedObjectSaveModal
            hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
            onSave={onSave}
            onClose={mockClose}
            lastSavedTitle={''}
            title={'Saved Object title'}
            objectType="visualization"
            showDescription={true}
            showCopyOnSave={true}
            mustCopyOnSaveMessage="You must save a copy of the object."
          />
        </I18nProvider>
      </EuiProvider>
    );

    expect(onSave).not.toHaveBeenCalled();

    expect(screen.getByTestId('saveAsNewCheckbox')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(onSave.mock.calls[0][0].newCopyOnSave).toBe(true);
    });
  });

  it('renders the form with noValidate to suppress native browser validation', () => {
    render(
      <I18nProvider>
        <SavedObjectSaveModal
          hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
          onSave={mockSave}
          onClose={mockClose}
          lastSavedTitle={''}
          title={'Saved Object title'}
          showCopyOnSave={false}
          objectType="visualization"
          showDescription={true}
        />
      </I18nProvider>
    );
    expect(document.querySelector('form')).toHaveAttribute('novalidate');
  });

  describe('handle title duplication logic', () => {
    it('should append "[1]" to title if no number is present', async () => {
      const onSave = jest.fn();

      render(
        <I18nProvider>
          <SavedObjectSaveModal
            hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
            onSave={onSave}
            onClose={() => {}}
            lastSavedTitle={''}
            title="Saved Object"
            objectType="visualization"
            showDescription={true}
            showCopyOnSave={true}
          />
        </I18nProvider>
      );

      const switchElement = screen.getByTestId('saveAsNewCheckbox');
      await userEvent.click(switchElement);

      await waitFor(() => {
        expect(screen.getByTestId('savedObjectTitle')).toHaveValue('Saved Object [1]');
      });
    });

    it('should increment the number by one when a number is already present', async () => {
      const onSave = jest.fn();

      render(
        <I18nProvider>
          <SavedObjectSaveModal
            hasLibraryItemWithTitle={mockHasLibraryItemWithTitle}
            onSave={onSave}
            onClose={() => {}}
            lastSavedTitle={''}
            title="Saved Object [1]"
            objectType="visualization"
            showDescription={true}
            showCopyOnSave={true}
          />
        </I18nProvider>
      );

      const switchElement = screen.getByTestId('saveAsNewCheckbox');
      await userEvent.click(switchElement);

      await waitFor(() => {
        expect(screen.getByTestId('savedObjectTitle')).toHaveValue('Saved Object [2]');
      });
    });
  });
});
