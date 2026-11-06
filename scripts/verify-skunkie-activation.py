"""Read-only, fail-closed validation before the workflow enables Skunkie.

Inputs contain only selected nonsecret Azure metadata. This script never reads
credentials, creates deployments, changes roles, or sends inference requests.
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

POLICY = "student-usd1-gpt41mini-2025-04-14-v1"
MODEL = "gpt-4.1-mini"
VERSION = "2025-04-14"
API_VERSION = "2024-10-21"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def account_name(endpoint, suffix):
    require(isinstance(endpoint, str), "Missing service endpoint")
    url = urlsplit(endpoint)
    require(url.scheme == "https" and not url.username and not url.password
            and not url.query and not url.fragment and url.path in ("", "/")
            and url.port in (None, 443), "Unsupported service endpoint")
    host = url.hostname or ""
    require(host.endswith(suffix), "Unexpected service host")
    name = host[:-len(suffix)]
    require(re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", name), "Invalid Azure account name")
    return name


def selected_settings(rows):
    require(isinstance(rows, list), "Invalid Function settings metadata")
    names = ("LMS_COSMOS_ENDPOINT", "LMS_COSMOS_DATABASE", "LMS_COSMOS_CONTAINER", "LMS_HOME_ORGANIZATION_ID")
    values = {}
    for row in rows:
        require(isinstance(row, dict) and row.get("name") in names, "Unexpected setting in metadata input")
        name, value = row["name"], row.get("value")
        require(name not in values and isinstance(value, str) and value.strip(), "Missing or duplicate LMS setting")
        values[name] = value
    require(set(values) == set(names), "Missing LMS settings")
    return values


def names(settings, endpoint):
    values = selected_settings(settings)
    return {
        "providerAccount": account_name(endpoint, ".openai.azure.com"),
        "cosmosAccount": account_name(values["LMS_COSMOS_ENDPOINT"], ".documents.azure.com"),
        "database": values["LMS_COSMOS_DATABASE"],
        "container": values["LMS_COSMOS_CONTAINER"],
    }


def validate(settings, endpoint, deployment_name, api_version, account, deployment, cosmos, container, health):
    selected = names(settings, endpoint)
    require(api_version == API_VERSION, "The reviewed Azure OpenAI API version is required")
    require(isinstance(deployment_name, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", deployment_name), "Invalid deployment name")
    require(account.get("name") == selected["providerAccount"] and account.get("kind") == "OpenAI"
            and account.get("provisioningState") == "Succeeded", "OpenAI account is not ready")
    require(account_name(account.get("endpoint"), ".openai.azure.com") == selected["providerAccount"], "OpenAI endpoint does not match the inspected account")
    props = deployment.get("properties", {})
    model = props.get("model", {})
    require(deployment.get("name") == deployment_name and props.get("provisioningState") == "Succeeded", "Model deployment is not ready")
    require(model.get("format") == "OpenAI" and model.get("name") == MODEL
            and model.get("version") == VERSION, "Deployment is not the reviewed model and version")
    require(deployment.get("sku", {}).get("name") == "GlobalStandard", "GlobalStandard pricing requires the GlobalStandard SKU")
    require(props.get("versionUpgradeOption") == "NoAutoUpgrade", "Automatic model upgrades must be disabled")
    require(cosmos.get("name") == selected["cosmosAccount"]
            and account_name(cosmos.get("documentEndpoint"), ".documents.azure.com") == selected["cosmosAccount"], "Cosmos endpoint does not match the inspected account")
    require(cosmos.get("provisioningState") == "Succeeded" and cosmos.get("enableMultipleWriteLocations") is False,
            "The budget requires a ready Cosmos account with multiple writes disabled")
    regions = cosmos.get("writeLocations")
    require(isinstance(regions, list) and len(regions) == 1 and isinstance(regions[0], dict)
            and isinstance(regions[0].get("locationName"), str) and regions[0]["locationName"].strip(),
            "The budget requires exactly one Cosmos write region")
    require(container.get("id") == selected["container"] and container.get("partitionKey", {}).get("paths") == ["/organizationId"]
            and container.get("partitionKey", {}).get("kind") == "Hash", "The existing LMS container partition is incompatible")
    require(health.get("ok") is True and health.get("skunkieSettings", {}).get("budgetPolicy") == POLICY,
            "The protected budget handler is not confirmed in the running release")
    return {"policy": POLICY, "model": MODEL, "version": VERSION, "topology": "single-write-region"}


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["names", "verify", "active"])
    parser.add_argument("--settings", required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--deployment-name")
    parser.add_argument("--api-version")
    for key in ("account", "deployment", "cosmos", "container", "health"):
        parser.add_argument("--" + key)
    args = parser.parse_args()
    try:
        if args.mode == "names":
            result = names(read(args.settings), args.endpoint)
        else:
            result = validate(read(args.settings), args.endpoint, args.deployment_name, args.api_version,
                              *[read(getattr(args, key)) for key in ("account", "deployment", "cosmos", "container", "health")])
            if args.mode == "active":
                require(read(args.health).get("skunkieSettings", {}).get("configured") is True,
                        "The running provider configuration was not confirmed")
        print(json.dumps(result))
        return 0
    except (ValueError, TypeError, AttributeError, OSError, KeyError):
        # Metadata can contain internal details. Keep failure output generic.
        print("Skunkie activation verification failed; check the workflow cleanup result.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
