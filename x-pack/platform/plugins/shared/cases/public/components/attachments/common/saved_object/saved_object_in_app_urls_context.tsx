/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useMemo } from 'react';
import {
  DASHBOARD_SO_TYPE,
  DISCOVER_SESSION_SO_TYPE,
  MAP_SO_TYPE,
} from '../../../../../common/constants/attachments';
import type { CaseUI } from '../../../../../common/ui/types';
import { useSavedObjectInAppUrlsQuery } from './use_saved_object_in_app_url';
import {
  getSavedObjectAttachmentAttributes,
  isSavedObjectAttachment,
  type SupportedSavedObjectType,
} from './helpers';

type UrlsBySoType = Record<SupportedSavedObjectType, Record<string, string | undefined>>;

const SavedObjectInAppUrlsContext = createContext<UrlsBySoType | null>(null);

export const useSavedObjectInAppUrlsContext = () => useContext(SavedObjectInAppUrlsContext);

interface SavedObjectInAppUrlsProviderProps {
  caseData: CaseUI;
  children: React.ReactNode;
}

/**
 * Pre-resolves in-app URLs for every SO-typed attachment on the case (one
 * `bulk_get` per SO type) and exposes the result via context. Downstream
 * consumers (`SavedObjectAddedEvent` in the timeline, `SavedObjectAttachmentsTable`
 * in the attachments tab) read from this map instead of each firing their own
 * request — avoiding N requests in the activity feed when N SO events are
 * rendered.
 */
export const SavedObjectInAppUrlsProvider: React.FC<SavedObjectInAppUrlsProviderProps> = ({
  caseData,
  children,
}) => {
  const idsBySoType = useMemo(() => {
    const dashboardIds = new Set<string>();
    const mapIds = new Set<string>();
    const searchIds = new Set<string>();
    for (const attachment of caseData.comments) {
      if (isSavedObjectAttachment(attachment)) {
        const attributes = getSavedObjectAttachmentAttributes(attachment);
        if (attributes.soType === DASHBOARD_SO_TYPE) {
          dashboardIds.add(attributes.attachmentId);
        } else if (attributes.soType === MAP_SO_TYPE) {
          mapIds.add(attributes.attachmentId);
        } else if (attributes.soType === DISCOVER_SESSION_SO_TYPE) {
          searchIds.add(attributes.attachmentId);
        }
      }
    }
    return {
      [DASHBOARD_SO_TYPE]: Array.from(dashboardIds),
      [MAP_SO_TYPE]: Array.from(mapIds),
      [DISCOVER_SESSION_SO_TYPE]: Array.from(searchIds),
    };
  }, [caseData.comments]);

  const dashboardUrls = useSavedObjectInAppUrlsQuery(DASHBOARD_SO_TYPE, idsBySoType.dashboard);
  const mapUrls = useSavedObjectInAppUrlsQuery(MAP_SO_TYPE, idsBySoType.map);
  const searchUrls = useSavedObjectInAppUrlsQuery(DISCOVER_SESSION_SO_TYPE, idsBySoType.search);

  const value = useMemo<UrlsBySoType>(
    () => ({
      [DASHBOARD_SO_TYPE]: dashboardUrls,
      [MAP_SO_TYPE]: mapUrls,
      [DISCOVER_SESSION_SO_TYPE]: searchUrls,
    }),
    [dashboardUrls, mapUrls, searchUrls]
  );

  return (
    <SavedObjectInAppUrlsContext.Provider value={value}>
      {children}
    </SavedObjectInAppUrlsContext.Provider>
  );
};

SavedObjectInAppUrlsProvider.displayName = 'SavedObjectInAppUrlsProvider';
