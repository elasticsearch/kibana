/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import { evaluateUploadPackage, evaluateUploadedZipPackage } from './evaluate_upload_package';
import type { EpmPackageItem } from './api';

const mockGetInstalledPackages = jest.fn();
const mockGetAllIntegrations = jest.fn();

jest.mock('./api', () => ({
  getInstalledPackages: (...args: unknown[]) => mockGetInstalledPackages(...args),
  getAllIntegrations: (...args: unknown[]) => mockGetAllIntegrations(...args),
}));

const uploadedPackage = (
  id: string,
  version: string,
  installSource = 'upload'
): EpmPackageItem => ({
  id,
  type: 'integration',
  version,
  installationInfo: { install_source: installSource, version },
});

const registryPackage = (id: string, installed = false): EpmPackageItem => ({
  id,
  type: 'integration',
  version: '2.0.0',
  ...(installed ? { installationInfo: { install_source: 'registry', version: '2.0.0' } } : {}),
});

describe('evaluateUploadPackage', () => {
  it('allows a free package name', () => {
    expect(evaluateUploadPackage('mako', '1.0.0', [], [])).toEqual({ kind: 'ok' });
  });

  it('blocks an uninstalled EPR/OOTB package name', () => {
    expect(evaluateUploadPackage('nginx', '1.0.0', [registryPackage('nginx')], [])).toEqual({
      kind: 'error',
      reason: 'duplicate',
      packageName: 'nginx',
    });
  });

  it('blocks an installed registry package name', () => {
    expect(evaluateUploadPackage('nginx', '3.0.0', [registryPackage('nginx', true)], [])).toEqual({
      kind: 'error',
      reason: 'duplicate',
      packageName: 'nginx',
    });
  });

  it('blocks a bundled package name', () => {
    expect(
      evaluateUploadPackage(
        'endpoint',
        '1.0.0',
        [uploadedPackage('endpoint', '1.0.0', 'bundled')],
        []
      )
    ).toEqual({
      kind: 'error',
      reason: 'duplicate',
      packageName: 'endpoint',
    });
  });

  it('blocks a name that matches an Automatic Import integration id', () => {
    expect(
      evaluateUploadPackage(
        'my_custom_integration',
        '1.1.0',
        [],
        [{ integrationId: 'my_custom_integration', title: 'Something Else' }]
      )
    ).toEqual({
      kind: 'error',
      reason: 'automatic_import',
      packageName: 'my_custom_integration',
    });
  });

  it('blocks a name that matches a normalized Automatic Import title', () => {
    expect(
      evaluateUploadPackage('nginx_logs', '1.1.0', [], [
        { integrationId: 'some_id', title: 'Nginx Logs' },
      ])
    ).toEqual({
      kind: 'error',
      reason: 'automatic_import',
      packageName: 'nginx_logs',
    });
  });

  it('allows upgrading an uploaded package when the zip version is greater', () => {
    expect(evaluateUploadPackage('mako', '1.1.0', [uploadedPackage('mako', '1.0.0')], [])).toEqual({
      kind: 'upgrade',
      packageName: 'mako',
      installedVersion: '1.0.0',
      zipVersion: '1.1.0',
    });
  });

  it('prefers installationInfo.version over the catalog version', () => {
    expect(
      evaluateUploadPackage(
        'mako',
        '1.2.0',
        [
          {
            id: 'mako',
            type: 'integration',
            version: '0.9.0',
            installationInfo: { install_source: 'upload', version: '1.1.0' },
          },
        ],
        []
      )
    ).toEqual({
      kind: 'upgrade',
      packageName: 'mako',
      installedVersion: '1.1.0',
      zipVersion: '1.2.0',
    });
  });

  it('blocks a zip whose name matches an Automatic Import integration even if Fleet has an uploaded package', () => {
    expect(
      evaluateUploadPackage(
        'mako',
        '1.2.0',
        [uploadedPackage('mako', '1.0.0')],
        [{ integrationId: 'mako', title: 'Mako' }]
      )
    ).toEqual({
      kind: 'error',
      reason: 'automatic_import',
      packageName: 'mako',
    });
  });

  it('blocks the same version of an uploaded package', () => {
    expect(evaluateUploadPackage('mako', '1.0.0', [uploadedPackage('mako', '1.0.0')], [])).toEqual({
      kind: 'error',
      reason: 'not_newer',
      packageName: 'mako',
      installedVersion: '1.0.0',
      zipVersion: '1.0.0',
    });
  });

  it('blocks an older version of an uploaded package', () => {
    expect(evaluateUploadPackage('mako', '0.9.0', [uploadedPackage('mako', '1.0.0')], [])).toEqual({
      kind: 'error',
      reason: 'not_newer',
      packageName: 'mako',
      installedVersion: '1.0.0',
      zipVersion: '0.9.0',
    });
  });

  it('blocks a missing zip version for an uploaded package', () => {
    expect(evaluateUploadPackage('mako', null, [uploadedPackage('mako', '1.0.0')], [])).toEqual({
      kind: 'error',
      reason: 'invalid_version',
      packageName: 'mako',
      installedVersion: '1.0.0',
      zipVersion: undefined,
    });
  });

  it('blocks an invalid zip version for an uploaded package', () => {
    expect(
      evaluateUploadPackage('mako', 'not-a-version', [uploadedPackage('mako', '1.0.0')], [])
    ).toEqual({
      kind: 'error',
      reason: 'invalid_version',
      packageName: 'mako',
      installedVersion: '1.0.0',
      zipVersion: 'not-a-version',
    });
  });

  it('blocks an invalid installed version for an uploaded package', () => {
    expect(evaluateUploadPackage('mako', '1.1.0', [uploadedPackage('mako', 'latest')], [])).toEqual(
      {
        kind: 'error',
        reason: 'invalid_version',
        packageName: 'mako',
        installedVersion: 'latest',
        zipVersion: '1.1.0',
      }
    );
  });
});

describe('evaluateUploadedZipPackage', () => {
  const mockHttp = {} as HttpSetup;
  const deps = { http: mockHttp };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInstalledPackages.mockResolvedValue({ items: [] });
    mockGetAllIntegrations.mockResolvedValue([]);
  });

  it('fetches catalog and Auto Import integrations then classifies', async () => {
    mockGetInstalledPackages.mockResolvedValue({
      items: [uploadedPackage('mako', '1.0.0')],
    });

    const result = await evaluateUploadedZipPackage('mako', '1.1.0', deps);

    expect(result).toEqual({
      kind: 'upgrade',
      packageName: 'mako',
      installedVersion: '1.0.0',
      zipVersion: '1.1.0',
    });
    expect(mockGetInstalledPackages).toHaveBeenCalledWith(deps);
    expect(mockGetAllIntegrations).toHaveBeenCalledWith(deps);
  });

  it('blocks an Automatic Import-only name', async () => {
    mockGetAllIntegrations.mockResolvedValue([{ integrationId: 'mako', title: 'Mako' }]);

    await expect(evaluateUploadedZipPackage('mako', '1.1.0', deps)).resolves.toEqual({
      kind: 'error',
      reason: 'automatic_import',
      packageName: 'mako',
    });
  });

  it('treats null API responses as empty catalogs', async () => {
    mockGetInstalledPackages.mockResolvedValue(null);
    mockGetAllIntegrations.mockResolvedValue(null);

    await expect(evaluateUploadedZipPackage('mako', '1.0.0', deps)).resolves.toEqual({
      kind: 'ok',
    });
  });
});
