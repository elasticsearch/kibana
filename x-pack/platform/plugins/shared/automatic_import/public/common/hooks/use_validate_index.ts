/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import { useKibana } from './use_kibana';
import * as i18n from './translations';

interface IndexMappingResponse {
  mappings?: {
    properties?: {
      event?: {
        properties?: {
          original?: {
            type?: string;
          };
        };
      };
    };
  };
}

export interface UseValidateIndexResult {
  isValidating: boolean;
  validationError: string | null;
  validateIndex: (indexName: string) => Promise<boolean>;
  clearValidationError: () => void;
}

/**
 * Hook to validate that a selected index contains the required event.original field
 */
export function useValidateIndex(): UseValidateIndexResult {
  const { http } = useKibana().services;
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateIndex = useCallback(
    async (indexName: string): Promise<boolean> => {
      if (!indexName) {
        setValidationError(null);
        return false;
      }

      setIsValidating(true);
      setValidationError(null);

      try {
        // Use Automatic Import mapping endpoint
        const response = await http.get<IndexMappingResponse>(
          `/api/automatic_import/index_mappings/${encodeURIComponent(indexName)}`,
          { version: '1' }
        );

        // Check if event.original exists at its fixed ECS path
        const hasEventOriginal = !!response?.mappings?.properties?.event?.properties?.original;

        if (!hasEventOriginal) {
          setValidationError(i18n.INDEX_MISSING_EVENT_ORIGINAL);
          return false;
        }

        return true;
      } catch {
        setValidationError(i18n.INDEX_VALIDATION_FAILED);
        return false;
      } finally {
        setIsValidating(false);
      }
    },
    [http]
  );

  const clearValidationError = useCallback(() => {
    setValidationError(null);
  }, []);

  return {
    isValidating,
    validationError,
    validateIndex,
    clearValidationError,
  };
}
