/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { responseMock } from './__mocks__';
import { responseAdapter } from './__mocks__/test_adapters';
import { withSiemErrorHandling } from './with_siem_error_handling';

describe('withSiemErrorHandling', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with the operation result on success', async () => {
    const mockedResponse = responseMock.create();

    await withSiemErrorHandling(mockedResponse, async () => ({ updated: 2 }));

    expect(responseAdapter(mockedResponse).status).toEqual(200);
  });

  it('returns the operation result as the response body on success', async () => {
    const mockedResponse = responseMock.create();

    await withSiemErrorHandling(mockedResponse, async () => ({ updated: 2 }));

    expect(responseAdapter(mockedResponse).body).toEqual({ updated: 2 });
  });

  it('maps a thrown error to the standard SIEM error response', async () => {
    const mockedResponse = responseMock.create();

    await withSiemErrorHandling(mockedResponse, async () => {
      throw new Error('Test error');
    });

    expect(responseAdapter(mockedResponse).body).toEqual({
      message: 'Test error',
      status_code: 500,
    });
  });
});
