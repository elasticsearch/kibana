/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';

import { ImportJsonFlyoutContent } from './import_json_flyout_content';
import type { ImportJsonFlyoutServices } from './types';

const VALID_STATE = { title: 'My Object', panels: [] };
const VALID_FILE = new File([JSON.stringify(VALID_STATE)], 'object.json', {
  type: 'application/json',
});

const createServices = (): ImportJsonFlyoutServices => ({
  application: {
    getUrlForApp: () => '/app/management/kibana/objects',
  },
  notifications: {
    toasts: {
      addDanger: jest.fn(),
    },
  },
});

const renderFlyout = ({
  sanitizeImportJson = jest.fn().mockResolvedValue({ data: VALID_STATE, warnings: [] }),
  createFromJson = jest.fn().mockResolvedValue({ id: 'new-id', title: 'My Object' }),
  onImportSuccess = jest.fn(),
  closeFlyout = jest.fn(),
  services = createServices(),
}: {
  sanitizeImportJson?: jest.Mock;
  createFromJson?: jest.Mock;
  onImportSuccess?: jest.Mock;
  closeFlyout?: jest.Mock;
  services?: ImportJsonFlyoutServices;
} = {}) => {
  render(
    <I18nProvider>
      <ImportJsonFlyoutContent
        title="Import object"
        titleId="import-json-title"
        closeFlyout={closeFlyout}
        dataTestSubjPrefix="test"
        exportApplication="Test application"
        services={services}
        isTechnicalPreview
        serverValidationError="The file could not be imported."
        sanitizeImportJson={sanitizeImportJson}
        createFromJson={createFromJson}
        onImportSuccess={onImportSuccess}
      />
    </I18nProvider>
  );
  return { sanitizeImportJson, createFromJson, onImportSuccess, closeFlyout, services };
};

const pickFile = async (file: File) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    await userEvent.upload(input, file);
  });
};

describe('ImportJsonFlyoutContent', () => {
  it('renders the file picker and info callout with NDJSON note', () => {
    renderFlyout();
    expect(screen.getByTestId('testFilePicker')).toBeInTheDocument();
    expect(screen.getByTestId('testTechnicalPreviewBadge')).toBeInTheDocument();
    expect(screen.getByText(/exported from Test application/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'here' })).toHaveAttribute(
      'href',
      '/app/management/kibana/objects'
    );
  });

  it('shows a JSON parse error when the file is not valid JSON', async () => {
    const { sanitizeImportJson } = renderFlyout();
    await pickFile(new File(['not json }{'], 'bad.json', { type: 'application/json' }));
    await waitFor(() =>
      expect(screen.getByText(/does not contain valid JSON/)).toBeInTheDocument()
    );
    expect(sanitizeImportJson).not.toHaveBeenCalled();
  });

  it('shows a file size error without reading an oversized file', async () => {
    const { sanitizeImportJson } = renderFlyout();
    const oversized = new File(['{}'], 'big.json', { type: 'application/json' });
    Object.defineProperty(oversized, 'size', { value: 26_214_401 });
    await pickFile(oversized);
    await waitFor(() =>
      expect(screen.getByText(/maximum size is 25 MB/)).toBeInTheDocument()
    );
    expect(sanitizeImportJson).not.toHaveBeenCalled();
    expect(screen.getByTestId('testImportButton')).toBeDisabled();
  });

  it('shows the server error callout when sanitize rejects the file', async () => {
    const sanitizeImportJson = jest.fn().mockRejectedValue(new Error('invalid'));
    renderFlyout({ sanitizeImportJson });
    await pickFile(VALID_FILE);
    await waitFor(() => expect(screen.getByTestId('testServerError')).toBeInTheDocument());
    expect(screen.getByText(/could not be imported/)).toBeInTheDocument();
    expect(screen.getByTestId('testImportButton')).toBeDisabled();
  });

  it('enables Import after a valid file is chosen', async () => {
    const { sanitizeImportJson } = renderFlyout();
    await pickFile(VALID_FILE);
    await waitFor(() => expect(sanitizeImportJson).toHaveBeenCalledWith(VALID_STATE));
    expect(screen.getByTestId('testImportButton')).toBeEnabled();
  });

  it('shows collapsible warnings above the file picker but still allows import', async () => {
    const user = userEvent.setup();
    const sanitizeImportJson = jest.fn().mockResolvedValue({
      data: VALID_STATE,
      warnings: ['Panel "chart-1" could not be loaded'],
    });
    renderFlyout({ sanitizeImportJson });
    await pickFile(VALID_FILE);
    await waitFor(() => expect(screen.getByTestId('testWarnings')).toBeInTheDocument());
    expect(screen.getByText(/Unsupported properties were removed/)).toBeInTheDocument();
    expect(screen.getByText(/1 item removed from the imported JSON/)).toBeInTheDocument();
    expect(screen.queryByTestId('testWarningsList')).not.toBeInTheDocument();

    await user.click(screen.getByText('Show details'));
    expect(screen.getByTestId('testWarningsList')).toBeInTheDocument();
    expect(screen.getByText(/Panel "chart-1" could not be loaded/)).toBeInTheDocument();

    const warnings = screen.getByTestId('testWarnings');
    const filePicker = screen.getByTestId('testFilePicker');
    const position = warnings.compareDocumentPosition(filePicker);
    expect(Math.floor(position / Node.DOCUMENT_POSITION_FOLLOWING) % 2).toBe(1);
    expect(screen.getByTestId('testImportButton')).toBeEnabled();
  });

  it('creates the object and calls onImportSuccess', async () => {
    const { createFromJson, onImportSuccess, closeFlyout } = renderFlyout();
    await pickFile(VALID_FILE);
    await waitFor(() => expect(screen.getByTestId('testImportButton')).toBeEnabled());
    await act(async () => {
      await userEvent.click(screen.getByTestId('testImportButton'));
    });
    await waitFor(() => expect(createFromJson).toHaveBeenCalledWith(VALID_STATE));
    expect(onImportSuccess).toHaveBeenCalledWith('new-id', 'My Object');
    expect(closeFlyout).toHaveBeenCalled();
  });

  it('shows a danger toast when createFromJson fails', async () => {
    const createFromJson = jest.fn().mockRejectedValue(new Error('create failed'));
    const { services } = renderFlyout({ createFromJson });
    await pickFile(VALID_FILE);
    await waitFor(() => expect(screen.getByTestId('testImportButton')).toBeEnabled());
    await act(async () => {
      await userEvent.click(screen.getByTestId('testImportButton'));
    });
    await waitFor(() =>
      expect(services.notifications.toasts.addDanger).toHaveBeenCalledWith({
        title: 'Import object',
        text: 'create failed',
      })
    );
  });
});
