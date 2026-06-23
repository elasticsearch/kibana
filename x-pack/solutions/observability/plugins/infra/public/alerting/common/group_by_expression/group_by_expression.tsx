/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiExpression,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useMemo, useState } from 'react';
import type { FieldSpec } from '@kbn/data-views-plugin/common';
import { GroupBySelector } from './selector';

interface Props {
  selectedGroups?: string[];
  fields: FieldSpec[];
  onChange: (groupBy: string[]) => void;
  label?: string;
}

const DEFAULT_GROUP_BY_LABEL = i18n.translate('xpack.infra.alerting.alertFlyout.groupByLabel', {
  defaultMessage: 'Group By',
});

const EVERYTHING_PLACEHOLDER = i18n.translate(
  'xpack.infra.alerting.alertFlyout.groupBy.placeholder',
  {
    defaultMessage: 'Nothing (ungrouped)',
  }
);

export const GroupByExpression: React.FC<Props> = ({
  selectedGroups = [],
  fields,
  label,
  onChange,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverTitleId = useGeneratedHtmlId();

  const expressionValue = useMemo(() => {
    return selectedGroups.length > 0 ? selectedGroups.join(', ') : EVERYTHING_PLACEHOLDER;
  }, [selectedGroups]);

  const labelProp = label ?? DEFAULT_GROUP_BY_LABEL;

  return (
    <EuiFlexGroup gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiPopover
          id="groupByExpression"
          aria-labelledby={popoverTitleId}
          button={
            <EuiExpression
              description={labelProp}
              uppercase={true}
              value={expressionValue}
              isActive={isPopoverOpen}
              onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            />
          }
          isOpen={isPopoverOpen}
          closePopover={() => setIsPopoverOpen(false)}
          ownFocus
          panelPaddingSize="s"
          anchorPosition="downLeft"
        >
          <div style={{ zIndex: 11000 }}>
            <EuiPopoverTitle id={popoverTitleId}>{labelProp}</EuiPopoverTitle>
            <GroupBySelector
              selectedGroups={selectedGroups}
              onChange={onChange}
              fields={fields}
              label={labelProp}
              placeholder={EVERYTHING_PLACEHOLDER}
            />
          </div>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
