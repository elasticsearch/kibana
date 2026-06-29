/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const API_KEY_HEADER_AUTHENTICATION_LABEL = i18n.translate(
  'connectorSpecs.apiKeyHeaderAuthentication.label',
  {
    defaultMessage: 'API key header authentication',
  }
);

export const API_KEY_AUTH_LABEL = i18n.translate('connectorSpecs.apiKeyAuth.label', {
  defaultMessage: 'API key',
});

export const API_KEY_AUTH_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.apiKeyAuth.requiredMessage',
  {
    defaultMessage: 'API key is required',
  }
);

export const HEADER_AUTH_LABEL = i18n.translate('connectorSpecs.headerAuth.label', {
  defaultMessage: 'API key header Field',
});

export const HEADER_AUTH_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.headerAuth.headerAuth.requiredMessage',
  {
    defaultMessage: 'Header field is required',
  }
);

export const BASIC_AUTH_LABEL = i18n.translate('connectorSpecs.basicAuth.label', {
  defaultMessage: 'Basic authentication',
});

export const BASIC_AUTH_USERNAME_LABEL = i18n.translate('connectorSpecs.basicAuth.username.label', {
  defaultMessage: 'Username',
});

export const BASIC_AUTH_USERNAME_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.basicAuth.username.requiredMessage',
  {
    defaultMessage: 'Username is required',
  }
);

export const BASIC_AUTH_PASSWORD_LABEL = i18n.translate('connectorSpecs.basicAuth.password.label', {
  defaultMessage: 'Password',
});

export const BASIC_AUTH_PASSWORD_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.basicAuth.password.requiredMessage',
  {
    defaultMessage: 'Password is required',
  }
);

export const BEARER_AUTH_LABEL = i18n.translate('connectorSpecs.authType.bearerAuth.label', {
  defaultMessage: 'Bearer token',
});

export const BEARER_TOKEN_LABEL = i18n.translate('connectorSpecs.bearerAuth.token.label', {
  defaultMessage: 'Token',
});

export const BEARER_AUTH_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.bearerAuth.token.requiredMessage',
  {
    defaultMessage: 'Token is required',
  }
);

export const NO_AUTH_LABEL = i18n.translate('connectorSpecs.authType.noAuth.label', {
  defaultMessage: 'None',
});

export const OAUTH_LABEL = i18n.translate('connectorSpecs.oauth.label', {
  defaultMessage: 'OAuth Client Credentials',
});

export const OAUTH_TOKEN_URL_LABEL = i18n.translate('connectorSpecs.oauthTokenUrl.label', {
  defaultMessage: 'Token URL',
});

export const OAUTH_CLIENT_ID_LABEL = i18n.translate('connectorSpecs.oauthClientId.label', {
  defaultMessage: 'Client ID',
});

export const OAUTH_CLIENT_ID_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.oauthClientId.requiredMessage',
  {
    defaultMessage: 'Client ID is required',
  }
);

export const OAUTH_SCOPE_LABEL = i18n.translate('connectorSpecs.oauthScope.label', {
  defaultMessage: 'Scope',
});

export const OAUTH_CLIENT_SECRET_LABEL = i18n.translate('connectorSpecs.oauthClientSecret.label', {
  defaultMessage: 'Client secret',
});

export const OAUTH_CLIENT_SECRET_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.oauthClientSecret.requiredMessage',
  {
    defaultMessage: 'Client secret is required',
  }
);

export const OAUTH_TOKEN_ENDPOINT_AUTH_METHOD_LABEL = i18n.translate(
  'connectorSpecs.oauthTokenEndpointAuthMethod.label',
  {
    defaultMessage: 'Token endpoint auth method',
  }
);

export const OAUTH_AUTHORIZATION_CODE_LABEL = i18n.translate(
  'connectorSpecs.oauthAuthorizationCode.label',
  {
    defaultMessage: 'OAuth 2.0 Authorization Code',
  }
);

