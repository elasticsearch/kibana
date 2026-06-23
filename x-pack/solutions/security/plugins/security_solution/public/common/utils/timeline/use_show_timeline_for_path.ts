/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { matchPath } from 'react-router-dom';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { ARTIFACT_MANAGEMENT_TAB_ROUTING_PATHS } from '../../../management/common/constants';
import { RULES_CHANGES_HISTORY_PATH } from '../../../../common/constants';
import type { NormalizedLink } from '../../links';
import { useNormalizedAppLinks } from '../../links/links_hooks';
import { useKibana } from '../../lib/kibana';
import { hasAccessToSecuritySolution } from '../../../helpers_access';

// Paths for pages that hide the timeline but can't be registered in app links (dynamic routes).
const EXTRA_HIDDEN_TIMELINE_PATHS = [RULES_CHANGES_HISTORY_PATH];

const useHiddenTimelineRoutes = () => {
  const normalizedLinks = useNormalizedAppLinks();
  return useMemo(
    () =>
      Object.values(normalizedLinks).reduce(
        (acc: string[], link: NormalizedLink) => {
          if (link.hideTimeline) {
            if (link.id === SecurityPageName.artifacts) {
              acc.push(...ARTIFACT_MANAGEMENT_TAB_ROUTING_PATHS);
            } else {
              acc.push(link.path);
            }
          }
          return acc;
        },
        [...EXTRA_HIDDEN_TIMELINE_PATHS]
      ),
    [normalizedLinks]
  );
};

export const useShowTimelineForGivenPath = () => {
  const { capabilities } = useKibana().services.application;
  const userHasSecuritySolutionVisible = hasAccessToSecuritySolution(capabilities);

  const hiddenTimelineRoutes = useHiddenTimelineRoutes();

  const getIsTimelineVisible = useCallback(
    (pathname: string) => {
      if (!userHasSecuritySolutionVisible) {
        return false;
      }
      return !hiddenTimelineRoutes.some((route) => matchPath(pathname, route));
    },
    [userHasSecuritySolutionVisible, hiddenTimelineRoutes]
  );

  return getIsTimelineVisible;
};
