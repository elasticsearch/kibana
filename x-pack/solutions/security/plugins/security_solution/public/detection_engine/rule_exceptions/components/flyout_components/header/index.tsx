/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import styled from '@emotion/styled';

import { EuiTitle, EuiSpacer, EuiFlyoutHeader } from '@elastic/eui';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import * as i18n from './translations';

const FlyoutHeader = styled(EuiFlyoutHeader)`
  ${({ theme }) => `
    border-bottom: 1px solid ${theme.euiTheme.colors.borderBasePlain};
  `}
`;

export interface ExceptionFlyoutHeaderProps {
  isEdit?: boolean;
  listType: ExceptionListTypeEnum;
  titleId: string;
  dataTestSubjId: string;
}

export const ExceptionFlyoutHeader = memo(function ExceptionFlyoutHeader({
  isEdit = false,
  listType,
  titleId,
  dataTestSubjId,
}: ExceptionFlyoutHeaderProps) {
  const addTitle = useMemo(() => {
    return listType === ExceptionListTypeEnum.ENDPOINT
      ? i18n.ADD_ENDPOINT_EXCEPTION
      : i18n.CREATE_RULE_EXCEPTION;
  }, [listType]);

  const editTitle = useMemo(() => {
    return listType === ExceptionListTypeEnum.ENDPOINT
      ? i18n.EDIT_ENDPOINT_EXCEPTION_TITLE
      : i18n.EDIT_EXCEPTION_TITLE;
  }, [listType]);

  const title = isEdit ? editTitle : addTitle;

  return (
    <FlyoutHeader>
      <EuiTitle>
        <h2 id={titleId} data-test-subj={dataTestSubjId}>
          {title}
        </h2>
      </EuiTitle>
      <EuiSpacer size="m" />
    </FlyoutHeader>
  );
});
