export declare const rawUiamApiKeysProvisioningStatusSchema: import("@kbn/config-schema").ObjectType<Omit<{
    '@timestamp': import("@kbn/config-schema").Type<string>;
    entityId: import("@kbn/config-schema").Type<string>;
    entityType: import("@kbn/config-schema").Type<import("@kbn/uiam-api-keys-provisioning-status").UiamApiKeyProvisioningEntityType>;
    status: import("@kbn/config-schema").Type<import("@kbn/uiam-api-keys-provisioning-status").UiamApiKeyProvisioningStatus>;
    message: import("@kbn/config-schema").Type<string | undefined>;
}, "errorCode"> & {
    errorCode: import("@kbn/config-schema").Type<string | undefined>;
}>;
