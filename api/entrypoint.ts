// Azure Functions v4 loads the module identified by package.json#main.
// Keep the existing portal API registrations intact and register the identity BFF
// as an isolated, default-disabled module. No frontend cutover occurs in this phase.
import "./functions.js";
import "./identityBffFunctions.js";

import "./lmsFunctions.js";

// Default-disabled SCIM 2.0 identity provisioning for Microsoft Entra.
import "./scimFunctions.js";

// Authenticated, per-learner Skunkie assessment and IDR records.
import "./skunkieAssessmentFunctions.js";
import "./skunkieOrchestrationFunctions.js";
