/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiCode,
  EuiIconTip,
  EuiSpacer,
} from '@elastic/eui';
import type { ESQLColumn } from '@kbn/es-types';
import React, { useMemo } from 'react';
import { DataControlEditorStrings } from '../data_control_constants';

export const ValuesPreviewHeader = ({
  previewColumns,
  dataSource,
}: {
  previewColumns: ESQLColumn[];
  dataSource: string;
}) => {
  const singleColumn = useMemo(
    () => (previewColumns.length === 1 ? previewColumns[0] : null),
    [previewColumns]
  );

  return (
    singleColumn && (
      <>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFormRow
              label={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getDataSourceLabel()}
            >
              <EuiCode>{dataSource}</EuiCode>
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow
              label={
                <>
                  {DataControlEditorStrings.manageControl.dataSource.valuesPreview.getFieldLabel()}{' '}
                  <EuiIconTip
                    type="question"
                    color="primary"
                    content={DataControlEditorStrings.manageControl.dataSource.valuesPreview.getFieldTooltip()}
                  />
                </>
              }
            >
              <EuiCode>{singleColumn.name}</EuiCode>
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
      </>
    )
  );
};
