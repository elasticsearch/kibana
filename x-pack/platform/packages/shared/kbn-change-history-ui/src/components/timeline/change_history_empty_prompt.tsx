/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt, EuiImage } from '@elastic/eui';
import noChangeHistoryImg from './images/no_change_history.png';
import { NO_CHANGE_HISTORY_IMAGE_SIZE } from './constants';
import * as i18n from './translations';

export function ChangeHistoryEmptyPrompt(): JSX.Element {
  return (
    <EuiEmptyPrompt
      icon={
        <EuiImage
          src={noChangeHistoryImg}
          size={NO_CHANGE_HISTORY_IMAGE_SIZE}
          alt={i18n.NO_CHANGE_HISTORY_TITLE}
        />
      }
      title={<h2>{i18n.NO_CHANGE_HISTORY_TITLE}</h2>}
      body={<p>{i18n.NO_CHANGE_HISTORY_BODY}</p>}
      data-test-subj="changeHistoryEmpty"
    />
  );
}
