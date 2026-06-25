/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxOptionOption } from '@elastic/eui';

export interface GetGenericComboBoxPropsReturn {
  comboOptions: EuiComboBoxOptionOption[];
  labels: string[];
  selectedComboOptions: EuiComboBoxOptionOption[];
}

/**
 * Determines the options, selected values and option labels for EUI combo box
 * @param options options user can select from
 * @param selectedOptions user selection if any
 * @param getLabel helper function to know which property to use for labels
 */
export const getGenericComboBoxProps = <T>({
  getLabel,
  getOptionTestSubj,
  options,
  selectedOptions,
  disabledOptions,
}: {
  getLabel: (value: T) => string;
  /**
   * Returns a stable `data-test-subj` for each option. EUI 116.3.0 no longer
   * exposes the option label via the native `title` attribute when
   * truncation is in play, so consumers that need a stable test hook should
   * provide one here.
   */
  getOptionTestSubj?: (value: T) => string | undefined;
  options: T[];
  selectedOptions: T[];
  disabledOptions?: T[];
}): GetGenericComboBoxPropsReturn => {
  const newLabels = options.map(getLabel);
  const disabledLabels = disabledOptions?.map(getLabel);
  const newComboOptions: EuiComboBoxOptionOption[] = options.map((option, idx) => {
    const label = newLabels[idx];
    const testSubj = getOptionTestSubj?.(option);
    return {
      label,
      disabled: disabledLabels && disabledLabels.length !== 0 && disabledLabels.includes(label),
      ...(testSubj ? { 'data-test-subj': testSubj } : {}),
    };
  });
  const newSelectedComboOptions = selectedOptions
    .map(getLabel)
    .filter((option) => {
      return newLabels.indexOf(option) !== -1;
    })
    .map((option) => {
      return newComboOptions[newLabels.indexOf(option)];
    });

  return {
    comboOptions: newComboOptions,
    labels: newLabels,
    selectedComboOptions: newSelectedComboOptions,
  };
};
