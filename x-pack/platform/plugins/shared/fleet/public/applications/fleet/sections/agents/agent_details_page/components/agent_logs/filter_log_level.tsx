/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useState, useCallback } from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
import { EuiPopover, EuiFilterButton, EuiSelectable } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import { AGENT_LOG_LEVELS } from '../../../../../../../../common/constants';

export const LogLevelFilter: React.FunctionComponent<{
  selectedLevels: string[];
  onToggleLevel: (level: string) => void;
}> = memo(({ selectedLevels, onToggleLevel }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const togglePopover = useCallback(() => setIsOpen((prevIsOpen) => !prevIsOpen), []);
  const closePopover = useCallback(() => setIsOpen(false), []);

  const [options, setOptions] = useState<EuiSelectableOption[]>(
    AGENT_LOG_LEVELS.map((level) => ({
      label: level,
      checked: selectedLevels.includes(level) ? 'on' : undefined,
      key: level,
    }))
  );

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.fleet.agentLogs.logLevelFilterAriaLabel', {
        defaultMessage: 'Log level filter',
      })}
      button={
        <EuiFilterButton
          data-test-subj="agentList.logLevelFilterBtn"
          iconType="chevronSingleDown"
          onClick={togglePopover}
          isSelected={isOpen}
          numFilters={options.length}
          hasActiveFilters={selectedLevels.length > 0}
          numActiveFilters={selectedLevels.length}
        >
          {i18n.translate('xpack.fleet.agentLogs.logLevelSelectText', {
            defaultMessage: 'Log level',
          })}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="s"
    >
      <EuiSelectable
        options={options}
        onChange={(newOptions) => {
          setOptions(newOptions);
          newOptions.forEach((option, index) => {
            if (option.checked !== options[index].checked) {
              onToggleLevel(option.label);
              return;
            }
          });
        }}
        data-test-subj="agentList.logLevelFilterOptions"
      >
        {(list) => list}
      </EuiSelectable>
    </EuiPopover>
  );
});
