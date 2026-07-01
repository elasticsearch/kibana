/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiScreenReaderOnly, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { isEmpty } from 'lodash';
import { useShouldShowAnomalyUi } from '../../../../hooks/use_should_show_anomaly_ui';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import type { AnomalyDetectorType } from '../../../../../common/anomaly_detection/apm_ml_detectors';
import { getAnomalyDetectorIndex } from '../../../../../common/anomaly_detection/apm_ml_detectors';
import { MLSingleMetricLink } from './mlsingle_metric_link';

interface OpenAnomaliesProps {
  mlJobId?: string;
  detectorType: AnomalyDetectorType;
  dataTestSubj?: string;
}

const mlIconLinkCss = css`
  align-items: center;
  line-height: 0;
`;

export function OpenAnomalies({ mlJobId, detectorType, dataTestSubj }: OpenAnomaliesProps) {
  const { transactionType, serviceName } = useApmServiceContext();
  const {
    query: { kuery },
  } = useAnyOfApmParams('/services/{serviceName}', '/mobile-services/{serviceName}');

  const shouldShowAnomalyUi = useShouldShowAnomalyUi();
  const hasKuery = !isEmpty(kuery);

  if (!shouldShowAnomalyUi || hasKuery || !mlJobId) {
    return null;
  }

  const openAnomaliesLabel = i18n.translate('xpack.apm.transactionChart.openAnomalies', {
    defaultMessage: 'Open Anomalies',
  });

  return (
    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
      <EuiFlexItem grow={false}>
        <div data-test-subj={dataTestSubj ?? 'apmTransactionChartOpenAnomalies'}>
          <EuiToolTip content={openAnomaliesLabel}>
            <MLSingleMetricLink
              jobId={mlJobId}
              detectorIndex={getAnomalyDetectorIndex(detectorType)}
              serviceName={serviceName}
              transactionType={transactionType}
            >
              <span css={mlIconLinkCss}>
                <EuiIcon type="machineLearningApp" size="m" aria-hidden="true" />
                <EuiScreenReaderOnly>
                  <span>{openAnomaliesLabel}</span>
                </EuiScreenReaderOnly>
              </span>
            </MLSingleMetricLink>
          </EuiToolTip>
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
