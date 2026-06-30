/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { EuiEmptyPrompt } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useExecutionContext } from '@kbn/kibana-react-plugin/public';
import { i18n } from '@kbn/i18n';
import { LoadingIndicator } from '../../components/common/loading_indicator';
import { Doc } from './components/doc';
import { useDiscoverServices } from '../../hooks/use_discover_services';
import { DiscoverError } from '../../components/common/error_alert';
import { useDataView } from '../../hooks/use_data_view';
import type { DocHistoryLocationState } from './locator';
import { createInMemoryContextAwarenessToolkit, useRootProfile } from '../../context_awareness';
import { ScopedServicesProvider } from '../../components/scoped_services_provider';

export interface DocUrlParams {
  dataViewId: string;
  index: string;
}

export const SingleDocRoute = () => {
  const { timefilter, core, profilesManager, ebtManager, getScopedHistory, profileStateRegistry } =
    useDiscoverServices();
  const { search } = useLocation();
  const { dataViewId, index } = useParams<DocUrlParams>();

  const query = useMemo(() => new URLSearchParams(search), [search]);
  const id = query.get('id');

  const locationState = useMemo(
    () => getScopedHistory<DocHistoryLocationState>()?.location.state,
    [getScopedHistory]
  );

  useExecutionContext(core.executionContext, {
    type: 'application',
    page: 'single-doc',
    id: dataViewId,
  });

  useEffect(() => {
    timefilter.disableAutoRefreshSelector();
    timefilter.disableTimeRangeSelector();
  }, [timefilter]);

  const { dataView, error } = useDataView({
    index: locationState?.dataViewSpec || decodeURIComponent(dataViewId),
  });
  const [scopedEbtManager] = useState(() => ebtManager.createScopedEBTManager());
  const [scopedProfilesManager] = useState(() =>
    profilesManager.createScopedProfilesManager({
      scopedEbtManager,
      toolkit: createInMemoryContextAwarenessToolkit({ profileStateRegistry }),
    })
  );
  const rootProfileState = useRootProfile();

  if (error) {
    return (
      <EuiEmptyPrompt
        iconType="warning"
        iconColor="danger"
        title={
          <FormattedMessage
            id="discover.singleDocRoute.errorTitle"
            defaultMessage="An error occurred"
          />
        }
        body={
          <FormattedMessage
            id="discover.singleDocRoute.errorMessage"
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

  if (!id) {
    return (
      <DiscoverError
        error={
          new Error(
            i18n.translate('discover.discoverError.missingIdParamError', {
              defaultMessage:
                'No document ID provided. Return to Discover to select another document.',
            })
          )
        }
      />
    );
  }

  return (
    <ScopedServicesProvider
      scopedProfilesManager={scopedProfilesManager}
      scopedEBTManager={scopedEbtManager}
    >
      <Doc id={id} index={index} dataView={dataView} referrer={locationState?.referrer} />
    </ScopedServicesProvider>
  );
};
