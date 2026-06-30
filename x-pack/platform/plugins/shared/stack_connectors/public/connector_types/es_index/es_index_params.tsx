/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import { isEmpty } from 'lodash';
import {
  EuiIcon,
  EuiText,
  EuiCodeBlock,
  EuiFieldText,
  EuiFormRow,
  EuiLink,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ActionParamsProps } from '@kbn/triggers-actions-ui-plugin/public';
import {
  AlertHistoryEsIndexConnectorId,
  AlertHistoryDocumentTemplate,
  AlertHistoryDefaultIndexName,
  JsonEditorWithMessageVariables,
  useKibana,
} from '@kbn/triggers-actions-ui-plugin/public';
import { ALERT_HISTORY_PREFIX } from '@kbn/connector-schemas/es_index/constants';
import type { IndexActionParams } from '../types';

export const IndexParamsFields = ({
  actionParams,
  index,
  editAction,
  messageVariables,
  errors,
  actionConnector,
}: ActionParamsProps<IndexActionParams>) => {
  const { docLinks } = useKibana().services;
  const { documents, indexOverride } = actionParams;

  const defaultAlertHistoryIndexSuffix = AlertHistoryDefaultIndexName.replace(
    ALERT_HISTORY_PREFIX,
    ''
  );
  const [isActionConnectorChanged, setIsActionConnectorChanged] = useState<boolean>(false);

  const getDocumentToIndex = (docs: Array<Record<string, any>> | undefined) => {
    // 'documents' param is stored as an array of objects but the JSON editor expects a single
    // stringified object

    // check that param is a non-empty array
    return docs && docs.length > 0
      ? // if the array entry is a string, we can pass it directly to the JSON editor
        typeof docs[0] === 'string'
        ? docs[0]
        : // otherwise check that the array entry is non-empty as sometimes we
        // use an empty object to trigger validation but we don't want to auto-populate with an empty object
        !isEmpty(docs[0])
        ? // if non-empty object, stringify it into format that JSON editor expects
          JSON.stringify(docs[0], null, 2)
        : null
      : '';
  };

  const [documentToIndex, setDocumentToIndex] = useState<string | undefined | null>(
    getDocumentToIndex(documents)
  );
  const [alertHistoryIndexSuffix, setAlertHistoryIndexSuffix] = useState<string>(
    indexOverride ? indexOverride.replace(ALERT_HISTORY_PREFIX, '') : defaultAlertHistoryIndexSuffix
  );
  const [usePreconfiguredSchema, setUsePreconfiguredSchema] = useState<boolean>(false);

  useEffect(() => {
    setDocumentToIndex(getDocumentToIndex(documents));
  }, [documents]);

  useEffect(() => {
    if (actionConnector?.id === AlertHistoryEsIndexConnectorId) {
      setUsePreconfiguredSchema(true);
      editAction('documents', [JSON.stringify(AlertHistoryDocumentTemplate)], index);
      setDocumentToIndex(JSON.stringify(AlertHistoryDocumentTemplate));
    } else if (isActionConnectorChanged) {
      setUsePreconfiguredSchema(false);
      editAction('documents', undefined, index);
      setDocumentToIndex(undefined);
    }
    setIsActionConnectorChanged(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionConnector?.id]);

  const onDocumentsChange = (updatedDocuments: string | null) => {
    try {
      if (updatedDocuments != null) {
        const documentsJSON = JSON.parse(updatedDocuments);
        editAction('documents', [documentsJSON], index);
      } else {
        editAction('documents', updatedDocuments, index);
      }
      setDocumentToIndex(updatedDocuments);
    } catch (e) {
      // set document as empty to turn on the validation for non empty valid JSON object
      editAction('documents', [{}], index);
      setDocumentToIndex(undefined);
    }
  };

  const documentsFieldLabel = i18n.translate(
    'xpack.stackConnectors.components.index.documentsFieldLabel',
    {
      defaultMessage: 'Document to index',
    }
  );

  const resetDefaultIndex =
    indexOverride && indexOverride !== AlertHistoryDefaultIndexName ? (
      <EuiText size="xs">
        <EuiLink
          data-test-subj="resetDefaultIndex"
          onClick={() => {
            editAction('indexOverride', AlertHistoryDefaultIndexName, index);
            setAlertHistoryIndexSuffix(defaultAlertHistoryIndexSuffix);
          }}
        >
          <EuiIcon type="refresh" aria-hidden={true} />
          <FormattedMessage
            id="xpack.stackConnectors.components.index.resetDefaultIndexLabel"
            defaultMessage="Reset default index"
          />
        </EuiLink>
      </EuiText>
    ) : (
      <></>
    );

  const preconfiguredDocumentSchema = (
    <>
      <EuiFormRow
        fullWidth
        error={errors.indexOverride as string[]}
        isInvalid={errors.indexOverride !== undefined && Number(errors.indexOverride.length) > 0}
        label={i18n.translate('xpack.stackConnectors.components.index.preconfiguredIndex', {
          defaultMessage: 'Elasticsearch index',
        })}
        labelAppend={resetDefaultIndex}
        helpText={
          <>
            <FormattedMessage
              id="xpack.stackConnectors.components.index.preconfiguredIndexHelpText"
              defaultMessage="Documents are indexed into the {alertHistoryIndex} index. "
              values={{ alertHistoryIndex: `${ALERT_HISTORY_PREFIX}${alertHistoryIndexSuffix}` }}
            />
            <EuiLink
              href={docLinks.links.alerting.preconfiguredAlertHistoryConnector}
              target="_blank"
            >
              <FormattedMessage
                id="xpack.stackConnectors.components.index.preconfiguredIndexDocLink"
                defaultMessage="View docs."
              />
            </EuiLink>
          </>
        }
      >
        <EuiFieldText
          isInvalid={errors.indexOverride !== undefined && Number(errors.indexOverride.length) > 0}
          fullWidth
          data-test-subj="preconfiguredIndexToUse"
          prepend={ALERT_HISTORY_PREFIX}
          value={alertHistoryIndexSuffix}
          onChange={(e) => {
            editAction('indexOverride', `${ALERT_HISTORY_PREFIX}${e.target.value}`, index);
            setAlertHistoryIndexSuffix(e.target.value);
          }}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiFormRow fullWidth label={documentsFieldLabel}>
        <EuiCodeBlock
          language="json"
          fontSize="s"
          paddingSize="s"
          data-test-subj="preconfiguredDocumentToIndex"
        >
          {JSON.stringify(AlertHistoryDocumentTemplate, null, 2)}
        </EuiCodeBlock>
      </EuiFormRow>
    </>
  );

  const jsonDocumentEditor = (
    <JsonEditorWithMessageVariables
      messageVariables={messageVariables}
      paramsProperty={'documents'}
      dataTestSubj="documentToIndex"
      inputTargetValue={documentToIndex}
      label={documentsFieldLabel}
      ariaLabel={i18n.translate('xpack.stackConnectors.components.index.jsonDocAriaLabel', {
        defaultMessage: 'Code editor',
      })}
      errors={errors.documents as string[]}
      onDocumentsChange={onDocumentsChange}
      helpText={
        <EuiLink href={docLinks.links.alerting.indexAction} target="_blank">
          <FormattedMessage
            id="xpack.stackConnectors.components.index.indexDocumentHelpLabel"
            defaultMessage="Index document example."
          />
        </EuiLink>
      }
      onBlur={() => {
        if (!documentToIndex) {
          // set document as empty to turn on the validation for non empty valid JSON object
          onDocumentsChange(null);
        }
      }}
    />
  );

  return usePreconfiguredSchema ? preconfiguredDocumentSchema : jsonDocumentEditor;
};

// eslint-disable-next-line import/no-default-export
export { IndexParamsFields as default };
