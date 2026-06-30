/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEuiTheme, type UseEuiTheme } from '@elastic/eui';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { type TriggerType, TriggerTypes } from '@kbn/workflows';
import { buildSuggestTechPreviewBadgeRules } from './get_suggest_tech_preview_badge_styles';
import type { ConnectorsResponse } from '../../../entities/connectors/model/types';
import { useKibana } from '../../../hooks/use_kibana';
import {
  getIconBase64,
  type GetIconBase64Params,
  getTriggerBoltFallbackDataUrl,
} from '../../../shared/ui/step_icons/get_icon_base64';
import { HardcodedIcons } from '../../../shared/ui/step_icons/hardcoded_icons';
import { MonochromeIcons } from '../../../shared/ui/step_icons/monochrome_icons';
import { triggerSchemas } from '../../../trigger_schemas';
import { collectTechPreviewSuggestAriaPrefixes } from '../lib/autocomplete/suggestions/collect_tech_preview_suggest_aria_prefixes';
import { setStabilityBadgeThemeContext } from '../lib/get_stability_note';
import {
  CUSTOM_TRIGGER_INLINE_CLASS,
  triggerTypeToCssClass,
} from '../ui/decorations/use_trigger_type_decorations';

/** Step/connector or trigger item for icon resolution; isTrigger selects trigger vs step icon resolution. */
export interface ConnectorTypeInfoMinimal extends Omit<GetIconBase64Params, 'kind'> {
  displayName: string;
  isTrigger?: boolean;
}

export const predefinedStepTypes = [
  {
    actionTypeId: 'console',
    displayName: 'Console',
  },
  {
    actionTypeId: 'elasticsearch',
    displayName: 'Elasticsearch',
  },
  {
    actionTypeId: 'kibana',
    displayName: 'Kibana',
  },
  {
    actionTypeId: 'if',
    displayName: 'If',
  },
  {
    actionTypeId: 'foreach',
    displayName: 'Foreach',
  },
  {
    actionTypeId: 'while',
    displayName: 'While',
  },
  {
    actionTypeId: 'switch',
    displayName: 'Switch',
  },
  {
    actionTypeId: 'parallel',
    displayName: 'Parallel',
  },
  {
    actionTypeId: 'merge',
    displayName: 'Merge',
  },
  {
    actionTypeId: 'wait',
    displayName: 'Wait',
  },
  {
    actionTypeId: 'waitForInput',
    displayName: 'Wait For Input',
  },
  {
    actionTypeId: 'waitForApproval',
    displayName: 'Wait For Approval',
  },
  {
    actionTypeId: 'data.set',
    displayName: 'Set Variables',
  },
  {
    actionTypeId: 'http',
    displayName: 'HTTP',
  },
  {
    actionTypeId: 'workflow.execute',
    displayName: 'Workflow Execute',
  },
  {
    actionTypeId: 'workflow.executeAsync',
    displayName: 'Workflow Execute Async',
  },
  {
    actionTypeId: 'workflow.output',
    displayName: 'Workflow Output',
  },
  {
    actionTypeId: 'workflow.fail',
    displayName: 'Workflow Fail',
  },
  {
    actionTypeId: 'loop.break',
    displayName: 'Break',
  },
  {
    actionTypeId: 'loop.continue',
    displayName: 'Continue',
  },
  {
    actionTypeId: 'manual',
    displayName: 'Manual',
  },
  {
    actionTypeId: 'alert',
    displayName: 'Alert',
  },
  {
    actionTypeId: 'scheduled',
    displayName: 'Scheduled',
  },
];

/** Inline bolt SVG as data URL so icons work even when async/asset loading fails */
export const FALLBACK_BOLT_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEzIDFMOS45OTkwNSA1SDEzQzEzLjQxNTIgNSAxMy43ODcgNS4yNTY1MiAxMy45MzQ2IDUuNjQ0NTNDMTQuMDgyMSA2LjAzMjYxIDEzLjk3NDQgNi40NzEyNCAxMy42NjQxIDYuNzQ3MDdMNC42NjQwOCAxNC43NDcxQzQuMzA1ODEgMTUuMDY1NSAzLjc3MjEgMTUuMDg1NSAzLjM5MTYyIDE0Ljc5MzlDMy4wMTExNCAxNC41MDI0IDIuODkxMTEgMTMuOTgxNSAzLjEwNTQ5IDEzLjU1MjdMNS4zODE4NiA5SDMuMDAwMDJDMi42MzEyMyA5IDIuMjkyMjEgOC43OTY4NCAyLjExODE5IDguNDcxNjhDMS45NDQyOSA4LjE0NjU2IDEuOTYzNDYgNy43NTIxIDIuMTY3OTkgNy40NDUzMUw2LjQ2NDg3IDFIMTMWk0zLjAwMDAyIDhINy4wMDAwMkw0LjAwMDAyIDE0TDEzIDZIOi4wMDAwMkwxMSAySDcuMDAwMDJMMy4wMDAwMiA4WiIvPgo8L3N2Zz4=';

