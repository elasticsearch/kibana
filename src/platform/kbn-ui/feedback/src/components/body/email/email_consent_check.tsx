/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { ChangeEvent } from 'react';
import { EuiCheckbox } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

interface Props {
  allowEmailContact: boolean;
  handleChangeAllowEmailContact: (allow: boolean) => void;
}

export const EmailConsentCheck = ({ allowEmailContact, handleChangeAllowEmailContact }: Props) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleChangeAllowEmailContact(e.target.checked);
  };

  return (
    <EuiCheckbox
      id="feedbackEmailConsentCheckbox"
      data-test-subj="feedbackEmailConsentCheckbox"
      label={i18n.translate('kbnUI.feedback.form.body.checkbox.consentLabel', {
        defaultMessage: "I'm open to being contacted via email.",
      })}
      checked={allowEmailContact}
      onChange={handleChange}
    />
  );
};