export const OAUTH_AUTHORIZATION_URL_LABEL = i18n.translate(
  'connectorSpecs.oauthAuthorizationUrl.label',
  {
    defaultMessage: 'Authorization URL',
  }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.label',
  { defaultMessage: 'OAuth Client Credentials (Private Key JWT)' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_ALGORITHM_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.algorithm.label',
  { defaultMessage: 'Signing algorithm' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_BINDING_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.certificateBinding.label',
  { defaultMessage: 'Certificate binding header' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_KEY_ID_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.keyId.label',
  { defaultMessage: 'Key ID' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_CERTIFICATE_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.certificate.label',
  { defaultMessage: 'Certificate (PEM)' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_CERTIFICATE_INVALID_PEM_MESSAGE =
  i18n.translate(
    'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.certificate.invalidPemMessage',
    {
      defaultMessage: 'Certificate must be a PEM-encoded X.509 certificate.',
    }
  );

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_PRIVATE_KEY_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.privateKey.label',
  { defaultMessage: 'Private key (PEM)' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_PRIVATE_KEY_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.privateKey.requiredMessage',
  { defaultMessage: 'Private key is required.' }
);

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_PRIVATE_KEY_INVALID_PEM_MESSAGE =
  i18n.translate(
    'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.privateKey.invalidPemMessage',
    {
      defaultMessage: 'Private key must be a PEM-encoded RSA or PKCS#8 key.',
    }
  );

export const OAUTH_CLIENT_CREDENTIALS_PRIVATE_KEY_JWT_PASSPHRASE_LABEL = i18n.translate(
  'connectorSpecs.oauthClientCredentialsPrivateKeyJwt.passphrase.label',
  { defaultMessage: 'Private key passphrase' }
);

export const CRT_AUTH_LABEL = i18n.translate('connectorSpecs.crt.label', {
  defaultMessage: 'SSL CRT and Key authentication',
});

export const CRT_AUTH_CERT_LABEL = i18n.translate('connectorSpecs.crtCert.label', {
  defaultMessage: 'CRT file',
});

export const CRT_AUTH_KEY_LABEL = i18n.translate('connectorSpecs.crtKey.label', {
  defaultMessage: 'KEY file',
});

export const CRT_AUTH_PASSPHRASE_LABEL = i18n.translate('connectorSpecs.crtPassphrase.label', {
  defaultMessage: 'Passphrase',
});

export const CRT_AUTH_CA_LABEL = i18n.translate('connectorSpecs.crtCA.label', {
  defaultMessage: 'CA file',
});

export const CRT_AUTH_VERIFICATION_MODE_LABEL = i18n.translate(
  'connectorSpecs.crtVerificationMode.label',
  {
    defaultMessage: 'Verification mode',
  }
);

export const PFX_AUTH_LABEL = i18n.translate('connectorSpecs.pfx.label', {
  defaultMessage: 'SSL PFX authentication',
});

export const PFX_AUTH_CERT_LABEL = i18n.translate('connectorSpecs.crtCert.label', {
  defaultMessage: 'PFX file',
});

export const PFX_AUTH_PASSPHRASE_LABEL = i18n.translate('connectorSpecs.pfxPassphrase.label', {
  defaultMessage: 'Passphrase',
});

export const PFX_AUTH_CA_LABEL = i18n.translate('connectorSpecs.pfxCA.label', {
  defaultMessage: 'CA file',
});

export const PFX_AUTH_VERIFICATION_MODE_LABEL = i18n.translate(
  'connectorSpecs.pfxVerificationMode.label',
  {
    defaultMessage: 'Verification mode',
  }
);

export const AZURE_SHARED_KEY_AUTH_LABEL = i18n.translate(
  'connectorSpecs.azureSharedKeyAuth.label',
  {
    defaultMessage: 'Azure Shared Key',
  }
);

export const AZURE_SHARED_KEY_ACCOUNT_NAME_LABEL = i18n.translate(
  'connectorSpecs.azureSharedKeyAuth.accountName.label',
  {
    defaultMessage: 'Storage account name',
  }
);

export const AZURE_SHARED_KEY_ACCOUNT_NAME_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.azureSharedKeyAuth.accountName.requiredMessage',
  {
    defaultMessage: 'Enter a storage account name.',
  }
);

export const AZURE_SHARED_KEY_ACCOUNT_KEY_LABEL = i18n.translate(
  'connectorSpecs.azureSharedKeyAuth.accountKey.label',
  {
    defaultMessage: 'Storage account key',
  }
);

export const AZURE_SHARED_KEY_ACCOUNT_KEY_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.azureSharedKeyAuth.accountKey.requiredMessage',
  {
    defaultMessage: 'Enter a storage account key.',
  }
);

export const AWS_CREDENTIALS_LABEL = i18n.translate('connectorSpecs.awsCredentials.label', {
  defaultMessage: 'AWS Credentials',
});

export const AWS_ACCESS_KEY_ID_LABEL = i18n.translate(
  'connectorSpecs.awsCredentials.accessKeyId.label',
  {
    defaultMessage: 'Access Key ID',
  }
);

export const AWS_ACCESS_KEY_ID_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.awsCredentials.accessKeyId.requiredMessage',
  {
    defaultMessage: 'Access Key ID is required',
  }
);

export const AWS_SECRET_ACCESS_KEY_LABEL = i18n.translate(
  'connectorSpecs.awsCredentials.secretAccessKey.label',
  {
    defaultMessage: 'Secret Access Key',
  }
);

export const AWS_SECRET_ACCESS_KEY_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.awsCredentials.secretAccessKey.requiredMessage',
  {
    defaultMessage: 'Secret Access Key is required',
  }
);

export const EARS_LABEL = i18n.translate('connectorSpecs.ears.label', {
  defaultMessage: 'Quick Connect OAuth 2.0',
});

export const GCP_SERVICE_ACCOUNT_LABEL = i18n.translate('connectorSpecs.gcpServiceAccount.label', {
  defaultMessage: 'GCP Service Account',
});

export const GCP_SERVICE_ACCOUNT_JSON_LABEL = i18n.translate(
  'connectorSpecs.gcpServiceAccount.json.label',
  {
    defaultMessage: 'Service Account JSON',
  }
);

export const GCP_SERVICE_ACCOUNT_JSON_REQUIRED_MESSAGE = i18n.translate(
  'connectorSpecs.gcpServiceAccount.json.requiredMessage',
  {
    defaultMessage: 'Service Account JSON is required',
  }
);

export const GCP_SERVICE_ACCOUNT_JSON_HELP_TEXT = i18n.translate(
  'connectorSpecs.gcpServiceAccount.json.helpText',
  {
    defaultMessage:
      'Paste the contents of your GCP service account JSON key file. You can download this from the GCP Console under IAM & Admin > Service Accounts.',
  }
);

export const GCP_SERVICE_ACCOUNT_SCOPE_LABEL = i18n.translate(
  'connectorSpecs.gcpServiceAccount.scope.label',
  {
    defaultMessage: 'OAuth Scope',
  }
);

export const GCP_SERVICE_ACCOUNT_SCOPE_HELP_TEXT = i18n.translate(
  'connectorSpecs.gcpServiceAccount.scope.helpText',
  {
    defaultMessage:
      'OAuth scope for the access token. Defaults to https://www.googleapis.com/auth/cloud-platform.',
  }
);