function appendStyleToEditorScope(
  style: HTMLStyleElement,
  styleId: string,
  editorContainer: HTMLElement | undefined,
  targetDoc: Document
): void {
  const removeFrom = (root: Document | ShadowRoot | HTMLElement) => {
    const el =
      root instanceof Document ? root.getElementById(styleId) : root.querySelector(`#${styleId}`);
    el?.remove();
  };
  removeFrom(targetDoc);
  if (editorContainer) {
    removeFrom(editorContainer);
    const root = editorContainer.getRootNode();
    if (root instanceof ShadowRoot) {
      removeFrom(root);
      root.appendChild(style);
      return;
    }
    // If Monaco is inside an iframe, inject there so styles apply to decoration spans
    const iframe = editorContainer.querySelector('iframe');
    if (iframe?.contentDocument?.head) {
      removeFrom(iframe.contentDocument);
      iframe.contentDocument.head.appendChild(style.cloneNode(true));
    }

    const containerClone = style.cloneNode(true) as HTMLStyleElement;
    const existing = editorContainer.querySelector(`#${styleId}`);
    existing?.remove();
    editorContainer.insertBefore(containerClone, editorContainer.firstChild);
  }
  targetDoc.head.appendChild(style);
}

/** Optional ref to the editor container — when set, styles are injected into its document so they apply to Monaco (e.g. in iframe) */
export function useDynamicTypeIcons(
  connectorsData: ConnectorsResponse | undefined,
  editorContainerRef?: React.RefObject<HTMLElement | null>,
  isEditorMounted?: boolean,
  editorValue?: string,
  onShadowIconsCssReady?: (css: string) => void
) {
  const { triggersActionsUi, workflowsExtensions } = useKibana().services;
  const euiThemeContext = useEuiTheme();
  const { actionTypeRegistry } = triggersActionsUi;
  // Refs so we don't re-run the effect when only these references change (e.g. when opening the
  // actions menu / trigger submenu re-renders the tree). Re-running would re-inject CSS and
  // replace custom trigger icons with the default bolt in YAML and suggestions.
  const workflowsExtensionsRef = useRef(workflowsExtensions);
  const actionTypeRegistryRef = useRef(actionTypeRegistry);
  const connectorsDataRef = useRef(connectorsData);
  const onShadowIconsCssReadyRef = useRef(onShadowIconsCssReady);
  workflowsExtensionsRef.current = workflowsExtensions;
  actionTypeRegistryRef.current = actionTypeRegistry;
  connectorsDataRef.current = connectorsData;
  onShadowIconsCssReadyRef.current = onShadowIconsCssReady;

  const triggerIdsKey = triggerSchemas
    .getTriggerDefinitions()
    .map((t) => t.id)
    .join(',');
  const connectorIdsKey = Object.keys(connectorsData?.connectorTypes ?? {})
    .sort()
    .join(',');
  const injectionRunIdRef = useRef(0);
  const lastInjectedShadowCssRef = useRef<string | null>(null);
  const customTriggerIds = triggerSchemas.getRegisteredIds();
  // Detect custom trigger in content: known registered ids OR pattern "type: x.y" (custom triggers use dots; built-in are manual/alert/scheduled).
  // This ensures we re-run and retry when loading saved YAML that has a custom trigger before the extension has registered.
  const contentHasCustomTrigger = Boolean(
    editorValue &&
      (customTriggerIds.some((id) => editorValue.includes(id)) ||
        /type:\s*[\w.-]*\.[\w.-]+/.test(editorValue))
  );

  useEffect(() => {
    const connectorTypesData = connectorsDataRef.current?.connectorTypes;
    const hasConnectorTypes = connectorTypesData && Object.keys(connectorTypesData).length > 0;
    const hasTriggerDefinitions = triggerSchemas.getTriggerDefinitions().length > 0;
    const hasEditorMounted = Boolean(isEditorMounted);
    // Run when we have connector/trigger data OR when editor is mounted (so we inject into container)
    if (!hasConnectorTypes && !hasTriggerDefinitions && !hasEditorMounted) {
      return;
    }
    const getAllTypes = (): ConnectorTypeInfoMinimal[] => {
      const registry = actionTypeRegistryRef.current;
      const connectorTypes = Object.values(connectorsDataRef.current?.connectorTypes ?? {}).map(
        (connector) => {
          // API can list types not registered in the UI registry => get() throws if missing.
          const icon = registry.has(connector.actionTypeId)
            ? registry.get(connector.actionTypeId)?.iconClass
            : undefined;
          return {
            actionTypeId: connector.actionTypeId,
            displayName: connector.displayName,
            ...(icon !== undefined && { icon }),
          };
        }
      );

      const registeredTypes = workflowsExtensionsRef.current
        .getAllStepDefinitions()
        .map((step) => ({
          actionTypeId: step.id,
          displayName: step.label,
          fromRegistry: true,
          icon: step.icon,
        }));

      const registeredTriggerTypes = triggerSchemas.getTriggerDefinitions().map((t) => ({
        actionTypeId: t.id,
        displayName: t.title ?? t.id,
        isTrigger: true,
        ...(t.icon !== undefined && { icon: t.icon }),
      }));

      return [
        ...predefinedStepTypes,
        ...connectorTypes,
        ...registeredTypes,
        ...registeredTriggerTypes,
      ];
    };

    const runInjection = async () => {
      const myRunId = ++injectionRunIdRef.current;
      setStabilityBadgeThemeContext(euiThemeContext);
      // Use ref at injection time so retries (150ms, 500ms, etc.) see the current DOM and find the iframe if it appeared.
      const editorContainer = editorContainerRef?.current ?? undefined;
      const allTypes = getAllTypes();
      await injectDynamicConnectorIcons(allTypes, editorContainer);
      injectSuggestTechPreviewBadges(editorContainer, euiThemeContext);
      await injectDynamicShadowIcons(
        allTypes,
        editorContainer,
        () => myRunId !== injectionRunIdRef.current,
        (css) => onShadowIconsCssReadyRef.current?.(css),
        lastInjectedShadowCssRef
      );
    };

    void runInjection();
    // Re-run to pick up custom triggers that register after first paint (e.g. example plugin).
    // Multiple retries avoid race where getTriggerDefinitions() is still empty on first run.
    const retryIds: ReturnType<typeof setTimeout>[] = [
      setTimeout(runInjection, 800),
      setTimeout(runInjection, 2500),
      setTimeout(runInjection, 5000),
      setTimeout(runInjection, 8000),
    ];
    // When YAML contains a custom trigger (load or re-add after delete), re-inject so custom icon
    // shows and wins over base bolt rule; retries catch late editor/decoration DOM.
    if (contentHasCustomTrigger && hasEditorMounted) {
      retryIds.push(setTimeout(runInjection, 150));
      retryIds.push(setTimeout(runInjection, 200));
      retryIds.push(setTimeout(runInjection, 500));
    }

    return () => {
      retryIds.forEach((id) => clearTimeout(id));
    };
  }, [
    isEditorMounted,
    triggerIdsKey,
    connectorIdsKey,
    contentHasCustomTrigger,
    editorValue,
    editorContainerRef,
    euiThemeContext,
  ]);
}

