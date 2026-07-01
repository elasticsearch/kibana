/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { EuiButton, EuiSelectable } from '@elastic/eui';
import type { EuiSelectableOption } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import * as i18n from '../translations';
import {
  DEFAULT_CLOSING_REASON_OPTIONS,
  DEFAULT_DETECTIONS_CLOSE_REASONS_KEY,
} from './default_closing_reasons';

interface ClosingReasonOption {
  key?: string;
}

export interface ClosingReasonPanelProps {
  onSubmit: (reason?: string) => void;
  /** Optional label override for the confirm button */
  buttonLabel?: string;
}

const ClosingReasonPanelComponent: React.FC<ClosingReasonPanelProps> = ({
  onSubmit,
  buttonLabel,
}) => {
  const {
    services: { uiSettings },
  } = useKibana<{ uiSettings: IUiSettingsClient }>();

  const customClosingReasons = useMemo(
    () => uiSettings.get<string[]>(DEFAULT_DETECTIONS_CLOSE_REASONS_KEY, []),
    [uiSettings]
  );

  const [options, setOptions] = useState<Array<EuiSelectableOption<ClosingReasonOption>>>([
    ...DEFAULT_CLOSING_REASON_OPTIONS.map((defaultReason) => ({ ...defaultReason })),
    ...customClosingReasons.map((reason) => ({ label: reason, key: reason })),
  ]);

  const selectedOption = useMemo(() => options.find((option) => option.checked), [options]);

  const onSubmitHandler = useCallback(() => {
    if (selectedOption) {
      onSubmit(selectedOption.key);
    }
  }, [onSubmit, selectedOption]);

  return (
    <>
      <EuiSelectable
        options={options}
        onChange={setOptions}
        singleSelection="always"
        data-test-subj="alert-closing-reason-selectable"
      >
        {(list) => list}
      </EuiSelectable>
      <EuiButton
        fullWidth
        size="s"
        disabled={!selectedOption}
        onClick={onSubmitHandler}
        data-test-subj="alert-closing-reason-submit-button"
      >
        {buttonLabel ?? i18n.CLOSING_REASON_BUTTON_MESSAGE}
      </EuiButton>
    </>
  );
};

export const ClosingReasonPanel = memo(ClosingReasonPanelComponent);
