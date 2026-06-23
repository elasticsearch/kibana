/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type CoreSetup,
  type CoreStart,
  type Plugin,
  type PluginInitializerContext,
  type AppUpdater,
} from '@kbn/core/public';
import type { Logger } from '@kbn/logging';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import { BehaviorSubject, distinctUntilChanged, type Subscription } from 'rxjs';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import React from 'react';
import ReactDOM from 'react-dom';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import { dynamic } from '@kbn/shared-ux-utility';
import { registerLocators } from './locator/register_locators';
import { buildAgentBuilderDeepLinks, registerAnalytics, registerApp } from './register';
import { AgentBuilderNavControlInitiator } from './components/nav_control/lazy_agent_builder_nav_control';

const LazyAgentBuilderAnnouncementChromeInner = dynamic(() =>
  import('./components/announcement/agent_builder_announcement_chrome_inner').then((m) => ({
    default: m.AgentBuilderAnnouncementChromeInner,
  }))
);
import {
  AgentBuilderAccessChecker,
  AgentService,
  AttachmentsService,
  ChatService,
  ConversationsService,
  DocLinksService,
  NavigationService,
  ToolsService,
  SkillsService,
  SmlService,
  OAuthClientsService,
  PluginsService,
  EventsService,
  type AgentBuilderInternalService,
} from './services';
import { createPublicAttachmentContract } from './services/attachments';
import { createPublicToolContract } from './services/tools';
import { createPublicAgentsContract } from './services/agents';
import { createPublicEventsContract } from './services/events';
import { registerWorkflowSteps } from './step_types';
import type {
  ConfigSchema,
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  AgentBuilderSetupDependencies,
  AgentBuilderStartDependencies,
  ConversationSidebarRef,
} from './types';
import type { EmbeddableConversationProps } from './embeddable/types';
import type {
  PublicEmbeddableConversationProps,
  PublicEmbeddableConversationInputProps,
  EmbeddableConversationInputRef,
} from './types';
import type { OpenConversationSidebarOptions, OpenSidebarInternalOptions } from './sidebar/types';
import {
  setSidebarServices,
  setSidebarRuntimeContext,
  clearSidebarRuntimeContext,
} from './sidebar';
import { createVisualizationAttachmentDefinition } from './application/components/attachments/visualization_attachment';
import { storageKeys } from './application/storage_keys';

