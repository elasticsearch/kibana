/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';

import { coreMock } from '@kbn/core/public/mocks';
import { useUpdateUserProfile } from '@kbn/user-profile-components';
import { AppearanceModal } from './appearance_modal';

jest.mock('@kbn/user-profile-components', () => {
  const original = jest.requireActual('@kbn/user-profile-components');
  return {
    ...original,
    useUpdateUserProfile: jest.fn().mockImplementation(() => ({
      userProfileData: {
        userSettings: {
          darkMode: 'light',
          contrastMode: 'standard',
        },
      },
      isLoading: false,
      update: jest.fn(),
      userProfileLoaded: true,
    })),
  };
});

jest.mock('./values_group', () => ({
  ValuesGroup: jest.fn().mockImplementation(({ title, selectedValue, onChange }) => (
    <div data-test-subj={`values-group-${title}`}>
      <h3>{title}</h3>
      <div>
        <button data-test-subj={`option-dark-${title}`} onClick={() => onChange('dark')}>
          Dark
        </button>
        <button data-test-subj={`option-high-${title}`} onClick={() => onChange('high')}>
          High
        </button>
      </div>
      <div>Selected: {selectedValue}</div>
    </div>
  )),
}));

describe('AppearanceModal', () => {
  const closeModal = jest.fn();
  const uiSettingsClient = coreMock.createStart().uiSettings;
  let updateMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    updateMock = jest.fn();
    (useUpdateUserProfile as jest.Mock).mockImplementation(() => ({
      userProfileData: {
        userSettings: {
          darkMode: 'light',
          contrastMode: 'standard',
        },
      },
      isLoading: false,
      update: updateMock,
      userProfileLoaded: true,
    }));
  });

  it('renders both color mode and contrast mode components', () => {
    const { getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    // Check that both the color mode and contrast mode components are rendered
    expect(getByTestId('values-group-Color mode')).toBeInTheDocument();
    expect(getByTestId('values-group-Interface contrast')).toBeInTheDocument();
  });

  it('updates color mode when user changes selection', () => {
    const { getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    // Click the dark option in the color mode group
    fireEvent.click(getByTestId('option-dark-Color mode'));

    // Check that the onChange handler was called with colorMode: dark
    expect(getByTestId('values-group-Color mode')).toHaveTextContent('Selected: dark');
  });

  it('updates contrast mode when user changes selection', () => {
    const { getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    // Click the high contrast option
    fireEvent.click(getByTestId('option-high-Interface contrast'));

    // Check that the contrast mode was updated
    expect(getByTestId('values-group-Interface contrast')).toHaveTextContent('Selected: high');
  });

  it('saves both color mode and contrast mode when saving changes', async () => {
    const { getByText, getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    // Change color mode to dark
    fireEvent.click(getByTestId('option-dark-Color mode'));

    // Change contrast mode to high
    fireEvent.click(getByTestId('option-high-Interface contrast'));

    // Click save button
    fireEvent.click(getByText('Save changes'));

    // Check that the update function was called with both settings
    expect(updateMock).toHaveBeenCalledWith({
      userSettings: {
        darkMode: 'dark',
        contrastMode: 'high',
      },
    });

    // Modal should be closed
    expect(closeModal).toHaveBeenCalled();
  });

  it('discards changes when clicking discard button', () => {
    const { getByText, getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    // Change color mode to dark
    fireEvent.click(getByTestId('option-dark-Color mode'));

    // Change contrast mode to high
    fireEvent.click(getByTestId('option-high-Interface contrast'));

    // Click discard button
    fireEvent.click(getByText('Discard'));

    // Check that the update function was not called
    expect(updateMock).not.toHaveBeenCalled();

    // Modal should be closed
    expect(closeModal).toHaveBeenCalled();
  });

  it('does not update settings if no changes were made', () => {
    const { getByText } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    // Click save button without making changes
    fireEvent.click(getByText('Save changes'));

    // Update should not be called since no changes were made
    expect(updateMock).not.toHaveBeenCalled();

    // Modal should still be closed
    expect(closeModal).toHaveBeenCalled();
  });

  it('defaults color mode to "system" when the user has no persisted preference', () => {
    // No `darkMode` persisted in the user profile -> falls back to the default
    (useUpdateUserProfile as jest.Mock).mockImplementation(() => ({
      userProfileData: {
        userSettings: {
          contrastMode: 'standard',
        },
      },
      isLoading: false,
      update: updateMock,
      userProfileLoaded: true,
    }));

    const { getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={false}
      />
    );

    expect(getByTestId('values-group-Color mode')).toHaveTextContent('Selected: system');
  });

  it('shows contrast options even in serverless mode', () => {
    const { getByTestId } = render(
      <AppearanceModal
        closeModal={closeModal}
        uiSettingsClient={uiSettingsClient}
        isServerless={true}
      />
    );

    // Contrast mode should still be present in serverless mode
    expect(getByTestId('values-group-Interface contrast')).toBeInTheDocument();
  });
});
