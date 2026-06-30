/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { validateEsqlQuery } from '@kbn/alerting-v2-schemas';
import { EsqlEditorField, EDITOR_HEIGHT_INLINE } from './esql_editor_field';

const DATA_TEST_SUBJ = 'ruleV2FormEvaluationQueryField';

interface EvaluationQueryFieldProps {
  /** Height of the editor (default: 140 for flyouts) */
  height?: string | number;
}

export const EvaluationQueryField = ({
  height = EDITOR_HEIGHT_INLINE,
}: EvaluationQueryFieldProps) => {
  return (
    <EsqlEditorField
      name="query.breach.query"
      height={height}
      dataTestSubj={DATA_TEST_SUBJ}
      rules={{
        required: i18n.translate('xpack.alertingV2.ruleForm.queryRequiredError', {
          defaultMessage: 'ES|QL query is required.',
        }),
        validate: (value: string | null | undefined) =>
          value ? validateEsqlQuery(value) ?? true : true,
      }}
    />
  );
};
