/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { memo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiDescribedFormGroup, EuiFormRow } from '@elastic/eui';

interface Props {
  titleId: string;
}
export const Description: FC<PropsWithChildren<Props>> = memo(({ children, titleId }) => {
  const title = i18n.translate('xpack.ml.newJob.wizard.projectRouting.title', {
    defaultMessage: 'Project scope',
  });
  return (
    <EuiDescribedFormGroup
      title={<h3 id={titleId}>{title}</h3>}
      description={
        <FormattedMessage
          id="xpack.ml.newJob.wizard.projectRouting.description"
          defaultMessage="Select the project routing for the job."
        />
      }
    >
      <EuiFormRow>
        <>{children}</>
      </EuiFormRow>
    </EuiDescribedFormGroup>
  );
});
