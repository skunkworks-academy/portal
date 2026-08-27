// Azure Functions v4 loads the module identified by package.json#main.
// Keep the existing portal API registrations intact and register the identity BFF
// as an isolated, default-disabled module. No frontend cutover occurs in this phase.
import "./functions.js";
import "./identityBffFunctions.js";
