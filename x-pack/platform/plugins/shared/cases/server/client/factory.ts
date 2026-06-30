/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KibanaRequest,
  SavedObjectsServiceStart,
  Logger,
  ElasticsearchClient,
  SavedObjectsClientContract,
  IBasePath,
  SecurityServiceStart,
} from '@kbn/core/server';
import type { ISavedObjectsSerializer } from '@kbn/core-saved-objects-server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import type {
  AuditLogger,
  SecurityPluginSetup,
  SecurityPluginStart,
} from '@kbn/security-plugin/server';
import type { FeaturesPluginStart } from '@kbn/features-plugin/server';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import type { LensServerPluginSetup } from '@kbn/lens-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { NotificationsPluginStart } from '@kbn/notifications-plugin/server';
import type {
  AlertsClient,
  RuleRegistryPluginStartContract,
} from '@kbn/rule-registry-plugin/server';

import type { PublicMethodsOf } from '@kbn/utility-types';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { spaceIdToNamespace } from '@kbn/spaces-plugin/server/lib/utils/namespace';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import type { FilesStart } from '@kbn/files-plugin/server';
import type { IUsageCounter } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counter';
import { KIBANA_SYSTEM_USERNAME } from '../../common/constants';
import { Authorization } from '../authorization/authorization';
import {
  CaseConfigureService,
  CasesService,
  CaseUserActionService,
  ConnectorMappingsService,
  AttachmentService,
  AlertService,
  TemplatesService,
  FieldDefinitionsService,
} from '../services';

import { AuthorizationAuditLogger } from '../authorization';
import type { CasesClient } from '.';
import { createCasesClient } from '.';
import type { PersistableStateAttachmentTypeRegistry } from '../attachment_framework/persistable_state_registry';
import type { ExternalReferenceAttachmentTypeRegistry } from '../attachment_framework/external_reference_registry';
import type { UnifiedAttachmentTypeRegistry } from '../attachment_framework/unified_attachment_registry';
import type { CasesServices } from './types';
import { LicensingService } from '../services/licensing';
import { EmailNotificationService } from '../services/notifications/email_notification_service';
import type { ConfigType } from '../config';
import type { CasesEventBus } from '../events/event_bus';
import { getSavedObjectsTypes } from '../../common';
import type {
  CasesAnalyticsV2DataViewRefresher,
  CasesAnalyticsV2WriterContract,
} from '../cases_analytics_v2';

interface CasesClientFactoryArgs {
  securityPluginSetup: SecurityPluginSetup;
  securityPluginStart: SecurityPluginStart;
  securityServiceStart: SecurityServiceStart;
  spacesPluginStart?: SpacesPluginStart;
  featuresPluginStart: FeaturesPluginStart;
  actionsPluginStart: ActionsPluginStart;
  licensingPluginStart: LicensingPluginStart;
  lensEmbeddableFactory: LensServerPluginSetup['lensEmbeddableFactory'];
  notifications: NotificationsPluginStart;
  ruleRegistry: RuleRegistryPluginStartContract;
  persistableStateAttachmentTypeRegistry: PersistableStateAttachmentTypeRegistry;
  externalReferenceAttachmentTypeRegistry: ExternalReferenceAttachmentTypeRegistry;
  unifiedAttachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
  publicBaseUrl?: IBasePath['publicBaseUrl'];
  filesPluginStart: FilesStart;
  usageCounter?: IUsageCounter;
  config: ConfigType;
  casesEventBus?: CasesEventBus;
  closeReasonValidator?: (
    closeReason: string,
    owner: string,
    request: KibanaRequest
  ) => Promise<boolean>;
  /**
   * Stable proxy returned by `CasesAnalyticsV2Service.getWriter()`. Always
   * resolvable — when v2 is disabled, the proxy delegates to a no-op writer
   * and SO-service hooks compile down to nothing.
   */
  analyticsV2Writer: CasesAnalyticsV2WriterContract;
  /**
   * Stable callback returned by `CasesAnalyticsV2Service.getDataViewRefresher()`.
   * Always resolvable — when v2 is disabled, defaults to
   * `V2_NOOP_DATA_VIEW_REFRESHER` so the templates service can call it
   * unconditionally.
   */
  analyticsV2DataViewRefresher: CasesAnalyticsV2DataViewRefresher;
}

