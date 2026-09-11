/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiCodeBlock,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useSeriesStorage } from '../hooks/use_series_storage';

export function EmbedModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const titleId = useGeneratedHtmlId();
  const { reportType, allSeries } = useSeriesStorage();

  if (!isOpen) {
    return null;
  }

  return (
    <EuiModal onClose={onClose} aria-labelledby={titleId} maxWidth={640}>
      <EuiModalHeader>
        <EuiModalHeaderTitle id={titleId}>{EMBED_TITLE_LABEL}</EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiCodeBlock language="jsx" fontSize="m" paddingSize="m" isCopyable={true}>
          {`const { observability } = useKibana<>().services;

const { ExploratoryViewEmbeddable } = observability;

<ExploratoryViewEmbeddable
        customHeight={'300px'}
        reportType="${reportType}"
        attributes={${JSON.stringify(allSeries, null, 2)}}
 />
        `}
        </EuiCodeBlock>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButton data-test-subj="o11yEmbedActionCloseButton" onClick={onClose} fill={true}>
          {CLOSE_LABEL}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}

const EMBED_TITLE_LABEL = i18n.translate('xpack.exploratoryView.expView.heading.embedTitle', {
  defaultMessage: 'Embed Exploratory view (Dev only feature)',
});

export const EMBED_LABEL = i18n.translate('xpack.exploratoryView.expView.heading.embed', {
  defaultMessage: 'Embed',
});

const CLOSE_LABEL = i18n.translate('xpack.exploratoryView.expView.heading.embedClose', {
  defaultMessage: 'Close',
});
