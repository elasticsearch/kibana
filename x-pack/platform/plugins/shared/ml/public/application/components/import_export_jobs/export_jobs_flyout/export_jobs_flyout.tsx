/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useState } from 'react';
import { EuiButtonEmpty } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { dynamic } from '@kbn/shared-ux-utility';

import { useEnabledFeatures } from '../../../contexts/ml';
import type { ExportJobsFlyoutContentProps } from './export_jobs_flyout_content';

export interface Props extends Pick<ExportJobsFlyoutContentProps, 'currentTab'> {
  isDisabled: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

const ExportJobsFlyoutContent = dynamic(async () => ({
  default: (await import('./export_jobs_flyout_content')).ExportJobsFlyoutContent,
}));

export const ExportJobsFlyout: FC<Props> = ({ isDisabled, isOpen, onClose, ...rest }) => {
  const [internalShowFlyout, setInternalShowFlyout] = useState(false);
  const { isADEnabled, isDFAEnabled } = useEnabledFeatures();
  const isControlled = isOpen !== undefined;
  const showFlyout = isControlled ? isOpen : internalShowFlyout;

  function toggleFlyout() {
    if (isControlled) {
      onClose?.();
      return;
    }
    setInternalShowFlyout(!internalShowFlyout);
  }

  function closeFlyout() {
    if (isControlled) {
      onClose?.();
      return;
    }
    setInternalShowFlyout(false);
  }

  if (isADEnabled === false && isDFAEnabled === false) {
    return null;
  }

  return (
    <>
      {!isControlled ? <FlyoutButton onClick={toggleFlyout} isDisabled={isDisabled} /> : null}

      {showFlyout === true && isDisabled === false && (
        <ExportJobsFlyoutContent
          onClose={closeFlyout}
          {...{ isADEnabled, isDFAEnabled, ...rest }}
        />
      )}
    </>
  );
};

const FlyoutButton: FC<{ isDisabled: boolean; onClick(): void }> = ({ isDisabled, onClick }) => {
  return (
    <EuiButtonEmpty
      iconType="upload"
      onClick={onClick}
      isDisabled={isDisabled}
      data-test-subj="mlJobsExportButton"
    >
      <FormattedMessage id="xpack.ml.importExport.exportButton" defaultMessage="Export jobs" />
    </EuiButtonEmpty>
  );
};
