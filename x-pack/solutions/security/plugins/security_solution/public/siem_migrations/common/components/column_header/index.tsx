/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiToolTip, EuiIcon } from '@elastic/eui';

interface TableHeaderProps {
  id?: string;
  title: string;
  tooltipContent?: React.ReactNode;
}

export const TableHeader: React.FC<TableHeaderProps> = React.memo(
  ({ id, title, tooltipContent }) => {
    return (
      <EuiToolTip content={tooltipContent}>
        <div id={id} tabIndex={0}>
          {title}
          &nbsp;
          <EuiIcon
            size="s"
            type="question"
            color="subdued"
            className="eui-alignTop"
            aria-hidden={true}
          />
        </div>
      </EuiToolTip>
    );
  }
);
TableHeader.displayName = 'TableHeader';
