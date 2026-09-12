/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInlineEditTitle,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getTitle } from '@kbn/presentation-publishing';
import React, { type ReactNode } from 'react';
import useObservable from 'react-use/lib/useObservable';
import { BehaviorSubject } from 'rxjs';
import { commitPanelTitle, type PanelSettingsApi } from './inline_panel_settings';

const undefinedString$ = new BehaviorSubject<string | undefined>(undefined);
const undefinedBoolean$ = new BehaviorSubject<boolean | undefined>(undefined);

const panelSettingsLabel = i18n.translate('embeddableApi.panelEditorChrome.panelSettingsLabel', {
  defaultMessage: 'Panel settings',
});

const untitledPanelLabel = i18n.translate('embeddableApi.panelEditorChrome.untitledPanelLabel', {
  defaultMessage: 'Untitled panel',
});

const showTitleOnPanelLabel = i18n.translate(
  'embeddableApi.panelEditorChrome.showTitleOnPanelLabel',
  {
    defaultMessage: 'Show title on panel',
  }
);

const hideTitleOnPanelLabel = i18n.translate(
  'embeddableApi.panelEditorChrome.hideTitleOnPanelLabel',
  {
    defaultMessage: 'Hide title on panel',
  }
);

const backLabel = i18n.translate('embeddableApi.panelEditorChrome.backLabel', {
  defaultMessage: 'Back',
});

const editTitleAriaLabel = i18n.translate('embeddableApi.panelEditorChrome.editTitleAriaLabel', {
  defaultMessage: 'Edit panel title',
});

export const PanelEditorHeader = ({
  api,
  onOpenSettings,
  extraHeaderActions,
  titleSize = 'xs',
  untitledTitle = untitledPanelLabel,
  titleTestSubj,
  hideSettingsButton = false,
}: {
  api: PanelSettingsApi;
  onOpenSettings: () => void;
  extraHeaderActions?: ReactNode;
  titleSize?: 'xs' | 's' | 'm';
  untitledTitle?: string;
  titleTestSubj?: string;
  hideSettingsButton?: boolean;
}) => {
  const { euiTheme } = useEuiTheme();
  const hideTitle = Boolean(
    useObservable(api.hideTitle$ ?? undefinedBoolean$, api.hideTitle$?.getValue())
  );
  const title = useObservable(api.title$ ?? undefinedString$, api.title$?.getValue());
  const defaultTitle = useObservable(
    api.defaultTitle$ ?? undefinedString$,
    api.defaultTitle$?.getValue()
  );
  const currentTitle = title ?? defaultTitle ?? getTitle(api) ?? '';

  return (
    <EuiFlexGroup
      justifyContent="spaceBetween"
      alignItems="center"
      gutterSize="xs"
      responsive={false}
      data-test-subj="inlinePanelEditorHeader"
    >
      <EuiFlexItem grow>
        <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap={false}>
          <EuiFlexItem
            grow={false}
            css={css`
              min-width: 0;
              max-width: 400px;
              opacity: ${hideTitle ? 0.45 : 1};
            `}
          >
            <EuiInlineEditTitle
              heading="h2"
              size={titleSize}
              defaultValue={currentTitle}
              placeholder={untitledTitle}
              onSave={(value) => {
                commitPanelTitle(api, value);
                return true;
              }}
              inputAriaLabel={editTitleAriaLabel}
              data-test-subj={titleTestSubj ?? 'inlinePanelEditorTitle'}
              readModeProps={{
                iconSize: 'm',
              }}
              css={css`
                max-width: 100%;
                .euiInlineEditText {
                  font-weight: ${euiTheme.font.weight.medium};
                  ${!currentTitle ? `color: ${euiTheme.colors.textSubdued};` : ''}
                }
              `}
            />
          </EuiFlexItem>
          {api.setHideTitle ? (
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={hideTitle ? showTitleOnPanelLabel : hideTitleOnPanelLabel}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  iconType={hideTitle ? 'eyeSlash' : 'eye'}
                  color="text"
                  aria-label={hideTitle ? showTitleOnPanelLabel : hideTitleOnPanelLabel}
                  data-test-subj="inlinePanelSettingsHideTitleButton"
                  onClick={() => api.setHideTitle?.(!hideTitle)}
                />
              </EuiToolTip>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlexItem>
      {!hideSettingsButton ? (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={panelSettingsLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="gear"
              color="text"
              aria-label={panelSettingsLabel}
              data-test-subj="inlinePanelSettingsButton"
              onClick={onOpenSettings}
            />
          </EuiToolTip>
        </EuiFlexItem>
      ) : null}
      {extraHeaderActions}
    </EuiFlexGroup>
  );
};

export const PanelSettingsLayerHeader = ({
  onBack,
  extraHeaderActions,
}: {
  onBack: () => void;
  extraHeaderActions?: ReactNode;
}) => {
  return (
    <EuiFlexGroup
      justifyContent="spaceBetween"
      alignItems="center"
      gutterSize="xs"
      responsive={false}
      data-test-subj="inlinePanelSettingsLayerHeader"
    >
      <EuiFlexItem grow>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={backLabel} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="chevronSingleLeft"
                color="text"
                aria-label={backLabel}
                data-test-subj="inlinePanelSettingsBackButton"
                onClick={onBack}
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h2>
                <FormattedMessage
                  id="embeddableApi.panelEditorChrome.panelSettingsTitle"
                  defaultMessage="Panel settings"
                />
              </h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {extraHeaderActions}
    </EuiFlexGroup>
  );
};
