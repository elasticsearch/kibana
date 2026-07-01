/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EUI_MODAL_CONFIRM_BUTTON, EuiConfirmModal, htmlIdGenerator } from '@elastic/eui';
import type { OverlayStart } from '@kbn/core/public';
import type { RenderingService } from '@kbn/core-rendering-browser';
import { toMountPoint } from '@kbn/react-kibana-mount';

export function showProjectRoutingChangeConfirmModal({
  overlays,
  rendering,
  jobCount,
}: {
  overlays: OverlayStart;
  rendering: RenderingService;
  jobCount: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const confirmModalTitleId = htmlIdGenerator()('confirmModalTitle');
      const modalSession = overlays.openModal(
        toMountPoint(
          <EuiConfirmModal
            aria-labelledby={confirmModalTitleId}
            title={i18n.translate(
              'xpack.ml.embeddables.updateADJobsProjectRoutingFlyout.confirmModalTitle',
              {
                defaultMessage: 'Update project routing?',
              }
            )}
            titleProps={{ id: confirmModalTitleId }}
            onCancel={() => {
              modalSession.close();
              reject();
            }}
            onConfirm={() => {
              modalSession.close();
              resolve();
            }}
            cancelButtonText={i18n.translate(
              'xpack.ml.embeddables.updateADJobsProjectRoutingFlyout.confirmModalCancel',
              {
                defaultMessage: 'Cancel',
              }
            )}
            confirmButtonText={i18n.translate(
              'xpack.ml.embeddables.updateADJobsProjectRoutingFlyout.confirmModalConfirm',
              {
                defaultMessage: 'Update',
              }
            )}
            defaultFocusedButton={EUI_MODAL_CONFIRM_BUTTON}
            data-test-subj="mlUpdateAdJobsProjectRoutingConfirmModal"
          >
            <FormattedMessage
              id="xpack.ml.embeddables.updateADJobsProjectRoutingFlyout.confirmModalBody"
              defaultMessage="Are you sure you want to update project routing for {count, plural, one {# job} other {# jobs}}?"
              values={{ count: jobCount }}
            />
          </EuiConfirmModal>,
          rendering
        )
      );
    } catch (e) {
      reject(e);
    }
  });
}
