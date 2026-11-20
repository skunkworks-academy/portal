targetScope = 'resourceGroup'

@description('Azure Front Door profile name, unique within the resource group.')
param profileName string

@description('Azure Front Door SKU; Premium is recommended for stronger origin isolation.')
@allowed(['Premium_AzureFrontDoor', 'Standard_AzureFrontDoor'])
param sku string = 'Premium_AzureFrontDoor'

@description('Each property requires a dedicated BFF origin configured for its own origin, Entra redirect URI and property identity. Do not use the public API host as a substitute for a BFF.')
param properties array

// Each entry: { id, hostname, staticHost, staticHostHeader, bffHost }
// Only register domains that are owned and explicitly authorised for DNS cutover.
resource profile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: profileName
  location: 'global'
  sku: { name: sku }
  properties: { originResponseTimeoutSeconds: 60 }
}

resource endpoints 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = [for p in properties: {
  parent: profile
  name: 'academy-${p.id}'
  location: 'global'
  properties: { enabledState: 'Enabled' }
}]

resource domains 'Microsoft.Cdn/profiles/customDomains@2023-05-01' = [for p in properties: {
  parent: profile
  name: 'domain-${p.id}'
  properties: {
    hostName: p.hostname
    tlsSettings: {
      certificateType: 'ManagedCertificate'
      minimumTlsVersion: 'TLS12'
    }
  }
}]

resource siteGroups 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = [for p in properties: {
  parent: profile
  name: 'site-${p.id}'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 2
      additionalLatencyInMilliseconds: 0
    }
    sessionAffinityState: 'Disabled'
  }
}]

resource apiGroups 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = [for p in properties: {
  parent: profile
  name: 'identity-${p.id}'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 2
      additionalLatencyInMilliseconds: 0
    }
    sessionAffinityState: 'Disabled'
  }
}]

resource sites 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = [for (p, i) in properties: {
  parent: siteGroups[i]
  name: 'static'
  properties: {
    hostName: p.staticHost
    originHostHeader: p.staticHostHeader
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}]

resource apis 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = [for (p, i) in properties: {
  parent: apiGroups[i]
  name: 'bff'
  properties: {
    hostName: p.bffHost
    originHostHeader: p.bffHost
    httpPort: 80
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}]

// Front Door chooses the more specific authentication route ahead of the static fallback.
// originPath prepends /api to /auth/login, /auth/callback, /auth/logout and /session.
// Never cache authentication responses.
resource identityRoutes 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = [for (p, i) in properties: {
  parent: endpoints[i]
  name: 'identity'
  dependsOn: [apis[i]]
  properties: {
    enabledState: 'Enabled'
    originGroup: { id: apiGroups[i].id }
    originPath: '/api'
    supportedProtocols: ['Http', 'Https']
    httpsRedirect: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    patternsToMatch: ['/auth/*', '/session']
    customDomains: [{ id: domains[i].id }]
    linkToDefaultDomain: 'Disabled'
  }
}]

resource siteRoutes 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = [for (p, i) in properties: {
  parent: endpoints[i]
  name: 'public-site'
  dependsOn: [sites[i]]
  properties: {
    enabledState: 'Enabled'
    originGroup: { id: siteGroups[i].id }
    supportedProtocols: ['Http', 'Https']
    httpsRedirect: 'Enabled'
    forwardingProtocol: 'HttpsOnly'
    patternsToMatch: ['/*']
    customDomains: [{ id: domains[i].id }]
    linkToDefaultDomain: 'Disabled'
  }
}]

output endpointDomains array = [for (p, i) in properties: {
  hostname: p.hostname
  endpointHostname: endpoints[i].properties.hostName
  // DNS cutover and certificate activation are manual gated operations.
}]