/**
 * Inject dynamic CSS for connector icons in Monaco autocompletion.
 * Uses targetDoc (editor's document) so styles apply when the editor is in an iframe.
 */
async function injectDynamicConnectorIcons(
  connectorTypes: ConnectorTypeInfoMinimal[],
  editorContainer: HTMLElement | undefined
) {
  const styleId = 'dynamic-connector-icons';
  const targetDoc = editorContainer?.ownerDocument ?? document;

  let cssToInject = '';

  const suggestPrefix = '.monaco-editor .suggest-widget .monaco-list .monaco-list-row';

  for (const connector of Object.values(connectorTypes)) {
    const connectorType = connector.actionTypeId.startsWith('.')
      ? connector.actionTypeId.slice(1)
      : connector.actionTypeId;

    const displayName = connector.displayName;

    let iconBase64: string | undefined;
    const isTrigger = 'isTrigger' in connector && connector.isTrigger;
    try {
      iconBase64 = await getIconBase64({
        ...connector,
        kind: isTrigger ? 'trigger' : 'step',
      });
    } catch {
      if (isTrigger) {
        iconBase64 = getTriggerBoltFallbackDataUrl();
      }
    }
    if (!iconBase64 && isTrigger) {
      iconBase64 = getTriggerBoltFallbackDataUrl();
    }
    if (iconBase64) {
      let selector = '';
      if (connectorType === 'elasticsearch') {
        selector = `.codicon-symbol-struct:before,
        ${suggestPrefix}[aria-label^="elasticsearch."] .suggest-icon:before`;
      } else if (connectorType === 'kibana') {
        selector = `.codicon-symbol-module:before,
        ${suggestPrefix}[aria-label^="kibana."] .suggest-icon:before`;
      } else if (connectorType === 'console') {
        selector = '.codicon-symbol-variable:before';
      } else {
        selector = `${suggestPrefix}[aria-label^="${connectorType}"] .suggest-icon:before,
      ${suggestPrefix}[aria-label^="${displayName}"] .suggest-icon:before`;
      }

      let cssProperties = '';
      if (MonochromeIcons.has(connector.actionTypeId)) {
        cssProperties = `
        mask-image: url("${iconBase64}");
        mask-size: contain;
        background-color: currentColor;
      `;
      } else {
        cssProperties = `background-image: url("${iconBase64}") !important;`;
      }

      cssToInject += `
      ${selector} {
        ${cssProperties}
        background-size: 12px 12px !important;
        background-repeat: no-repeat !important;
        background-position: center !important;
        content: " " !important;
        width: 16px !important;
        height: 16px !important;
        display: block !important;
      }
    `;
    }
  }

  if (cssToInject) {
    const style = targetDoc.createElement('style');
    style.id = styleId;
    style.textContent = cssToInject;
    appendStyleToEditorScope(style, styleId, editorContainer, targetDoc);
  }
}

