/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiHighlight,
  EuiIcon,
  EuiLink,
  EuiScreenReaderOnly,
  EuiToolTip,
  euiTextTruncate,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';

import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { CustomizePanelActionApi } from '../../../ui_actions/customize_panel_action';
import { isApiCompatibleWithCustomizePanelAction } from '../../../ui_actions/customize_panel_action';
import { openCustomizePanelFlyout } from '../../../ui_actions/customize_panel_action/open_customize_panel';

export const PresentationPanelTitle = ({
  api,
  headerId,
  viewMode,
  hideTitle,
  panelTitle,
  panelDescription,
  titleHighlight,
}: {
  api: unknown;
  headerId: string;
  hideTitle?: boolean;
  panelTitle?: string;
  panelDescription?: string;
  viewMode?: ViewMode;
  titleHighlight?: string;
}) => {
  const { euiTheme } = useEuiTheme();
  const isEditableTitle = viewMode === 'edit' && isApiCompatibleWithCustomizePanelAction(api);

  const onClick = useCallback(() => {
    openCustomizePanelFlyout({
      api: api as CustomizePanelActionApi,
      focusOnTitle: true,
    });
  }, [api]);

  const panelTitleElement = useMemo(() => {
    if (hideTitle) return null;

    const titleStyles = css`
      ${euiTextTruncate()};
      font-weight: ${euiTheme.font.weight.medium};

      .kbnGridPanel--active & {
        pointer-events: none; // prevent drag event from triggering onClick
      }
    `;

    const titleContent =
      titleHighlight && panelTitle ? (
        <EuiHighlight strict={false} highlightAll search={titleHighlight}>
          {panelTitle ?? ''}
        </EuiHighlight>
      ) : (
        panelTitle
      );

    if (!isEditableTitle) {
      return (
        <span data-test-subj="embeddablePanelTitle" css={titleStyles}>
          {titleContent}
        </span>
      );
    }

    return (
      <EuiLink
        color="text"
        onClick={onClick}
        css={titleStyles}
        aria-label={i18n.translate('embeddableApi.header.titleAriaLabel', {
          defaultMessage: 'Click to edit title: {title}',
          values: { title: panelTitle },
        })}
        data-test-subj="embeddablePanelTitle"
      >
        {titleContent}
      </EuiLink>
    );
  }, [
    onClick,
    hideTitle,
    panelTitle,
    isEditableTitle,
    euiTheme.font.weight.medium,
    titleHighlight,
  ]);

  const describedPanelTitleElement = useMemo(() => {
    if (hideTitle) return null;
    if (!panelTitleElement) return null;

    if (!panelDescription) {
      if (!panelTitle) return panelTitleElement;

      return (
        <EuiToolTip
          content={panelTitle}
          position="top"
          display="block"
          anchorProps={{
            'data-test-subj': 'embeddablePanelTitleTooltipAnchor',
          }}
        >
          {/* A block container is required for text-overflow:ellipsis to fire (inline elements do not
              produce ellipsis). In edit mode the EuiLink inside is focusable via <a> and its focus
              events bubble to the tooltip anchor, so no tabIndex is needed on this wrapper. */}
          <span
            tabIndex={isEditableTitle ? undefined : 0}
            css={css`
              display: block;
              ${euiTextTruncate()};
            `}
          >
            {panelTitleElement}
          </span>
        </EuiToolTip>
      );
    }
    return (
      <EuiToolTip
        title={panelTitle}
        content={panelDescription}
        position="top"
        anchorProps={{
          'data-test-subj': 'embeddablePanelTooltipAnchor',
        }}
      >
        <div
          data-test-subj="embeddablePanelTitleInner"
          className="embPanel__titleInner"
          css={css`
            display: flex;
            flex-wrap: nowrap;
            column-gap: ${euiTheme.size.xs};
            align-items: center;
          `}
          tabIndex={0}
        >
          {!hideTitle ? (
            <h2
              // styles necessary for applying ellipsis and showing the info icon if description is present
              css={css`
                overflow: hidden;
                // The panel title is a heading, but rendered at the regular text size. Reset the
                // heading's font and margin so a global h2 style cannot override the panel title size
                font: inherit;
                margin: 0;
              `}
            >
              <EuiScreenReaderOnly>
                <span id={headerId}>
                  {panelTitle
                    ? i18n.translate('embeddableApi.ariaLabel', {
                        defaultMessage: 'Panel: {title}',
                        values: {
                          title: panelTitle,
                        },
                      })
                    : i18n.translate('embeddableApi.untitledPanelAriaLabel', {
                        defaultMessage: 'Untitled panel',
                      })}
                </span>
              </EuiScreenReaderOnly>
              {panelTitleElement}
            </h2>
          ) : null}
          <EuiIcon
            type="info"
            color="subdued"
            data-test-subj="embeddablePanelTitleDescriptionIcon"
            tabIndex={0}
            aria-label={i18n.translate('embeddableApi.header.descriptionIconAriaLabel', {
              defaultMessage: 'Description',
            })}
          />
        </div>
      </EuiToolTip>
    );
  }, [
    hideTitle,
    panelDescription,
    panelTitle,
    panelTitleElement,
    isEditableTitle,
    headerId,
    euiTheme.size.xs,
  ]);

  return describedPanelTitleElement;
};
