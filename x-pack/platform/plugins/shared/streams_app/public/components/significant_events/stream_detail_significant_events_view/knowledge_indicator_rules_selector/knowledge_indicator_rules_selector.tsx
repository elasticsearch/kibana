/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectableOption } from '@elastic/eui';
import { EuiButton, EuiPopover, EuiSelectable, useGeneratedHtmlId } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useMemo, useState } from 'react';

interface KnowledgeIndicatorRulesSelectorProps {
  options: EuiSelectableOption[];
  onChange: (options: EuiSelectableOption[]) => void;
}

export function KnowledgeIndicatorRulesSelector({
  options,
  onChange,
}: KnowledgeIndicatorRulesSelectorProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverId = useGeneratedHtmlId({ prefix: 'significantEventsTypeFilterPopover' });

  const selectedLabel = useMemo(
    () => options.find((option) => option.checked === 'on')?.label,
    [options]
  );

  return (
    <EuiPopover
      id={popoverId}
      aria-label={TYPE_FILTER_POPOVER_ARIA_LABEL}
      button={
        <EuiButton
          iconType="arrowDown"
          iconSide="right"
          color="text"
          onClick={() => setIsPopoverOpen((isOpen) => !isOpen)}
        >
          {selectedLabel ?? TYPE_FILTER_LABEL}
        </EuiButton>
      }
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      panelPaddingSize="s"
    >
      <EuiSelectable
        aria-label={TYPE_FILTER_SELECTABLE_ARIA_LABEL}
        singleSelection="always"
        options={options}
        onChange={(nextOptions) => {
          onChange(nextOptions);
          setIsPopoverOpen(false);
        }}
      >
        {(list) => (
          <div
            css={css`
              min-width: 260px;
            `}
          >
            {list}
          </div>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
}

const TYPE_FILTER_POPOVER_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.typeFilterPopoverLabel',
  {
    defaultMessage: 'Type filter',
  }
);

const TYPE_FILTER_LABEL = i18n.translate('xpack.streams.significantEventsTable.typeFilterLabel', {
  defaultMessage: 'Knowledge Indicators',
});

const TYPE_FILTER_SELECTABLE_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.typeFilterSelectableAriaLabel',
  {
    defaultMessage: 'Filter by type',
  }
);
