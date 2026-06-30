/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

export const TableTitle = ({
  pageIndex,
  pageSize,
  total,
  label,
}: {
  pageIndex: number;
  pageSize: number;
  total: number;
  label: string;
}) => {
  const start = Math.min(pageIndex * pageSize + 1, total);
  const end = Math.min(start + pageSize - 1, total);
  return (
    <EuiText size="xs">
      <FormattedMessage
        id="xpack.streams.tableTitle.showing"
        defaultMessage="Showing {count} of {total} {label}"
        values={{
          count: (
            <strong>
              {start}-{end}
            </strong>
          ),
          total,
          label: <strong>{label}</strong>,
        }}
      />
    </EuiText>
  );
};
