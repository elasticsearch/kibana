/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiExpression,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelect,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { isFinite, isNumber } from 'lodash';
import React, { useState } from 'react';
import type { IErrorObject } from '@kbn/triggers-actions-ui-plugin/public';
import type { RuleParams } from '../../../../../common/alerting/logs/log_threshold/types';
import {
  Comparator,
  ComparatorToi18nMap,
} from '../../../../../common/alerting/logs/log_threshold/types';

const thresholdPrefix = i18n.translate('xpack.infra.logs.alertFlyout.thresholdPrefix', {
  defaultMessage: 'is',
});

const popoverTitle = i18n.translate('xpack.infra.logs.alertFlyout.thresholdPopoverTitle', {
  defaultMessage: 'Threshold',
});

const getComparatorOptions = (): Array<{
  value: Comparator;
  text: string;
}> => {
  return [
    { value: Comparator.LT, text: ComparatorToi18nMap[Comparator.LT] },
    { value: Comparator.LT_OR_EQ, text: ComparatorToi18nMap[Comparator.LT_OR_EQ] },
    { value: Comparator.GT, text: ComparatorToi18nMap[Comparator.GT] },
    { value: Comparator.GT_OR_EQ, text: ComparatorToi18nMap[Comparator.GT_OR_EQ] },
  ];
};

interface Props {
  comparator?: Comparator;
  value?: number;
  updateThreshold: (params: Partial<RuleParams['count']>) => void;
  errors: IErrorObject;
}

export const Threshold: React.FC<Props> = ({ comparator, value, updateThreshold, errors }) => {
  const [isThresholdPopoverOpen, setThresholdPopoverOpenState] = useState(false);
  const popoverTitleId = useGeneratedHtmlId();

  return (
    <EuiFlexGroup gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiPopover
          id="threshold"
          aria-labelledby={popoverTitleId}
          button={
            <EuiExpression
              description={thresholdPrefix}
              uppercase={true}
              value={`${comparator ? ComparatorToi18nMap[comparator] : ''} ${
                typeof value === 'number' ? value : ''
              }`}
              isActive={isThresholdPopoverOpen}
              onClick={() => setThresholdPopoverOpenState(!isThresholdPopoverOpen)}
            />
          }
          isOpen={isThresholdPopoverOpen}
          closePopover={() => setThresholdPopoverOpenState(false)}
          ownFocus
          panelPaddingSize="s"
          anchorPosition="downLeft"
        >
          <>
            <EuiPopoverTitle id={popoverTitleId}>{popoverTitle}</EuiPopoverTitle>
            <EuiFlexGroup>
              <EuiFlexItem grow={false}>
                <EuiFormRow>
                  <EuiSelect
                    data-test-subj="infraThresholdSelect"
                    compressed
                    value={comparator}
                    onChange={(e) => updateThreshold({ comparator: e.target.value as Comparator })}
                    options={getComparatorOptions()}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFormRow
                  isInvalid={
                    // @ts-expect-error upgrade typescript v5.1.6
                    errors.value.length > 0
                  }
                  error={errors.value as string[]}
                >
                  <EuiFieldNumber
                    // @ts-expect-error upgrade typescript v5.1.6
                    isInvalid={errors.value.length > 0}
                    data-test-subj="infraThresholdFieldNumber"
                    compressed
                    value={value}
                    onChange={(e) => {
                      const number = parseFloat(e.target.value);
                      updateThreshold({
                        value: isNumber(number) && isFinite(number) ? number : undefined,
                      });
                    }}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
