/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useContext, useMemo } from 'react';
import type { EuiButtonEmpty, EuiButtonIcon } from '@elastic/eui';
import { isString } from 'lodash/fp';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { HostPanelKey } from '../../../../../flyout/entity_details/shared/constants';
import { StatefulEventContext } from '../../../../../common/components/events_viewer/stateful_event_context';
import { HostDetailsLink } from '../../../../../common/components/links';
import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import { TruncatableText } from '../../../../../common/components/truncatable_text';
import { useIsInSecurityApp } from '../../../../../common/hooks/is_in_security_app';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { useKibana } from '../../../../../common/lib/kibana';
import { Host } from '../../../../../flyout_v2/entity/host/main';
import { flyoutProviders } from '../../../../../flyout_v2/shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../../flyout_v2/shared/hooks/use_default_flyout_properties';
import { documentFlyoutHistoryKey } from '../../../../../flyout_v2/shared/constants/flyout_history';

interface Props {
  contextId: string;
  Component?: typeof EuiButtonEmpty | typeof EuiButtonIcon;
  isButton?: boolean;
  onClick?: () => void;
  value: string | number | undefined | null;
  title?: string;
  entityId?: string;
}

const HostNameComponent: React.FC<Props> = ({
  Component,
  contextId,
  isButton,
  onClick,
  title,
  value,
  entityId,
}) => {
  const { openFlyout } = useExpandableFlyoutApi();
  const { services } = useKibana();
  const { overlays } = services;
  const store = useStore();
  const history = useHistory();
  const newFlyoutSystemEnabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
  const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();

  const isInSecurityApp = useIsInSecurityApp();

  const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;

  const eventContext = useContext(StatefulEventContext);
  const hostName = `${value}`;
  const isInTimelineContext = hostName && eventContext?.timelineID;

  const openHostDetailsSidePanel = useCallback(
    (e: React.SyntheticEvent<Element, Event>) => {
      e.preventDefault();

      if (onClick) {
        onClick();
      }

      if (!eventContext || !isInTimelineContext || !eventContext.enableHostDetailsFlyout) {
        return;
      }

      if (newFlyoutSystemEnabled) {
        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: <Host hostName={hostName} entityId={entityId} />,
          }),
          {
            ...defaultDocumentFlyoutProperties,
            historyKey,
            session: 'start',
          }
        );
      } else {
        const { timelineID } = eventContext;
        openFlyout({
          right: {
            id: HostPanelKey,
            params: {
              hostName,
              entityId,
              contextID: contextId,
              scopeId: timelineID,
            },
          },
        });
      }
    },
    [
      onClick,
      eventContext,
      isInTimelineContext,
      hostName,
      entityId,
      openFlyout,
      contextId,
      newFlyoutSystemEnabled,
      overlays,
      services,
      store,
      history,
      historyKey,
      defaultDocumentFlyoutProperties,
    ]
  );

  // The below is explicitly defined this way as the onClick takes precedence when it and the href are both defined
  // When this component is used outside of timeline/alerts table (i.e. in the flyout) we would still like it to link to the Host Details page
  const content = useMemo(
    () => (
      <HostDetailsLink
        Component={Component}
        hostName={hostName}
        isButton={isButton}
        onClick={isInTimelineContext || !isInSecurityApp ? openHostDetailsSidePanel : undefined}
        title={title}
      >
        <TruncatableText data-test-subj="draggable-truncatable-content">{hostName}</TruncatableText>
      </HostDetailsLink>
    ),
    [
      Component,
      hostName,
      isButton,
      isInTimelineContext,
      isInSecurityApp,
      openHostDetailsSidePanel,
      title,
    ]
  );

  return isString(value) && hostName.length > 0 ? content : getEmptyTagValue();
};

export const HostName = React.memo(HostNameComponent);
HostName.displayName = 'HostName';
