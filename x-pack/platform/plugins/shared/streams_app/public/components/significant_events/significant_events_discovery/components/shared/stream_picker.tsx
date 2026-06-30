/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiComboBox } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ListStreamDetail } from '@kbn/streams-plugin/server/routes/internal/streams/crud/route';
import React, { useCallback, useMemo } from 'react';

interface StreamPickerProps {
  streams: ListStreamDetail[] | undefined;
  isStreamsLoading: boolean;
  selectedStreamNames: string[];
  onSelectedStreamNamesChange: (streamNames: string[]) => void;
  excludedStreamNames?: string[];
  isDisabled?: boolean;
  fullWidth?: boolean;
}

export const StreamPicker = ({
  streams,
  isStreamsLoading,
  selectedStreamNames,
  onSelectedStreamNamesChange,
  excludedStreamNames,
  isDisabled,
  fullWidth,
}: StreamPickerProps) => {
  const excludedSet = useMemo(() => new Set(excludedStreamNames ?? []), [excludedStreamNames]);

  const options = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () =>
      (streams ?? [])
        .filter((s) => !excludedSet.has(s.stream.name))
        .map((s) => ({
          label: s.stream.name,
          key: s.stream.name,
        })),
    [streams, excludedSet]
  );

  const selectedOptions = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () => selectedStreamNames.map((name) => ({ label: name, key: name })),
    [selectedStreamNames]
  );

  const handleChange = useCallback(
    (nextOptions: Array<EuiComboBoxOptionOption<string>>) => {
      onSelectedStreamNamesChange(nextOptions.map((o) => o.label));
    },
    [onSelectedStreamNamesChange]
  );

  return (
    <EuiComboBox
      aria-label={STREAM_PICKER_ARIA_LABEL}
      placeholder={STREAM_PICKER_PLACEHOLDER}
      options={options}
      selectedOptions={selectedOptions}
      onChange={handleChange}
      isLoading={isStreamsLoading}
      isDisabled={isDisabled}
      fullWidth={fullWidth}
      isClearable
    />
  );
};

const STREAM_PICKER_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicators.streamPickerAriaLabel',
  {
    defaultMessage: 'Select streams to generate knowledge indicators for',
  }
);

const STREAM_PICKER_PLACEHOLDER = i18n.translate(
  'xpack.streams.knowledgeIndicators.streamPickerPlaceholder',
  {
    defaultMessage: 'Select streams...',
  }
);