/**
 * This class handles the logic for creating a CasesClient. We need this because some of the member variables
 * can't be initialized until a plugin's start() method but we need to register the case context in the setup() method.
 */
export class CasesClientFactory {
  private isInitialized = false;
  private readonly logger: Logger;
  // The reason this is protected is because we'll get type collisions otherwise because we're using a type guard assert
  // to ensure the options member is instantiated before using it in various places
  // See for more info: https://stackoverflow.com/questions/66206180/typescript-typeguard-attribut-with-method
  protected options?: CasesClientFactoryArgs;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * This should be called by the plugin's start() method.
   */
  public initialize(options: CasesClientFactoryArgs) {
    if (this.isInitialized) {
      throw new Error('CasesClientFactory already initialized');
    }
    this.isInitialized = true;
    this.options = options;
  }

  /**
   * Creates a cases client for the current request. This request will be used to authorize the operations done through
   * the client.
   */
  public async create({
    request,
    scopedClusterClient,
    savedObjectsService,
  }: {
    request: KibanaRequest;
    savedObjectsService: SavedObjectsServiceStart;
    scopedClusterClient: ElasticsearchClient;
  }): Promise<CasesClient> {
    this.validateInitialization();

    const auditLogger = this.options.securityPluginSetup.audit.asScoped(request);

    const auth = await Authorization.create({
      request,
      securityAuth: this.options.securityPluginStart?.authz,
      spaces: this.options.spacesPluginStart,
      features: this.options.featuresPluginStart,
      auditLogger: new AuthorizationAuditLogger(auditLogger),
      logger: this.logger,
    });

    const unsecuredSavedObjectsClient = savedObjectsService.getScopedClient(request, {
      includedHiddenTypes: getSavedObjectsTypes(this.options.config),
      // this tells the security plugin to not perform SO authorization and audit logging since we are handling
      // that manually using our Authorization class and audit logger.
      excludedExtensions: [SECURITY_EXTENSION_ID],
    });

    const savedObjectsSerializer = savedObjectsService.createSerializer();
    const alertsClient = await this.options.ruleRegistry.getRacClientWithRequest(request);

    const services = this.createServices({
      unsecuredSavedObjectsClient,
      savedObjectsSerializer,
      esClient: scopedClusterClient,
      request,
      auditLogger,
      alertsClient,
      auth,
    });

    const userInfo = await this.getUserInfo(request);

    const spaceId =
      this.options.spacesPluginStart?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
    const fileService = this.options.filesPluginStart.fileServiceFactory.asScoped(request);
    const { closeReasonValidator } = this.options;
    const boundCloseReasonValidator = closeReasonValidator
      ? (closeReason: string, owner: string) => closeReasonValidator(closeReason, owner, request)
      : undefined;

    return createCasesClient({
      services,
      unsecuredSavedObjectsClient,
      user: userInfo,
      logger: this.logger,
      lensEmbeddableFactory: this.options.lensEmbeddableFactory,
      authorization: auth,
      actionsClient: await this.options.actionsPluginStart.getActionsClientWithRequest(request),
      persistableStateAttachmentTypeRegistry: this.options.persistableStateAttachmentTypeRegistry,
      externalReferenceAttachmentTypeRegistry: this.options.externalReferenceAttachmentTypeRegistry,
      unifiedAttachmentTypeRegistry: this.options.unifiedAttachmentTypeRegistry,
      securityStartPlugin: this.options.securityPluginStart,
      publicBaseUrl: this.options.publicBaseUrl,
      spaceId,
      savedObjectsSerializer,
      fileService,
      usageCounter: this.options.usageCounter,
      config: this.options.config,
      casesEventBus: this.options.casesEventBus,
      request,
      closeReasonValidator: boundCloseReasonValidator,
    });
  }

  private validateInitialization(): asserts this is this & { options: CasesClientFactoryArgs } {
    if (!this.isInitialized || this.options == null) {
      throw new Error('CasesClientFactory must be initialized before calling create');
    }
  }

