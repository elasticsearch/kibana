/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';
import { i18n } from '@kbn/i18n';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY } from '@kbn/management-settings-ids';
import { NightshiftApp } from '@kbn/nightshift';
import type { GapsReport } from '@kbn/nightshift';
import { useKibana } from '../../utils/kibana_react';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { OVERVIEW_PATH } from '../../../common/locators/paths';

const ONBOARDING_INITIAL_MESSAGE = i18n.translate(
  'xpack.observability.nightshift.onboardingInitialMessage',
  {
    defaultMessage:
      'Start the significant-events-onboarding skill. First check whether there is already memory about my system. If there is, summarise what you know and ask whether I have something specific to add or correct, or whether I want a general review of the gaps. If memory is empty, go straight into gathering information.',
  }
);

const CLOSE_GAPS_INITIAL_MESSAGE = i18n.translate(
  'xpack.observability.nightshift.closeGapsInitialMessage',
  {
    defaultMessage:
      'Start the significant-events-onboarding skill. Read the _gaps/overview memory page, summarise the highest priority gaps, and help me close them one by one by gathering the missing operational context.',
  }
);

const getCloseGapsInitialMessage = (connectorName?: string) =>
  connectorName
    ? i18n.translate('xpack.observability.nightshift.closeGapsConnectorInitialMessage', {
        defaultMessage:
          'Start the significant-events-onboarding skill. Read the _gaps/overview memory page, summarise the highest priority gaps, and help me close them one by one by gathering the missing operational context. Start with connector {connectorName}, then go from there.',
        values: { connectorName },
      })
    : CLOSE_GAPS_INITIAL_MESSAGE;

interface ActionConnectorResponseItem {
  actionTypeId?: string;
  connector_type_id?: string;
}

export function NightshiftPage() {
  const { http, uiSettings, serverless, agentBuilder } = useKibana().services;
  const { ObservabilityPageTemplate } = usePluginContext();
  const history = useHistory();

  const isEnabled = uiSettings.get<boolean>(
    OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY,
    false
  );

  useBreadcrumbs(
    [
      {
        href: http.basePath.prepend('/app/observability/nightshift'),
        text: i18n.translate('xpack.observability.breadcrumbs.nightshiftLinkText', {
          defaultMessage: 'Nightshift',
        }),
        deepLinkId: 'observability-overview:nightshift',
      },
    ],
    { serverless }
  );

  const handleStartOnboarding = useCallback(() => {
    agentBuilder?.openChat({
      newConversation: true,
      initialMessage: ONBOARDING_INITIAL_MESSAGE,
      autoSendInitialMessage: true,
    });
  }, [agentBuilder]);

  const handleStartGapClosing = useCallback(
    (connectorName?: string) => {
      agentBuilder?.openChat({
        newConversation: true,
        initialMessage: getCloseGapsInitialMessage(connectorName),
        autoSendInitialMessage: true,
      });
    },
    [agentBuilder]
  );

  const [gapsReport, setGapsReport] = useState<GapsReport | null>(null);
  const [installedConnectorActionTypeIds, setInstalledConnectorActionTypeIds] = useState<string[]>(
    []
  );

  useEffect(() => {
    http
      .get<{ available: boolean; data?: GapsReport }>('/internal/streams/memory/_gaps_overview')
      .then((response) => {
        if (response.available && response.data) {
          setGapsReport(response.data);
        }
      })
      .catch(() => {
        // gaps report not yet available — keep null so empty state is shown
      });
  }, [http]);

  useEffect(() => {
    http
      .get<ActionConnectorResponseItem[]>('/api/actions/connectors')
      .then((connectors) => {
        setInstalledConnectorActionTypeIds(
          connectors
            .map((connector) => connector.actionTypeId ?? connector.connector_type_id)
            .filter((actionTypeId): actionTypeId is string => Boolean(actionTypeId))
        );
      })
      .catch(() => {
        setInstalledConnectorActionTypeIds([]);
      });
  }, [http]);

  if (!isEnabled) {
    history.replace(OVERVIEW_PATH);
    return null;
  }

  return (
    <ObservabilityPageTemplate data-test-subj="nightshiftPage" isEmptyState>
      <NightshiftApp
        agentBuilderAvailable={!!agentBuilder}
        onStartOnboarding={handleStartOnboarding}
        onStartGapClosing={handleStartGapClosing}
        gapsReport={gapsReport}
        installedConnectorActionTypeIds={installedConnectorActionTypeIds}
      />
    </ObservabilityPageTemplate>
  );
}
