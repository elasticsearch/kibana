/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import { EuiToolTip, useEuiTheme } from '@elastic/eui';

import type { CaseUI } from '../../../../../../../common/ui/types';
import { getExtendedFieldDisplayLabels } from '../../../../../all_cases/utils/extended_fields_column_utils';

interface ExtendedFieldsListItemContentProps {
  extendedFields: CaseUI['extendedFields'];
  extendedFieldsLabels: CaseUI['extendedFieldsLabels'];
}

export const ExtendedFieldsListItemContent: React.FC<ExtendedFieldsListItemContentProps> = ({
  extendedFields,
  extendedFieldsLabels,
}) => {
  const { euiTheme } = useEuiTheme();
  const labels = getExtendedFieldDisplayLabels(extendedFields, extendedFieldsLabels);

  const styles = useMemo(
    () => ({
      tooltipContent: css`
        display: flex;
        flex-direction: column;
        gap: ${euiTheme.size.xs};
      `,
      tooltipAnchor: {
        cursor: 'default',
      },
    }),
    [euiTheme]
  );

  const tooltipContent = (
    <div css={styles.tooltipContent}>
      {labels.map((label, index) => (
        <div key={`${label}-${index}`}>{label}</div>
      ))}
    </div>
  );

  return (
    <EuiToolTip content={tooltipContent} position="top">
      <span
        css={styles.tooltipAnchor}
        data-test-subj="cases-list-item-field-extended-fields-tooltip-anchor"
        tabIndex={0}
      >
        {labels.length}
      </span>
    </EuiToolTip>
  );
};

ExtendedFieldsListItemContent.displayName = 'ExtendedFieldsListItemContent';
