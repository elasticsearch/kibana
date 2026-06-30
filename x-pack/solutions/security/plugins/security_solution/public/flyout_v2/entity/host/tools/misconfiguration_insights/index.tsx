/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { EuiFlyoutHeader } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import {
  EntityIdentifierFields,
  EntityType,
} from '../../../../../../common/entity_analytics/types';
import { useKibana } from '../../../../../common/lib/kibana';
import { useIsInSecurityApp } from '../../../../../common/hooks/is_in_security_app';
import { flyoutProviders } from '../../../../shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../shared/hooks/use_default_flyout_properties';
import { documentFlyoutHistoryKey } from '../../../../shared/constants/flyout_history';
import { Misconfiguration } from '../../../../csp/misconfiguration';
import { ToolsFlyoutHeader } from '../../../../shared/components/tools_flyout_header';
import { MisconfigurationFindingsDetailsTable } from '../../../../../cloud_security_posture/components/csp_details/misconfiguration_findings_details_table';
import { MISCONFIGURATION_INSIGHTS_TOOL_TEST_ID } from './test_ids';

const TITLE = i18n.translate(
  'xpack.securitySolution.flyout.entityDetails.host.misconfigurationInsights.title',
  { defaultMessage: 'Misconfigurations' }
);

export interface MisconfigurationInsightsProps {
  /** The host name used to query misconfigurations (`host.name` field value). */
  value: string;
  /** Canonical Entity Store v2 id (`entity.id`) when already resolved. */
  entityId?: string;
  /** Opens the originating host flyout as a child. */
  onShowHost: () => void;
}

/**
 * Tool flyout displaying CSP misconfiguration findings for a host entity.
 */
export const MisconfigurationInsights = memo(
  ({ value, entityId, onShowHost }: MisconfigurationInsightsProps) => {
    const { services } = useKibana();
    const { overlays } = services;
    const store = useStore();
    const history = useHistory();
    const defaultDocumentFlyoutProperties = useDefaultDocumentFlyoutProperties();
    const isInSecurityApp = useIsInSecurityApp();
    const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;

    const onShowFinding = useCallback(
      (resourceId: string, ruleId: string) => {
        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: <Misconfiguration resourceId={resourceId} ruleId={ruleId} />,
          }),
          { ...defaultDocumentFlyoutProperties, title: value, historyKey, session: 'inherit' }
        );
      },
      [overlays, services, store, history, defaultDocumentFlyoutProperties, value, historyKey]
    );

    return (
      <>
        <EuiFlyoutHeader hasBorder>
          <ToolsFlyoutHeader
            title={TITLE}
            onTitleClick={onShowHost}
            label={value}
            iconType="storage"
          />
        </EuiFlyoutHeader>
        <div className="eui-yScroll" data-test-subj={MISCONFIGURATION_INSIGHTS_TOOL_TEST_ID}>
          <MisconfigurationFindingsDetailsTable
            field={EntityIdentifierFields.hostName}
            value={value}
            entityId={entityId}
            entityType={EntityType.host}
            onShowFinding={onShowFinding}
          />
        </div>
      </>
    );
  }
);

MisconfigurationInsights.displayName = 'MisconfigurationInsights';
