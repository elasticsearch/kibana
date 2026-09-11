/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react';

const mockLoadAsync = jest.fn();
jest.mock('jszip', () => ({
  __esModule: true,
  default: { loadAsync: (...args: unknown[]) => mockLoadAsync(...args) },
}));

const mockParseYaml = jest.fn();
jest.mock('yaml', () => ({ parse: (...args: unknown[]) => mockParseYaml(...args) }));

const mockEvaluateUploadedZipPackage = jest.fn();
const mockRunInstallPackage = jest.fn();
const mockGetIntegrationNameFromResponse = jest.fn();
jest.mock('../../../common', () => ({
  runInstallPackage: (...args: unknown[]) => mockRunInstallPackage(...args),
  getIntegrationNameFromResponse: (...args: unknown[]) =>
    mockGetIntegrationNameFromResponse(...args),
}));

jest.mock('../../../common/lib/evaluate_upload_package', () => ({
  evaluateUploadedZipPackage: (...args: unknown[]) => mockEvaluateUploadedZipPackage(...args),
}));

jest.mock('../../../common/hooks/use_kibana', () => ({
  useKibana: () => ({
    services: {
      http: {},
      application: {
        getUrlForApp: jest.fn(() => '/app/integrations'),
        navigateToUrl: jest.fn(),
      },
      licensing: { license$: { subscribe: jest.fn() } },
    },
  }),
}));

jest.mock('react-use/lib/useObservable', () =>
  jest.fn(() => ({ isAvailable: true, isActive: true, hasAtLeast: () => true }))
);

jest.mock('../../telemetry_context', () => ({
  useTelemetry: () => ({ reportCancelButtonClicked: jest.fn() }),
}));

jest.mock('./docs_link_subtitle', () => ({
  DocsLinkSubtitle: () => null,
}));

jest.mock('../../license_paywall/license_paywall_card', () => ({
  LicensePaywallCard: () => null,
}));

import { CreateIntegrationUpload } from './create_integration_upload';

const makeZipWithPackageName = (packageName: string, version = '1.0.0') => ({
  files: {
    [`${packageName}-${version}/manifest.yml`]: {
      dir: false,
      name: `${packageName}-${version}/manifest.yml`,
      async: jest.fn().mockResolvedValue(`name: ${packageName}\nversion: ${version}\n`),
    },
  },
});

const settledMockResults = (mockFn: jest.Mock) =>
  Promise.all(
    mockFn.mock.results.map((result) =>
      result.type === 'throw'
        ? Promise.resolve()
        : Promise.resolve(result.value).catch(() => undefined)
    )
  );

