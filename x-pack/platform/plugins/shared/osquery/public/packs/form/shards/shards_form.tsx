/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiToolTip } from '@elastic/eui';
import type { UseFieldArrayRemove, UseFormReturn } from 'react-hook-form';
import type { ShardsArray } from '../../../../common/utils/converters';
import { ShardsPolicyField } from './shards_policy_field';
import { ShardsPercentageField } from './shards_percentage_field';
import { overflowCss } from '../../utils';

export type ShardsFormReturn = UseFormReturn<{ shardsArray: ShardsArray }>;

interface ShardsFormProps {
  index: number;
  isLastItem: boolean;
  control: ShardsFormReturn['control'];
  onDelete?: UseFieldArrayRemove;
  options: Array<EuiComboBoxOptionOption<string>>;
  isDisabled?: boolean;
}

const ShardsFormComponent = ({
  onDelete,
  index,
  isLastItem,
  control,
  options,
  isDisabled = false,
}: ShardsFormProps) => {
  const handleDeleteClick = useCallback(() => {
    if (onDelete) {
      onDelete(index);
    }
  }, [index, onDelete]);

  const buttonWrapperCss = useCallback(
    ({ euiTheme }: any) => (index === 0 ? { marginTop: euiTheme.size.base } : {}),
    [index]
  );

  // EuiComboBox uses `isDisabled`; EuiRange uses `disabled`.
  const comboBoxProps = useMemo(() => ({ isDisabled }), [isDisabled]);
  const rangeProps = useMemo(() => ({ disabled: isDisabled }), [isDisabled]);

  return (
    <>
      <EuiFlexGroup
        data-test-subj={`packShardsForm-${index}`}
        alignItems="flexStart"
        gutterSize="s"
      >
        <EuiFlexItem css={overflowCss}>
          <ShardsPolicyField
            index={index}
            control={control}
            hideLabel={index !== 0}
            options={options}
            euiFieldProps={comboBoxProps}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={true}>
              <ShardsPercentageField
                index={index}
                control={control}
                hideLabel={index !== 0}
                euiFieldProps={rangeProps}
              />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <div css={buttonWrapperCss}>
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.osquery.pack.form.deleteShardsRowButtonAriaLabel',
                    {
                      defaultMessage: 'Delete shards row',
                    }
                  )}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    aria-label={i18n.translate(
                      'xpack.osquery.pack.form.deleteShardsRowButtonAriaLabel',
                      {
                        defaultMessage: 'Delete shards row',
                      }
                    )}
                    iconType="trash"
                    color="text"
                    disabled={isLastItem || isDisabled}
                    onClick={handleDeleteClick}
                  />
                </EuiToolTip>
              </div>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
    </>
  );
};

export const ShardsForm = React.memo(ShardsFormComponent);
