/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import type { CloudDataAttributes } from '@kbn/cloud-plugin/common/types';
import { useKibana } from '../../../common/lib/kibana/kibana_react';
import { OnboardingTopicId } from '../../constants';

const URL = '/internal/cloud/solution';

interface UseCloudTopicIdParams {
  onComplete: (topicId: OnboardingTopicId | null) => void;
}

export const useCloudTopicId = ({ onComplete }: UseCloudTopicIdParams) => {
  const { http } = useKibana().services;
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const start = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await http.get<CloudDataAttributes>(URL, { version: '1' });
      if (isSiemMigrationsCloudOnboarding(data)) {
        onComplete(OnboardingTopicId.siemMigrations);
      } else {
        onComplete(null);
      }
    } catch (_) {
      // ignore the error, we will just show the default topic
      onComplete(null);
    }
    setIsLoading(false);
  }, [onComplete, http]);

  return { start, isLoading };
};

export const isSiemMigrationsCloudOnboarding = (data: CloudDataAttributes | null) => {
  const { security } = data?.onboardingData ?? {};
  return security?.useCase === 'siem' && security?.migration?.value === true;
};
