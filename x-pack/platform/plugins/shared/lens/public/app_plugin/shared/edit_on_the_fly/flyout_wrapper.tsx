/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiToolTip,
  EuiButton,
  EuiLink,
  EuiBetaBadge,
  EuiSpacer,
  EuiText,
  EuiCallOut,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { DRAG_DROP_EXTRA_TARGETS_WIDTH, DRAG_DROP_EXTRA_TARGETS_PADDING } from '@kbn/lens-common';
import {
  PanelEditorHeader,
  PanelSettingsForm,
  PanelSettingsLayerHeader,
} from '@kbn/embeddable-plugin/public';
import { PanelSettingsToolbarContext } from '../../../shared_components/panel_settings_toolbar_context';
import type { FlyoutWrapperProps } from './types';

const applyAndCloseLabel = i18n.translate('xpack.lens.config.applyFlyoutLabel', {
  defaultMessage: 'Apply and close',
});

const closeConfigurationLabel = i18n.translate('xpack.lens.config.closeFlyoutAriaLabel', {
  defaultMessage: 'Close configuration',
});

export const FlyoutWrapper = ({
  children,
  toolbar,
  layerTabs,
  isInlineFlyoutVisible,
  isScrollable,
  displayFlyoutHeader,
  isSaveable,
  onCancel,
  navigateToLensEditor,
  onApply,
  isReadOnly,
  applyButtonLabel = applyAndCloseLabel,
  applyButtonDisabledTooltip,
  panelSettingsApi,
}: FlyoutWrapperProps) => {
  const { euiTheme } = useEuiTheme();
  const [isPanelSettingsOpen, setIsPanelSettingsOpen] = useState(false);
  const showInlinePanelChrome = Boolean(panelSettingsApi) && !isReadOnly;

  const untitledVisualizationLabel = i18n.translate(
    'xpack.lens.config.untitledVisualizationLabel',
    {
      defaultMessage: 'Untitled visualization',
    }
  );

  const panelSettingsLabel = i18n.translate('xpack.lens.config.panelSettingsLabel', {
    defaultMessage: 'Panel settings',
  });

  const panelSettingsToolbarAction = showInlinePanelChrome
    ? {
        onOpen: () => setIsPanelSettingsOpen(true),
        label: panelSettingsLabel,
      }
    : null;

  const closeButton = (
    <EuiFlexItem grow={false}>
      <EuiToolTip content={closeConfigurationLabel} disableScreenReaderOutput>
        <EuiButtonIcon
          color="text"
          iconType="cross"
          onClick={onCancel}
          data-test-subj="euiFlyoutCloseButton"
          aria-label={closeConfigurationLabel}
        />
      </EuiToolTip>
    </EuiFlexItem>
  );
  return (
    <PanelSettingsToolbarContext.Provider value={panelSettingsToolbarAction}>
      {isInlineFlyoutVisible && displayFlyoutHeader && (
        <EuiFlyoutHeader
          hasBorder={false}
          css={css`
            pointer-events: auto;
            background-color: ${euiTheme.colors.emptyShade};
          `}
          data-test-subj="editFlyoutHeader"
        >
          {/* Header row 1: Title + close (same onCancel as footer Cancel) */}
          {showInlinePanelChrome && panelSettingsApi ? (
            isPanelSettingsOpen ? (
              <PanelSettingsLayerHeader onBack={() => setIsPanelSettingsOpen(false)} />
            ) : (
              <PanelEditorHeader
                api={panelSettingsApi}
                onOpenSettings={() => setIsPanelSettingsOpen(true)}
                untitledTitle={untitledVisualizationLabel}
                hideSettingsButton
              />
            )
          ) : (
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size="xs" data-test-subj="inlineEditingFlyoutLabel">
                  <h2>
                    <EuiFlexGroup alignItems="center" responsive={false} gutterSize="xs">
                      <EuiFlexItem grow={false}>
                        {i18n.translate('xpack.lens.config.showVisualizationLabel', {
                          defaultMessage: 'Configuration',
                        })}
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiToolTip
                          title={i18n.translate(
                            'xpack.lens.config.experimentalLabelDataview.title',
                            {
                              defaultMessage: 'Technical preview',
                            }
                          )}
                          content={i18n.translate(
                            'xpack.lens.config.experimentalLabelDataview.content',
                            {
                              defaultMessage:
                                'Inline editing currently offers limited configuration options.',
                            }
                          )}
                        >
                          <EuiBetaBadge
                            tabIndex={0}
                            label=""
                            iconType="flask"
                            size="s"
                            css={css`
                              vertical-align: middle;
                            `}
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </h2>
                </EuiTitle>
              </EuiFlexItem>
              {closeButton}
            </EuiFlexGroup>
          )}
          {!isPanelSettingsOpen ? <EuiSpacer size="xs" /> : null}
          {/* Header row 2: Edit in Lens and button groups */}
          {!isPanelSettingsOpen && (navigateToLensEditor || toolbar || showInlinePanelChrome) && (
            <>
              <EuiFlexGroup
                gutterSize="xs"
                justifyContent="spaceBetween"
                alignItems="center"
                responsive={false}
              >
                {navigateToLensEditor && !isReadOnly && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs">
                      <EuiLink
                        onClick={navigateToLensEditor}
                        data-test-subj="navigateToLensEditorLink"
                      >
                        {i18n.translate('xpack.lens.config.editLinkLabel', {
                          defaultMessage: 'Edit in Lens',
                        })}
                      </EuiLink>
                    </EuiText>
                  </EuiFlexItem>
                )}
                {/* Empty growing flex item to push toolbar to the right */}
                <EuiFlexItem grow={true} />
                {toolbar ?? null}
              </EuiFlexGroup>
              <EuiSpacer size="s" />
            </>
          )}
          {/* Header row 3: Layer tabs */}
          {!isPanelSettingsOpen && layerTabs ? (
            <div
              // Adding negative margin to compensate for EuiFlyout header padding
              css={css({
                marginInline: `-${euiTheme.size.base}`,
              })}
            >
              {layerTabs}
            </div>
          ) : null}
        </EuiFlyoutHeader>
      )}
      {isInlineFlyoutVisible && isReadOnly ? (
        <EuiCallOut
          announceOnMount={false}
          title={i18n.translate('xpack.lens.config.readOnly', {
            defaultMessage: 'Read-only: Changes will be reverted on close',
          })}
          color="warning"
          iconType="warning"
          size="s"
        />
      ) : null}

      <EuiFlyoutBody
        className="lnsEditFlyoutBody"
        css={css`
          // styles needed to display extra drop targets that are outside of the config panel main area
          overflow-y: auto;
          padding-left: ${DRAG_DROP_EXTRA_TARGETS_PADDING}px;
          margin-left: -${DRAG_DROP_EXTRA_TARGETS_PADDING}px;
          pointer-events: none;
          // Override the default max-width of drag-drop extra targets to reduce
          // horizontal overflow space requirements
          .domDroppable__extraTargets {
            width: ${DRAG_DROP_EXTRA_TARGETS_WIDTH}px;
          }
          .euiFlyoutBody__overflow {
            transform: initial;
            -webkit-mask-image: none;
            padding-left: inherit;
            margin-left: inherit;
            ${!isScrollable &&
            `
                overflow-y: hidden;
              `}
            > * {
              pointer-events: auto;
            }
          }
          .euiFlyoutBody__overflowContent {
            background-color: ${euiTheme.colors.emptyShade};
            padding: 0;
          }
        `}
      >
        {isPanelSettingsOpen && panelSettingsApi ? (
          <div
            css={css`
              padding: ${euiTheme.size.base};
            `}
          >
            <PanelSettingsForm api={panelSettingsApi} />
          </div>
        ) : (
          children
        )}
      </EuiFlyoutBody>
      {isInlineFlyoutVisible && (
        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                id="lnsCancelEditOnFlyFlyout"
                onClick={onCancel}
                flush="left"
                aria-label={i18n.translate('xpack.lens.config.cancelFlyoutAriaLabel', {
                  defaultMessage: 'Cancel applied changes',
                })}
                data-test-subj="cancelFlyoutButton"
              >
                <FormattedMessage
                  id="xpack.lens.config.cancelFlyoutLabel"
                  defaultMessage="Cancel"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
            {isReadOnly ? null : (
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={applyButtonDisabledTooltip}
                  display={applyButtonDisabledTooltip ? 'inlineBlock' : 'block'}
                >
                  <EuiButton
                    onClick={onApply}
                    fill
                    disabled={!isSaveable}
                    hasAriaDisabled
                    iconType="check"
                    data-test-subj="applyFlyoutButton"
                  >
                    {applyButtonLabel}
                  </EuiButton>
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      )}
    </PanelSettingsToolbarContext.Provider>
  );
};
