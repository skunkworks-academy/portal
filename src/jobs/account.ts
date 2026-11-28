import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

export function isJobsPage() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("workspace") === "jobs";
}
export function selectedPortalAccount(accounts: AccountInfo[], instance: IPublicClientApplication) {
  if (isJobsPage()) {
    const active = instance.getActiveAccount()?.homeAccountId;
    return accounts.find(account => account.homeAccountId === active) ?? accounts[0];
  }
  return accounts[0];
}
