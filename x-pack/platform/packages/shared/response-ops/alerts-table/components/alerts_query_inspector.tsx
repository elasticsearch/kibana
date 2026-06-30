/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import React, { useState, memo, useCallback } from 'react';

import type { EsQuerySnapshot } from '@kbn/alerting-types';
import { HoverVisibilityContainer } from './hover_visibility_container';

import { AlertsQueryInspectorModal } from './alerts_query_inspector_modal';
import * as i18n from '../translations';

export const BUTTON_CLASS = 'inspectButtonComponent';
const VISIBILITY_CLASSES = [BUTTON_CLASS];

interface InspectButtonContainerProps {
  hide?: boolean;
  children: React.ReactNode;
}

export const InspectButtonContainer: React.FC<InspectButtonContainerProps> = memo(
  ({ children, hide }) => (
    <HoverVisibilityContainer hide={hide} targetClassNames={VISIBILITY_CLASSES}>
      {children}
    </HoverVisibilityContainer>
  )
);

interface InspectButtonProps {
  onCloseInspect?: () => void;
  showInspectButton?: boolean;
  alertsQuerySnapshot: EsQuerySnapshot;
  inspectTitle: string;
}

const AlertsQueryInspectorComponent: React.FC<InspectButtonProps> = ({
  alertsQuerySnapshot,
  inspectTitle,
}) => {
  const [isShowingModal, setIsShowingModal] = useState(false);

  const onOpenModal = useCallback(() => {
    setIsShowingModal(true);
  }, []);

  const onCloseModal = useCallback(() => {
    setIsShowingModal(false);
  }, []);

  return (
    <>
      <EuiToolTip content={i18n.INSPECT} disableScreenReaderOutput>
        <EuiButtonIcon
          className={BUTTON_CLASS}
          aria-label={i18n.INSPECT}
          data-test-subj="inspect-icon-button"
          iconSize="m"
          iconType="inspect"
          onClick={onOpenModal}
        />
      </EuiToolTip>
      {isShowingModal && (
        <AlertsQueryInspectorModal
          closeModal={onCloseModal}
          data-test-subj="inspect-modal"
          alertsQuerySnapshot={alertsQuerySnapshot}
          title={inspectTitle}
        />
      )}
    </>
  );
};

AlertsQueryInspectorComponent.displayName = 'AlertsQueryInspectorComponent';

export const AlertsQueryInspector = React.memo(AlertsQueryInspectorComponent);
