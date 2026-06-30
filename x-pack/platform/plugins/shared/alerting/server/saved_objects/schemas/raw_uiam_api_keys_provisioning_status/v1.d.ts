import { UiamApiKeyProvisioningEntityType, UiamApiKeyProvisioningStatus } from '@kbn/uiam-api-keys-provisioning-status';
export declare const rawUiamApiKeysProvisioningStatusSchema: import("@kbn/config-schema").ObjectType<{
    '@timestamp': import("@kbn/config-schema").Type<string>;
    entityId: import("@kbn/config-schema").Type<string>;
    entityType: import("@kbn/config-schema").Type<UiamApiKeyProvisioningEntityType>;
    status: import("@kbn/config-schema").Type<UiamApiKeyProvisioningStatus>;
    message: import("@kbn/config-schema").Type<string | undefined>;
}>;
