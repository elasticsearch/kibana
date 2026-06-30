/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { EuiFlyoutBody, EuiFlyoutHeader } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { noop } from 'lodash/fp';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { EntityType } from '../../../../../../common/entity_analytics/types';
import { RiskInputsTab } from '../../../../../entity_analytics/components/entity_details_flyout/tabs/risk_inputs/risk_inputs_tab';
import { ToolsFlyoutHeader } from '../../../../shared/components/tools_flyout_header';
import { useKibana } from '../../../../../common/lib/kibana';
import { flyoutProviders } from '../../../../shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../../shared/hooks/use_default_flyout_properties';
import { DocumentFlyoutWrapper } from '../../../../document/main/document_flyout_wrapper';
import { cellActionRenderer } from '../../../../shared/components/cell_actions';
import { useIsInSecurityApp } from '../../../../../common/hooks/is_in_security_app';
import { documentFlyoutHistoryKey } from '../../../../shared/constants/flyout_history';
import { RISK_INPUTS_TOOL_TEST_ID } from './test_ids';

const TITLE = i18n.translate('xpack.securitySolution.flyout.entityDetails.host.riskInputs.title', {
  defaultMessage: 'Risk score',
});

export interface RiskInputsProps {
  /** Display name of the host (typically `host.name`). */
  entityName: string;
  /** Canonical Entity Store v2 id (`entity.id`) when already resolved. */
  entityId?: string;
  /** Opens the originating host flyout as a child. */
  onShowHost: () => void;
}

export const RiskInputs = memo(({ entityName, entityId, onShowHost }: RiskInputsProps) => {
  const { services } = useKibana();
  const store = useStore();
  const history = useHistory();
  const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();
  const isInSecurityApp = useIsInSecurityApp();
  const historyKey = isInSecurityApp ? documentFlyoutHistoryKey : DOC_VIEWER_FLYOUT_HISTORY_KEY;

  const onShowAlert = useCallback(
    (id: string, indexName: string) => {
      services.overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: (
            <DocumentFlyoutWrapper
              documentId={id}
              indexName={indexName}
              renderCellActions={cellActionRenderer}
              onAlertUpdated={noop}
            />
          ),
        }),
        {
          ...defaultFlyoutProperties,
          historyKey,
          session: 'inherit',
        }
      );
    },
    [services, store, history, defaultFlyoutProperties, historyKey]
  );

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <ToolsFlyoutHeader
          title={TITLE}
          onTitleClick={onShowHost}
          label={entityName}
          iconType="storage"
        />
      </EuiFlyoutHeader>
      <EuiFlyoutBody data-test-subj={RISK_INPUTS_TOOL_TEST_ID}>
        <RiskInputsTab
          entityType={EntityType.host}
          entityName={entityName}
          entityId={entityId}
          onShowAlert={onShowAlert}
        />
      </EuiFlyoutBody>
    </>
  );
});

RiskInputs.displayName = 'RiskInputs';