  private createServices({
    unsecuredSavedObjectsClient,
    savedObjectsSerializer,
    esClient,
    request,
    auditLogger,
    alertsClient,
    auth,
  }: {
    unsecuredSavedObjectsClient: SavedObjectsClientContract;
    savedObjectsSerializer: ISavedObjectsSerializer;
    esClient: ElasticsearchClient;
    request: KibanaRequest;
    auditLogger: AuditLogger;
    alertsClient: PublicMethodsOf<AlertsClient>;
    auth: PublicMethodsOf<Authorization>;
  }): CasesServices {
    this.validateInitialization();

    const attachmentService = new AttachmentService({
      log: this.logger,
      unsecuredSavedObjectsClient,
      config: this.options.config,
    });

    const spaceId =
      this.options.spacesPluginStart?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
    const namespace = spaceIdToNamespace(spaceId) ?? DEFAULT_NAMESPACE_STRING;

    // Bound, parameterless callback handed to the templates service. The v2
    // service handles the no-op-when-disabled case internally; the
    // templates service only needs to fire-and-forget after every template
    // mutation.
    const refreshAnalyticsV2DataView = () =>
      this.options.analyticsV2DataViewRefresher({
        spaceId,
        request,
        savedObjectsClient: unsecuredSavedObjectsClient,
      });

    const templatesService = new TemplatesService({
      unsecuredSavedObjectsClient,
      savedObjectsSerializer,
      esClient,
      namespace,
      refreshAnalyticsV2DataView,
    });

    const fieldDefinitionsService = new FieldDefinitionsService({
      unsecuredSavedObjectsClient,
    });

    const caseService = new CasesService({
      log: this.logger,
      unsecuredSavedObjectsClient,
      attachmentService,
      analyticsV2Writer: this.options.analyticsV2Writer,
    });

    const licensingService = new LicensingService(
      this.options.licensingPluginStart.license$,
      this.options.licensingPluginStart.featureUsage.notifyUsage
    );

    /**
     * The notifications plugins only exports the EmailService.
     * We do the same. If in the future we use other means
     * of notifications we can refactor to use a factory.
     */
    const notificationService = new EmailNotificationService({
      logger: this.logger,
      notifications: this.options.notifications,
      security: this.options.securityPluginStart,
      publicBaseUrl: this.options.publicBaseUrl,
      spaceId:
        this.options.spacesPluginStart?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID,
    });

    return {
      templatesService,
      fieldDefinitionsService,
      alertsService: new AlertService(esClient, this.logger, alertsClient),
      caseService,
      caseConfigureService: new CaseConfigureService(this.logger),
      connectorMappingsService: new ConnectorMappingsService(this.logger),
      userActionService: new CaseUserActionService({
        log: this.logger,
        unsecuredSavedObjectsClient,
        savedObjectsSerializer,
        auditLogger,
        isCasesAttachmentsEnabled: this.options.config.attachments?.enabled === true,
      }),
      attachmentService,
      licensingService,
      notificationService,
    };
  }

  /**
   * This function attempts to retrieve the current user's info. The first method is using the user profile api
   * provided by the security plugin. If that fails or the session isn't found then we will attempt using authc
   * which will not retrieve the profile uid but at least gets us the username and sometimes full name, and email.
   *
   * This function also forces the fields to be strings or null (except the profile uid since it's optional anyway)
   * because the get case API expects a created_by field to be set. If we leave the fields as undefined
   * then the resulting object in ES will just be empty and it'll fail to encode the user when returning it to the API
   * request. If we force them to be null it will succeed.
   */
  private async getUserInfo(request: KibanaRequest): Promise<{
    username: string | null;
    full_name: string | null;
    email: string | null;
    profile_uid?: string;
  }> {
    this.validateInitialization();

    try {
      const userProfile = await this.options.securityPluginStart.userProfiles.getCurrent({
        // todo: Access userProfiles from core's UserProfileService contract
        request,
      });

      if (userProfile != null) {
        return {
          username: userProfile.user.username,
          full_name: userProfile.user.full_name ?? null,
          email: userProfile.user.email ?? null,
          profile_uid: userProfile.uid,
        };
      }
    } catch (error) {
      this.logger.debug(`Failed to retrieve user profile, falling back to authc: ${error}`);
    }

    try {
      const user = this.options.securityServiceStart.authc.getCurrentUser(request);

      if (user != null) {
        return {
          username: user.username,
          full_name: user.full_name ?? null,
          email: user.email ?? null,
        };
      }
    } catch (error) {
      this.logger.debug(`Failed to retrieve user info from authc: ${error}`);
    }

    if (request.isFakeRequest) {
      return {
        username: KIBANA_SYSTEM_USERNAME,
        full_name: null,
        email: null,
      };
    }

    return {
      username: null,
      full_name: null,
      email: null,
    };
  }
}
