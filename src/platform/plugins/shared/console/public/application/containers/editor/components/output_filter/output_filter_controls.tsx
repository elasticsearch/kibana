/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonEmpty, useEuiTheme } from '@elastic/eui';
import { useRequestReadContext } from '../../../../contexts';
import {
  useOutputFilterActionContext,
  useOutputFilterReadContext,
} from '../../../../contexts/output_filter_context';
import { isFilterableStatusCode } from '../../../../lib/apply_response_filter';

export const OutputFilterControls = () => {
  const {
    lastResult: { data },
  } = useRequestReadContext();
  const { expression: appliedExpression, isExpanded } = useOutputFilterReadContext();
  const { setIsExpanded } = useOutputFilterActionContext();
  const { euiTheme } = useEuiTheme();

  if (!data || data.length !== 1 || !isFilterableStatusCode(data[0].response.statusCode))
    return null;

  const isActive = appliedExpression.length > 0;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <EuiButtonEmpty
        size="xs"
        color={isActive ? 'primary' : 'text'}
        iconType="filter"
        data-test-subj="consoleOutputFilterButton"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {i18n.translate('console.outputFilter.button.label', {
          defaultMessage: 'Filter response',
        })}
      </EuiButtonEmpty>
      {!isExpanded && isActive && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 2,
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: euiTheme.colors.primary,
            border: `2px solid ${euiTheme.colors.emptyShade}`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};
