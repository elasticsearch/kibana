/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useImperativeHandle, useRef } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiFilePicker, EuiImage } from '@elastic/eui';
import type { EuiFilePickerProps } from '@elastic/eui';

import type { ResetInputRef } from '@kbn/management-settings-types';
import { getFieldInputValue, useUpdate } from '@kbn/management-settings-utilities';

import type { InputProps } from '../types';
import { useServices } from '../services';
import { TEST_SUBJ_PREFIX_FIELD } from '.';

/**
 * Props for a {@link ImageInput} component.
 */
export type ImageInputProps = InputProps<'image'>;

const getImageAsBase64 = async (file: Blob): Promise<string | ArrayBuffer> => {
  const reader = new FileReader();
  reader.readAsDataURL(file);

  return new Promise((resolve, reject) => {
    reader.onload = () => {
      resolve(reader.result!);
    };
    reader.onerror = (err) => {
      reject(err);
    };
  });
};

const errorMessage = i18n.translate('management.settings.field.imageChangeErrorMessage', {
  defaultMessage: 'Image could not be saved',
});

/**
 * Component for manipulating an `image` field.
 */
export const ImageInput = React.forwardRef<ResetInputRef, ImageInputProps>(
  ({ field, unsavedChange, isSavingEnabled, onInputChange }, ref) => {
    const inputRef = useRef<React.ComponentRef<typeof EuiFilePicker>>(null);

    useImperativeHandle(ref, () => ({
      reset: () => inputRef.current?.removeFiles(),
    }));

    const { showDanger } = useServices();

    const onUpdate = useUpdate({ onInputChange, field });

    const onChange: EuiFilePickerProps['onChange'] = async (files: FileList | null) => {
      if (files === null || !files.length) {
        onUpdate();
        return null;
      }

      const file = files[0];

      try {
        let base64Image = '';

        if (file instanceof File) {
          base64Image = String(await getImageAsBase64(file));
        }

        onUpdate({ type: field.type, unsavedValue: base64Image });
      } catch (err) {
        showDanger(errorMessage);
        onUpdate({ type: field.type, unsavedValue: '', error: errorMessage, isInvalid: true });
      }
    };

    const { id, name, ariaAttributes } = field;
    const { ariaLabel, ariaDescribedBy } = ariaAttributes;
    const [value] = getFieldInputValue(field, unsavedChange);

    const a11yProps = {
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
    };

    // TODO: this check will be a bug, if a default image is ever actually
    // defined in Kibana.
    //
    // see: https://github.com/elastic/kibana/issues/166578
    //
    if (value) {
      return <EuiImage allowFullScreen url={value} alt={name} {...a11yProps} />;
    } else {
      return (
        <EuiFilePicker
          accept=".jpg,.jpeg,.png"
          data-test-subj={`${TEST_SUBJ_PREFIX_FIELD}-${id}`}
          disabled={!isSavingEnabled}
          ref={inputRef}
          fullWidth
          {...{ onChange, ...a11yProps }}
        />
      );
    }
  }
);
