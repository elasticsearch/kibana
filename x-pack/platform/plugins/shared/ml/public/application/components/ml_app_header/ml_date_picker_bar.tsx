/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { css } from '@emotion/react';
import { map, distinctUntilChanged } from 'rxjs';
import { DatePickerWrapper } from '@kbn/ml-date-picker';
import { useMlKibana } from '../../contexts/kibana';

const maxInlineSizeStyles = css`
  max-inline-size: 100%;
`;

export const MlDatePickerBar: FC = () => {
  const {
    services: {
      mlServices: { httpService },
    },
  } = useMlKibana();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const subscription = httpService.getLoadingCount$
      .pipe(
        map((v) => v !== 0),
        distinctUntilChanged()
      )
      .subscribe((loading) => {
        setIsLoading(loading);
      });

    return () => subscription.unsubscribe();
  }, [httpService.getLoadingCount$]);

  return (
    <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem grow={false} css={maxInlineSizeStyles}>
        <DatePickerWrapper isLoading={isLoading} width="full" />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
