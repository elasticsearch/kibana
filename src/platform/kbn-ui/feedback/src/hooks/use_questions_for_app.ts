/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useState } from 'react';
import type { FeedbackRegistryEntry } from '../types';

interface UseQuestionsForAppArgs {
  getQuestions: (appId: string) => Promise<FeedbackRegistryEntry[]>;
  appId: string;
}

interface UseQuestionsForAppResult {
  questions: FeedbackRegistryEntry[];
  isLoading: boolean;
  error: Error | undefined;
}

export const useQuestionsForApp = ({
  getQuestions,
  appId,
}: UseQuestionsForAppArgs): UseQuestionsForAppResult => {
  const [questions, setQuestions] = useState<FeedbackRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    const abortController = new AbortController();
    setIsLoading(true);
    setError(undefined);
    getQuestions(appId)
      .then((q) => {
        if (!abortController.signal.aborted) {
          setQuestions(q);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!abortController.signal.aborted) {
          setError(err);
          setIsLoading(false);
        }
      });
    return () => {
      abortController.abort();
    };
  }, [getQuestions, appId]);

  return { questions, isLoading, error };
};
