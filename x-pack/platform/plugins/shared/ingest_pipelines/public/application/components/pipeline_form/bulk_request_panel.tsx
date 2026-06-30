/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import {
  EuiSpacer,
  EuiPanel,
  EuiCodeBlock,
  EuiText,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';

const bulkRequestExample = `PUT books/_bulk?pipeline=my-pipeline
{ "create":{ } }
{ "name": "Snow Crash", "author": "Neal Stephenson" }
{ "create":{ } }
{ "name": "Revelation Space", "author": "Alastair Reynolds" }
`;

const singleRequestExample = `POST books/_doc?pipeline=my-pipeline-name
{
  "name": "Snow Crash",
  "author": "Neal Stephenson"
}
`;

const SINGLE_REQUEST_ID = 'single';
const BULK_REQUEST_ID = 'bulk';

const requestModeOptions = [
  {
    id: SINGLE_REQUEST_ID,
    label: i18n.translate('xpack.ingestPipelines.form.singleRequestOption', {
      defaultMessage: 'Single document',
    }),
  },
  {
    id: BULK_REQUEST_ID,
    label: i18n.translate('xpack.ingestPipelines.form.bulkRequestOption', {
      defaultMessage: 'Bulk',
    }),
  },
];

export const BulkRequestPanel = () => {
  const [isBulk, setIsBulk] = useState(false);

  return (
    <EuiPanel hasShadow={false} hasBorder grow={false}>
      <EuiFlexGroup direction="column" gutterSize="m">
        <EuiFlexItem>
          <EuiText size="s">
            <strong>
              <FormattedMessage
                id="xpack.ingestPipelines.form.bulkCardTitle"
                defaultMessage="Example request"
              />
            </strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend={i18n.translate('xpack.ingestPipelines.form.bulkRequestToggle', {
              defaultMessage: 'Example request type',
            })}
            options={requestModeOptions}
            idSelected={isBulk ? BULK_REQUEST_ID : SINGLE_REQUEST_ID}
            onChange={(id) => setIsBulk(id === BULK_REQUEST_ID)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiCodeBlock language="json" overflowHeight={250} isCopyable>
        {isBulk ? bulkRequestExample : singleRequestExample}
      </EuiCodeBlock>
    </EuiPanel>
  );
};
