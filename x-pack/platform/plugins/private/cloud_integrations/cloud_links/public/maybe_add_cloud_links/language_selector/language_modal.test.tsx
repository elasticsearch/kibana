/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, fireEvent, render } from '@testing-library/react';
import React, { type FC, type PropsWithChildren } from 'react';

import { EuiProvider } from '@elastic/eui';

import { getBrowserPreferredLocale } from '@kbn/i18n';

import { LanguageModal } from './language_modal';
import { useLanguage } from './use_language_hook';

const Wrapper: FC<PropsWithChildren<unknown>> = ({ children }) => (
  <EuiProvider>{children}</EuiProvider>
);

jest.mock('./use_language_hook');

jest.mock('@kbn/i18n', () => {
  const original = jest.requireActual('@kbn/i18n');
  return {
    ...original,
    getAvailableLocales: jest.fn(() => [
      { id: 'en', label: 'English' },
      { id: 'fr-FR', label: 'Français' },
      { id: 'ja-JP', label: '日本語' },
    ]),
    getBrowserPreferredLocale: jest.fn(() => 'en'),
  };
});

describe('LanguageModal', () => {
  const closeModal = jest.fn();
  let onChangeMock: jest.Mock;
  let reportEventMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    onChangeMock = jest.fn().mockResolvedValue(undefined);
    reportEventMock = jest.fn();

    (useLanguage as jest.Mock).mockReturnValue({
      value: 'en',
      initialValue: 'en',
      isLoading: false,
      isVisible: true,
      onChange: onChangeMock,
    });
  });

  const renderModal = (analytics: { reportEvent: jest.Mock } = { reportEvent: reportEventMock }) =>
    render(<LanguageModal closeModal={closeModal} analytics={analytics as any} />, {
      wrapper: Wrapper,
    });

  it('renders the language select with available locales', () => {
    const { getByTestId } = renderModal();
    const select = getByTestId('languageSelect') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.options).toHaveLength(3);
  });

  it('saves and reports display_language_changed event when locale changed', async () => {
    (useLanguage as jest.Mock).mockReturnValue({
      value: 'fr-FR',
      initialValue: 'en',
      isLoading: false,
      isVisible: true,
      onChange: onChangeMock,
    });

    const { getByTestId } = renderModal({ reportEvent: reportEventMock });

    await act(async () => {
      fireEvent.click(getByTestId('languageModalSaveButton'));
    });

    expect(onChangeMock).toHaveBeenCalledWith('fr-FR', true);
    expect(reportEventMock).toHaveBeenCalledWith('display_language_changed', {
      from: 'en',
      to: 'fr-FR',
      preferred_language_kibana_locale: 'en',
    });
    expect(closeModal).toHaveBeenCalled();
  });

  it('omits preferred_language_kibana_locale when the browser preference is unservable', async () => {
    (getBrowserPreferredLocale as jest.Mock).mockReturnValueOnce(undefined);
    (useLanguage as jest.Mock).mockReturnValue({
      value: 'fr-FR',
      initialValue: 'en',
      isLoading: false,
      isVisible: true,
      onChange: onChangeMock,
    });

    const { getByTestId } = renderModal({ reportEvent: reportEventMock });

    await act(async () => {
      fireEvent.click(getByTestId('languageModalSaveButton'));
    });

    expect(reportEventMock).toHaveBeenCalledWith('display_language_changed', {
      from: 'en',
      to: 'fr-FR',
    });
  });

  it('does not report event or close modal when save fails', async () => {
    onChangeMock.mockRejectedValue(new Error('save failed'));
    (useLanguage as jest.Mock).mockReturnValue({
      value: 'fr-FR',
      initialValue: 'en',
      isLoading: false,
      isVisible: true,
      onChange: onChangeMock,
    });

    const { getByTestId } = renderModal({ reportEvent: reportEventMock });

    await act(async () => {
      fireEvent.click(getByTestId('languageModalSaveButton'));
    });

    expect(onChangeMock).toHaveBeenCalledWith('fr-FR', true);
    expect(reportEventMock).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();
  });

  it('does not report event when locale is unchanged', () => {
    const { getByTestId } = renderModal({ reportEvent: reportEventMock });

    fireEvent.click(getByTestId('languageModalSaveButton'));

    expect(onChangeMock).not.toHaveBeenCalled();
    expect(reportEventMock).not.toHaveBeenCalled();
    expect(closeModal).toHaveBeenCalled();
  });

  it('discards changes and closes modal without saving or reporting', () => {
    (useLanguage as jest.Mock).mockReturnValue({
      value: 'fr-FR',
      initialValue: 'en',
      isLoading: false,
      isVisible: true,
      onChange: onChangeMock,
    });

    const { getByTestId } = renderModal({ reportEvent: reportEventMock });

    fireEvent.click(getByTestId('languageModalDiscardButton'));

    expect(reportEventMock).not.toHaveBeenCalled();
    expect(closeModal).toHaveBeenCalled();
  });
});
