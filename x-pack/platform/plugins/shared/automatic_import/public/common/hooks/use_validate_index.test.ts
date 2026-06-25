/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useValidateIndex } from './use_validate_index';
import { useKibana } from './use_kibana';
import * as i18n from './translations';

jest.mock('./use_kibana');
const mockUseKibana = useKibana as jest.Mock;

describe('useValidateIndex', () => {
  const mockHttpGet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana.mockReturnValue({
      services: {
        http: {
          get: mockHttpGet,
        },
      },
    });
  });

  describe('initial state', () => {
    it('should return initial state with no validation error', () => {
      const { result } = renderHook(() => useValidateIndex());

      expect(result.current.isValidating).toBe(false);
      expect(result.current.validationError).toBeNull();
      expect(typeof result.current.validateIndex).toBe('function');
      expect(typeof result.current.clearValidationError).toBe('function');
    });
  });

  describe('validateIndex', () => {
    it('should return false for empty index name without making API call', async () => {
      const { result } = renderHook(() => useValidateIndex());

      let isValid: boolean = true;
      await act(async () => {
        isValid = await result.current.validateIndex('');
      });

      expect(isValid).toBe(false);
      expect(mockHttpGet).not.toHaveBeenCalled();
      expect(result.current.validationError).toBeNull();
    });

    it('should set isValidating to true during validation', async () => {
      mockHttpGet.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ mappings: { properties: {} } }), 100);
          })
      );

      const { result } = renderHook(() => useValidateIndex());

      act(() => {
        result.current.validateIndex('test-index');
      });

      expect(result.current.isValidating).toBe(true);

      await waitFor(() => {
        expect(result.current.isValidating).toBe(false);
      });
    });

    it('should return true when event.original field exists', async () => {
      mockHttpGet.mockResolvedValue({
        mappings: {
          properties: {
            event: {
              properties: {
                original: {
                  type: 'keyword',
                },
              },
            },
          },
        },
      });

      const { result } = renderHook(() => useValidateIndex());

      let isValid: boolean = false;
      await act(async () => {
        isValid = await result.current.validateIndex('some-valid-index');
      });

      expect(isValid).toBe(true);
      expect(result.current.validationError).toBeNull();
      expect(mockHttpGet).toHaveBeenCalledWith(
        '/api/automatic_import/index_mappings/some-valid-index',
        {
          version: '1',
        }
      );
    });

    it('should return false and set error when event.original field is missing', async () => {
      mockHttpGet.mockResolvedValue({
        mappings: {
          properties: {
            message: { type: 'text' },
          },
        },
      });

      const { result } = renderHook(() => useValidateIndex());

      let isValid: boolean = true;
      await act(async () => {
        isValid = await result.current.validateIndex('invalid-index');
      });

      expect(isValid).toBe(false);
      expect(result.current.validationError).toBe(i18n.INDEX_MISSING_EVENT_ORIGINAL);
    });

    it('should return false and set error when mappings is empty', async () => {
      mockHttpGet.mockResolvedValue({
        mappings: {},
      });

      const { result } = renderHook(() => useValidateIndex());

      let isValid: boolean = true;
      await act(async () => {
        isValid = await result.current.validateIndex('empty-mappings-index');
      });

      expect(isValid).toBe(false);
      expect(result.current.validationError).toBe(i18n.INDEX_MISSING_EVENT_ORIGINAL);
    });

    it('should set a generic translated error when the request fails', async () => {
      mockHttpGet.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useValidateIndex());

      let isValid: boolean = true;
      await act(async () => {
        isValid = await result.current.validateIndex('error-index');
      });

      expect(isValid).toBe(false);
      expect(result.current.validationError).toBe(i18n.INDEX_VALIDATION_FAILED);
      expect(result.current.isValidating).toBe(false);
    });

    it('should URL encode the index name', async () => {
      mockHttpGet.mockResolvedValue({
        mappings: { properties: {} },
      });

      const { result } = renderHook(() => useValidateIndex());

      await act(async () => {
        await result.current.validateIndex('some-index');
      });

      expect(mockHttpGet).toHaveBeenCalledWith(
        '/api/automatic_import/index_mappings/some-index',
        expect.any(Object)
      );
    });
  });

  describe('clearValidationError', () => {
    it('should clear validation error', async () => {
      mockHttpGet.mockResolvedValue({
        mappings: { properties: {} },
      });

      const { result } = renderHook(() => useValidateIndex());

      // First trigger an error
      await act(async () => {
        await result.current.validateIndex('invalid-index');
      });
      expect(result.current.validationError).toBe(i18n.INDEX_MISSING_EVENT_ORIGINAL);

      // Error is cleared
      act(() => {
        result.current.clearValidationError();
      });

      expect(result.current.validationError).toBeNull();
    });
  });
});
