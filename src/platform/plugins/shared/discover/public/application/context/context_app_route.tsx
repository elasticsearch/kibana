/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EuiEmptyPrompt } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { generateFilters } from '@kbn/data-plugin/public';
import { popularizeField } from '@kbn/unified-data-table';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DocViewerApi } from '@kbn/unified-doc-viewer';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import { useStableCallback } from '@kbn/react-hooks';
import { ContextApp } from './context_app';
import { LoadingIndicator } from '../../components/common/loading_indicator';
import { useDataView } from '../../hooks/use_data_view';
import type { ContextHistoryLocationState } from './services/locator';
import { useDiscoverServices } from '../../hooks/use_discover_services';
import { createInMemoryContextAwarenessToolkit, useRootProfile } from '../../context_awareness';
import { ScopedServicesProvider } from '../../components/scoped_services_provider';

export interface ContextUrlParams {
  dataViewId: string;
  id: string;
}

export function ContextAppRoute() {
  const {
    profilesManager,
    ebtManager,
    getScopedHistory,
    filterManager,
    dataViews,
    capabilities,
    fieldsMetadata,
    profileStateRegistry,
  } = useDiscoverServices();
  const scopedHistory = getScopedHistory<ContextHistoryLocationState>();
  const locationState = useMemo(
    () => scopedHistory?.location.state as ContextHistoryLocationState | undefined,
    [scopedHistory?.location.state]
  );

  /**
   * Updates history state when gets undefined.
   * Should be removed once url state will be deleted from context page.
   */
  useEffect(() => {
    const unlisten = scopedHistory?.listen((location) => {
      const currentState = location.state;
      if (!currentState?.referrer && locationState) {
        const newLocation = { ...location, state: { ...currentState, ...locationState } };
        scopedHistory.replace(newLocation);
      }
    });
    return () => unlisten?.();
  }, [locationState, scopedHistory]);

  const { dataViewId: encodedDataViewId, id } = useParams<ContextUrlParams>();
  const dataViewId = decodeURIComponent(encodedDataViewId);
  const anchorId = decodeURIComponent(id);
  const { dataView, error } = useDataView({ index: locationState?.dataViewSpec || dataViewId });
  const rootProfileState = useRootProfile();
  const [scopedEbtManager] = useState(() => ebtManager.createScopedEBTManager());

  const [expandedDoc, setExpandedDocState] = useState<DataTableRecord | undefined>();
  const [initialDocViewerTabId, setInitialDocViewerTabId] = useState<string | undefined>(undefined);
  const docViewerRef = useRef<DocViewerApi>(null);

  const setExpandedDoc = useStableCallback(
    (doc: DataTableRecord | undefined, options?: { initialTabId?: string }) => {
      setExpandedDocState(doc);
      setInitialDocViewerTabId(options?.initialTabId);
      if (options?.initialTabId) {
        docViewerRef.current?.setSelectedTabId(options.initialTabId);
      }
    }
  );

  const addFilter = useStableCallback<DocViewFilterFn>((mapping, values, operation) => {
    if (!dataView || !mapping) {
      return;
    }

    const newFilters = generateFilters(filterManager, mapping, values, operation, dataView);
    const fieldName = typeof mapping === 'string' ? mapping : mapping.name;

    void popularizeField(dataView, fieldName, dataViews, capabilities);
    filterManager.addFilters(newFilters);

    void scopedEbtManager.trackFilterAddition({
      fieldName: fieldName === '_exists_' ? String(values) : fieldName,
      filterOperation: fieldName === '_exists_' ? '_exists_' : operation,
      fieldsMetadata,
    });
  });

  const [scopedProfilesManager] = useState(() =>
    profilesManager.createScopedProfilesManager({
      scopedEbtManager,
      toolkit: createInMemoryContextAwarenessToolkit({
        profileStateRegistry,
        actions: {
          addFilter,
          setExpandedDoc,
        },
      }),
    })
  );

  if (error) {
    return (
      <EuiEmptyPrompt
        iconType="warning"
        iconColor="danger"
        title={
          <FormattedMessage
            id="discover.contextViewRoute.errorTitle"
            defaultMessage="An error occurred"
          />
        }
        body={
          <FormattedMessage
            id="discover.contextViewRoute.errorMessage"
            defaultMessage="No matching data view for id {dataViewId}"
            values={{ dataViewId }}
          />
        }
      />
    );
  }

  if (!dataView || rootProfileState.rootProfileLoading) {
    return <LoadingIndicator />;
  }

  return (
    <ScopedServicesProvider
      scopedProfilesManager={scopedProfilesManager}
      scopedEBTManager={scopedEbtManager}
    >
      <ContextApp
        anchorId={anchorId}
        dataView={dataView}
        referrer={locationState?.referrer}
        addFilter={addFilter}
        expandedDoc={expandedDoc}
        initialDocViewerTabId={initialDocViewerTabId}
        docViewerRef={docViewerRef}
        setExpandedDoc={setExpandedDoc}
      />
    </ScopedServicesProvider>
  );
}
