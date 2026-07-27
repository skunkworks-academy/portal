targetScope = 'subscription'

@description('Azure region for the portal API resources.')
param location string = 'southafricanorth'

@description('Resource group that will contain the portal API resources.')
param resourceGroupName string = 'rg-skunkworks-academy-portal-prod'

@description('Globally unique Function App name.')
param functionAppName string

@description('Globally unique storage account name.')
param storageAccountName string

@description('Microsoft Entra tenant ID used to validate portal API tokens.')
param entraTenantId string = '338a8916-80d9-467c-a94a-7f61d04ef7d5'

@description('Application/client ID used by the SPA and API audience.')
param portalClientId string = 'e22672ae-61a6-434e-b135-3360557819ec'

@description('Application ID URI exposed by the Portal API.')
param applicationIdUri string = 'api://${portalClientId}'

@description('Delegated scope exposed by the Portal API.')
param apiScope string = '${applicationIdUri}/access_as_user'

@description('Allowed browser origins for CORS.')
param allowedOrigins string = 'https://portal.skunkworksacademy.com,https://skunkworks-academy.github.io,http://localhost:5173'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

module portalApi './portal-api.bicep' = {
  name: 'portal-api'
  scope: rg
  params: {
    location: location
    functionAppName: functionAppName
    storageAccountName: storageAccountName
    entraTenantId: entraTenantId
    portalClientId: portalClientId
    applicationIdUri: applicationIdUri
    apiScope: apiScope
    allowedOrigins: allowedOrigins
  }
}

output functionAppName string = portalApi.outputs.functionAppName
output functionAppHostname string = portalApi.outputs.functionAppHostname
output apiBaseUrl string = 'https://${portalApi.outputs.functionAppHostname}/api'
output resourceGroupName string = resourceGroupName
