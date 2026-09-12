/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import React, { useState, useEffect, useRef } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiEmptyPrompt,
  EuiLink,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import type { ComponentTemplateListItem } from '../../../../../common';
import { SectionError, SectionLoading, GlobalFlyout } from '../shared_imports';
import type { ComponentTemplateDetailsProps } from '../component_template_details';
import {
  ComponentTemplateDetailsFlyoutContent,
  defaultFlyoutProps,
} from '../component_template_details';
import { CreateButtonPopOver } from './components';
import { ComponentTemplates } from './component_templates';
import { ComponentTemplatesSelection } from './component_templates_selection';
import { useApi } from '../component_templates_context';
import { useCreatesDataStream } from '../../template_form/steps/use_creates_data_stream';

const { useGlobalFlyout } = GlobalFlyout;

interface Props {
  onChange: (components: string[]) => void;
  onComponentsLoaded: (components: ComponentTemplateListItem[]) => void;
  defaultValue?: string[];
  docUri: string;
  emptyPrompt?: {
    text?: string | JSX.Element;
    showCreateButton?: boolean;
  };
}

const useStyles = ({ hasSelection }: { hasSelection: boolean }) => {
  const { euiTheme } = useEuiTheme();

  return {
    selectorWrapper: css`
      width: 100%;
      height: 480px;
    `,
    selector: css`
      width: 100%;
      height: 100%;
    `,
    column: css`
      min-width: 0;
    `,
    selection: css`
      border: ${euiTheme.border.thin};
      border-radius: ${euiTheme.border.radius.medium};
      padding: 0 ${euiTheme.size.base} ${euiTheme.size.base};
      color: ${euiTheme.colors.darkShade};

      ${!hasSelection &&
      css`
        align-items: center;
        justify-content: center;
      `}
    `,
    selectionHeader: css`
      background-color: ${euiTheme.colors.lightestShade};
      border-bottom: ${euiTheme.border.thin};
      color: ${euiTheme.colors.fullShade};
      height: ${euiTheme.size.xxl}; /* Height to align left and right column headers */
      line-height: ${euiTheme.size.xxl}; /* Height to align left and right column headers */
      font-size: ${euiTheme.size.m};
      margin-bottom: ${euiTheme.size.s};
      margin-left: calc(${euiTheme.size.base} * -1);
      margin-right: calc(${euiTheme.size.base} * -1);
      padding-left: ${euiTheme.size.base};
    `,
    selectionHeaderCount: css`
      font-weight: 600;
    `,
    selectionContent: css`
      mask-image: none;
    `,
  };
};

const i18nTexts = {
  icons: {
    view: i18n.translate('xpack.idxMgmt.componentTemplatesSelector.viewItemIconLabel', {
      defaultMessage: 'View',
    }),
    select: i18n.translate('xpack.idxMgmt.componentTemplatesSelector.selectItemIconLabel', {
      defaultMessage: 'Select',
    }),
    remove: i18n.translate('xpack.idxMgmt.componentTemplatesSelector.removeItemIconLabel', {
      defaultMessage: 'Remove',
    }),
  },
};