const selectFile = async (container: HTMLElement, fileName = 'test.zip') => {
  const loadCallsBefore = mockLoadAsync.mock.calls.length;
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['zip'], fileName, { type: 'application/zip' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await waitFor(() => {
    expect(mockLoadAsync.mock.calls.length).toBeGreaterThan(loadCallsBefore);
  });

  await act(async () => {
    await settledMockResults(mockLoadAsync);
    await settledMockResults(mockEvaluateUploadedZipPackage);
  });
};

const renderUpload = () => render(<CreateIntegrationUpload />);

describe('CreateIntegrationUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvaluateUploadedZipPackage.mockResolvedValue({ kind: 'ok' });
    mockParseYaml.mockReturnValue({ name: 'test_package', version: '1.0.0' });
    mockLoadAsync.mockResolvedValue(makeZipWithPackageName('test_package'));
  });

  describe('file selection validation', () => {
    it('shows an error when the package name is already taken', async () => {
      mockEvaluateUploadedZipPackage.mockResolvedValue({
        kind: 'error',
        reason: 'duplicate',
        packageName: 'test_package',
      });

      const { container, getByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(getByText(/A package named "test_package" already exists/)).toBeInTheDocument();
      });
    });

    it('shows no error when the package name is free', async () => {
      const { container, queryByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => expect(mockEvaluateUploadedZipPackage).toHaveBeenCalled());
      expect(queryByText(/already exists/)).not.toBeInTheDocument();
    });

    it('evaluates the zip name and version from the manifest', async () => {
      mockParseYaml.mockReturnValue({ name: 'mako', version: '1.1.0' });

      const { container } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(mockEvaluateUploadedZipPackage).toHaveBeenCalledWith(
          'mako',
          '1.1.0',
          expect.objectContaining({ http: {} })
        );
      });
    });

    it('disables the install button when the name is taken', async () => {
      mockEvaluateUploadedZipPackage.mockResolvedValue({
        kind: 'error',
        reason: 'duplicate',
        packageName: 'test_package',
      });

      const { container, getByTestId } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(getByTestId('buttonsFooter-actionButton')).toBeDisabled();
      });
    });

    it('disables the install button when the name is an Automatic Import integration', async () => {
      mockEvaluateUploadedZipPackage.mockResolvedValue({
        kind: 'error',
        reason: 'automatic_import',
        packageName: 'mako',
      });

      const { container, getByTestId, getByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(getByText(/is an Automatic Import integration/)).toBeInTheDocument();
        expect(getByTestId('buttonsFooter-actionButton')).toBeDisabled();
      });
    });

    it('enables the install button when the name is free', async () => {
      const { container, getByTestId } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(getByTestId('buttonsFooter-actionButton')).not.toBeDisabled();
      });
    });

    it('enables the install button without a message when upgrading an uploaded package', async () => {
      mockEvaluateUploadedZipPackage.mockResolvedValue({
        kind: 'upgrade',
        packageName: 'mako',
        installedVersion: '1.0.0',
        zipVersion: '1.1.0',
      });

      const { container, getByTestId, queryByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(getByTestId('buttonsFooter-actionButton')).not.toBeDisabled();
      });
      expect(queryByText(/This will upgrade/)).not.toBeInTheDocument();
      expect(queryByText(/already exists/)).not.toBeInTheDocument();
    });

    it('disables the install button when the zip version is not newer', async () => {
      mockEvaluateUploadedZipPackage.mockResolvedValue({
        kind: 'error',
        reason: 'not_newer',
        packageName: 'mako',
        installedVersion: '1.1.0',
        zipVersion: '1.0.0',
      });

      const { container, getByTestId, getByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(
          getByText(/Version 1.0.0 of "mako" is not newer than the installed version 1.1.0/)
        ).toBeInTheDocument();
        expect(getByTestId('buttonsFooter-actionButton')).toBeDisabled();
      });
    });

    it('disables the install button when the zip version is invalid', async () => {
      mockEvaluateUploadedZipPackage.mockResolvedValue({
        kind: 'error',
        reason: 'invalid_version',
        packageName: 'mako',
      });

      const { container, getByTestId, getByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => {
        expect(getByText(/Cannot upgrade "mako"/)).toBeInTheDocument();
        expect(getByTestId('buttonsFooter-actionButton')).toBeDisabled();
      });
    });

    it('clears a previous error when a new file is selected', async () => {
      mockEvaluateUploadedZipPackage
        .mockResolvedValueOnce({
          kind: 'error',
          reason: 'duplicate',
          packageName: 'test_package',
        })
        .mockResolvedValueOnce({ kind: 'ok' });

      const { container, queryByText } = renderUpload();

      await selectFile(container);
      await waitFor(() => expect(queryByText(/already exists/)).toBeInTheDocument());

      await selectFile(container, 'other.zip');
      await waitFor(() => expect(queryByText(/already exists/)).not.toBeInTheDocument());
    });

    it('shows no error when zip parsing fails', async () => {
      mockLoadAsync.mockRejectedValue(new Error('bad zip'));

      const { container, queryByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => expect(mockLoadAsync).toHaveBeenCalled());
      expect(queryByText(/already exists/)).not.toBeInTheDocument();
      expect(mockEvaluateUploadedZipPackage).not.toHaveBeenCalled();
    });

    it('shows no error when manifest has no name field', async () => {
      mockParseYaml.mockReturnValue({ version: '1.0.0' });

      const { container, queryByText } = renderUpload();
      await selectFile(container);

      await waitFor(() => expect(mockParseYaml).toHaveBeenCalled());
      expect(queryByText(/already exists/)).not.toBeInTheDocument();
      expect(mockEvaluateUploadedZipPackage).not.toHaveBeenCalled();
    });
  });

  describe('install button initial state', () => {
    it('is disabled before any file is selected', () => {
      const { getByTestId } = renderUpload();
      expect(getByTestId('buttonsFooter-actionButton')).toBeDisabled();
    });
  });
});
