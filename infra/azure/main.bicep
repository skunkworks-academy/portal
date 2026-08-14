targetScope = 'subscription'

@description('Deployment environment name.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environmentName string = 'prod'

@description('Azure region for the portal resources.')
param location string = 'southafricanorth'

@description('Globally unique prefix. Lowercase letters and numbers only.')
param namePrefix string = 'skwportal'

var resourceGroupName = 'rg-${namePrefix}-${environmentName}-${location}'
var suffix = uniqueString(subscription().subscriptionId, resourceGroupName)
var storageName = take(replace('${namePrefix}${environmentName}${suffix}', '-', ''), 24)
var keyVaultName = take('${namePrefix}-${environmentName}-${suffix}', 24)
var logName = 'log-${namePrefix}-${environmentName}'
var appInsightsName = 'appi-${namePrefix}-${environmentName}'
var planName = 'asp-${namePrefix}-${environmentName}'
var functionName = take('func-${namePrefix}-${environmentName}-${suffix}', 60)

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    workload: 'Skunkworks Academy Portal'
    environment: environmentName
    managedBy: 'Bicep'
  }
}

module portal './portal-resources.bicep' = {
  name: 'portal-resources-${environmentName}'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    storageName: storageName
    keyVaultName: keyVaultName
    logName: logName
    appInsightsName: appInsightsName
    planName: planName
    functionName: functionName
  }
}

output resourceGroupName string = rg.name
output functionAppName string = portal.outputs.functionAppName
output functionAppUrl string = portal.outputs.functionAppUrl
output keyVaultName string = portal.outputs.keyVaultName
output appInsightsName string = portal.outputs.appInsightsName
