/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { EuiBadge, EuiHealth, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { AnomalyDetectorType } from '@kbn/apm-types';
import { ML_ANOMALY_SEVERITY } from '@kbn/ml-anomaly-utils/anomaly_severity';
import {
  getApmMlDetectorLabel,
  getSeverity,
  getSeverityColor,
} from '../../../../../common/anomaly_detection';

function getI18nLabel(severity: ML_ANOMALY_SEVERITY): string {
  switch (severity) {
    case ML_ANOMALY_SEVERITY.CRITICAL:
      return i18n.translate('xpack.apm.anomaliesBadge.label.critical', {
        defaultMessage: 'Critical',
      });
    case ML_ANOMALY_SEVERITY.MAJOR:
      return i18n.translate('xpack.apm.anomaliesBadge.label.major', {
        defaultMessage: 'Major',
      });
    case ML_ANOMALY_SEVERITY.MINOR:
      return i18n.translate('xpack.apm.anomaliesBadge.label.minor', {
        defaultMessage: 'Minor',
      });
    case ML_ANOMALY_SEVERITY.WARNING:
      return i18n.translate('xpack.apm.anomaliesBadge.label.warning', {
        defaultMessage: 'Warning',
      });
    case ML_ANOMALY_SEVERITY.LOW:
      return i18n.translate('xpack.apm.anomaliesBadge.label.low', {
        defaultMessage: 'Low',
      });
    case ML_ANOMALY_SEVERITY.UNKNOWN:
      return i18n.translate('xpack.apm.anomaliesBadge.label.unknown', {
        defaultMessage: 'Unknown',
      });
  }
}

function formatLabelWithScore(label: string, score?: number): string {
  if (score === undefined) return label;
  return `${label} (${Math.round(score)})`;
}

const anomaliesBadgeCss = css`
  align-items: center;
`;

const anomaliesBadgeHealthCss = css`
  line-height: inherit;
  display: flex;
  align-items: center;
`;

interface AnomaliesBadgeProps {
  score?: number;
  /** When set, the badge renders as an anchor linking to this URL (e.g. the service overview tab). */
  href?: string;
  /** When set, the badge renders as a button using this handler for SPA navigation (avoids a full page reload). Mutually exclusive with `href`. */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Detector that produced the surfaced score, used to name the anomalous signal in the tooltip. */
  detectorType?: AnomalyDetectorType;
}

export function AnomaliesBadge({ score, href, onClick, detectorType }: AnomaliesBadgeProps) {
  const severity = getSeverity(score);
  const text = formatLabelWithScore(getI18nLabel(severity), score);

  const tooltipContent =
    score === undefined
      ? i18n.translate('xpack.apm.anomaliesBadge.tooltip.unknown', {
          defaultMessage: 'No anomaly score is available for the selected time range.',
        })
      : detectorType !== undefined
      ? i18n.translate('xpack.apm.anomaliesBadge.tooltip.scoreWithDetector', {
          defaultMessage: 'Anomaly score (max.): {score} - {detector}',
          values: { score: score.toFixed(2), detector: getApmMlDetectorLabel(detectorType) },
        })
      : i18n.translate('xpack.apm.anomaliesBadge.tooltip.score', {
          defaultMessage: 'Anomaly score (max.): {score}',
          values: { score: score.toFixed(2) },
        });

  // `EuiBadge` exposes anchor (`href`) and button (`onClick`) variants as a
  // mutually exclusive union, so the interaction props are resolved up front.
  const interactionProps = onClick
    ? { onClick, onClickAriaLabel: text }
    : href
    ? { href }
    : { role: 'img', 'aria-label': text };

  return (
    <EuiToolTip position="bottom" content={tooltipContent}>
      <EuiBadge
        tabIndex={0}
        color="hollow"
        css={anomaliesBadgeCss}
        data-test-subj="apmAnomaliesBadge"
        {...interactionProps}
      >
        <EuiHealth
          textSize="inherit"
          color={score === undefined ? 'subdued' : getSeverityColor(score)}
          css={anomaliesBadgeHealthCss}
        >
          {text}
        </EuiHealth>
      </EuiBadge>
    </EuiToolTip>
  );
}