export const ComponentTemplatesSelector = ({
  onChange,
  defaultValue,
  onComponentsLoaded,
  docUri,
  emptyPrompt: { text, showCreateButton } = {},
}: Props) => {
  const { data: components, isLoading, error } = useApi().useLoadComponentTemplates();
  const { addContent: addContentToGlobalFlyout, removeContent: removeContentFromGlobalFlyout } =
    useGlobalFlyout();
  const createsDataStream = useCreatesDataStream();
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [componentsSelected, setComponentsSelected] = useState<ComponentTemplateListItem[]>([]);
  const isInitialized = useRef(false);

  const hasSelection = Object.keys(componentsSelected).length > 0;
  const hasComponents = components && components.length > 0 ? true : false;
  const styles = useStyles({ hasSelection });

  const closeComponentTemplateDetails = () => {
    setSelectedComponent(null);
  };

  useEffect(() => {
    if (components) {
      if (
        defaultValue &&
        defaultValue.length > 0 &&
        componentsSelected.length === 0 &&
        isInitialized.current === false
      ) {
        // Once the components are fetched, we check the ones previously selected
        // from the prop "defaultValue" passed. Templates that do not exist (allowed through
        // "ignore_missing_component_templates") get a placeholder entry so that the
        // "defaultValue" order is preserved.
        const nextComponentsSelected: ComponentTemplateListItem[] = defaultValue.map(
          (name) =>
            components.find((comp) => comp.name === name) ?? {
              name,
              usedBy: [],
              hasMappings: false,
              hasAliases: false,
              hasSettings: false,
              isManaged: false,
            }
        );

        setComponentsSelected(nextComponentsSelected);
        onChange(nextComponentsSelected.map(({ name }) => name));
        isInitialized.current = true;
      } else {
        onChange(componentsSelected.map(({ name }) => name));
      }
    }
  }, [defaultValue, components, componentsSelected, onChange]);

  useEffect(() => {
    if (!isLoading && !error) {
      onComponentsLoaded(components ?? []);
    }
  }, [isLoading, error, components, onComponentsLoaded]);

  useEffect(() => {
    if (selectedComponent) {
      // Open the flyout with the Component Template Details content
      addContentToGlobalFlyout<ComponentTemplateDetailsProps>({
        id: 'componentTemplateDetails',
        Component: ComponentTemplateDetailsFlyoutContent,
        props: {
          onClose: closeComponentTemplateDetails,
          componentTemplateName: selectedComponent,
        },
        flyoutProps: { ...defaultFlyoutProps, onClose: closeComponentTemplateDetails },
        cleanUpFunc: () => {
          setSelectedComponent(null);
        },
      });
    }
  }, [selectedComponent, addContentToGlobalFlyout]);

  useEffect(() => {
    if (!selectedComponent) {
      removeContentFromGlobalFlyout('componentTemplateDetails');
    }
  }, [selectedComponent, removeContentFromGlobalFlyout]);

  const onSelectionReorder = (reorderedComponents: ComponentTemplateListItem[]) => {
    setComponentsSelected(reorderedComponents);
  };

  const renderLoading = () => (
    <SectionLoading>
      <FormattedMessage
        id="xpack.idxMgmt.componentTemplatesSelector.loadingComponentsDescription"
        defaultMessage="Loading component templates…"
      />
    </SectionLoading>
  );

  const renderError = () => (
    <SectionError
      title={
        <FormattedMessage
          id="xpack.idxMgmt.componentTemplatesSelector.loadingComponentsErrorMessage"
          defaultMessage="Error loading components"
        />
      }
      error={error!}
    />
  );

  const renderSelector = () => (
    <div css={styles.selectorWrapper}>
      <EuiFlexGroup css={styles.selector}>
        <EuiFlexItem
          grow
          css={[styles.column, styles.selection]}
          data-test-subj="componentTemplatesSelection"
        >
          {hasSelection ? (
            <>
              <div css={styles.selectionHeader}>
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplatesSelector.selectionHeader.componentsSelectedLabel"
                  defaultMessage="Components selected: {count}"
                  values={{
                    count: (
                      <span css={styles.selectionHeaderCount}>{componentsSelected.length}</span>
                    ),
                  }}
                />
              </div>
              <div css={styles.selectionContent} className="eui-yScrollWithShadows">
                <ComponentTemplatesSelection
                  components={componentsSelected}
                  onReorder={onSelectionReorder}
                  listItemProps={{
                    onViewDetail: (component: ComponentTemplateListItem) => {
                      setSelectedComponent(component.name);
                    },
                    actions: [
                      {
                        label: i18nTexts.icons.remove,
                        icon: 'minusCircle',
                        handler: (component: ComponentTemplateListItem) => {
                          setComponentsSelected((prev) => {
                            return prev.filter(({ name }) => component.name !== name);
                          });
                        },
                      },
                    ],
                  }}
                />
              </div>
            </>
          ) : (
            <EuiText textAlign="center" data-test-subj="emptyPrompt">
              <p>
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplatesSelector.noComponentSelectedLabel-1"
                  defaultMessage="Add component template building blocks to this template."
                />
                <br />
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplatesSelector.noComponentSelectedLabel-2"
                  defaultMessage="Component templates are applied in the order specified."
                />
              </p>
            </EuiText>
          )}
        </EuiFlexItem>

        {/* List of components */}
        <EuiFlexItem grow css={styles.column}>
          <ComponentTemplates
            isLoading={isLoading}
            components={components ?? []}
            listItemProps={{
              onViewDetail: (component: ComponentTemplateListItem) => {
                setSelectedComponent(component.name);
              },
              actions: [
                {
                  label: i18nTexts.icons.select,
                  icon: 'plusCircle',
                  handler: (component: ComponentTemplateListItem) => {
                    setComponentsSelected((prev) => {
                      return [...prev, component];
                    });
                  },
                },
              ],
              isSelected: (component: ComponentTemplateListItem) => {
                return componentsSelected.find(({ name }) => component.name === name) !== undefined;
              },
              createsDataStream,
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );

  if (isLoading) {
    return renderLoading();
  } else if (error) {
    return renderError();
  } else if (hasComponents) {
    return renderSelector();
  }

  // No components: render empty prompt
  const emptyPromptBody = (
    <EuiText color="subdued">
      <p>
        {text ?? (
          <FormattedMessage
            id="xpack.idxMgmt.componentTemplatesSelector.emptyPromptDescription"
            defaultMessage="Components templates let you save index settings, mappings and aliases and inherit from them in index templates."
          />
        )}
        <br />
        <EuiLink href={docUri} target="_blank" external>
          <FormattedMessage
            id="xpack.idxMgmt.componentTemplatesSelector.emptyPromptLearnMoreLinkText"
            defaultMessage="Learn more."
          />
        </EuiLink>
      </p>
    </EuiText>
  );

  return (
    <EuiEmptyPrompt
      iconType="managementApp"
      title={
        <h2>
          <FormattedMessage
            id="xpack.idxMgmt.componentTemplatesSelector.emptyPromptTitle"
            defaultMessage="You don’t have any components yet"
          />
        </h2>
      }
      body={emptyPromptBody}
      actions={showCreateButton ? <CreateButtonPopOver anchorPosition="downCenter" /> : undefined}
      data-test-subj="emptyPrompt"
    />
  );
};
