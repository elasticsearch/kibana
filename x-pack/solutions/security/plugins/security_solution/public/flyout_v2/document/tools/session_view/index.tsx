/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { css } from '@emotion/react';
import { EuiFlyoutBody, EuiFlyoutHeader, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { type DataTableRecord } from '@kbn/discover-utils';
import type { Process, ProcessEvent } from '@kbn/session-view-plugin/common';
import { useHistory } from 'react-router-dom';
import { useStore } from 'react-redux';
import { DocumentToolsFlyoutHeader } from '../../../shared/components/document_tools_flyout_header';
import type { CellActionRenderer } from '../../../shared/components/cell_actions';
import type { SessionViewConfig } from '../../../../../common/types/session_view';
import { DocumentFlyoutWrapper } from '../../main/document_flyout_wrapper';
import { PREFIX } from '../../../../flyout/shared/test_ids';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useKibana } from '../../../../common/lib/kibana';
import { useSessionViewConfig } from './hooks/use_session_view_config';
import { flyoutProviders } from '../../../shared/components/flyout_provider';
import { useDefaultDocumentFlyoutProperties } from '../../../shared/hooks/use_default_flyout_properties';
import { SessionViewDetails } from './components/session_view_details';

export const SESSION_VIEW_TEST_ID = `${PREFIX}SessionView` as const;

const TITLE = i18n.translate('xpack.securitySolution.flyout.sessionView.title', {
  defaultMessage: 'Session view',
});

const EUI_HEADER_HEIGHT = 96;
const EXPANDABLE_FLYOUT_LEFT_SECTION_HEADER_HEIGHT = 72;
const VISUALIZE_WRAPPER_PADDING = 16;
const VISUALIZE_BUTTON_GROUP_HEIGHT = 32;
const EUI_SPACER_HEIGHT = 16;
const SESSION_VIEW_SEARCH_BAR_HEIGHT = 64;

export interface SessionViewProps {
  /**
   * Alert document
   */
  hit: DataTableRecord;
  /**
   * Passed to Session View component to reset the view.
   */
  jumpToEntityId?: string;
  /**
   * Passed to Session View component to reset the view.
   */
  jumpToCursor?: string;
  /**
   * Renderer used by Session View panels for field cell actions.
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh parent flyout content.
   */
  onAlertUpdated: () => void;
}

/**
 * Session view displayed in the document details expandable flyout left section under the Visualize tab
 */
export const SessionView: FC<SessionViewProps> = memo(
  ({ hit, jumpToEntityId, jumpToCursor, renderCellActions, onAlertUpdated }) => {
    const { euiTheme } = useEuiTheme();
    const { services } = useKibana();
    const { overlays, sessionView } = services;
    const store = useStore();
    const history = useHistory();
    const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();

    const { canReadPolicyManagement } = useUserPrivileges().endpointPrivileges;

    const sessionViewConfig = useSessionViewConfig(hit);
    const [jumpTarget, setJumpTarget] = useState<{
      jumpToEntityId?: string;
      jumpToCursor?: string;
    }>({ jumpToEntityId, jumpToCursor });

    useEffect(() => {
      setJumpTarget({ jumpToEntityId, jumpToCursor });
    }, [jumpToCursor, jumpToEntityId]);

    const openAlertDetails = useCallback(
      (alertId: string, alertIndex: string, onClose?: () => void) =>
        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: (
              <DocumentFlyoutWrapper
                documentId={alertId}
                indexName={alertIndex}
                renderCellActions={renderCellActions}
                onAlertUpdated={onAlertUpdated}
              />
            ),
          }),
          {
            ...defaultFlyoutProperties,
            session: 'inherit',
          }
        ),
      [
        defaultFlyoutProperties,
        history,
        onAlertUpdated,
        overlays,
        renderCellActions,
        services,
        store,
      ]
    );

    const handleJumpToEvent = useCallback(
      (event: ProcessEvent) => {
        if (!event.process) {
          return;
        }

        const { entity_id: entityId } = event.process;
        if (!entityId || entityId === sessionViewConfig?.sessionEntityId) {
          return;
        }

        const alert = event.kibana?.alert;
        const cursor = alert ? alert.original_time : event['@timestamp'];
        if (!cursor) {
          return;
        }

        setJumpTarget({ jumpToEntityId: entityId, jumpToCursor: cursor });
      },
      [sessionViewConfig?.sessionEntityId]
    );

    const openDetails = useCallback(
      (selectedProcess: Process | null) => {
        if (
          !selectedProcess ||
          !sessionViewConfig?.index ||
          !sessionViewConfig?.sessionEntityId ||
          !sessionViewConfig?.sessionStartTime ||
          !sessionViewConfig?.investigatedAlertId
        ) {
          return;
        }

        overlays.openSystemFlyout(
          flyoutProviders({
            services,
            store,
            history,
            children: (
              <SessionViewDetails
                selectedProcess={selectedProcess}
                index={sessionViewConfig.index}
                sessionEntityId={sessionViewConfig.sessionEntityId}
                sessionStartTime={sessionViewConfig.sessionStartTime}
                investigatedAlertId={sessionViewConfig.investigatedAlertId}
                renderCellActions={renderCellActions}
                onJumpToEvent={handleJumpToEvent}
                onAlertUpdated={onAlertUpdated}
              />
            ),
          }),
          {
            ...defaultFlyoutProperties,
            session: 'inherit',
          }
        );
      },
      [
        defaultFlyoutProperties,
        handleJumpToEvent,
        history,
        onAlertUpdated,
        overlays,
        renderCellActions,
        services,
        sessionViewConfig?.index,
        sessionViewConfig?.investigatedAlertId,
        sessionViewConfig?.sessionEntityId,
        sessionViewConfig?.sessionStartTime,
        store,
      ]
    );

    const closeDetails = useCallback(() => {}, []);

    const height =
      window.innerHeight -
      EUI_HEADER_HEIGHT -
      EXPANDABLE_FLYOUT_LEFT_SECTION_HEADER_HEIGHT -
      2 * VISUALIZE_WRAPPER_PADDING -
      VISUALIZE_BUTTON_GROUP_HEIGHT -
      EUI_SPACER_HEIGHT -
      SESSION_VIEW_SEARCH_BAR_HEIGHT;

    return (
      <>
        <EuiFlyoutHeader
          hasBorder
          css={css`
            padding-block: ${euiTheme.size.s} !important;
          `}
        >
          <DocumentToolsFlyoutHeader
            title={TITLE}
            hit={hit}
            renderCellActions={renderCellActions}
            onAlertUpdated={onAlertUpdated}
          />
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <div data-test-subj={SESSION_VIEW_TEST_ID}>
            {sessionView.getSessionView({
              ...(sessionViewConfig as SessionViewConfig),
              height,
              isFullScreen: true,
              loadAlertDetails: openAlertDetails,
              openDetails: (selectedProcess: Process | null) => openDetails(selectedProcess),
              closeDetails: () => closeDetails(),
              canReadPolicyManagement,
              resetJumpToEntityId: jumpTarget.jumpToEntityId,
              resetJumpToCursor: jumpTarget.jumpToCursor,
            })}
          </div>
        </EuiFlyoutBody>
      </>
    );
  }
);

SessionView.displayName = 'SessionView';
