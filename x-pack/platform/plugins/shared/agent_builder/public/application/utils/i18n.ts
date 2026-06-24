/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const labels = {
  common: {
    optional: i18n.translate('xpack.agentBuilder.common.optional', {
      defaultMessage: 'Optional',
    }),
    markdownViewModeLegend: i18n.translate('xpack.agentBuilder.common.markdownViewModeLegend', {
      defaultMessage: 'Markdown view mode',
    }),
    markdownViewRenderedLabel: i18n.translate(
      'xpack.agentBuilder.common.markdownViewRenderedLabel',
      {
        defaultMessage: 'Rendered',
      }
    ),
    markdownViewRawLabel: i18n.translate('xpack.agentBuilder.common.markdownViewRawLabel', {
      defaultMessage: 'Raw',
    }),
  },
  customizeLandingEmptyState: {
    learnMore: i18n.translate('xpack.agentBuilder.customizeLandingEmptyState.learnMore', {
      defaultMessage: 'Learn more',
    }),
  },
  conversations: {
    title: i18n.translate('xpack.agentBuilder.conversations.title', {
      defaultMessage: 'Agent Chat',
    }),
    staleCheckPartialFailureTitle: i18n.translate(
      'xpack.agentBuilder.conversations.staleCheckPartialFailureTitle',
      {
        defaultMessage: 'Could not check whether some attachments are outdated',
      }
    ),
  },
  tools: {
    // Landing page
    libraryTitle: i18n.translate('xpack.agentBuilder.tools.libraryTitle', {
      defaultMessage: 'Tools library',
    }),
    title: i18n.translate('xpack.agentBuilder.tools.title', { defaultMessage: 'Tools' }),
    newToolButton: i18n.translate('xpack.agentBuilder.tools.newToolButton', {
      defaultMessage: 'New tool',
    }),
    mcpServerConnectionButton: i18n.translate(
      'xpack.agentBuilder.tools.mcpServerConnectionButton',
      {
        defaultMessage: 'Manage MCP',
      }
    ),
    copyMcpServerUrlButton: i18n.translate('xpack.agentBuilder.tools.copyMcpServerUrlButton', {
      defaultMessage: 'Copy MCP Server URL',
    }),
    bulkImportMcpToolsButton: i18n.translate('xpack.agentBuilder.tools.bulkImportMcpToolsButton', {
      defaultMessage: 'Bulk import MCP tools',
    }),
    manageMcpClientsButton: i18n.translate('xpack.agentBuilder.tools.manageMcpClientsButton', {
      defaultMessage: 'Manage MCP clients (OAuth)',
    }),
    aboutMcpServerDocumentationButton: i18n.translate(
      'xpack.agentBuilder.tools.aboutMcpServerDocumentationButton',
      {
        defaultMessage: 'Documentation',
      }
    ),
    newToolTitle: i18n.translate('xpack.agentBuilder.tools.newToolTitle', {
      defaultMessage: 'Create a new tool',
    }),
    readOnly: i18n.translate('xpack.agentBuilder.tools.readOnly', {
      defaultMessage: 'Read-only',
    }),
    toolsTableCaption: (toolsCount: number) =>
      i18n.translate('xpack.agentBuilder.tools.toolsTableCaption', {
        defaultMessage: 'Available tools for AI agents: {toolsCount} tools',
        values: { toolsCount },
      }),
    newIndexSearchToolTitle: i18n.translate('xpack.agentBuilder.tools.newIndexSearchTool.title', {
      defaultMessage: 'New index search tool',
    }),
    editIndexSearchToolTitle: i18n.translate('xpack.agentBuilder.tools.editIndexSearchTool.title', {
      defaultMessage: 'Edit index search tool',
    }),

    editToolContextMenuButtonLabel: i18n.translate(
      'xpack.agentBuilder.tools.editToolContextMenuButtonLabel',
      {
        defaultMessage: 'Edit tool context menu',
      }
    ),
    saveButtonLabel: i18n.translate('xpack.agentBuilder.tools.saveButtonLabel', {
      defaultMessage: 'Save',
    }),
    testButtonLabel: i18n.translate('xpack.agentBuilder.tools.testButtonLabel', {
      defaultMessage: 'Test',
    }),
    saveAndTestButtonLabel: i18n.translate('xpack.agentBuilder.tools.saveAndTestButtonLabel', {
      defaultMessage: 'Save & test',
    }),
    cancelButtonLabel: i18n.translate('xpack.agentBuilder.tools.cancelButtonLabel', {
      defaultMessage: 'Cancel',
    }),
    saveButtonTooltip: i18n.translate('xpack.agentBuilder.tools.saveButtonTooltip', {
      defaultMessage: 'Resolve all form errors to save.',
    }),

    // Table columns and labels
    toolIdLabel: i18n.translate('xpack.agentBuilder.tools.idLabel', { defaultMessage: 'ID' }),
    tagsLabel: i18n.translate('xpack.agentBuilder.tools.tagsLabel', { defaultMessage: 'Labels' }),
    experimentalLabel: i18n.translate('xpack.agentBuilder.tools.experimentalLabel', {
      defaultMessage: 'Experimental',
    }),
    toolsLabel: i18n.translate('xpack.agentBuilder.tools.toolsLabel', { defaultMessage: 'Tools' }),
    selectToolColumnHeader: i18n.translate('xpack.agentBuilder.tools.selectToolColumnHeader', {
      defaultMessage: 'Select tool',
    }),
    selectToolCheckboxAriaLabel: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.selectToolCheckboxAriaLabel', {
        defaultMessage: 'Select tool {toolId}',
        values: { toolId },
      }),

    // Tool types
    esqlLabel: i18n.translate('xpack.agentBuilder.tools.esqlLabel', { defaultMessage: 'ES|QL' }),
    builtinLabel: i18n.translate('xpack.agentBuilder.tools.builtinLabel', {
      defaultMessage: 'System',
    }),
    mcpLabel: i18n.translate('xpack.agentBuilder.tools.mcpLabel', { defaultMessage: 'MCP' }),
    searchLabel: i18n.translate('xpack.agentBuilder.tools.searchLabel', {
      defaultMessage: 'Search',
    }),
    indexTypeLabel: i18n.translate('xpack.agentBuilder.tools.indexTypeLabel', {
      defaultMessage: 'Index',
    }),
    aliasTypeLabel: i18n.translate('xpack.agentBuilder.tools.aliasTypeLabel', {
      defaultMessage: 'Alias',
    }),
    dataStreamTypeLabel: i18n.translate('xpack.agentBuilder.tools.dataStreamTypeLabel', {
      defaultMessage: 'Data stream',
    }),

    // MCP tool health status
    mcpHealthStatus: {
      toolNotFound: {
        title: i18n.translate('xpack.agentBuilder.tools.mcpHealthStatus.toolNotFound.title', {
          defaultMessage: 'Tool not found on MCP server',
        }),
        description: i18n.translate(
          'xpack.agentBuilder.tools.mcpHealthStatus.toolNotFound.description',
          {
            defaultMessage: 'It may have been removed or renamed.',
          }
        ),
      },
      connectorNotFound: {
        title: i18n.translate('xpack.agentBuilder.tools.mcpHealthStatus.connectorNotFound.title', {
          defaultMessage: 'MCP connector unavailable',
        }),
        description: i18n.translate(
          'xpack.agentBuilder.tools.mcpHealthStatus.connectorNotFound.description',
          {
            defaultMessage: 'Check your MCP server connection',
          }
        ),
      },
      listToolsFailed: {
        title: i18n.translate('xpack.agentBuilder.tools.mcpHealthStatus.listToolsFailed.title', {
          defaultMessage: "Can't retrieve tools from MCP server",
        }),
        description: i18n.translate(
          'xpack.agentBuilder.tools.mcpHealthStatus.listToolsFailed.description',
          {
            defaultMessage: 'Check your MCP server connection',
          }
        ),
      },
      toolUnhealthy: {
        title: i18n.translate('xpack.agentBuilder.tools.mcpHealthStatus.toolUnhealthy.title', {
          defaultMessage: 'Tool execution failed',
        }),
        description: i18n.translate(
          'xpack.agentBuilder.tools.mcpHealthStatus.toolUnhealthy.description',
          {
            defaultMessage: 'Check your MCP server connection',
          }
        ),
      },
    },

    // Actions
    editToolButtonLabel: i18n.translate('xpack.agentBuilder.tools.editToolButtonLabel', {
      defaultMessage: 'Edit',
    }),
    viewToolButtonLabel: i18n.translate('xpack.agentBuilder.tools.viewToolButtonLabel', {
      defaultMessage: 'View',
    }),
    deleteToolButtonLabel: i18n.translate('xpack.agentBuilder.tools.deleteToolButtonLabel', {
      defaultMessage: 'Delete',
    }),
    testToolButtonLabel: i18n.translate('xpack.agentBuilder.tools.testToolButtonLabel', {
      defaultMessage: 'Test',
    }),
    cloneToolButtonLabel: i18n.translate('xpack.agentBuilder.tools.cloneToolButtonLabel', {
      defaultMessage: 'Clone',
    }),
    toolContextMenuButtonLabel: i18n.translate(
      'xpack.agentBuilder.tools.toolContextMenuButtonLabel',
      {
        defaultMessage: 'Tool context menu',
      }
    ),

    // Table header and bulk actions
    deleteSelectedToolsButtonLabel: (count: number) =>
      i18n.translate('xpack.agentBuilder.tools.deleteSelectedToolsButtonLabel', {
        defaultMessage: 'Delete {count, plural, one {# Tool} other {# Tools}}',
        values: { count },
      }),
    selectAllToolsButtonLabel: i18n.translate(
      'xpack.agentBuilder.tools.selectAllToolsButtonLabel',
      {
        defaultMessage: 'Select all',
      }
    ),
    clearSelectionButtonLabel: i18n.translate(
      'xpack.agentBuilder.tools.clearSelectionButtonLabel',
      {
        defaultMessage: 'Clear selection',
      }
    ),
    includeSystemToolsSwitchLabel: i18n.translate(
      'xpack.agentBuilder.tools.includeSystemToolsSwitchLabel',
      {
        defaultMessage: 'Include system tools',
      }
    ),

    // Search and filters
    searchToolsPlaceholder: i18n.translate('xpack.agentBuilder.tools.searchToolsPlaceholder', {
      defaultMessage: 'Search',
    }),
    typeFilter: i18n.translate('xpack.agentBuilder.tools.typeFilter', { defaultMessage: 'Type' }),
    tagsFilter: i18n.translate('xpack.agentBuilder.tools.tagsFilter', { defaultMessage: 'Labels' }),

    // Empty states and messages
    noEsqlToolsMatchMessage: i18n.translate('xpack.agentBuilder.tools.noEsqlToolsMatchMessage', {
      defaultMessage: 'No tools match your search.',
    }),
    noEsqlToolsMessage: i18n.translate('xpack.agentBuilder.tools.noEsqlToolsMessage', {
      defaultMessage: "It looks like you don't have any ES|QL tools defined yet.",
    }),
    listToolsErrorMessage: i18n.translate('xpack.agentBuilder.tools.listToolsErrorMessage', {
      defaultMessage: 'Failed to fetch tools',
    }),

    // Success toasts
    deleteToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.deleteToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" deleted',
        values: { toolId },
      }),
    bulkDeleteToolsSuccessToast: (count: number) =>
      i18n.translate('xpack.agentBuilder.tools.bulkDeleteToolsSuccessToast', {
        defaultMessage: 'Deleted {count, plural, one {# tool} other {# tools}}',
        values: { count },
      }),
    createEsqlToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.createEsqlToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" created',
        values: { toolId },
      }),
    editEsqlToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.editEsqlToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" updated',
        values: { toolId },
      }),
    createIndexSearchToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.createIndexSearchToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" created',
        values: { toolId },
      }),
    editIndexSearchToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.editIndexSearchToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" updated',
        values: { toolId },
      }),

    // Error toasts
    deleteToolErrorToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.deleteToolErrorToast', {
        defaultMessage: 'Unable to delete tool "{toolId}"',
        values: { toolId },
      }),
    bulkDeleteToolsErrorToast: (count: number) =>
      i18n.translate('xpack.agentBuilder.tools.bulkDeleteToolsErrorToast', {
        defaultMessage: 'Unable to delete {count, plural, one {# tool} other {# tools}}',
        values: { count },
      }),
    createEsqlToolErrorToast: i18n.translate('xpack.agentBuilder.tools.createEsqlToolErrorToast', {
      defaultMessage: 'Unable to create tool',
    }),
    editEsqlToolErrorToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.editEsqlToolErrorToast', {
        defaultMessage: 'Unable to update tool "{toolId}"',
        values: { toolId },
      }),
    searchToolsErrorToast: i18n.translate('xpack.agentBuilder.tools.searchToolsErrorToast', {
      defaultMessage: 'Error searching tools',
    }),
    loadToolErrorToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.loadToolErrorToast', {
        defaultMessage: 'Unable to load "{toolId}"',
        values: { toolId },
      }),
    loadToolsErrorToast: i18n.translate('xpack.agentBuilder.tools.loadToolsErrorToast', {
      defaultMessage: 'Unable to load tools',
    }),

    // Delete modals
    deleteEsqlToolTitle: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.deleteEsqlToolTitle', {
        defaultMessage: 'Delete {toolId}?',
        values: { toolId },
      }),
    deleteEsqlToolCancelButton: i18n.translate(
      'xpack.agentBuilder.tools.deleteEsqlToolCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    deleteEsqlToolConfirmButton: i18n.translate(
      'xpack.agentBuilder.tools.deleteEsqlToolConfirmButton',
      {
        defaultMessage: 'Delete tool',
      }
    ),
    deleteEsqlToolConfirmationText: i18n.translate(
      'xpack.agentBuilder.tools.deleteEsqlToolConfirmationText',
      {
        defaultMessage: 'This action will permanently remove the tool. This cannot be undone.',
      }
    ),

    deleteToolUsedByAgentsTitle: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.tools.deleteToolUsedByAgentsTitle', {
        defaultMessage: 'Tool "{toolId}" is used by agents',
        values: { toolId },
      }),
    deleteToolUsedByAgentsDescription: i18n.translate(
      'xpack.agentBuilder.tools.deleteToolUsedByAgentsDescription',
      {
        defaultMessage: 'Remove this tool from all agents that use it and delete the tool?',
      }
    ),
    deleteToolUsedByAgentsAgentListLabel: i18n.translate(
      'xpack.agentBuilder.tools.deleteToolUsedByAgentsAgentListLabel',
      {
        defaultMessage: 'Agents using this tool',
      }
    ),
    deleteToolUsedByAgentsAgentList: (agentNames: string[]) => agentNames.join(', '),
    deleteToolUsedByAgentsConfirmButton: i18n.translate(
      'xpack.agentBuilder.tools.deleteToolUsedByAgentsConfirmButton',
      {
        defaultMessage: 'Yes, remove and delete',
      }
    ),
    deleteToolUsedByAgentsCancelButton: i18n.translate(
      'xpack.agentBuilder.tools.deleteToolUsedByAgentsCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),

    // Bulk delete modal
    bulkDeleteEsqlToolsTitle: (count: number) =>
      i18n.translate('xpack.agentBuilder.tools.bulkDeleteEsqlToolsTitle', {
        defaultMessage: 'Delete {count, plural, one {# tool} other {# tools}}?',
        values: { count },
      }),
    bulkDeleteEsqlToolsConfirmationText: i18n.translate(
      'xpack.agentBuilder.tools.bulkDeleteEsqlToolsConfirmationText',
      {
        defaultMessage: "You can't recover deleted data.",
      }
    ),
    // Bulk import MCP tools
    bulkImportMcp: {
      title: i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.title', {
        defaultMessage: 'Bulk import MCP tools',
      }),
      description: i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.description', {
        defaultMessage:
          'Select an MCP server and import multiple tools at once to make them available in Agent Builder.',
      }),
      importToolsButton: i18n.translate(
        'xpack.agentBuilder.tools.bulkImportMcp.importToolsButton',
        {
          defaultMessage: 'Import tools',
        }
      ),
      cancelButton: i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.cancelButton', {
        defaultMessage: 'Cancel',
      }),
      sourceSection: {
        title: i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.sourceSection.title', {
          defaultMessage: 'Source',
        }),
        description: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.description',
          {
            defaultMessage: 'Select the MCP server and preview the tools available for import.',
          }
        ),
        mcpServerLabel: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.mcpServerLabel',
          {
            defaultMessage: 'MCP Server',
          }
        ),
        addMcpServerLink: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.addMcpServerLink',
          {
            defaultMessage: 'Add a new MCP server',
          }
        ),
        toolsToImportLabel: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.toolsToImportLabel',
          {
            defaultMessage: 'Tools to import',
          }
        ),
        nameColumn: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.nameColumn',
          {
            defaultMessage: 'Name',
          }
        ),
        searchPlaceholder: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.searchPlaceholder',
          {
            defaultMessage: 'Search tools',
          }
        ),
        selectedCount: (selected: number) =>
          i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.sourceSection.selectedCount', {
            defaultMessage: '{selected} Selected',
            values: { selected },
          }),
        clearSelection: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.clearSelection',
          {
            defaultMessage: 'Clear selection',
          }
        ),
        selectMcpServerMessage: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.selectMcpServerMessage',
          {
            defaultMessage: 'Select an MCP server to see available tools.',
          }
        ),
        noToolsMessage: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.noToolsMessage',
          {
            defaultMessage: 'No tools found on the selected MCP server.',
          }
        ),
        noMatchingToolsMessage: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.noMatchingToolsMessage',
          {
            defaultMessage: 'No tools match your search.',
          }
        ),
        loadingToolsMessage: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.loadingToolsMessage',
          {
            defaultMessage: 'Loading tools...',
          }
        ),
        toolsErrorMessage: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.toolsErrorMessage',
          {
            defaultMessage: 'Failed to load tools from the selected MCP server.',
          }
        ),
        tableCaption: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.sourceSection.tableCaption',
          {
            defaultMessage: 'MCP tools available for import',
          }
        ),
      },
      organizationSection: {
        title: i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.organizationSection.title', {
          defaultMessage: 'Organization',
        }),
        description: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.organizationSection.description',
          {
            defaultMessage: 'Choose how imported tools should be grouped and labeled.',
          }
        ),
        namespaceLabel: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.organizationSection.namespaceLabel',
          {
            defaultMessage: 'Namespace',
          }
        ),
        namespaceHelpText: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.organizationSection.namespaceHelpText',
          {
            defaultMessage: 'Minimum 1 character',
          }
        ),
        labelsLabel: i18n.translate(
          'xpack.agentBuilder.tools.bulkImportMcp.organizationSection.labelsLabel',
          {
            defaultMessage: 'Labels',
          }
        ),
      },
      importSuccessToast: (count: number) =>
        i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.importSuccessToast', {
          defaultMessage: 'Successfully imported {count, plural, one {# tool} other {# tools}}',
          values: { count },
        }),
      importErrorToast: i18n.translate('xpack.agentBuilder.tools.bulkImportMcp.importErrorToast', {
        defaultMessage: 'Failed to import MCP tools',
      }),
      noToolsSelectedError: i18n.translate(
        'xpack.agentBuilder.tools.bulkImportMcp.noToolsSelectedError',
        {
          defaultMessage: 'Please select at least one tool to import.',
        }
      ),
    },
    mcpClients: {
      title: i18n.translate('xpack.agentBuilder.mcpClients.title', {
        defaultMessage: 'MCP clients (OAuth)',
      }),
      description: i18n.translate('xpack.agentBuilder.mcpClients.description', {
        defaultMessage:
          'An MCP client enables agentic AI to securely interact with Elastic Cloud on your behalf. Agents can request access dynamically and act as delegated users.',
      }),
      breadcrumb: i18n.translate('xpack.agentBuilder.mcpClients.breadcrumb', {
        defaultMessage: 'MCP clients',
      }),
      addMcpClientButtonLabel: i18n.translate(
        'xpack.agentBuilder.mcpClients.addMcpClientButtonLabel',
        {
          defaultMessage: 'Add MCP client',
        }
      ),
      manageApplicationConnectionsButtonLabel: i18n.translate(
        'xpack.agentBuilder.mcpClients.manageApplicationConnectionsButtonLabel',
        {
          defaultMessage: 'Manage application connections',
        }
      ),
      searchMcpClientsPlaceholder: i18n.translate(
        'xpack.agentBuilder.mcpClients.searchMcpClientsPlaceholder',
        {
          defaultMessage: 'Search',
        }
      ),
      listMcpClientsErrorMessage: i18n.translate(
        'xpack.agentBuilder.mcpClients.listMcpClientsErrorMessage',
        {
          defaultMessage: 'Failed to fetch MCP clients',
        }
      ),
      noMcpClientsFoundMessage: i18n.translate(
        'xpack.agentBuilder.mcpClients.noMcpClientsFoundMessage',
        {
          defaultMessage: 'No MCP clients found.',
        }
      ),
      noMcpClientsPromptTitle: i18n.translate(
        'xpack.agentBuilder.mcpClients.noMcpClientsPromptTitle',
        {
          defaultMessage: 'No MCP clients (OAuth)',
        }
      ),
      noMcpClientsPromptBody: i18n.translate(
        'xpack.agentBuilder.mcpClients.noMcpClientsPromptBody',
        {
          defaultMessage: 'Get started with MCP clients (OAuth).',
        }
      ),
      noItemsPromptLearnMoreLinkLabel: i18n.translate(
        'xpack.agentBuilder.mcpClients.noItemsPromptLearnMoreLinkLabel',
        {
          defaultMessage: 'Learn more',
        }
      ),
      name: i18n.translate('xpack.agentBuilder.mcpClients.name', { defaultMessage: 'Name' }),
      connections: i18n.translate('xpack.agentBuilder.mcpClients.connections', {
        defaultMessage: 'Connections',
      }),
      status: i18n.translate('xpack.agentBuilder.mcpClients.status', {
        defaultMessage: 'Status',
      }),
      actionsColumnLabel: i18n.translate('xpack.agentBuilder.mcpClients.actions', {
        defaultMessage: 'Actions',
      }),
      statusFilter: i18n.translate('xpack.agentBuilder.mcpClients.statusFilter', {
        defaultMessage: 'Status',
      }),
      mcpClientsLabel: i18n.translate('xpack.agentBuilder.mcpClients.mcpClientsLabel', {
        defaultMessage: 'MCP clients',
      }),
      addMcpClientOAuthButtonLabel: i18n.translate(
        'xpack.agentBuilder.mcpClients.addMcpClientOAuthButtonLabel',
        {
          defaultMessage: 'Add MCP client (OAuth)',
        }
      ),
      actions: {
        ariaLabel: i18n.translate('xpack.agentBuilder.mcpClients.actions.ariaLabel', {
          defaultMessage: 'Actions',
        }),
        revoke: i18n.translate('xpack.agentBuilder.mcpClients.actions.revoke', {
          defaultMessage: 'Revoke',
        }),
      },
      form: {
        pageTitle: i18n.translate('xpack.agentBuilder.mcpClients.form.pageTitle', {
          defaultMessage: 'Create MCP client (OAuth)',
        }),
        pageDescription: i18n.translate('xpack.agentBuilder.mcpClients.form.pageDescription', {
          defaultMessage:
            'An MCP client enables agentic AI to securely interact with Elastic Cloud on your behalf. Agents can request access dynamically and act as delegated users.',
        }),
        createBreadcrumb: i18n.translate('xpack.agentBuilder.mcpClients.form.createBreadcrumb', {
          defaultMessage: 'Create MCP client',
        }),
        createButton: i18n.translate('xpack.agentBuilder.mcpClients.form.createButton', {
          defaultMessage: 'Create client',
        }),
        cancelButton: i18n.translate('xpack.agentBuilder.mcpClients.form.cancelButton', {
          defaultMessage: 'Cancel',
        }),
        nameLabel: i18n.translate('xpack.agentBuilder.mcpClients.form.nameLabel', {
          defaultMessage: 'Name',
        }),
        namePlaceholder: i18n.translate('xpack.agentBuilder.mcpClients.form.namePlaceholder', {
          defaultMessage: 'Enter a client name (e.g. Log Analysis Agent)',
        }),
        logoLabel: i18n.translate('xpack.agentBuilder.mcpClients.form.logoLabel', {
          defaultMessage: 'Client logo (optional)',
        }),
        selectLogoPlaceholder: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.selectLogoPlaceholder',
          {
            defaultMessage: 'Select logo',
          }
        ),
        defaultLogoBadge: i18n.translate('xpack.agentBuilder.mcpClients.form.defaultLogoBadge', {
          defaultMessage: 'Default',
        }),
        uploadLogoPrompt: i18n.translate('xpack.agentBuilder.mcpClients.form.uploadLogoPrompt', {
          defaultMessage: 'Drag and drop or click to upload',
        }),
        uploadLogoHelp: (maxSize: string) =>
          i18n.translate('xpack.agentBuilder.mcpClients.form.uploadLogoHelp', {
            defaultMessage: 'PNG, JPEG, or GIF. Max {maxSize}. Recommended size: 48x48.',
            values: { maxSize },
          }),
        uploadLogoInvalidType: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.uploadLogoInvalidType',
          {
            defaultMessage: 'Logo must be a PNG, JPEG, or GIF.',
          }
        ),
        uploadLogoTooLarge: (maxSize: string, actualSize: string) =>
          i18n.translate('xpack.agentBuilder.mcpClients.form.uploadLogoTooLarge', {
            defaultMessage: 'Logo must be {maxSize} or smaller. Selected file is {actualSize}.',
            values: { maxSize, actualSize },
          }),
        uploadLogoReadError: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.uploadLogoReadError',
          {
            defaultMessage: 'Could not read the selected file. Please try again.',
          }
        ),
        logoUploadPreview: i18n.translate('xpack.agentBuilder.mcpClients.form.logoUploadPreview', {
          defaultMessage: 'Selected logo: ',
        }),
        detailsSectionTitle: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.detailsSectionTitle',
          {
            defaultMessage: 'MCP details',
          }
        ),
        redirectSectionTitle: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.redirectSectionTitle',
          {
            defaultMessage: 'Redirect URI type',
          }
        ),
        redirectTypeLabel: i18n.translate('xpack.agentBuilder.mcpClients.form.redirectTypeLabel', {
          defaultMessage: 'Redirect URI type',
        }),
        redirectLocal: i18n.translate('xpack.agentBuilder.mcpClients.form.redirectLocal', {
          defaultMessage: 'Local',
        }),
        redirectLocalDescription: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.redirectLocalDescription',
          {
            defaultMessage: 'For applications running on your local machine.',
          }
        ),
        redirectRemote: i18n.translate('xpack.agentBuilder.mcpClients.form.redirectRemote', {
          defaultMessage: 'Remote',
        }),
        redirectRemoteDescription: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.redirectRemoteDescription',
          {
            defaultMessage: 'For hosted or cloud-based applications.',
          }
        ),
        localUrlsLabel: i18n.translate('xpack.agentBuilder.mcpClients.form.localUrlsLabel', {
          defaultMessage: 'Local URLs',
        }),
        localUrlsHelpText: i18n.translate('xpack.agentBuilder.mcpClients.form.localUrlsHelpText', {
          defaultMessage: 'For common local agent (Claude Desktop, Cursor etc) you can use:',
        }),
        remoteUrlsLabel: i18n.translate('xpack.agentBuilder.mcpClients.form.remoteUrlsLabel', {
          defaultMessage: 'Remote URL',
        }),
        remoteUrlsHelpText: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.remoteUrlsHelpText',
          {
            defaultMessage: 'Only HTTPS URLs are allowed.',
          }
        ),
        addLocalUrl: i18n.translate('xpack.agentBuilder.mcpClients.form.addLocalUrl', {
          defaultMessage: 'Add local URL',
        }),
        addRemoteUrl: i18n.translate('xpack.agentBuilder.mcpClients.form.addRemoteUrl', {
          defaultMessage: 'Add remote URL',
        }),
        removeUriAriaLabel: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.removeUriAriaLabel',
          {
            defaultMessage: 'Remove URL',
          }
        ),
        credentialsSectionTitle: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.credentialsSectionTitle',
          {
            defaultMessage: 'Client credentials',
          }
        ),
        credentialsSectionDescription: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.credentialsSectionDescription',
          {
            defaultMessage:
              'Client ID and server URL will be generated automatically when you create the client.',
          }
        ),
        confidentialLabel: i18n.translate('xpack.agentBuilder.mcpClients.form.confidentialLabel', {
          defaultMessage: 'Generate confidential MCP client (optional)',
        }),
        confidentialDescription: i18n.translate(
          'xpack.agentBuilder.mcpClients.form.confidentialDescription',
          {
            defaultMessage:
              'Make your MCP client confidential by generating a client secret. This is recommended for improved security.',
          }
        ),
        createSuccessToast: (name: string) =>
          i18n.translate('xpack.agentBuilder.mcpClients.form.createSuccessToast', {
            defaultMessage: 'MCP client "{name}" created successfully',
            values: { name },
          }),
        createErrorToast: i18n.translate('xpack.agentBuilder.mcpClients.form.createErrorToast', {
          defaultMessage: 'Failed to create MCP client',
        }),
      },
      revoke: {
        title: (name: string) =>
          i18n.translate('xpack.agentBuilder.mcpClients.revoke.title', {
            defaultMessage: 'Revoke {name}?',
            values: { name },
          }),
        warningTitle: i18n.translate('xpack.agentBuilder.mcpClients.revoke.warningTitle', {
          defaultMessage: 'Warning',
        }),
        confirmLabel: (name: string) =>
          i18n.translate('xpack.agentBuilder.mcpClients.revoke.confirmLabel', {
            defaultMessage: 'To confirm, type {name}',
            values: { name },
          }),
        confirmPlaceholder: i18n.translate(
          'xpack.agentBuilder.mcpClients.revoke.confirmPlaceholder',
          {
            defaultMessage: 'MCP client name',
          }
        ),
        revokeButton: i18n.translate('xpack.agentBuilder.mcpClients.revoke.revokeButton', {
          defaultMessage: 'Revoke',
        }),
        cancelButton: i18n.translate('xpack.agentBuilder.mcpClients.revoke.cancelButton', {
          defaultMessage: 'Cancel',
        }),
        successToast: (name: string) =>
          i18n.translate('xpack.agentBuilder.mcpClients.revoke.successToast', {
            defaultMessage: 'MCP client "{name}" revoked successfully',
            values: { name },
          }),
        errorToast: i18n.translate('xpack.agentBuilder.mcpClients.revoke.errorToast', {
          defaultMessage: 'Failed to revoke MCP client',
        }),
      },
    },
  },
  byAuthor: (author: string) =>
    i18n.translate('xpack.agentBuilder.byAuthor', {
      defaultMessage: 'By {author}',
      values: { author },
    }),
  skills: {
    libraryTitle: i18n.translate('xpack.agentBuilder.skills.libraryTitle', {
      defaultMessage: 'Skills library',
    }),
    title: i18n.translate('xpack.agentBuilder.skills.title', { defaultMessage: 'Skills' }),
    newSkillButton: i18n.translate('xpack.agentBuilder.skills.newSkillButton', {
      defaultMessage: 'New skill',
    }),
    newSkillTitle: i18n.translate('xpack.agentBuilder.skills.newSkillTitle', {
      defaultMessage: 'Create a new skill',
    }),
    editSkillTitle: i18n.translate('xpack.agentBuilder.skills.editSkillTitle', {
      defaultMessage: 'Edit skill',
    }),
    readOnly: i18n.translate('xpack.agentBuilder.skills.readOnly', {
      defaultMessage: 'Read-only',
    }),
    builtinLabel: i18n.translate('xpack.agentBuilder.skills.builtinLabel', {
      defaultMessage: 'Built-in',
    }),
    customLabel: i18n.translate('xpack.agentBuilder.skills.customLabel', {
      defaultMessage: 'Custom',
    }),
    skillsTableCaption: (skillsCount: number) =>
      i18n.translate('xpack.agentBuilder.skills.skillsTableCaption', {
        defaultMessage: 'Available skills for AI agents: {skillsCount} skills',
        values: { skillsCount },
      }),
    skillIdLabel: i18n.translate('xpack.agentBuilder.skills.idLabel', { defaultMessage: 'ID' }),
    nameLabel: i18n.translate('xpack.agentBuilder.skills.nameLabel', { defaultMessage: 'Name' }),
    descriptionLabel: i18n.translate('xpack.agentBuilder.skills.descriptionLabel', {
      defaultMessage: 'Description',
    }),
    contentLabel: i18n.translate('xpack.agentBuilder.skills.contentLabel', {
      defaultMessage: 'Instructions',
    }),
    toolsLabel: i18n.translate('xpack.agentBuilder.skills.toolsLabel', { defaultMessage: 'Tools' }),
    referencedContentLabel: i18n.translate('xpack.agentBuilder.skills.referencedContentLabel', {
      defaultMessage: 'Files',
    }),
    referencedFileCard: {
      skillNamePathPlaceholder: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileCard.skillNamePathPlaceholder',
        {
          defaultMessage: '(skill name)',
        }
      ),
      fileNameLabel: i18n.translate('xpack.agentBuilder.skills.referencedFileCard.fileNameLabel', {
        defaultMessage: 'File name',
      }),
      fileNameHelp: i18n.translate('xpack.agentBuilder.skills.referencedFileCard.fileNameHelp', {
        defaultMessage: 'Do not include .md — it is added automatically.',
      }),
      folderPathLabel: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileCard.folderPathLabel',
        {
          defaultMessage: 'Folder path',
        }
      ),
      folderPathHelp: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileCard.folderPathHelp',
        {
          defaultMessage: 'Start with ./ for the root directory. Example: ./templates',
        }
      ),
      fullPathPreview: (path: string) =>
        i18n.translate('xpack.agentBuilder.skills.referencedFileCard.fullPathPreview', {
          defaultMessage: 'Full path preview: {path}',
          values: { path },
        }),
      contentLabel: i18n.translate('xpack.agentBuilder.skills.referencedFileCard.contentLabel', {
        defaultMessage: 'Content',
      }),
      contentAriaLabel: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileCard.contentAriaLabel',
        {
          defaultMessage: 'Referenced file markdown content',
        }
      ),
      estimatedTokens: (count: number) =>
        i18n.translate('xpack.agentBuilder.skills.referencedFileCard.estimatedTokens', {
          defaultMessage: 'Estimated tokens: {count}',
          values: { count },
        }),
    },
    referencedFileSection: {
      description: i18n.translate('xpack.agentBuilder.skills.referencedFileSection.description', {
        defaultMessage:
          'Attach extra markdown files that belong to this skill. Paths are relative to the skill folder.',
      }),
      addFileButton: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileSection.addFileButton',
        {
          defaultMessage: 'Add file',
        }
      ),
      filesAddedCount: (current: number, max: number) =>
        i18n.translate('xpack.agentBuilder.skills.referencedFileSection.filesAddedCount', {
          defaultMessage: '({current}/{max} files added)',
          values: { current, max },
        }),
      removeFileAriaLabel: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileSection.removeFileAriaLabel',
        {
          defaultMessage: 'Remove this additional file',
        }
      ),
      emptyReadOnly: i18n.translate(
        'xpack.agentBuilder.skills.referencedFileSection.emptyReadOnly',
        {
          defaultMessage: 'This skill has no additional files.',
        }
      ),
      addFileButtonDisabledTooltip: (max: number) =>
        i18n.translate(
          'xpack.agentBuilder.skills.referencedFileSection.addFileButtonDisabledTooltip',
          {
            defaultMessage: 'You cannot add more than {max} additional files.',
            values: { max },
          }
        ),
      readOnlyFileAccordionAriaLabel: (path: string) =>
        i18n.translate(
          'xpack.agentBuilder.skills.referencedFileSection.readOnlyFileAccordionAriaLabel',
          {
            defaultMessage: 'Additional file {path}. Expand to view markdown content.',
            values: { path },
          }
        ),
    },
    typeLabel: i18n.translate('xpack.agentBuilder.skills.typeLabel', { defaultMessage: 'Type' }),
    saveButtonLabel: i18n.translate('xpack.agentBuilder.skills.saveButtonLabel', {
      defaultMessage: 'Save',
    }),
    cancelButtonLabel: i18n.translate('xpack.agentBuilder.skills.cancelButtonLabel', {
      defaultMessage: 'Cancel',
    }),
    saveButtonTooltip: i18n.translate('xpack.agentBuilder.skills.saveButtonTooltip', {
      defaultMessage: 'Resolve all form errors to save.',
    }),
    editSkillButtonLabel: i18n.translate('xpack.agentBuilder.skills.editSkillButtonLabel', {
      defaultMessage: 'Edit',
    }),
    viewSkillButtonLabel: i18n.translate('xpack.agentBuilder.skills.viewSkillButtonLabel', {
      defaultMessage: 'View',
    }),
    deleteSkillButtonLabel: i18n.translate('xpack.agentBuilder.skills.deleteSkillButtonLabel', {
      defaultMessage: 'Delete',
    }),
    skillContextMenuButtonLabel: i18n.translate(
      'xpack.agentBuilder.skills.skillContextMenuButtonLabel',
      {
        defaultMessage: 'Skill context menu',
      }
    ),
    searchSkillsPlaceholder: i18n.translate('xpack.agentBuilder.skills.searchSkillsPlaceholder', {
      defaultMessage: 'Search',
    }),
    noSkillsMatchMessage: i18n.translate('xpack.agentBuilder.skills.noSkillsMatchMessage', {
      defaultMessage: 'No skills match your search.',
    }),
    noSkillsMessage: i18n.translate('xpack.agentBuilder.skills.noSkillsMessage', {
      defaultMessage: "It looks like you don't have any custom skills defined yet.",
    }),
    listSkillsErrorMessage: i18n.translate('xpack.agentBuilder.skills.listSkillsErrorMessage', {
      defaultMessage: 'Failed to fetch skills',
    }),
    includeBuiltinSkillsSwitchLabel: i18n.translate(
      'xpack.agentBuilder.skills.includeBuiltinSkillsSwitchLabel',
      {
        defaultMessage: 'Include built-in skills',
      }
    ),
    deleteSkillSuccessToast: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.deleteSkillSuccessToast', {
        defaultMessage: 'Skill "{skillId}" deleted',
        values: { skillId },
      }),
    createSkillSuccessToast: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.createSkillSuccessToast', {
        defaultMessage: 'Skill "{skillId}" created',
        values: { skillId },
      }),
    editSkillSuccessToast: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.editSkillSuccessToast', {
        defaultMessage: 'Skill "{skillId}" updated',
        values: { skillId },
      }),
    deleteSkillErrorToast: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.deleteSkillErrorToast', {
        defaultMessage: 'Unable to delete skill "{skillId}"',
        values: { skillId },
      }),
    createSkillErrorToast: i18n.translate('xpack.agentBuilder.skills.createSkillErrorToast', {
      defaultMessage: 'Unable to create skill',
    }),
    editSkillErrorToast: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.editSkillErrorToast', {
        defaultMessage: 'Unable to update skill "{skillId}"',
        values: { skillId },
      }),
    loadSkillErrorToast: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.loadSkillErrorToast', {
        defaultMessage: 'Unable to load "{skillId}"',
        values: { skillId },
      }),
    loadSkillsErrorToast: i18n.translate('xpack.agentBuilder.skills.loadSkillsErrorToast', {
      defaultMessage: 'Unable to load skills',
    }),
    deleteSkillTitle: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.deleteSkillTitle', {
        defaultMessage: 'Delete {skillId}?',
        values: { skillId },
      }),
    deleteSkillCancelButton: i18n.translate('xpack.agentBuilder.skills.deleteSkillCancelButton', {
      defaultMessage: 'Cancel',
    }),
    deleteSkillConfirmButton: i18n.translate('xpack.agentBuilder.skills.deleteSkillConfirmButton', {
      defaultMessage: 'Delete skill',
    }),
    deleteSkillConfirmationText: i18n.translate(
      'xpack.agentBuilder.skills.deleteSkillConfirmationText',
      {
        defaultMessage: 'This action will permanently remove the skill. This cannot be undone.',
      }
    ),
    deleteSkillUsedByAgentsTitle: (skillId: string) =>
      i18n.translate('xpack.agentBuilder.skills.deleteSkillUsedByAgentsTitle', {
        defaultMessage: 'Skill "{skillId}" is used by agents',
        values: { skillId },
      }),
    deleteSkillUsedByAgentsDescription: i18n.translate(
      'xpack.agentBuilder.skills.deleteSkillUsedByAgentsDescription',
      {
        defaultMessage: 'Remove this skill from all agents that use it and delete the skill?',
      }
    ),
    deleteSkillUsedByAgentsAgentListLabel: i18n.translate(
      'xpack.agentBuilder.skills.deleteSkillUsedByAgentsAgentListLabel',
      {
        defaultMessage: 'Agents using this skill',
      }
    ),
    deleteSkillUsedByAgentsAgentList: (agentNames: string[]) => agentNames.join(', '),
    deleteSkillUsedByAgentsConfirmButton: i18n.translate(
      'xpack.agentBuilder.skills.deleteSkillUsedByAgentsConfirmButton',
      {
        defaultMessage: 'Yes, remove and delete',
      }
    ),
    deleteSkillUsedByAgentsCancelButton: i18n.translate(
      'xpack.agentBuilder.skills.deleteSkillUsedByAgentsCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    toolIdsLabel: i18n.translate('xpack.agentBuilder.skills.toolIdsLabel', {
      defaultMessage: 'Associated tools',
    }),
    toolIdsHelpText: i18n.translate('xpack.agentBuilder.skills.toolIdsHelpText', {
      defaultMessage: 'Select tools that this skill can use.',
    }),
    experimentalLabel: i18n.translate('xpack.agentBuilder.skills.experimentalLabel', {
      defaultMessage: 'Experimental',
    }),
  },
  agentSkills: {
    pageDescription: i18n.translate('xpack.agentBuilder.agentSkills.pageDescription', {
      defaultMessage:
        'Capabilities that help the agent analyze data, generate queries, and perform tasks.',
    }),
    addSkillButton: i18n.translate('xpack.agentBuilder.agentSkills.addSkillButton', {
      defaultMessage: 'Add skill',
    }),
    importFromLibraryMenuItem: i18n.translate(
      'xpack.agentBuilder.agentSkills.importFromLibraryMenuItem',
      {
        defaultMessage: 'Import from skill library',
      }
    ),
    createSkillMenuItem: i18n.translate('xpack.agentBuilder.agentSkills.createSkillMenuItem', {
      defaultMessage: 'Create a skill',
    }),
    createFromChatButton: i18n.translate('xpack.agentBuilder.agentSkills.createFromChatButton', {
      defaultMessage: 'Create from chat',
    }),
    searchActiveSkillsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentSkills.searchActiveSkillsPlaceholder',
      {
        defaultMessage: 'Search active skills',
      }
    ),
    addSkillFromLibraryTitle: i18n.translate(
      'xpack.agentBuilder.agentSkills.addSkillFromLibraryTitle',
      {
        defaultMessage: 'Add skill from library',
      }
    ),
    manageSkillLibraryLink: i18n.translate(
      'xpack.agentBuilder.agentSkills.manageSkillLibraryLink',
      {
        defaultMessage: 'Manage skill library',
      }
    ),
    searchAvailableSkillsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentSkills.searchAvailableSkillsPlaceholder',
      {
        defaultMessage: 'Search available skills',
      }
    ),
    addButtonLabel: i18n.translate('xpack.agentBuilder.agentSkills.addButtonLabel', {
      defaultMessage: 'Add',
    }),
    editSkillAriaLabel: i18n.translate('xpack.agentBuilder.agentSkills.editSkillAriaLabel', {
      defaultMessage: 'Edit skill',
    }),
    removeSkillAriaLabel: i18n.translate('xpack.agentBuilder.agentSkills.removeSkillAriaLabel', {
      defaultMessage: 'Remove skill from agent',
    }),
    noActiveSkillsMessage: i18n.translate('xpack.agentBuilder.agentSkills.noActiveSkillsMessage', {
      defaultMessage: 'No skills assigned to this agent yet. Add skills from the library.',
    }),
    noActiveSkillsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentSkills.noActiveSkillsMatchMessage',
      {
        defaultMessage: 'No active skills match your search.',
      }
    ),
    noAvailableSkillsMessage: i18n.translate(
      'xpack.agentBuilder.agentSkills.noAvailableSkillsMessage',
      {
        defaultMessage: 'All skills have been added to this agent.',
      }
    ),
    noAvailableSkillsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentSkills.noAvailableSkillsMatchMessage',
      {
        defaultMessage: 'No available skills match your search.',
      }
    ),
    removeSkillSuccessToast: (skillName: string) =>
      i18n.translate('xpack.agentBuilder.agentSkills.removeSkillSuccessToast', {
        defaultMessage: 'Skill "{skillName}" removed from agent',
        values: { skillName },
      }),
    addSkillSuccessToast: (skillName: string) =>
      i18n.translate('xpack.agentBuilder.agentSkills.addSkillSuccessToast', {
        defaultMessage: 'Skill "{skillName}" added to agent',
        values: { skillName },
      }),
    updateSkillsErrorToast: i18n.translate(
      'xpack.agentBuilder.agentSkills.updateSkillsErrorToast',
      {
        defaultMessage: 'Unable to update agent skills',
      }
    ),
    editSkillFlyoutTitle: i18n.translate('xpack.agentBuilder.agentSkills.editSkillFlyoutTitle', {
      defaultMessage: 'Edit skill',
    }),
    createSkillFlyoutTitle: i18n.translate(
      'xpack.agentBuilder.agentSkills.createSkillFlyoutTitle',
      {
        defaultMessage: 'Create skill',
      }
    ),
    viewSkillLibraryLink: i18n.translate('xpack.agentBuilder.agentSkills.viewSkillLibraryLink', {
      defaultMessage: 'View skill library',
    }),
    sharedSkillWarning: i18n.translate('xpack.agentBuilder.agentSkills.sharedSkillWarning', {
      defaultMessage:
        'You are editing a shared skill. Changes will affect all users using this skill.',
    }),
    newSkillLibraryInfo: i18n.translate('xpack.agentBuilder.agentSkills.newSkillLibraryInfo', {
      defaultMessage:
        'This skill will be added to your library and be available for other agents to use.',
    }),
    advancedOptionsLabel: i18n.translate('xpack.agentBuilder.agentSkills.advancedOptionsLabel', {
      defaultMessage: 'Advanced options',
    }),
    allSkillsSummary: (showing: number, total: number) =>
      i18n.translate('xpack.agentBuilder.agentSkills.allSkillsSummary', {
        defaultMessage: 'Showing {showing} of {total} {total, plural, one {Skill} other {Skills}}',
        values: { showing, total },
      }),
    removeSkillButtonLabel: i18n.translate(
      'xpack.agentBuilder.agentSkills.removeSkillButtonLabel',
      {
        defaultMessage: 'Remove',
      }
    ),
    skillDetailInstructionsLabel: i18n.translate(
      'xpack.agentBuilder.agentSkills.skillDetailInstructionsLabel',
      {
        defaultMessage: 'Instructions',
      }
    ),
    noSkillSelectedMessage: i18n.translate(
      'xpack.agentBuilder.agentSkills.noSkillSelectedMessage',
      {
        defaultMessage: 'Select a skill to view details.',
      }
    ),
    removeSkillConfirmTitle: (skillName: string) =>
      i18n.translate('xpack.agentBuilder.agentSkills.removeSkillConfirmTitle', {
        defaultMessage: 'Remove "{skillName}" from agent?',
        values: { skillName },
      }),
    removeSkillConfirmBody: i18n.translate(
      'xpack.agentBuilder.agentSkills.removeSkillConfirmBody',
      {
        defaultMessage: 'The skill will no longer be available to this agent.',
      }
    ),
    removeSkillConfirmButton: i18n.translate(
      'xpack.agentBuilder.agentSkills.removeSkillConfirmButton',
      {
        defaultMessage: 'Remove',
      }
    ),
    removeSkillCancelButton: i18n.translate(
      'xpack.agentBuilder.agentSkills.removeSkillCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    elasticCapabilitiesManagedTooltip: i18n.translate(
      'xpack.agentBuilder.agentSkills.elasticCapabilitiesManagedTooltip',
      {
        defaultMessage:
          'This built-in skill is automatically included because Elastic Capabilities is enabled for this agent.',
      }
    ),
    elasticCapabilitiesReadOnlyBadge: i18n.translate(
      'xpack.agentBuilder.agentSkills.elasticCapabilitiesReadOnlyBadge',
      {
        defaultMessage: 'Auto',
      }
    ),
    readOnlyBadge: i18n.translate('xpack.agentBuilder.agentSkills.readOnlyBadge', {
      defaultMessage: 'Read only',
    }),
    autoIncludedBadgeLabel: i18n.translate(
      'xpack.agentBuilder.agentSkills.autoIncludedBadgeLabel',
      {
        defaultMessage: 'Auto-included',
      }
    ),
    autoIncludedTooltipTitle: i18n.translate(
      'xpack.agentBuilder.agentSkills.autoIncludedTooltipTitle',
      {
        defaultMessage: 'Added automatically from agent settings',
      }
    ),
    autoIncludedTooltipBody: i18n.translate(
      'xpack.agentBuilder.agentSkills.autoIncludedTooltipBody',
      {
        defaultMessage: 'Turn off auto-include built-in skills to manage it yourself',
      }
    ),
    elasticCapabilitiesCallout: i18n.translate(
      'xpack.agentBuilder.agentSkills.elasticCapabilitiesCallout',
      {
        defaultMessage:
          'Built-in skills are automatically included while Elastic Capabilities is enabled.',
      }
    ),
    manageAllSkills: i18n.translate('xpack.agentBuilder.agentSkills.manageAllSkillsLink', {
      defaultMessage: 'Manage all skills',
    }),
    emptyStateTitle: i18n.translate('xpack.agentBuilder.agentSkills.emptyStateTitle', {
      defaultMessage: 'No skills added yet',
    }),
    emptyStateLearnMoreSuffix: i18n.translate(
      'xpack.agentBuilder.agentSkills.emptyStateLearnMoreSuffix',
      {
        defaultMessage: ' about skills.',
      }
    ),
    emptyStateAddButton: i18n.translate('xpack.agentBuilder.agentSkills.emptyStateAddButton', {
      defaultMessage: 'Add skills',
    }),
    emptyStateFooter: i18n.translate('xpack.agentBuilder.agentSkills.emptyStateFooter', {
      defaultMessage: 'Skills are free - no additional credits used. Remove anytime.',
    }),
  },
  agentPlugins: {
    pageDescription: i18n.translate('xpack.agentBuilder.agentPlugins.pageDescription', {
      defaultMessage: 'Pre-built packages that bundle multiple capabilities into a single install.',
    }),
    installPluginButton: i18n.translate('xpack.agentBuilder.agentPlugins.installPluginButton', {
      defaultMessage: 'Install plugin',
    }),
    fromUrlOrZipMenuItem: i18n.translate('xpack.agentBuilder.agentPlugins.fromUrlOrZipMenuItem', {
      defaultMessage: 'From URL or ZIP',
    }),
    fromLibraryMenuItem: i18n.translate('xpack.agentBuilder.agentPlugins.fromLibraryMenuItem', {
      defaultMessage: 'From library',
    }),
    searchActivePluginsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentPlugins.searchActivePluginsPlaceholder',
      {
        defaultMessage: 'Search active plugins',
      }
    ),
    noActivePluginsMessage: i18n.translate(
      'xpack.agentBuilder.agentPlugins.noActivePluginsMessage',
      {
        defaultMessage:
          'No plugins assigned to this agent yet. Install or add plugins from the library.',
      }
    ),
    noActivePluginsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentPlugins.noActivePluginsMatchMessage',
      {
        defaultMessage: 'No active plugins match your search.',
      }
    ),
    removePluginButtonLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.removePluginButtonLabel',
      {
        defaultMessage: 'Remove',
      }
    ),
    removePluginAriaLabel: i18n.translate('xpack.agentBuilder.agentPlugins.removePluginAriaLabel', {
      defaultMessage: 'Remove plugin from agent',
    }),
    removePluginConfirmTitle: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.agentPlugins.removePluginConfirmTitle', {
        defaultMessage: 'Remove "{pluginName}" from agent?',
        values: { pluginName },
      }),
    removePluginConfirmBody: i18n.translate(
      'xpack.agentBuilder.agentPlugins.removePluginConfirmBody',
      {
        defaultMessage: 'The plugin and its skills will no longer be available to this agent.',
      }
    ),
    removePluginConfirmButton: i18n.translate(
      'xpack.agentBuilder.agentPlugins.removePluginConfirmButton',
      {
        defaultMessage: 'Remove',
      }
    ),
    removePluginCancelButton: i18n.translate(
      'xpack.agentBuilder.agentPlugins.removePluginCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    addPluginSuccessToast: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.agentPlugins.addPluginSuccessToast', {
        defaultMessage: 'Plugin "{pluginName}" added to agent',
        values: { pluginName },
      }),
    removePluginSuccessToast: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.agentPlugins.removePluginSuccessToast', {
        defaultMessage: 'Plugin "{pluginName}" removed from agent',
        values: { pluginName },
      }),
    updatePluginsErrorToast: i18n.translate(
      'xpack.agentBuilder.agentPlugins.updatePluginsErrorToast',
      {
        defaultMessage: 'Unable to update agent plugins',
      }
    ),
    noPluginSelectedMessage: i18n.translate(
      'xpack.agentBuilder.agentPlugins.noPluginSelectedMessage',
      {
        defaultMessage: 'Select a plugin to view details.',
      }
    ),
    skillsCountBadge: (count: number) =>
      i18n.translate('xpack.agentBuilder.agentPlugins.skillsCountBadge', {
        defaultMessage: '{count} {count, plural, one {Skill} other {Skills}}',
        values: { count },
      }),
    addPluginFromLibraryTitle: i18n.translate(
      'xpack.agentBuilder.agentPlugins.addPluginFromLibraryTitle',
      {
        defaultMessage: 'Add plugin from library',
      }
    ),
    managePluginLibraryLink: i18n.translate(
      'xpack.agentBuilder.agentPlugins.managePluginLibraryLink',
      {
        defaultMessage: 'Manage plugin library',
      }
    ),
    searchAvailablePluginsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentPlugins.searchAvailablePluginsPlaceholder',
      {
        defaultMessage: 'Search available plugins',
      }
    ),
    noAvailablePluginsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentPlugins.noAvailablePluginsMatchMessage',
      {
        defaultMessage: 'No available plugins match your search.',
      }
    ),
    noAvailablePluginsMessage: i18n.translate(
      'xpack.agentBuilder.agentPlugins.noAvailablePluginsMessage',
      {
        defaultMessage: 'All plugins have been added to this agent.',
      }
    ),
    skillDetailInstalledVia: (source: string) =>
      i18n.translate('xpack.agentBuilder.agentPlugins.skillDetailInstalledVia', {
        defaultMessage: 'Installed via {source}',
        values: { source },
      }),
    pluginDetailIdLabel: i18n.translate('xpack.agentBuilder.agentPlugins.pluginDetailIdLabel', {
      defaultMessage: 'Plugin ID',
    }),
    pluginDetailIdCopyLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.pluginDetailIdCopyLabel',
      {
        defaultMessage: 'Copy plugin ID',
      }
    ),
    pluginDetailNameLabel: i18n.translate('xpack.agentBuilder.agentPlugins.pluginDetailNameLabel', {
      defaultMessage: 'Name',
    }),
    pluginDetailDescriptionLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.pluginDetailDescriptionLabel',
      {
        defaultMessage: 'Description',
      }
    ),
    pluginDetailSkillsLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.pluginDetailSkillsLabel',
      {
        defaultMessage: 'Skills included',
      }
    ),
    pluginDetailAuthorLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.pluginDetailAuthorLabel',
      {
        defaultMessage: 'Author',
      }
    ),
    pluginDetailSourceLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.pluginDetailSourceLabel',
      {
        defaultMessage: 'Source',
      }
    ),
    pluginDetailInstructionsLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.pluginDetailInstructionsLabel',
      {
        defaultMessage: 'Instructions',
      }
    ),
    installPluginFlyoutTitle: i18n.translate(
      'xpack.agentBuilder.agentPlugins.installPluginFlyoutTitle',
      {
        defaultMessage: 'Install plugin...',
      }
    ),
    installPluginUrlTab: i18n.translate('xpack.agentBuilder.agentPlugins.installPluginUrlTab', {
      defaultMessage: 'URL',
    }),
    installPluginUploadTab: i18n.translate(
      'xpack.agentBuilder.agentPlugins.installPluginUploadTab',
      {
        defaultMessage: 'Upload ZIP',
      }
    ),
    autoBadge: i18n.translate('xpack.agentBuilder.agentPlugins.autoBadge', {
      defaultMessage: 'Auto',
    }),
    autoPluginManagedTooltip: i18n.translate(
      'xpack.agentBuilder.agentPlugins.autoPluginManagedTooltip',
      {
        defaultMessage:
          'This plugin is automatically included while Elastic Capabilities is enabled.',
      }
    ),
    autoIncludedBadgeLabel: i18n.translate(
      'xpack.agentBuilder.agentPlugins.autoIncludedBadgeLabel',
      {
        defaultMessage: 'Auto-included',
      }
    ),
    autoIncludedTooltipTitle: i18n.translate(
      'xpack.agentBuilder.agentPlugins.autoIncludedTooltipTitle',
      {
        defaultMessage: 'Added automatically from agent settings',
      }
    ),
    autoIncludedTooltipBody: i18n.translate(
      'xpack.agentBuilder.agentPlugins.autoIncludedTooltipBody',
      {
        defaultMessage: 'Turn off auto-include built-in plugins to manage it yourself',
      }
    ),
    manageAllPlugins: i18n.translate('xpack.agentBuilder.agentPlugins.manageAllSkillsLink', {
      defaultMessage: 'Manage all plugins',
    }),
    emptyStateTitle: i18n.translate('xpack.agentBuilder.agentPlugins.emptyStateTitle', {
      defaultMessage: 'No plugins added yet',
    }),
    emptyStateLearnMoreSuffix: i18n.translate(
      'xpack.agentBuilder.agentPlugins.emptyStateLearnMoreSuffix',
      {
        defaultMessage: ' about plugins.',
      }
    ),
    emptyStateAddButton: i18n.translate('xpack.agentBuilder.agentPlugins.emptyStateAddButton', {
      defaultMessage: 'Add plugins',
    }),
    emptyStateFooter: i18n.translate('xpack.agentBuilder.agentPlugins.emptyStateFooter', {
      defaultMessage: 'Plugins are free - no additional credits used. Remove anytime.',
    }),
  },
  agentConnectors: {
    emptyStateTitle: i18n.translate('xpack.agentBuilder.agentConnectors.emptyStateTitle', {
      defaultMessage: 'No connectors assigned yet',
    }),
    emptyStateDescription: i18n.translate(
      'xpack.agentBuilder.agentConnectors.emptyStateDescription',
      {
        defaultMessage:
          'Connectors let your agent reach into external systems like Slack, Jira, and PagerDuty, so responses are grounded in real data from your environment.',
      }
    ),
    emptyStateLearnMoreSuffix: i18n.translate(
      'xpack.agentBuilder.agentConnectors.emptyStateLearnMoreSuffix',
      { defaultMessage: ' about connectors.' }
    ),
    emptyStateAddButton: i18n.translate('xpack.agentBuilder.agentConnectors.emptyStateAddButton', {
      defaultMessage: 'Add connector',
    }),
    emptyStateManageAll: i18n.translate('xpack.agentBuilder.agentConnectors.emptyStateManageAll', {
      defaultMessage: 'Manage all connectors',
    }),
    addConnectorFromLibraryTitle: i18n.translate(
      'xpack.agentBuilder.agentConnectors.library.title',
      { defaultMessage: 'Add connector' }
    ),
    manageConnectorLibraryLink: i18n.translate(
      'xpack.agentBuilder.agentConnectors.library.manageLink',
      { defaultMessage: 'Manage connector library' }
    ),
    searchAvailableConnectorsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentConnectors.library.searchPlaceholder',
      { defaultMessage: 'Search connectors' }
    ),
    noAvailableConnectorsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentConnectors.library.noMatchMessage',
      { defaultMessage: 'No connectors match your search.' }
    ),
    noAvailableConnectorsMessage: i18n.translate(
      'xpack.agentBuilder.agentConnectors.library.noItemsMessage',
      { defaultMessage: 'No connectors available.' }
    ),
    removeConnectorButtonLabel: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.removeButton',
      { defaultMessage: 'Remove' }
    ),
    removeConnectorConfirmTitle: (name: string) =>
      i18n.translate('xpack.agentBuilder.agentConnectors.detail.removeConfirmTitle', {
        defaultMessage: 'Remove {name}',
        values: { name },
      }),
    removeConnectorConfirmBody: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.removeConfirmBody',
      { defaultMessage: 'This connector will no longer be available to this agent.' }
    ),
    removeConnectorConfirmButton: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.removeConfirmButton',
      { defaultMessage: 'Remove' }
    ),
    removeConnectorCancelButton: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.removeCancelButton',
      { defaultMessage: 'Cancel' }
    ),
    subActionsSectionTitle: (count: number) =>
      i18n.translate('xpack.agentBuilder.agentConnectors.detail.subActionsSectionTitle', {
        defaultMessage: 'Sub-actions ({count} available)',
        values: { count },
      }),
    connectionSectionTitle: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.connectionSectionTitle',
      { defaultMessage: 'Connection' }
    ),
    oauthConnectedStatus: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.oauthConnectedStatus',
      { defaultMessage: 'OAuth connected' }
    ),
    oauthDisconnectedStatus: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.oauthDisconnectedStatus',
      { defaultMessage: 'OAuth disconnected' }
    ),
    missingSecretsStatus: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.missingSecretsStatus',
      { defaultMessage: 'Missing credentials' }
    ),
    sharedCredentialsStatus: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.sharedCredentialsStatus',
      { defaultMessage: 'Shared credentials' }
    ),
    authenticateLink: i18n.translate('xpack.agentBuilder.agentConnectors.detail.authenticateLink', {
      defaultMessage: 'Authenticate',
    }),
    reauthenticateLink: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.reauthenticateLink',
      { defaultMessage: 'Re-authenticate' }
    ),
    usedBySectionTitle: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.usedBySectionTitle',
      { defaultMessage: 'Used by' }
    ),
    usedByAgentsMessage: (count: number) =>
      i18n.translate('xpack.agentBuilder.agentConnectors.detail.usedByAgentsMessage', {
        defaultMessage: '{count} other {count, plural, one {agent} other {agents}}',
        values: { count },
      }),
    notUsedByOtherAgents: i18n.translate(
      'xpack.agentBuilder.agentConnectors.detail.notUsedByOtherAgents',
      { defaultMessage: 'Not used by other agents' }
    ),
    usedByLoadError: i18n.translate('xpack.agentBuilder.agentConnectors.detail.usedByLoadError', {
      defaultMessage: 'Failed to load agents',
    }),
  },
  agentTools: {
    pageDescription: i18n.translate('xpack.agentBuilder.agentTools.pageDescription', {
      defaultMessage:
        'Modular, reusable Elasticsearch operations. Agents use them to search, retrieve, and analyze your data.',
    }),
    addToolButton: i18n.translate('xpack.agentBuilder.agentTools.addToolButton', {
      defaultMessage: 'Add tool',
    }),
    fromLibraryMenuItem: i18n.translate('xpack.agentBuilder.agentTools.fromLibraryMenuItem', {
      defaultMessage: 'From library',
    }),
    createNewToolMenuItem: i18n.translate('xpack.agentBuilder.agentTools.createNewToolMenuItem', {
      defaultMessage: 'Create new tool',
    }),
    searchActiveToolsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentTools.searchActiveToolsPlaceholder',
      {
        defaultMessage: 'Search active tools',
      }
    ),
    noActiveToolsMessage: i18n.translate('xpack.agentBuilder.agentTools.noActiveToolsMessage', {
      defaultMessage:
        'No tools assigned to this agent yet. Add tools from the library or create a new one.',
    }),
    noActiveToolsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentTools.noActiveToolsMatchMessage',
      {
        defaultMessage: 'No active tools match your search.',
      }
    ),
    removeToolButtonLabel: i18n.translate('xpack.agentBuilder.agentTools.removeToolButtonLabel', {
      defaultMessage: 'Remove',
    }),
    removeToolAriaLabel: i18n.translate('xpack.agentBuilder.agentTools.removeToolAriaLabel', {
      defaultMessage: 'Remove tool from agent',
    }),
    removeToolConfirmTitle: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.agentTools.removeToolConfirmTitle', {
        defaultMessage: 'Remove "{toolId}" from agent?',
        values: { toolId },
      }),
    removeToolConfirmBody: i18n.translate('xpack.agentBuilder.agentTools.removeToolConfirmBody', {
      defaultMessage: 'The tool will no longer be available to this agent.',
    }),
    removeToolConfirmButton: i18n.translate(
      'xpack.agentBuilder.agentTools.removeToolConfirmButton',
      {
        defaultMessage: 'Remove',
      }
    ),
    removeToolCancelButton: i18n.translate('xpack.agentBuilder.agentTools.removeToolCancelButton', {
      defaultMessage: 'Cancel',
    }),
    addToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.agentTools.addToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" added to agent',
        values: { toolId },
      }),
    removeToolSuccessToast: (toolId: string) =>
      i18n.translate('xpack.agentBuilder.agentTools.removeToolSuccessToast', {
        defaultMessage: 'Tool "{toolId}" removed from agent',
        values: { toolId },
      }),
    updateToolsErrorToast: i18n.translate('xpack.agentBuilder.agentTools.updateToolsErrorToast', {
      defaultMessage: 'Unable to update agent tools',
    }),
    noToolSelectedMessage: i18n.translate('xpack.agentBuilder.agentTools.noToolSelectedMessage', {
      defaultMessage: 'Select a tool to view details.',
    }),
    readOnlyBadge: i18n.translate('xpack.agentBuilder.agentTools.readOnlyBadge', {
      defaultMessage: 'Read only',
    }),
    addToolFromLibraryTitle: i18n.translate(
      'xpack.agentBuilder.agentTools.addToolFromLibraryTitle',
      {
        defaultMessage: 'Add tool from library',
      }
    ),
    manageToolLibraryLink: i18n.translate('xpack.agentBuilder.agentTools.manageToolLibraryLink', {
      defaultMessage: 'Manage tool library',
    }),
    editInLibraryLink: i18n.translate('xpack.agentBuilder.agentTools.editInLibraryLink', {
      defaultMessage: 'Edit in library',
    }),
    searchAvailableToolsPlaceholder: i18n.translate(
      'xpack.agentBuilder.agentTools.searchAvailableToolsPlaceholder',
      {
        defaultMessage: 'Search available tools',
      }
    ),
    noAvailableToolsMatchMessage: i18n.translate(
      'xpack.agentBuilder.agentTools.noAvailableToolsMatchMessage',
      {
        defaultMessage: 'No available tools match your search.',
      }
    ),
    noAvailableToolsMessage: i18n.translate(
      'xpack.agentBuilder.agentTools.noAvailableToolsMessage',
      {
        defaultMessage: 'All tools have been added to this agent.',
      }
    ),
    toolDetailIdLabel: i18n.translate('xpack.agentBuilder.agentTools.toolDetailIdLabel', {
      defaultMessage: 'ID',
    }),
    toolDetailTypeLabel: i18n.translate('xpack.agentBuilder.agentTools.toolDetailTypeLabel', {
      defaultMessage: 'Type',
    }),
    toolDetailDescriptionLabel: i18n.translate(
      'xpack.agentBuilder.agentTools.toolDetailDescriptionLabel',
      {
        defaultMessage: 'Description',
      }
    ),
    toolDetailTagsLabel: i18n.translate('xpack.agentBuilder.agentTools.toolDetailTagsLabel', {
      defaultMessage: 'Tags',
    }),
    noTagsLabel: i18n.translate('xpack.agentBuilder.agentTools.noTagsLabel', {
      defaultMessage: 'No tags',
    }),
    autoIncludedTooltip: i18n.translate('xpack.agentBuilder.agentTools.autoIncludedTooltip', {
      defaultMessage: 'This tool is automatically included and cannot be removed.',
    }),
    autoIncludedBadgeLabel: i18n.translate('xpack.agentBuilder.agentTools.autoIncludedBadgeLabel', {
      defaultMessage: 'Auto-included',
    }),
    autoIncludedTooltipTitle: i18n.translate(
      'xpack.agentBuilder.agentTools.autoIncludedTooltipTitle',
      {
        defaultMessage: 'Added automatically from agent settings',
      }
    ),
    autoIncludedTooltipBody: i18n.translate(
      'xpack.agentBuilder.agentTools.autoIncludedTooltipBody',
      {
        defaultMessage: 'Turn off auto-include built-in tools to manage it yourself',
      }
    ),
    elasticCapabilitiesManagedTooltip: i18n.translate(
      'xpack.agentBuilder.agentTools.elasticCapabilitiesManagedTooltip',
      {
        defaultMessage:
          'This built-in tool is automatically included because Elastic Capabilities is enabled for this agent.',
      }
    ),
    elasticCapabilitiesReadOnlyBadge: i18n.translate(
      'xpack.agentBuilder.agentTools.elasticCapabilitiesReadOnlyBadge',
      {
        defaultMessage: 'Auto',
      }
    ),
    elasticCapabilitiesCallout: i18n.translate(
      'xpack.agentBuilder.agentTools.elasticCapabilitiesCallout',
      {
        defaultMessage:
          'Built-in tools are automatically included while Elastic Capabilities is enabled.',
      }
    ),
    manageAllTools: i18n.translate('xpack.agentBuilder.agentTools.manageAllToolsLink', {
      defaultMessage: 'Manage all tools',
    }),
    emptyStateTitle: i18n.translate('xpack.agentBuilder.agentTools.emptyStateTitle', {
      defaultMessage: 'No tools added yet',
    }),
    emptyStateLearnMoreSuffix: i18n.translate(
      'xpack.agentBuilder.agentTools.emptyStateLearnMoreSuffix',
      {
        defaultMessage: ' about tools.',
      }
    ),
    emptyStateAddButton: i18n.translate('xpack.agentBuilder.agentTools.emptyStateAddButton', {
      defaultMessage: 'Add tools',
    }),
    emptyStateFooter: i18n.translate('xpack.agentBuilder.agentTools.emptyStateFooter', {
      defaultMessage: 'Tools are free - no additional credits used. Remove anytime.',
    }),
  },
  plugins: {
    libraryTitle: i18n.translate('xpack.agentBuilder.plugins.libraryTitle', {
      defaultMessage: 'Plugins library',
    }),
    title: i18n.translate('xpack.agentBuilder.plugins.title', { defaultMessage: 'Plugins' }),
    pluginsTableCaption: (pluginsCount: number) =>
      i18n.translate('xpack.agentBuilder.plugins.pluginsTableCaption', {
        defaultMessage: 'Plugins: {pluginsCount} plugins',
        values: { pluginsCount },
      }),
    nameLabel: i18n.translate('xpack.agentBuilder.plugins.nameLabel', {
      defaultMessage: 'Name',
    }),
    descriptionLabel: i18n.translate('xpack.agentBuilder.plugins.descriptionLabel', {
      defaultMessage: 'Description',
    }),
    versionLabel: i18n.translate('xpack.agentBuilder.plugins.versionLabel', {
      defaultMessage: 'Version',
    }),
    skillsLabel: i18n.translate('xpack.agentBuilder.plugins.skillsLabel', {
      defaultMessage: 'Skills',
    }),
    sourceLabel: i18n.translate('xpack.agentBuilder.plugins.sourceLabel', {
      defaultMessage: 'Source',
    }),
    searchPluginsPlaceholder: i18n.translate(
      'xpack.agentBuilder.plugins.searchPluginsPlaceholder',
      {
        defaultMessage: 'Search plugins',
      }
    ),
    noPluginsMatchMessage: i18n.translate('xpack.agentBuilder.plugins.noPluginsMatchMessage', {
      defaultMessage: 'No plugins match your search',
    }),
    noPluginsMessage: i18n.translate('xpack.agentBuilder.plugins.noPluginsMessage', {
      defaultMessage: 'No plugins installed',
    }),
    listPluginsErrorMessage: i18n.translate('xpack.agentBuilder.plugins.listPluginsErrorMessage', {
      defaultMessage: 'Failed to fetch plugins',
    }),
    loadPluginsErrorToast: i18n.translate('xpack.agentBuilder.plugins.loadPluginsErrorToast', {
      defaultMessage: 'Unable to load plugins',
    }),
    deletePluginSuccessToast: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.plugins.deletePluginSuccessToast', {
        defaultMessage: 'Plugin "{pluginName}" deleted',
        values: { pluginName },
      }),
    deletePluginErrorToast: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.plugins.deletePluginErrorToast', {
        defaultMessage: 'Unable to delete plugin "{pluginName}"',
        values: { pluginName },
      }),
    deletePluginTitle: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.plugins.deletePluginTitle', {
        defaultMessage: 'Delete {pluginName}?',
        values: { pluginName },
      }),
    deletePluginCancelButton: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    deletePluginConfirmButton: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginConfirmButton',
      {
        defaultMessage: 'Delete plugin',
      }
    ),
    deletePluginConfirmationText: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginConfirmationText',
      {
        defaultMessage:
          'This will permanently remove the plugin and all its managed skills. This cannot be undone.',
      }
    ),
    deletePluginUsedByAgentsTitle: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.plugins.deletePluginUsedByAgentsTitle', {
        defaultMessage: 'Plugin "{pluginName}" is used by agents',
        values: { pluginName },
      }),
    deletePluginUsedByAgentsDescription: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginUsedByAgentsDescription',
      {
        defaultMessage:
          "Remove this plugin's skills from all agents that use them and delete the plugin?",
      }
    ),
    deletePluginUsedByAgentsAgentListLabel: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginUsedByAgentsAgentListLabel',
      {
        defaultMessage: 'Agents using this plugin',
      }
    ),
    deletePluginUsedByAgentsAgentList: (agentNames: string[]) => agentNames.join(', '),
    deletePluginUsedByAgentsConfirmButton: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginUsedByAgentsConfirmButton',
      {
        defaultMessage: 'Yes, remove and delete',
      }
    ),
    deletePluginUsedByAgentsCancelButton: i18n.translate(
      'xpack.agentBuilder.plugins.deletePluginUsedByAgentsCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    pluginContextMenuButtonLabel: i18n.translate(
      'xpack.agentBuilder.plugins.pluginContextMenuButtonLabel',
      {
        defaultMessage: 'Plugin context menu',
      }
    ),
    deletePluginButtonLabel: i18n.translate('xpack.agentBuilder.plugins.deletePluginButtonLabel', {
      defaultMessage: 'Delete',
    }),
    installPluginButton: i18n.translate('xpack.agentBuilder.plugins.installPluginButton', {
      defaultMessage: 'Install plugin',
    }),
    installFromUrlMenuItem: i18n.translate('xpack.agentBuilder.plugins.installFromUrlMenuItem', {
      defaultMessage: 'Install from URL',
    }),
    uploadMenuItem: i18n.translate('xpack.agentBuilder.plugins.uploadMenuItem', {
      defaultMessage: 'Upload ZIP',
    }),
    installFromUrlModalTitle: i18n.translate(
      'xpack.agentBuilder.plugins.installFromUrlModalTitle',
      {
        defaultMessage: 'Install plugin from URL',
      }
    ),
    uploadPluginModalTitle: i18n.translate('xpack.agentBuilder.plugins.uploadPluginModalTitle', {
      defaultMessage: 'Upload plugin',
    }),
    urlFieldLabel: i18n.translate('xpack.agentBuilder.plugins.urlFieldLabel', {
      defaultMessage: 'Plugin URL',
    }),
    urlFieldPlaceholder: i18n.translate('xpack.agentBuilder.plugins.urlFieldPlaceholder', {
      defaultMessage: 'https://github.com/...',
    }),
    fileFieldLabel: i18n.translate('xpack.agentBuilder.plugins.fileFieldLabel', {
      defaultMessage: 'Plugin ZIP file',
    }),
    installButton: i18n.translate('xpack.agentBuilder.plugins.installButton', {
      defaultMessage: 'Install',
    }),
    cancelButton: i18n.translate('xpack.agentBuilder.plugins.cancelButton', {
      defaultMessage: 'Cancel',
    }),
    installPluginSuccessToast: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.plugins.installPluginSuccessToast', {
        defaultMessage: 'Plugin "{pluginName}" installed',
        values: { pluginName },
      }),
    installPluginErrorToast: i18n.translate('xpack.agentBuilder.plugins.installPluginErrorToast', {
      defaultMessage: 'Failed to install plugin',
    }),
    uploadPluginSuccessToast: (pluginName: string) =>
      i18n.translate('xpack.agentBuilder.plugins.uploadPluginSuccessToast', {
        defaultMessage: 'Plugin "{pluginName}" installed',
        values: { pluginName },
      }),
    uploadPluginErrorToast: i18n.translate('xpack.agentBuilder.plugins.uploadPluginErrorToast', {
      defaultMessage: 'Failed to upload plugin',
    }),
    readOnly: i18n.translate('xpack.agentBuilder.plugins.readOnly', {
      defaultMessage: 'Built-in plugin (read-only)',
    }),
    viewPluginButtonLabel: i18n.translate('xpack.agentBuilder.plugins.viewPluginButtonLabel', {
      defaultMessage: 'View',
    }),
    pluginDetailsTitle: i18n.translate('xpack.agentBuilder.plugins.pluginDetailsTitle', {
      defaultMessage: 'Plugin details',
    }),
    backToPluginsButton: i18n.translate('xpack.agentBuilder.plugins.backToPluginsButton', {
      defaultMessage: 'Back to plugins',
    }),
    idLabel: i18n.translate('xpack.agentBuilder.plugins.idLabel', {
      defaultMessage: 'ID',
    }),
    authorLabel: i18n.translate('xpack.agentBuilder.plugins.authorLabel', {
      defaultMessage: 'Author',
    }),
    noSkillsLabel: i18n.translate('xpack.agentBuilder.plugins.noSkillsLabel', {
      defaultMessage: 'None',
    }),
    identitySectionTitle: i18n.translate('xpack.agentBuilder.plugins.identitySectionTitle', {
      defaultMessage: 'Identity',
    }),
    identitySectionDescription: i18n.translate(
      'xpack.agentBuilder.plugins.identitySectionDescription',
      {
        defaultMessage: 'Core identifiers and version information for the plugin.',
      }
    ),
    aboutSectionTitle: i18n.translate('xpack.agentBuilder.plugins.aboutSectionTitle', {
      defaultMessage: 'About',
    }),
    aboutSectionDescription: i18n.translate('xpack.agentBuilder.plugins.aboutSectionDescription', {
      defaultMessage: 'Description and authorship information.',
    }),
    sourceSectionTitle: i18n.translate('xpack.agentBuilder.plugins.sourceSectionTitle', {
      defaultMessage: 'Source',
    }),
    sourceSectionDescription: i18n.translate(
      'xpack.agentBuilder.plugins.sourceSectionDescription',
      {
        defaultMessage: 'Where the plugin was installed from.',
      }
    ),
    skillsSectionTitle: i18n.translate('xpack.agentBuilder.plugins.skillsSectionTitle', {
      defaultMessage: 'Skills',
    }),
    skillsSectionDescription: i18n.translate(
      'xpack.agentBuilder.plugins.skillsSectionDescription',
      {
        defaultMessage: 'Skills provided by this plugin.',
      }
    ),
    loadPluginErrorToast: (pluginId: string) =>
      i18n.translate('xpack.agentBuilder.plugins.loadPluginErrorToast', {
        defaultMessage: 'Unable to load "{pluginId}"',
        values: { pluginId },
      }),
  },
  connectors: {
    libraryTitle: i18n.translate('xpack.agentBuilder.connectors.libraryTitle', {
      defaultMessage: 'Connectors library',
    }),
    title: i18n.translate('xpack.agentBuilder.connectors.title', {
      defaultMessage: 'Connectors',
    }),
    pageDescription: i18n.translate('xpack.agentBuilder.connectors.pageDescription', {
      defaultMessage:
        'Manage connectors for your agents. Connectors with workflow definitions will automatically create tools when configured.',
    }),
    createButton: i18n.translate('xpack.agentBuilder.connectors.createButton', {
      defaultMessage: 'Create connector',
    }),

    // Table columns
    nameColumn: i18n.translate('xpack.agentBuilder.connectors.column.name', {
      defaultMessage: 'Name',
    }),
    typeColumn: i18n.translate('xpack.agentBuilder.connectors.column.type', {
      defaultMessage: 'Type',
    }),
    statusColumn: i18n.translate('xpack.agentBuilder.connectors.column.status', {
      defaultMessage: 'Status',
    }),
    statusAuthorized: i18n.translate('xpack.agentBuilder.connectors.status.authorized', {
      defaultMessage: 'Authorized',
    }),
    statusNotAuthorized: i18n.translate('xpack.agentBuilder.connectors.status.notAuthorized', {
      defaultMessage: 'Not authorized',
    }),
    statusNotAuthorizedTooltip: i18n.translate(
      'xpack.agentBuilder.connectors.status.notAuthorizedTooltip',
      {
        defaultMessage: 'Click to authorize via OAuth',
      }
    ),
    statusEarsDisabled: i18n.translate('xpack.agentBuilder.connectors.status.earsDisabled', {
      defaultMessage: 'Disabled',
    }),
    statusEarsDisabledTooltip: i18n.translate(
      'xpack.agentBuilder.connectors.status.earsDisabledTooltip',
      {
        defaultMessage:
          'EARS authentication is disabled. Enable it via xpack.actions.auth.ears.enabled in kibana.yml.',
      }
    ),
    statusFilter: i18n.translate('xpack.agentBuilder.connectors.statusFilter', {
      defaultMessage: 'Status',
    }),
    connectorsLabel: i18n.translate('xpack.agentBuilder.connectors.connectorsLabel', {
      defaultMessage: 'Connectors',
    }),

    // Table
    tableCaption: (count: number) =>
      i18n.translate('xpack.agentBuilder.connectors.tableCaption', {
        defaultMessage: 'Available connectors: {count} connectors',
        values: { count },
      }),
    noConnectorsMessage: i18n.translate('xpack.agentBuilder.connectors.noConnectorsMessage', {
      defaultMessage: "It looks like you don't have any connectors configured yet.",
    }),
    noConnectorsMatchMessage: i18n.translate(
      'xpack.agentBuilder.connectors.noConnectorsMatchMessage',
      {
        defaultMessage: 'No connectors match your search.',
      }
    ),
    listConnectorsErrorMessage: i18n.translate(
      'xpack.agentBuilder.connectors.listConnectorsErrorMessage',
      {
        defaultMessage: 'Failed to fetch connectors',
      }
    ),

    // Search
    searchConnectorsPlaceholder: i18n.translate(
      'xpack.agentBuilder.connectors.searchConnectorsPlaceholder',
      {
        defaultMessage: 'Search',
      }
    ),
    typeFilter: i18n.translate('xpack.agentBuilder.connectors.typeFilter', {
      defaultMessage: 'Type',
    }),

    // Actions
    editConnectorButtonLabel: i18n.translate(
      'xpack.agentBuilder.connectors.editConnectorButtonLabel',
      {
        defaultMessage: 'Edit',
      }
    ),
    deleteConnectorButtonLabel: i18n.translate(
      'xpack.agentBuilder.connectors.deleteConnectorButtonLabel',
      {
        defaultMessage: 'Delete',
      }
    ),
    connectorContextMenuButtonLabel: i18n.translate(
      'xpack.agentBuilder.connectors.connectorContextMenuButtonLabel',
      {
        defaultMessage: 'Connector context menu',
      }
    ),

    // OAuth
    authorizeButtonLabel: i18n.translate('xpack.agentBuilder.connectors.authorizeButtonLabel', {
      defaultMessage: 'Authorize',
    }),
    cancelAuthorizationButtonLabel: i18n.translate(
      'xpack.agentBuilder.connectors.cancelAuthorizationButtonLabel',
      {
        defaultMessage: 'Cancel authorization',
      }
    ),
    disconnectButtonLabel: i18n.translate('xpack.agentBuilder.connectors.disconnectButtonLabel', {
      defaultMessage: 'Disconnect',
    }),
    disconnectConfirmTitle: (name: string) =>
      i18n.translate('xpack.agentBuilder.connectors.disconnectConfirmTitle', {
        defaultMessage: 'Disconnect {name}?',
        values: { name },
      }),
    disconnectConfirmMessage: i18n.translate(
      'xpack.agentBuilder.connectors.disconnectConfirmMessage',
      {
        defaultMessage: 'You will need to re-authorize to use this connector again.',
      }
    ),
    disconnectConfirmButton: i18n.translate(
      'xpack.agentBuilder.connectors.disconnectConfirmButton',
      {
        defaultMessage: 'Disconnect',
      }
    ),
    disconnectCancelButton: i18n.translate('xpack.agentBuilder.connectors.disconnectCancelButton', {
      defaultMessage: 'Cancel',
    }),
    oauthConnectSuccessTitle: i18n.translate(
      'xpack.agentBuilder.connectors.oauthConnectSuccessTitle',
      {
        defaultMessage: 'Authorization successful',
      }
    ),
    oauthConnectSuccessMessage: i18n.translate(
      'xpack.agentBuilder.connectors.oauthConnectSuccessMessage',
      {
        defaultMessage: 'Your connector has been authorized successfully.',
      }
    ),
    oauthConnectErrorTitle: i18n.translate('xpack.agentBuilder.connectors.oauthConnectErrorTitle', {
      defaultMessage: 'Authorization failed',
    }),
    oauthDisconnectSuccessTitle: i18n.translate(
      'xpack.agentBuilder.connectors.oauthDisconnectSuccessTitle',
      {
        defaultMessage: 'Disconnected',
      }
    ),
    oauthDisconnectSuccessMessage: i18n.translate(
      'xpack.agentBuilder.connectors.oauthDisconnectSuccessMessage',
      {
        defaultMessage: 'Your connector has been disconnected from OAuth.',
      }
    ),
    oauthDisconnectErrorTitle: i18n.translate(
      'xpack.agentBuilder.connectors.oauthDisconnectErrorTitle',
      {
        defaultMessage: 'Disconnect failed',
      }
    ),

    // Bulk actions
    deleteSelectedConnectorsButtonLabel: (count: number) =>
      i18n.translate('xpack.agentBuilder.connectors.deleteSelectedConnectorsButtonLabel', {
        defaultMessage: 'Delete {count, plural, one {# Connector} other {# Connectors}}',
        values: { count },
      }),
    selectAllConnectorsButtonLabel: i18n.translate(
      'xpack.agentBuilder.connectors.selectAllConnectorsButtonLabel',
      {
        defaultMessage: 'Select all',
      }
    ),
    clearSelectionButtonLabel: i18n.translate(
      'xpack.agentBuilder.connectors.clearSelectionButtonLabel',
      {
        defaultMessage: 'Clear selection',
      }
    ),
    assignButtonLabel: i18n.translate('xpack.agentBuilder.connectors.assignButtonLabel', {
      defaultMessage: 'Assign',
    }),
    chooseConnectorPlaceholder: i18n.translate(
      'xpack.agentBuilder.connectors.chooseConnectorPlaceholder',
      { defaultMessage: 'Choose a connector' }
    ),
    addExistingConnectorFlyoutTitle: i18n.translate(
      'xpack.agentBuilder.connectors.addExistingConnectorFlyoutTitle',
      { defaultMessage: 'Add existing connector' }
    ),
    cancelButtonLabel: i18n.translate('xpack.agentBuilder.connectors.cancelButtonLabel', {
      defaultMessage: 'Cancel',
    }),
    assignConnectorSuccessToast: i18n.translate(
      'xpack.agentBuilder.connectors.assignConnectorSuccessToast',
      { defaultMessage: 'Connector added' }
    ),
    assignConnectorErrorToast: i18n.translate(
      'xpack.agentBuilder.connectors.assignConnectorErrorToast',
      { defaultMessage: 'Failed to add connector' }
    ),

    // Delete modal
    deleteConnectorTitle: (name: string) =>
      i18n.translate('xpack.agentBuilder.connectors.deleteConnectorTitle', {
        defaultMessage: 'Delete {name}?',
        values: { name },
      }),
    deleteConnectorCancelButton: i18n.translate(
      'xpack.agentBuilder.connectors.deleteConnectorCancelButton',
      {
        defaultMessage: 'Cancel',
      }
    ),
    deleteConnectorConfirmButton: i18n.translate(
      'xpack.agentBuilder.connectors.deleteConnectorConfirmButton',
      {
        defaultMessage: 'Delete connector',
      }
    ),
    deleteConnectorConfirmationText: i18n.translate(
      'xpack.agentBuilder.connectors.deleteConnectorConfirmationText',
      {
        defaultMessage: 'This action will permanently remove the connector. This cannot be undone.',
      }
    ),

    // Bulk delete modal
    bulkDeleteConnectorsTitle: (count: number) =>
      i18n.translate('xpack.agentBuilder.connectors.bulkDeleteConnectorsTitle', {
        defaultMessage: 'Delete {count, plural, one {# connector} other {# connectors}}?',
        values: { count },
      }),
    bulkDeleteConnectorsConfirmButton: (count: number) =>
      i18n.translate('xpack.agentBuilder.connectors.bulkDeleteConnectorsConfirmButton', {
        defaultMessage: 'Delete {count, plural, one {# connector} other {# connectors}}',
        values: { count },
      }),
    bulkDeleteConnectorsConfirmationText: i18n.translate(
      'xpack.agentBuilder.connectors.bulkDeleteConnectorsConfirmationText',
      {
        defaultMessage: "You can't recover deleted connectors.",
      }
    ),

    // Toasts
    deleteConnectorSuccessToast: (name: string) =>
      i18n.translate('xpack.agentBuilder.connectors.deleteConnectorSuccessToast', {
        defaultMessage: 'Connector "{name}" deleted',
        values: { name },
      }),
    deleteConnectorErrorToast: (name: string) =>
      i18n.translate('xpack.agentBuilder.connectors.deleteConnectorErrorToast', {
        defaultMessage: 'Unable to delete connector "{name}"',
        values: { name },
      }),
    bulkDeleteConnectorsSuccessToast: (count: number) =>
      i18n.translate('xpack.agentBuilder.connectors.bulkDeleteConnectorsSuccessToast', {
        defaultMessage: 'Deleted {count, plural, one {# connector} other {# connectors}}',
        values: { count },
      }),
    bulkDeleteConnectorsErrorToast: (count: number) =>
      i18n.translate('xpack.agentBuilder.connectors.bulkDeleteConnectorsErrorToast', {
        defaultMessage: 'Unable to delete {count, plural, one {# connector} other {# connectors}}',
        values: { count },
      }),

    // Agent connectors page
    manageAllLink: i18n.translate('xpack.agentBuilder.agentConnectors.manageAllLink', {
      defaultMessage: 'Manage all connectors',
    }),
    addConnectorPopoverLabel: i18n.translate(
      'xpack.agentBuilder.agentConnectors.addConnectorPopoverLabel',
      { defaultMessage: 'Add connector options' }
    ),
    addConnectorButton: i18n.translate('xpack.agentBuilder.agentConnectors.addConnectorButton', {
      defaultMessage: 'Add connector',
    }),
    fromLibraryMenuItem: i18n.translate('xpack.agentBuilder.agentConnectors.fromLibraryMenuItem', {
      defaultMessage: 'From library',
    }),
    createNewMenuItem: i18n.translate('xpack.agentBuilder.agentConnectors.createNewMenuItem', {
      defaultMessage: 'Create new connector',
    }),
    searchPlaceholder: i18n.translate('xpack.agentBuilder.agentConnectors.searchPlaceholder', {
      defaultMessage: 'Search active connectors',
    }),
    noMatchMessage: i18n.translate('xpack.agentBuilder.agentConnectors.noMatchMessage', {
      defaultMessage: 'No connectors match your search.',
    }),
    noConnectorsAssignedMessage: i18n.translate(
      'xpack.agentBuilder.agentConnectors.noConnectorsAssignedMessage',
      {
        defaultMessage: 'No connectors assigned yet.',
      }
    ),
    noSelectionMessage: i18n.translate('xpack.agentBuilder.agentConnectors.noSelectionMessage', {
      defaultMessage: 'Select a connector to view details',
    }),
  },
  agents: {
    title: i18n.translate('xpack.agentBuilder.agents.list.title', { defaultMessage: 'Agents' }),
    newAgent: i18n.translate('xpack.agentBuilder.agents.new.title', {
      defaultMessage: 'New Agent',
    }),
    editAgent: i18n.translate('xpack.agentBuilder.agents.edit.title', {
      defaultMessage: 'Edit Agent',
    }),
    createAgent: i18n.translate('xpack.agentBuilder.agents.create.title', {
      defaultMessage: 'Create Agent',
    }),
    settings: {
      cancelButtonLabel: i18n.translate(
        'xpack.agentBuilder.agents.form.settings.cancelButtonLabel',
        {
          defaultMessage: 'Cancel',
        }
      ),
    },
  },
  agentOverview: {
    autoIncludeEnabledToast: i18n.translate(
      'xpack.agentBuilder.overview.autoInclude.enabledToast',
      {
        defaultMessage: 'Built-in capabilities enabled',
      }
    ),
    autoIncludeDisabledToast: i18n.translate(
      'xpack.agentBuilder.overview.autoInclude.disabledToast',
      {
        defaultMessage: 'Built-in capabilities disabled',
      }
    ),
    autoIncludeErrorToast: i18n.translate('xpack.agentBuilder.overview.autoInclude.errorToast', {
      defaultMessage: 'Unable to update capabilities setting',
    }),
    instructionsSavedToast: i18n.translate('xpack.agentBuilder.overview.instructions.savedToast', {
      defaultMessage: 'Instructions saved',
    }),
    instructionsErrorToast: i18n.translate('xpack.agentBuilder.overview.instructions.errorToast', {
      defaultMessage: 'Unable to save instructions',
    }),
    docsLink: i18n.translate('xpack.agentBuilder.overview.docsLink', {
      defaultMessage: 'Docs',
    }),
    editDetailsButton: i18n.translate('xpack.agentBuilder.overview.editDetailsButton', {
      defaultMessage: 'Edit agent settings',
    }),
    readMore: i18n.translate('xpack.agentBuilder.overview.description.readMore', {
      defaultMessage: 'Read more',
    }),
    readLess: i18n.translate('xpack.agentBuilder.overview.description.readLess', {
      defaultMessage: 'Read less',
    }),
    capabilitiesTitle: i18n.translate('xpack.agentBuilder.overview.capabilities.title', {
      defaultMessage: 'Capabilities',
    }),
    capabilitiesDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.description',
      {
        defaultMessage: 'Manage the capabilities this agent uses to perform tasks and activities.',
      }
    ),
    skillsDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.skillsDescription',
      {
        defaultMessage: 'Combine prompts and tools into reusable logic your agent can invoke.',
      }
    ),
    skillsOnboardingDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.skillsOnboardingDescription',
      {
        defaultMessage:
          "Turn your agent into a specialist. Skills let you define exactly how your agent approaches specific tasks, so it follows your team's process every time instead of giving generic answers.",
      }
    ),
    addSkill: i18n.translate('xpack.agentBuilder.overview.capabilities.addSkill', {
      defaultMessage: 'Add a skill',
    }),
    customizeSkills: i18n.translate('xpack.agentBuilder.overview.capabilities.customizeSkills', {
      defaultMessage: 'Customize',
    }),
    pluginsDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.pluginsDescription',
      {
        defaultMessage:
          'Add packaged sets of skills from external sources to quickly extend your agent.',
      }
    ),
    pluginsOnboardingDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.pluginsOnboardingDescription',
      {
        defaultMessage:
          'Extend your agent in one step. Plugins are ready-made packages that add a set of related skills to your agent, so you can get up and running without building each capability individually.',
      }
    ),
    addPlugin: i18n.translate('xpack.agentBuilder.overview.capabilities.addPlugin', {
      defaultMessage: 'Add a plugin',
    }),
    customizePlugins: i18n.translate('xpack.agentBuilder.overview.capabilities.customizePlugins', {
      defaultMessage: 'Customize',
    }),
    toolsCapabilityLabel: (count: number) =>
      i18n.translate('xpack.agentBuilder.overview.capabilities.tools', {
        defaultMessage: '{count, plural, one {Tool} other {Tools}}',
        values: { count },
      }),
    toolsDescription: i18n.translate('xpack.agentBuilder.overview.capabilities.toolsDescription', {
      defaultMessage:
        'Expose callable functions and integrations your agent can use while responding.',
    }),
    toolsOnboardingDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.toolsOnboardingDescription',
      {
        defaultMessage:
          'Give your agent ways to act. Tools let it search data, run workflows, and reach connected services instead of answering from memory alone.',
      }
    ),
    customizeTools: i18n.translate('xpack.agentBuilder.overview.capabilities.customizeTools', {
      defaultMessage: 'Customize',
    }),
    connectorsDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.connectorsDescription',
      {
        defaultMessage: 'Connect external services to give your agent access to data and actions.',
      }
    ),
    connectorsOnboardingDescription: i18n.translate(
      'xpack.agentBuilder.overview.capabilities.connectorsOnboardingDescription',
      {
        defaultMessage:
          'Bring your data into the conversation. Connectors let your agent reach into external systems like Slack, Jira, and PagerDuty, so responses are grounded in real data from your environment.',
      }
    ),
    addConnector: i18n.translate('xpack.agentBuilder.overview.capabilities.addConnector', {
      defaultMessage: 'Add a connector',
    }),
    settingsTitle: i18n.translate('xpack.agentBuilder.overview.settings.title', {
      defaultMessage: 'Settings',
    }),
    settingsDescription: i18n.translate('xpack.agentBuilder.overview.settings.description', {
      defaultMessage: 'Configure how this agent behaves and how its capabilities are managed.',
    }),
    autoIncludeTitle: i18n.translate('xpack.agentBuilder.overview.settings.autoIncludeTitle', {
      defaultMessage: 'Include built-in capabilities automatically',
    }),
    autoIncludeDescription: i18n.translate(
      'xpack.agentBuilder.overview.settings.autoIncludeDescription',
      {
        defaultMessage:
          'Automatically include all current and future Elastic-built skills, plugins, and tools. Turn off to manage them manually.',
      }
    ),
    autoIncludeLabel: i18n.translate('xpack.agentBuilder.overview.settings.autoIncludeLabel', {
      defaultMessage: 'Include built-in capabilities automatically',
    }),
    instructionsTitle: i18n.translate('xpack.agentBuilder.overview.settings.instructionsTitle', {
      defaultMessage: 'Use custom instructions',
    }),
    instructionsDescription: i18n.translate(
      'xpack.agentBuilder.overview.settings.instructionsDescription',
      {
        defaultMessage:
          'Define how the agent should behave, what it should prioritize, and any rules it should follow when responding.',
      }
    ),
    instructionsPlaceholder: i18n.translate(
      'xpack.agentBuilder.overview.settings.instructionsPlaceholder',
      {
        defaultMessage: 'No custom instructions.',
      }
    ),
    saveInstructionsButton: i18n.translate(
      'xpack.agentBuilder.overview.settings.saveInstructionsButton',
      {
        defaultMessage: 'Save instructions',
      }
    ),
    createdByElastic: i18n.translate('xpack.agentBuilder.overview.createdByElastic', {
      defaultMessage: 'Elastic',
    }),
    byAuthor: (author: string) =>
      i18n.translate('xpack.agentBuilder.overview.byAuthor', {
        defaultMessage: 'By {author}',
        values: { author },
      }),
    agentId: (id: string) =>
      i18n.translate('xpack.agentBuilder.overview.agentId', {
        defaultMessage: 'ID {id}',
        values: { id },
      }),
    copyIdAriaLabel: i18n.translate('xpack.agentBuilder.overview.copyIdAriaLabel', {
      defaultMessage: 'Copy agent ID',
    }),
    skillsLabel: (count: number) =>
      i18n.translate('xpack.agentBuilder.overview.capabilities.skills', {
        defaultMessage: '{count, plural, one {Skill} other {Skills}}',
        values: { count },
      }),
    pluginsLabel: (count: number) =>
      i18n.translate('xpack.agentBuilder.overview.capabilities.plugins', {
        defaultMessage: '{count, plural, one {Plugin} other {Plugins}}',
        values: { count },
      }),
    connectorsLabel: (count: number) =>
      i18n.translate('xpack.agentBuilder.overview.capabilities.connectors', {
        defaultMessage: '{count, plural, one {Connector} other {Connectors}}',
        values: { count },
      }),
    customizationsTitle: i18n.translate('xpack.agentBuilder.overview.customizations.title', {
      defaultMessage: 'Customizations',
    }),
    customInstructionsTitle: i18n.translate(
      'xpack.agentBuilder.overview.customizations.instructionsTitle',
      {
        defaultMessage: 'Custom instructions',
      }
    ),
    customInstructionsSubtitle: i18n.translate(
      'xpack.agentBuilder.overview.customizations.instructionsOnboardingText',
      {
        defaultMessage: 'Shape how the agent responds to questions and tasks.',
      }
    ),
    addInstructionsLink: i18n.translate(
      'xpack.agentBuilder.overview.customizations.addInstructionsLink',
      {
        defaultMessage: 'Add instructions',
      }
    ),
    agentSettingsCardTitle: i18n.translate(
      'xpack.agentBuilder.overview.customizations.agentSettingsTitle',
      {
        defaultMessage: 'Agent settings',
      }
    ),
    agentSettingsCardSubtitle: i18n.translate(
      'xpack.agentBuilder.overview.customizations.agentSettingsSubtitle',
      {
        defaultMessage: 'Control how your agent behaves.',
      }
    ),
    autoIncludeInfoTooltip: i18n.translate(
      'xpack.agentBuilder.overview.customizations.autoIncludeInfoTooltip',
      {
        defaultMessage:
          'Automatically include all current and future Elastic-built skills, plugins, and tools. Turn off to manage them manually.',
      }
    ),
    enabledBadge: i18n.translate('xpack.agentBuilder.overview.customizations.enabledBadge', {
      defaultMessage: 'Enabled',
    }),
    notSetBadge: i18n.translate('xpack.agentBuilder.overview.customizations.notSetBadge', {
      defaultMessage: 'Not set',
    }),
    preExecutionWorkflowTitle: i18n.translate(
      'xpack.agentBuilder.overview.customizations.preExecutionWorkflowTitle',
      { defaultMessage: 'Pre-execution workflows' }
    ),
    editDetails: {
      successToast: i18n.translate('xpack.agentBuilder.overview.editDetails.successToast', {
        defaultMessage: 'Agent details updated',
      }),
      errorToast: i18n.translate('xpack.agentBuilder.overview.editDetails.errorToast', {
        defaultMessage: 'Unable to update agent details',
      }),
      title: i18n.translate('xpack.agentBuilder.overview.editDetails.title', {
        defaultMessage: 'Edit agent settings',
      }),
      sharedWarningPrefix: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.sharedWarningPrefix',
        { defaultMessage: "You're editing a " }
      ),
      sharedWarningBadge: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.sharedWarningBadge',
        { defaultMessage: 'Shared agent' }
      ),
      sharedWarningSuffix: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.sharedWarningSuffix',
        { defaultMessage: '. Changes will affect all users.' }
      ),
      identificationTitle: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.identificationTitle',
        { defaultMessage: 'Identification' }
      ),
      identificationDescription: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.identificationDescription',
        { defaultMessage: 'Define how this agent is named and described.' }
      ),
      nameLabel: i18n.translate('xpack.agentBuilder.overview.editDetails.nameLabel', {
        defaultMessage: 'Agent name',
      }),
      nameRequired: i18n.translate('xpack.agentBuilder.overview.editDetails.nameRequired', {
        defaultMessage: 'Agent name is required.',
      }),
      descriptionLabel: i18n.translate('xpack.agentBuilder.overview.editDetails.descriptionLabel', {
        defaultMessage: 'Description',
      }),
      descriptionRequired: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.descriptionRequired',
        { defaultMessage: 'Description is required.' }
      ),
      avatarSymbolLabel: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.avatarSymbolLabel',
        { defaultMessage: 'Avatar symbol' }
      ),
      avatarSymbolPlaceholder: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.avatarSymbolPlaceholder',
        { defaultMessage: 'Paste an emoji or use a two letter abbreviation' }
      ),
      avatarColorLabel: i18n.translate('xpack.agentBuilder.overview.editDetails.avatarColorLabel', {
        defaultMessage: 'Avatar color',
      }),
      avatarColorInvalid: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.avatarColorInvalid',
        { defaultMessage: 'Enter a color hex code' }
      ),
      avatarColorPlaceholder: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.avatarColorPlaceholder',
        { defaultMessage: 'Enter a color hex code' }
      ),
      accessTitle: i18n.translate('xpack.agentBuilder.overview.editDetails.accessTitle', {
        defaultMessage: 'Access control',
      }),
      accessDescription: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.accessDescription',
        { defaultMessage: 'Control who can view and edit this agent.' }
      ),
      accessControlModeLabel: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.accessControlModeLabel',
        {
          defaultMessage: 'Access control',
        }
      ),
      accessControlModeDisabledReason: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.accessControlModeDisabledReason',
        {
          defaultMessage: 'Only the owner or an administrator can change the access control mode.',
        }
      ),
      accessControlModeAriaLabel: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.accessControlModeAriaLabel',
        { defaultMessage: 'Agent access control mode' }
      ),
      customizationTitle: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.customizationTitle',
        { defaultMessage: 'Customization' }
      ),
      customizationDescription: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.customizationDescription',
        { defaultMessage: 'Control how your agent behaves.' }
      ),
      autoIncludeTitle: i18n.translate('xpack.agentBuilder.overview.editDetails.autoIncludeTitle', {
        defaultMessage: 'Include built-in capabilities automatically',
      }),
      autoIncludeDescription: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.autoIncludeDescription',
        {
          defaultMessage:
            'Automatically include all current and future Elastic-built skills, plugins, and tools. Turn off to manage them manually.',
        }
      ),
      autoIncludeLabel: i18n.translate('xpack.agentBuilder.overview.editDetails.autoIncludeLabel', {
        defaultMessage: 'Include built-in capabilities automatically',
      }),
      workflowTitle: i18n.translate('xpack.agentBuilder.overview.editDetails.workflowTitle', {
        defaultMessage: 'Pre-execution workflow',
      }),
      workflowDescription: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.workflowDescription',
        {
          defaultMessage:
            'Workflows that run automatically when the agent starts, preparing context before it responds.',
        }
      ),
      workflowLabel: i18n.translate('xpack.agentBuilder.overview.editDetails.workflowLabel', {
        defaultMessage: 'Workflows',
      }),
      instructionsTitle: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.instructionsTitle',
        { defaultMessage: 'Custom Instructions' }
      ),
      instructionsDescription: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.instructionsDescription',
        {
          defaultMessage:
            'Define how the agent should behave, what it should prioritize, and any rules it should follow when responding.',
        }
      ),
      instructionsPlaceholder: i18n.translate(
        'xpack.agentBuilder.overview.editDetails.instructionsPlaceholder',
        {
          defaultMessage:
            'e.g., Prioritize concise answers. Focus on logs and metrics for payment services. Include ES|QL queries when helpful and end with clear next steps.',
        }
      ),
      tagsTitle: i18n.translate('xpack.agentBuilder.overview.editDetails.tagsTitle', {
        defaultMessage: 'Tags',
      }),
      tagsDescription: i18n.translate('xpack.agentBuilder.overview.editDetails.tagsDescription', {
        defaultMessage: 'Add labels to organize and quickly find this agent.',
      }),
      tagsLabel: i18n.translate('xpack.agentBuilder.overview.editDetails.tagsLabel', {
        defaultMessage: 'Enter a tag',
      }),
      cancelButton: i18n.translate('xpack.agentBuilder.overview.editDetails.cancelButton', {
        defaultMessage: 'Cancel',
      }),
      saveButton: i18n.translate('xpack.agentBuilder.overview.editDetails.saveButton', {
        defaultMessage: 'Save',
      }),
    },
  },
  navigationAbort: {
    title: i18n.translate('xpack.agentBuilder.navigationAbort.title', {
      defaultMessage: 'Abort chat request?',
    }),
    message: i18n.translate('xpack.agentBuilder.navigationAbort.message', {
      defaultMessage: 'A chat request is in progress. Do you want to navigate away and abort it?',
    }),
    confirmButton: i18n.translate('xpack.agentBuilder.navigationAbort.confirmButton', {
      defaultMessage: 'Yes, abort',
    }),
  },
};
