/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiPopover,
  EuiCodeBlock,
  EuiPopoverTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import type { TypedLensByValueInput } from '@kbn/lens-plugin/public';
import { useSeriesStorage } from '../hooks/use_series_storage';

export function EmbedAction({
  lensAttributes,
}: {
  lensAttributes: TypedLensByValueInput['attributes'] | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const embedActionPopoverTitleId = useGeneratedHtmlId();

  const { reportType, allSeries } = useSeriesStorage();

  const button = (
    <EuiButtonEmpty
      data-test-subj="o11yEmbedActionButton"
      size="s"
      isDisabled={lensAttributes === null}
      onClick={() => {
        setIsOpen(!isOpen);
      }}
    >
      {EMBED_LABEL}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      aria-labelledby={embedActionPopoverTitleId}
      button={button}
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
    >
      <EuiPopoverTitle id={embedActionPopoverTitleId}>{EMBED_TITLE_LABEL}</EuiPopoverTitle>
      <EuiCodeBlock
        language="jsx"
        fontSize="m"
        paddingSize="m"
        isCopyable={true}
        style={{ width: 500 }}
      >
        {`const { observability } = useKibana<>().services;

const { ExploratoryViewEmbeddable } = observability;

<ExploratoryViewEmbeddable
        customHeight={'300px'}
        reportType="${reportType}"
        attributes={${JSON.stringify(allSeries, null, 2)}}
 />
        `}
      </EuiCodeBlock>
    </EuiPopover>
  );
}

const EMBED_TITLE_LABEL = i18n.translate('xpack.exploratoryView.expView.heading.embedTitle', {
  defaultMessage: 'Embed Exploratory view (Dev only feature)',
});

const EMBED_LABEL = i18n.translate('xpack.exploratoryView.expView.heading.embed', {
  defaultMessage: 'Embed <></>',
  ignoreTag: true,
});
