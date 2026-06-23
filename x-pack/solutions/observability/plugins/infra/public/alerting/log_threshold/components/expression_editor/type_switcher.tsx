/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiFlexItem, EuiFlexGroup, EuiPopover, EuiSelect, EuiExpression } from '@elastic/eui';
import type {
  PartialCriteria,
  ThresholdType,
} from '../../../../../common/alerting/logs/log_threshold/types';
import { isRatioRule } from '../../../../../common/alerting/logs/log_threshold/types';
import { ExpressionLike } from './editor';

const typePrefix = i18n.translate('xpack.infra.logs.alertFlyout.thresholdTypePrefix', {
  defaultMessage: 'when the',
});

const countSuffix = i18n.translate('xpack.infra.logs.alertFlyout.thresholdTypeCountSuffix', {
  defaultMessage: 'of log entries',
});

const ratioSuffix = i18n.translate('xpack.infra.logs.alertFlyout.thresholdTypeRatioSuffix', {
  defaultMessage: 'of Query A to Query B',
});

const countI18n = i18n.translate('xpack.infra.logs.alertFlyout.thresholdTypeCount', {
  defaultMessage: 'count',
});

const ratioI18n = i18n.translate('xpack.infra.logs.alertFlyout.thresholdTypeRatio', {
  defaultMessage: 'ratio',
});

const getOptions = (): Array<{
  value: ThresholdType;
  text: string;
}> => {
  return [
    { value: 'ratio', text: ratioI18n },
    { value: 'count', text: countI18n },
  ];
};

interface Props {
  criteria: PartialCriteria;
  updateType: (type: ThresholdType) => void;
}

const getThresholdType = (criteria: PartialCriteria): ThresholdType => {
  return isRatioRule(criteria) ? 'ratio' : 'count';
};

export const TypeSwitcher: React.FC<Props> = ({ criteria, updateType }) => {
  const [isThresholdTypePopoverOpen, setThresholdTypePopoverOpenState] = useState(false);
  const thresholdType = getThresholdType(criteria);

  return (
    <EuiFlexGroup gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiPopover
          id="thresholdType"
          aria-label={i18n.translate('xpack.infra.logs.alertFlyout.thresholdTypePopoverAriaLabel', {
            defaultMessage: 'Threshold type',
          })}
          button={
            <>
              <EuiExpression
                description={typePrefix}
                uppercase={true}
                value={thresholdType === 'ratio' ? ratioI18n : countI18n}
                isActive={isThresholdTypePopoverOpen}
                onClick={() => setThresholdTypePopoverOpenState(!isThresholdTypePopoverOpen)}
              />
              <ExpressionLike
                text={
                  thresholdType === 'ratio' ? ratioSuffix.toUpperCase() : countSuffix.toUpperCase()
                }
              />
            </>
          }
          isOpen={isThresholdTypePopoverOpen}
          closePopover={() => setThresholdTypePopoverOpenState(false)}
          ownFocus
          panelPaddingSize="s"
          anchorPosition="downLeft"
        >
          <EuiFlexGroup>
            <EuiFlexItem grow={false}>
              <EuiSelect
                data-test-subj="infraTypeSwitcherSelect"
                compressed
                value={thresholdType}
                onChange={(e) => updateType(thresholdType === 'ratio' ? 'count' : 'ratio')}
                options={getOptions()}
                aria-label={i18n.translate(
                  'xpack.infra.logs.alertFlyout.thresholdTypeSelect.ariaLabel',
                  {
                    defaultMessage: 'Threshold type',
                  }
                )}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
