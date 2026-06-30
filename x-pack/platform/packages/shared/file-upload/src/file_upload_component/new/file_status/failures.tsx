/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useState, type FC } from 'react';

import { useEuiTheme, EuiAccordion, EuiPagination, EuiCallOut } from '@elastic/eui';
import { css } from '@emotion/react';
import type { ImportFailure } from '@kbn/file-upload-common';

const PAGE_SIZE = 100;

interface Props {
  failedDocs: ImportFailure[];
  docCount: number;
}

const containerStyle = css({
  maxHeight: '200px',
  overflowY: 'auto',
});

export const Failures: FC<Props> = ({ failedDocs, docCount }) => {
  const { euiTheme } = useEuiTheme();

  const [page, setPage] = useState(0);

  const startIndex = page * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;

  return (
    <EuiCallOut
      title={
        <FormattedMessage
          id="xpack.fileUpload.importSummary.documentsCouldNotBeImportedTitle"
          defaultMessage="Some documents could not be imported"
        />
      }
      color="warning"
      iconType="help"
      size="s"
    >
      <p>
        <FormattedMessage
          id="xpack.fileUpload.importSummary.documentsCouldNotBeImportedDescription"
          defaultMessage="{importFailuresLength} out of {docCount} documents could not be imported.
        This could be due to lines not matching the Grok pattern."
          values={{
            importFailuresLength: failedDocs.length,
            docCount,
          }}
        />
      </p>

      <EuiAccordion
        id="failureList"
        buttonContent={
          <FormattedMessage
            id="xpack.fileUpload.importSummary.failedDocumentsButtonLabel"
            defaultMessage="Failed documents"
          />
        }
        paddingSize="m"
      >
        <div css={containerStyle}>
          {failedDocs.length > PAGE_SIZE && (
            <EuiPagination
              aria-label={i18n.translate(
                'xpack.fileUpload.importSummary.failedDocumentsPaginationAriaLabel',
                { defaultMessage: 'Failed documents pagination' }
              )}
              pageCount={Math.ceil(failedDocs.length / PAGE_SIZE)}
              activePage={page}
              onPageClick={(newPage) => setPage(newPage)}
              compressed
            />
          )}
          {failedDocs.slice(startIndex, endIndex).map(({ item, reason, doc }) => (
            <div key={item}>
              <div
                css={{
                  color: euiTheme.colors.danger,
                }}
              >
                {item}: {reason}
              </div>
              <div>{JSON.stringify(doc)}</div>
            </div>
          ))}
        </div>
      </EuiAccordion>
    </EuiCallOut>
  );
};
