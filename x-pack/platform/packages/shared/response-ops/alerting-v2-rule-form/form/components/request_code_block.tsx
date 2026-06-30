/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCodeBlock } from '@elastic/eui';
import { useFormContext } from 'react-hook-form';
import { i18n } from '@kbn/i18n';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { FormValues } from '../types';
import {
  mapFormValuesToCreateRequest,
  mapFormValuesToUpdateRequest,
} from '../utils/rule_request_mappers';

export type ShowRequestActivePage = 'create' | 'update';

const SHOW_REQUEST_ERROR = i18n.translate(
  'xpack.alertingV2.ruleForm.showRequest.errorSerializing',
  { defaultMessage: 'Error serializing rule request' }
);

const stringifyRequest = (formValues: FormValues, activeTab: ShowRequestActivePage): string => {
  try {
    const body =
      activeTab === 'update'
        ? mapFormValuesToUpdateRequest(formValues)
        : mapFormValuesToCreateRequest(formValues);
    return JSON.stringify(body, null, 2);
  } catch {
    return SHOW_REQUEST_ERROR;
  }
};

interface RequestCodeBlockProps {
  activeTab: ShowRequestActivePage;
  ruleId?: string;
  'data-test-subj'?: string;
}

export const RequestCodeBlock = ({
  activeTab,
  ruleId,
  'data-test-subj': dataTestSubj,
}: RequestCodeBlockProps) => {
  const { getValues } = useFormContext<FormValues>();
  const formValues = getValues();

  const formattedRequest = stringifyRequest(formValues, activeTab);

  const method = activeTab === 'update' ? 'PATCH' : 'POST';
  const path =
    activeTab === 'update' ? `${ALERTING_V2_RULE_API_PATH}/${ruleId}` : ALERTING_V2_RULE_API_PATH;

  return (
    <EuiCodeBlock language="json" isCopyable data-test-subj={dataTestSubj}>
      {`${method} kbn:${path}\n${formattedRequest}`}
    </EuiCodeBlock>
  );
};
