@description('Azure region for resources.')
param location string

@description('Globally unique Function App name.')
param functionAppName string

@description('Globally unique storage account name.')
param storageAccountName string

@description('Microsoft Entra tenant ID.')
param entraTenantId string

@description('Application/client ID used for API audience validation.')
param portalClientId string

@description('Application ID URI used by the Portal API.')
param applicationIdUri string = 'api://${portalClientId}'

@description('Delegated scope exposed by the Portal API.')
param apiScope string = '${applicationIdUri}/access_as_user'

@description('Comma-separated allowed browser origins.')
param allowedOrigins string

var parsedAllowedOrigins = [for origin in split(allowedOrigins, ','): trim(origin)]
var hostingPlanName = '${functionAppName}-plan'
var appInsightsName = '${functionAppName}-insights'
var workspaceName = '${functionAppName}-logs'
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${listKeys(storage.id, storage.apiVersion).keys[0].value}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: hostingPlanName
  location: location
  kind: 'functionapp'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      alwaysOn: false
      cors: {
        allowedOrigins: parsedAllowedOrigins
        supportCredentials: false
      }
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storageConnectionString
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ENTRA_TENANT_ID'
          value: entraTenantId
        }
        {
          name: 'API_CLIENT_ID'
          value: portalClientId
        }
        {
          name: 'SPA_CLIENT_ID'
          value: portalClientId
        }
        {
          name: 'APPLICATION_ID_URI'
          value: applicationIdUri
        }
        {
          name: 'API_SCOPE'
          value: apiScope
        }
        {
          name: 'GRAPH_TENANT_ID'
          value: entraTenantId
        }
        {
          name: 'ALLOWED_ORIGINS'
          value: allowedOrigins
        }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