export class AgentBuilderPlugin
  implements
    Plugin<
      AgentBuilderPluginSetup,
      AgentBuilderPluginStart,
      AgentBuilderSetupDependencies,
      AgentBuilderStartDependencies
    >
{
  logger: Logger;
  private conversationActiveConfig: EmbeddableConversationProps = {};
  private internalServices?: AgentBuilderInternalService;
  private setupServices?: {
    navigationService: NavigationService;
    usageCollection?: UsageCollectionSetup;
  };
  private activeSidebarRef: ConversationSidebarRef | null = null;
  private sidebarCallbacks: {
    updateProps: (props: EmbeddableConversationProps) => void;
    resetBrowserApiTools: () => void;
    addAttachment: (attachment: AttachmentInput) => void;
  } | null = null;
  private appUpdater$ = new BehaviorSubject<AppUpdater>(() => ({}));
  private isEarsEnabled = false;
  private isEarsExperimentalEnabled = false;
  private experimentalDeepLinksSubscription?: Subscription;

  constructor(context: PluginInitializerContext<ConfigSchema>) {
    this.logger = context.logger.get();
  }
  setup(
    core: CoreSetup<AgentBuilderStartDependencies, AgentBuilderPluginStart>,
    deps: AgentBuilderSetupDependencies
  ): AgentBuilderPluginSetup {
    const navigationService = new NavigationService({
      management: deps.management.locator,
      licenseManagement: deps.licenseManagement?.locator,
    });

    this.setupServices = { navigationService, usageCollection: deps.usageCollection };
    this.isEarsEnabled = deps.actions.isEarsEnabled;
    this.isEarsExperimentalEnabled = deps.actions.isEarsExperimentalEnabled;

    registerApp({
      core,
      getServices: () => {
        if (!this.internalServices) {
          throw new Error('getServices called before plugin start');
        }
        return this.internalServices;
      },
      appUpdater$: this.appUpdater$,
    });

    registerAnalytics({ analytics: core.analytics });
    registerLocators(deps.share);

    registerWorkflowSteps(deps.workflowsExtensions, core);

    core.chrome.sidebar.registerApp({
      appId: 'agentBuilder',
      restoreOnReload: false,
      loadComponent: async () => {
        const { SidebarConversation } = await import('./sidebar/sidebar_conversation');
        return SidebarConversation;
      },
    });

    return {};
  }

  start(
    core: CoreStart,
    startDependencies: AgentBuilderStartDependencies
  ): AgentBuilderPluginStart {
    const { http } = core;
    const { licensing, inference } = startDependencies;

    const agentService = new AgentService({ http });
    const attachmentsService = new AttachmentsService({ http });

    attachmentsService.addAttachmentType(
      'visualization',
      createVisualizationAttachmentDefinition({ startDependencies })
    );

    const eventsService = new EventsService();
    const chatService = new ChatService({ http, events: eventsService });
    const conversationsService = new ConversationsService({ http });
    const docLinksService = new DocLinksService(core.docLinks.links);
    const toolsService = new ToolsService({ http });
    const skillsService = new SkillsService({ http });
    const smlService = new SmlService({ http });
    const pluginsService = new PluginsService({ http });
    const oauthClientsService = new OAuthClientsService({ http });
    const accessChecker = new AgentBuilderAccessChecker({ licensing, inference });

    if (!this.setupServices) {
      throw new Error('plugin start called before plugin setup');
    }

    const { navigationService, usageCollection } = this.setupServices;

    const hasAgentBuilder = core.application.capabilities.agentBuilder?.show === true;
    const sidebar = core.chrome.sidebar.getApp('agentBuilder');

    const openSidebarInternal = (options?: OpenSidebarInternalOptions) => {
      const { conversationId, ...openOptions } = options ?? {};
      const config =
        Object.keys(openOptions).length > 0 ? openOptions : this.conversationActiveConfig;

      if (conversationId) {
        const storageKey = storageKeys.getLastConversationKey(config.sessionTag, config.agentId);
        window?.localStorage?.setItem(storageKey, JSON.stringify(conversationId));
      }

      // If already open, update props instead of creating new
      if (this.activeSidebarRef && this.sidebarCallbacks) {
        this.sidebarCallbacks.updateProps(config);
        return { chatRef: this.activeSidebarRef };
      }

      // Set runtime context before opening
      setSidebarRuntimeContext({
        options: config,
        onRegisterCallbacks: (callbacks) => {
          this.sidebarCallbacks = callbacks;
        },
        onClose: () => {
          this.activeSidebarRef = null;
          this.sidebarCallbacks = null;
          clearSidebarRuntimeContext();
        },
      });

      sidebar.open();

      const sidebarRef: ConversationSidebarRef = {
        close: () => {
          sidebar.close();
          this.activeSidebarRef = null;
          this.sidebarCallbacks = null;
          clearSidebarRuntimeContext();
        },
      };

      this.activeSidebarRef = sidebarRef;
      return { chatRef: sidebarRef };
    };

    const internalServices: AgentBuilderInternalService = {
      agentService,
      attachmentsService,
      chatService,
      conversationsService,
      docLinksService,
      navigationService,
      toolsService,
      skillsService,
      smlService,
      pluginsService,
      oauthClientsService,
      startDependencies,
      usageCollection,
      accessChecker,
      eventsService,
      isEarsEnabled: this.isEarsEnabled,
      isEarsExperimentalEnabled: this.isEarsExperimentalEnabled,
      openSidebarConversation: (options?: OpenSidebarInternalOptions) => {
        return openSidebarInternal(options);
      },
    };

    this.internalServices = internalServices;

    setSidebarServices(core, internalServices);

    const LazyConfiguredEmbeddableConversation = React.lazy(async () => {
      const { createEmbeddableConversation } = await import(
        './embeddable/create_embeddable_conversation'
      );

      return {
        default: createEmbeddableConversation({
          services: internalServices,
          coreStart: core,
        }),
      };
    });

    const PublicEmbeddableConversation: React.FC<PublicEmbeddableConversationProps> = ({
      onClose,
      ariaLabelledBy,
      ...rest
    }) => (
      <React.Suspense fallback={null}>
        <LazyConfiguredEmbeddableConversation
          {...rest}
          onClose={onClose}
          ariaLabelledBy={ariaLabelledBy ?? 'agent-builder-embeddable-conversation'}
        />
      </React.Suspense>
    );

    const LazyConfiguredEmbeddableConversationInput = React.lazy(async () => {
      const { createEmbeddableConversationInput } = await import(
        './embeddable/create_embeddable_conversation_input'
      );

      return {
        default: createEmbeddableConversationInput({
          services: internalServices,
          coreStart: core,
        }),
      };
    });

    const PublicEmbeddableConversationInput = React.forwardRef<
      EmbeddableConversationInputRef,
      PublicEmbeddableConversationInputProps
    >((props, ref) => (
      <React.Suspense fallback={null}>
        <LazyConfiguredEmbeddableConversationInput {...props} ref={ref} />
      </React.Suspense>
    ));

    this.experimentalDeepLinksSubscription = core.uiSettings
      .get$<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID)
      .pipe(distinctUntilChanged())
      .subscribe((experimentalFeaturesEnabled) => {
        this.appUpdater$.next(() => ({
          deepLinks: buildAgentBuilderDeepLinks(experimentalFeaturesEnabled),
        }));
      });

    const agentBuilderService: AgentBuilderPluginStart = {
      agents: createPublicAgentsContract({ agentService }),
      attachments: createPublicAttachmentContract({ attachmentsService }),
      tools: createPublicToolContract({ toolsService }),
      events: createPublicEventsContract({ eventsService }),
      addAttachment: (attachment: AttachmentInput) => {
        if (this.sidebarCallbacks) {
          this.sidebarCallbacks.addAttachment(attachment);
        }
      },
      setChatConfig: (config: EmbeddableConversationProps) => {
        // Set config until sidebar is next opened
        this.conversationActiveConfig = config;
        // If there is already an active sidebar, update its props
        if (this.activeSidebarRef && this.sidebarCallbacks) {
          this.sidebarCallbacks.updateProps(config);
          return { chatRef: this.activeSidebarRef };
        }
      },
      clearChatConfig: () => {
        this.conversationActiveConfig = {};
        if (this.activeSidebarRef && this.sidebarCallbacks) {
          // Removes stale browserApiTools from the sidebar
          this.sidebarCallbacks.resetBrowserApiTools();
        }
      },
      openChat: (options?: OpenConversationSidebarOptions) => {
        return openSidebarInternal(options);
      },
      toggleChat: (options?: OpenConversationSidebarOptions) => {
        if (this.activeSidebarRef) {
          const sidebarRef = this.activeSidebarRef;
          // Be defensive: clear local references immediately in case the sidebar doesn't
          // synchronously invoke our onClose callback.
          this.activeSidebarRef = null;
          this.sidebarCallbacks = null;
          sidebarRef.close();
          return;
        }

        openSidebarInternal(options);
      },
      updateAttachmentOrigin: (conversationId: string, attachmentId: string, origin: string) => {
        return attachmentsService.updateOrigin(conversationId, attachmentId, origin);
      },
      EmbeddableConversation: PublicEmbeddableConversation,
      EmbeddableConversationInput: PublicEmbeddableConversationInput,
    };

    if (hasAgentBuilder) {
      core.chrome.navControls.registerRight({
        mount: (element) => {
          ReactDOM.render(
            <LazyAgentBuilderAnnouncementChromeInner
              coreStart={core}
              pluginsStart={startDependencies}
            />,
            element,
            () => {}
          );

          return () => {
            ReactDOM.unmountComponentAtNode(element);
          };
        },
        order: 1000,
      });

      core.chrome.navControls.registerRight({
        mount: (element) => {
          ReactDOM.render(
            <AgentBuilderNavControlInitiator
              coreStart={core}
              pluginsStart={startDependencies}
              agentBuilderService={agentBuilderService}
            />,
            element,
            () => {}
          );

          return () => {
            ReactDOM.unmountComponentAtNode(element);
          };
        },
        // right before the user profile
        order: 1001,
      });

      // Chrome Next transition: also expose this control as an AI button so it renders in the
      // Chrome Next global header (behind the `core.chrome.next` feature flag). Chrome Next does
      // not render HeaderNavControls (`registerRight` mount points), so we dual-register for now.
      // Remove the `registerRight` registration once Chrome Next is the only chrome.
      // See https://github.com/elastic/kibana/issues/260010
      core.chrome.next.aiButton.register({
        content: (
          <AgentBuilderNavControlInitiator
            coreStart={core}
            pluginsStart={startDependencies}
            agentBuilderService={agentBuilderService}
          />
        ),
      });
    }

    return agentBuilderService;
  }

  stop() {
    this.experimentalDeepLinksSubscription?.unsubscribe();
  }
}
