/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { stringHash } from '@kbn/ml-string-hash';
import {
  ML_ANOMALY_CHARTS_ATTACHMENT_TYPE,
  ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import { i18n } from '@kbn/i18n';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import { ANOMALY_SWIMLANE_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import { useMlKibana } from './kibana_context';
import type { MappedEmbeddableTypeOf, MlEmbeddableTypes } from '../../../embeddables';

const attachmentTypeByEmbeddableType: Record<MlEmbeddableTypes, string> = {
  [ANOMALY_SWIMLANE_EMBEDDABLE_TYPE]: ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  [ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE]: ML_ANOMALY_CHARTS_ATTACHMENT_TYPE,
  [ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE]: ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
};

/**
 * Returns a callback for opening the cases modal with provided attachment state.
 */
export const useCasesModal = <EmbeddableType extends MlEmbeddableTypes>(
  embeddableType: EmbeddableType,
  title: string
) => {
  const {
    services: { cases },
  } = useMlKibana();

  const successMessage = useMemo(() => {
    return i18n.translate('xpack.ml.useCasesModal.successMessage', {
      defaultMessage: '{title} added to case.',
      values: { title },
    });
  }, [title]);

  const selectCaseModal = cases?.hooks.useCasesAddToExistingCaseModal({
    successToaster: {
      content: successMessage,
    },
  });

  return useCallback(
    (state: Partial<Omit<MappedEmbeddableTypeOf<EmbeddableType>, 'id'>>) => {
      const attachmentState = {
        ...state,
        // Creates unique id based on the input
        id: stringHash(JSON.stringify(state)).toString(),
      };

      if (!selectCaseModal) {
        throw new Error('Cases modal is not available');
      }

      selectCaseModal.open({
        getAttachments: () => [
          {
            type: attachmentTypeByEmbeddableType[embeddableType],
            data: {
              state: JSON.parse(JSON.stringify(attachmentState)),
            },
          },
        ],
      });
    },

    [embeddableType, selectCaseModal]
  );
};
