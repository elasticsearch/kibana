/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type FC } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIconTip,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSelect,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { Theme } from '@emotion/react';
import { css } from '@emotion/react';
import type { AnalyticsServiceStart } from '@kbn/core/public';
import { i18n, getAvailableLocales, getBrowserPreferredLocale } from '@kbn/i18n';
import type { LocaleValue } from '@kbn/user-profile-components';

import { useLanguage } from './use_language_hook';

const betaBadgeStyle = ({ euiTheme }: Theme) => css`
  padding: calc(${euiTheme.size.xxs} * 1.5);
  border: ${euiTheme.border.width.thin} solid ${euiTheme.border.color};
  border-radius: 50%;
`;

interface Props {
  closeModal: () => void;
  analytics: AnalyticsServiceStart;
}

export const LanguageModal: FC<Props> = ({ closeModal, analytics }) => {
  const modalTitleId = useGeneratedHtmlId();
  const selectId = useGeneratedHtmlId();

  const { value: locale, initialValue: initialLocaleValue, isLoading, onChange } = useLanguage();

  const localeOptions = getAvailableLocales().map(({ id, label }) => ({ value: id, text: label }));

  return (
    <EuiModal aria-labelledby={modalTitleId} onClose={closeModal}>
      <EuiModalHeader>
        <EuiModalHeaderTitle size="m" id={modalTitleId}>
          {i18n.translate('xpack.cloudLinks.userMenuLinks.languageModalTitle', {
            defaultMessage: 'Language',
          })}
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <EuiFormRow
          label={
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                {i18n.translate('xpack.cloudLinks.userMenuLinks.languageModalSelectLabel', {
                  defaultMessage: 'Display language',
                })}
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <div css={betaBadgeStyle}>
                  <EuiIconTip
                    aria-label={i18n.translate(
                      'xpack.cloudLinks.userMenuLinks.languageModalBetaBadgeLabel',
                      { defaultMessage: 'beta' }
                    )}
                    content={i18n.translate(
                      'xpack.cloudLinks.userMenuLinks.languageModalBetaBadgeTooltip',
                      {
                        defaultMessage: 'The display language setting is currently a beta feature.',
                      }
                    )}
                    type="beta"
                    position="bottom"
                  />
                </div>
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          fullWidth
        >
          <EuiSelect
            id={selectId}
            options={localeOptions}
            value={locale}
            onChange={(e) => onChange(e.target.value as LocaleValue, false)}
            data-test-subj="languageSelect"
            fullWidth
          />
        </EuiFormRow>
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty
          data-test-subj="languageModalDiscardButton"
          onClick={() => {
            onChange(initialLocaleValue, false);
            closeModal();
          }}
        >
          {i18n.translate('xpack.cloudLinks.userMenuLinks.languageModalDiscardBtnLabel', {
            defaultMessage: 'Discard',
          })}
        </EuiButtonEmpty>

        <EuiButton
          data-test-subj="languageModalSaveButton"
          onClick={async () => {
            if (locale !== initialLocaleValue) {
              try {
                await onChange(locale, true);
              } catch (_) {
                return;
              }
              const preferredLocale = getBrowserPreferredLocale();
              analytics.reportEvent('display_language_changed', {
                from: initialLocaleValue,
                to: locale,
                ...(preferredLocale ? { preferred_language_kibana_locale: preferredLocale } : {}),
              });
            }
            closeModal();
          }}
          fill
          isLoading={isLoading}
        >
          {i18n.translate('xpack.cloudLinks.userMenuLinks.languageModalSaveBtnLabel', {
            defaultMessage: 'Save changes',
          })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
