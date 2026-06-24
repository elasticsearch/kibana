/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect } from 'react';
import { SecurityPageName, useNavigateTo } from '@kbn/security-solution-navigation';
import { useHistory } from 'react-router-dom';
import type { History } from 'history';
import { useStoredUrlDetails } from './use_stored_state';
import { OnboardingTopicId, type OnboardingCardId } from '../../constants';
import { useOnboardingContext } from '../onboarding_context';
import { useTopicId } from './use_topic_id';
import { useCloudTopicId } from './use_cloud_topic_id';

export const getCardIdFromHash = (hash: string): OnboardingCardId | null =>
  (hash.split('?')[0].replace('#', '') as OnboardingCardId) || null;

const setHash = (history: History, cardId: OnboardingCardId | null) => {
  history.replace({ hash: cardId == null ? undefined : `#${cardId}` });
};

const getUrlDetail = (topicId: OnboardingTopicId, cardId: OnboardingCardId | null): string => {
  return `${topicId !== OnboardingTopicId.default ? topicId : ''}${cardId ? `#${cardId}` : ''}`;
};

/**
 * This hook manages the expanded card id state in the LocalStorage and the hash in the URL.
 * The "urlDetail" is the combination of the topicId as the path fragment followed cardId in the hash (#) parameter, in the URL
 */
export const useUrlDetail = () => {
  const { spaceId, telemetry } = useOnboardingContext();
  const topicId = useTopicId();
  const [storedUrlDetail, setStoredUrlDetail] = useStoredUrlDetails(spaceId);

  const { navigateTo } = useNavigateTo();
  const history = useHistory();

  const navigateToDetail = useCallback(
    (detail?: string | null) => {
      navigateTo({ deepLinkId: SecurityPageName.landing, path: detail || undefined });
    },
    [navigateTo]
  );

  const setTopic = useCallback(
    (newTopicId: OnboardingTopicId) => {
      const detail = newTopicId === OnboardingTopicId.default ? null : newTopicId;
      setStoredUrlDetail(detail);
      navigateToDetail(detail);
    },
    [setStoredUrlDetail, navigateToDetail]
  );

  const setCard = useCallback(
    (newCardId: OnboardingCardId | null) => {
      setHash(history, newCardId);
      setStoredUrlDetail(getUrlDetail(topicId, newCardId) || null);
      if (newCardId != null) {
        telemetry.reportCardOpen(newCardId);
      }
    },
    [setStoredUrlDetail, topicId, telemetry, history]
  );

  return { topicId, setTopic, setCard, navigateToDetail, storedUrlDetail, setStoredUrlDetail };
};

interface UseSyncUrlDetailsParams {
  pathTopicId: OnboardingTopicId | null;
  hashCardId: OnboardingCardId | null;
}
/**
 * This hook manages the expanded card id state in the LocalStorage and the hash in the URL.
 */
export const useSyncUrlDetails = ({ pathTopicId, hashCardId }: UseSyncUrlDetailsParams) => {
  const { config, telemetry } = useOnboardingContext();
  const { storedUrlDetail, setStoredUrlDetail, navigateToDetail, setTopic } = useUrlDetail();

  const onComplete = useCallback((cloudTopicId: OnboardingTopicId | null) => {
    if (cloudTopicId && config.has(cloudTopicId)) {
      if (cloudTopicId === OnboardingTopicId.siemMigrations) {
        setStoredUrlDetail(null);
        navigateToDetail(cloudTopicId);
      } else {
        setTopic(cloudTopicId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { start: startGetCloudTopicId, isLoading } = useCloudTopicId({ onComplete });

  useEffect(() => {
    // Create the URL detail
    const urlDetail = `${pathTopicId || ''}${hashCardId ? `#${hashCardId}` : ''}`;

    // If the URL has a topic it has prevalence, we need to set it to the local storage
    if (urlDetail && urlDetail !== storedUrlDetail) {
      if (hashCardId) {
        telemetry.reportCardOpen(hashCardId, { auto: true });
      }
      setStoredUrlDetail(urlDetail);
      return;
    }

    // If the URL has no topic, but the local storage has a topic, we need to navigate to the topic
    if (!urlDetail && storedUrlDetail) {
      // Check if the stored topic is not valid, if so clear it to prevent inconsistencies
      const [storedTopicId] = storedUrlDetail.split('#');
      if (storedTopicId === OnboardingTopicId.siemMigrations) {
        // The SIEM migrations topic now redirects away from Get started, so don't restore it from stale local storage.
        setStoredUrlDetail(null);
        return;
      }
      if (storedTopicId && !config.has(storedTopicId as OnboardingTopicId)) {
        setStoredUrlDetail(null);
        return;
      }
      navigateToDetail(storedUrlDetail);
    }

    // If nothing is stored and nothing is in the URL, let's see if we have a cloud topic (first time onboarding)
    if (!urlDetail && storedUrlDetail === undefined) {
      startGetCloudTopicId();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isLoading };
};