function injectSuggestTechPreviewBadges(
  editorContainer: HTMLElement | undefined,
  euiThemeContext: UseEuiTheme
): void {
  const styleId = 'dynamic-suggest-tech-preview-badges';
  const targetDoc = editorContainer?.ownerDocument ?? document;
  const ariaLabelPrefixes = collectTechPreviewSuggestAriaPrefixes();
  const cssToInject = buildSuggestTechPreviewBadgeRules(ariaLabelPrefixes, euiThemeContext);

  if (!cssToInject) {
    return;
  }

  const style = targetDoc.createElement('style');
  style.id = styleId;
  style.textContent = cssToInject;
  appendStyleToEditorScope(style, styleId, editorContainer, targetDoc);
}

/* eslint-disable-next-line complexity */
async function injectDynamicShadowIcons(
  connectorTypes: ConnectorTypeInfoMinimal[],
  editorContainer: HTMLElement | undefined,
  isStale?: () => boolean,
  onCssReady?: (css: string) => void,
  lastInjectedCssRef?: React.MutableRefObject<string | null>
): Promise<void> {
  const styleId = 'dynamic-shadow-icons';
  const targetDoc = editorContainer?.ownerDocument ?? document;
  const boltUrl = getTriggerBoltFallbackDataUrl() || FALLBACK_BOLT_DATA_URL;

  const baseRule = `
    content: "" !important;
    display: inline-block !important;
    width: 12px !important;
    height: 12px !important;
    margin-left: 4px !important;
    vertical-align: middle !important;
    position: relative !important;
    top: -1px !important;
    color: inherit !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
  `;
  const inlineScope = '.monaco-editor .view-line span';
  const glyphBaseRule = `
    content: '' !important;
    display: block !important;
    width: 14px !important;
    height: 14px !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
  `;
  const glyphDefault =
    boltUrl !== ''
      ? `
  [class^="trigger-type-glyph"]::before {
    ${glyphBaseRule}
    background-image: url("${boltUrl}") !important;
  }
  `
      : '';
  const afterIconDefault =
    boltUrl !== ''
      ? `
  [class^="trigger-inline-icon-"] { display: inline-block !important; width: 12px !important; height: 12px !important; vertical-align: middle !important; }
  [class^="trigger-inline-icon-"]::before {
    content: '' !important; display: inline-block !important; width: 12px !important; height: 12px !important;
    margin-left: 4px !important; vertical-align: middle !important; background-size: contain !important; background-repeat: no-repeat !important;
    background-image: url("${boltUrl}") !important;
  }
  `
      : '';
  let cssToInject =
    boltUrl !== ''
      ? `
  ${glyphDefault}
  ${afterIconDefault}
  `
      : glyphDefault + afterIconDefault;

  if (boltUrl !== '') {
    cssToInject += `
  .monaco-editor .type-inline-highlight.${CUSTOM_TRIGGER_INLINE_CLASS}::after,
  ${inlineScope}.type-inline-highlight.${CUSTOM_TRIGGER_INLINE_CLASS}::after,
  span.type-inline-highlight.${CUSTOM_TRIGGER_INLINE_CLASS}::after {
    ${baseRule}
    background-image: url("${boltUrl}") !important;
  }
  `;
  }

  for (const triggerId of TriggerTypes) {
    const iconUrl = HardcodedIcons[triggerId] || boltUrl || FALLBACK_BOLT_DATA_URL;
    const notCustom = ':not([class*="type-ct-"])';
    cssToInject += `
  ${inlineScope}.type-inline-highlight.type-${triggerId}${notCustom}::after {
    ${baseRule}
    background-image: url("${iconUrl}") !important;
  }
  `;
  }

  const isValidDataUrl = (url: string) =>
    typeof url === 'string' &&
    url.length > 50 &&
    url.startsWith('data:') &&
    url.includes('base64,');

  for (const connector of connectorTypes) {
    const isTriggerConnector = 'isTrigger' in connector && connector.isTrigger;
    const isBuiltInTriggerId = TriggerTypes.includes(connector.actionTypeId as TriggerType);

    let iconBase64: string | undefined;
    try {
      iconBase64 = await getIconBase64({
        ...connector,
        kind: isTriggerConnector ? 'trigger' : 'step',
      });
    } catch {
      if (isTriggerConnector && boltUrl) {
        iconBase64 = boltUrl;
      } else if (isBuiltInTriggerId) {
        iconBase64 = HardcodedIcons[connector.actionTypeId] || boltUrl || FALLBACK_BOLT_DATA_URL;
      }
    }
    if (isTriggerConnector && iconBase64 !== undefined && !isValidDataUrl(iconBase64) && boltUrl) {
      iconBase64 = boltUrl;
    }
    if (iconBase64 !== undefined) {
      const connectorType = connector.actionTypeId.startsWith('.')
        ? connector.actionTypeId.slice(1)
        : connector.actionTypeId;

      let className: string;
      if (isTriggerConnector) {
        className = `type-ct-${triggerTypeToCssClass(connectorType)}`;
      } else if (connectorType.startsWith('elasticsearch.')) {
        className = 'elasticsearch';
      } else if (connectorType.startsWith('kibana.')) {
        className = 'kibana';
      } else if (connectorType.startsWith('.')) {
        className = connectorType.substring(1);
      } else if (connectorType.includes('.')) {
        className = connectorType.replaceAll('.', '-');
      } else {
        className = connectorType;
      }

      let bgProp: string;
      if (MonochromeIcons.has(connector.actionTypeId)) {
        bgProp = `
        mask-image: url("${iconBase64}");
        mask-size: contain;
        background-color: currentColor;
      `;
      } else {
        bgProp = `background-image: url("${iconBase64}") !important;`;
      }

      if (isTriggerConnector) {
        const triggerIconUrl = isValidDataUrl(iconBase64)
          ? iconBase64
          : boltUrl || FALLBACK_BOLT_DATA_URL;
        const triggerBgProp =
          MonochromeIcons.has(connector.actionTypeId) && isValidDataUrl(iconBase64)
            ? bgProp
            : `background-image: url("${triggerIconUrl}") !important;`;
        cssToInject += `
  .monaco-editor .type-inline-highlight.${CUSTOM_TRIGGER_INLINE_CLASS}.${className}::after,
  ${inlineScope}.type-inline-highlight.${CUSTOM_TRIGGER_INLINE_CLASS}.${className}::after,
  span.type-inline-highlight.${CUSTOM_TRIGGER_INLINE_CLASS}.${className}::after {
    ${baseRule}
    ${triggerBgProp}
  }
  `;
      } else {
        const isBuiltInTrigger = TriggerTypes.includes(className as TriggerType);
        const notCustom = isBuiltInTrigger ? ':not([class*="type-ct-"])' : '';
        cssToInject += `
  ${inlineScope}.type-inline-highlight.type-${className}${notCustom}::after {
    ${baseRule}
    ${bgProp}
  }
  `;
      }
    }
  }

  const isUnchanged = lastInjectedCssRef?.current === cssToInject;
  if (cssToInject && !isStale?.() && !isUnchanged) {
    if (lastInjectedCssRef) lastInjectedCssRef.current = cssToInject;
    onCssReady?.(cssToInject);
    const injectedStyleId = `${styleId}-injected`;
    const style = targetDoc.createElement('style');
    style.id = injectedStyleId;
    style.textContent = cssToInject;
    appendStyleToEditorScope(style, injectedStyleId, editorContainer, targetDoc);
  }
}
