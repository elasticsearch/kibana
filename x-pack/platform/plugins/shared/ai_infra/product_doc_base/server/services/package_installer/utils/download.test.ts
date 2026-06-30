/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createReadStream } from 'fs';
import { ProxyAgent } from 'undici';
import { downloadToDisk } from './download';

jest.mock('@kbn/fs', () => ({
  createWriteStream: jest.fn(() => ({
    on: jest.fn((event, callback) => {
      if (event === 'finish') {
        callback();
      }
    }),
    pipe: jest.fn(),
  })),
  getSafePath: jest.fn().mockReturnValue({
    fullPath: 'artifacts/package_installer/file.txt',
    alias: 'disk:artifacts/package_installer/file.txt',
  }),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn().mockReturnValue({
    on: jest.fn(),
    pipe: jest.fn(),
  }),
}));

jest.mock('stream/promises', () => ({
  pipeline: jest.fn(),
}));

const fetchMock = jest.spyOn(global, 'fetch');

describe('downloadToDisk', () => {
  const mockFileUrl = 'http://example.com/file.txt';
  const mockFilePathAtVolume = 'artifacts/package_installer/file.txt';
  const mockLocalPath = '/local/path/to/file.txt';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes a proxy dispatcher to fetch when a proxy URL is configured', async () => {
    const mockResponseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('test content'));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue({
      body: mockResponseBody,
    } as unknown as Response);

    const artifactRepositoryProxyUrl = 'http://proxy.example.com:3128';
    await downloadToDisk(mockFileUrl, mockFilePathAtVolume, artifactRepositoryProxyUrl);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchOptions = fetchMock.mock.calls[0][1] as { dispatcher?: ProxyAgent };
    expect(fetchOptions.dispatcher).toBeInstanceOf(ProxyAgent);
  });

  it('should download a file from a remote URL', async () => {
    // Create a proper ReadableStream for the mock response body
    // Readable.fromWeb() requires an actual ReadableStream instance
    const mockResponseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('test content'));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue({
      body: mockResponseBody,
    } as unknown as Response);

    await downloadToDisk(mockFileUrl, mockFilePathAtVolume);

    expect(fetchMock).toHaveBeenCalledWith(mockFileUrl, {});
  });

  it('should copy a file from a local file URL', async () => {
    const mockLocalFileUrl = 'file:///local/path/to/file.txt';

    await downloadToDisk(mockLocalFileUrl, mockFilePathAtVolume);

    expect(createReadStream).toHaveBeenCalledWith(mockLocalPath);
  });

  it('should handle errors during the download process', async () => {
    const mockError = new Error('Download failed');
    fetchMock.mockRejectedValue(mockError);

    await expect(downloadToDisk(mockFileUrl, mockFilePathAtVolume)).rejects.toThrow(
      'Download failed'
    );
  });
});
