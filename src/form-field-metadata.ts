export {};

const fieldSelector = "input, select, textarea";
let generatedFieldId = 0;

function normaliseToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function fieldLabel(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const wrappingLabel = field.closest("label");
  return wrappingLabel?.textContent?.trim() ?? "";
}

function autocompleteFor(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const token = `${field.name} ${field.id} ${fieldLabel(field)}`.toLowerCase();

  if (token.includes("email")) return "email";
  if (token.includes("phone") || token.includes("mobile") || (field instanceof HTMLInputElement && field.type === "tel")) return "tel";
  if (token.includes("display name") || token.includes("applicantname") || /(^|\s)name($|\s)/.test(token)) return "name";
  if (token.includes("location")) return "address-level2";
  if (token.includes("role") || token.includes("discipline")) return "organization";
  return "off";
}

function applyFieldMetadata(field: Element) {
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;

  if (!field.id) {
    const hint = normaliseToken(field.name || fieldLabel(field) || field.getAttribute("placeholder") || field.tagName);
    generatedFieldId += 1;
    field.id = `portal-${hint || "field"}-${generatedFieldId}`;
  }

  if (!field.name) field.name = field.id;
  if (!field.autocomplete) field.autocomplete = autocompleteFor(field);

  const wrappingLabel = field.closest("label");
  if (wrappingLabel instanceof HTMLLabelElement && !wrappingLabel.htmlFor) {
    wrappingLabel.htmlFor = field.id;
  }
}

function refreshFormFieldMetadata(root: ParentNode = document) {
  root.querySelectorAll(fieldSelector).forEach(applyFieldMetadata);
}

refreshFormFieldMetadata();

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(fieldSelector)) applyFieldMetadata(node);
      refreshFormFieldMetadata(node);
    });
  });
});

observer.observe(document.documentElement, { childList: true, subtree: true });
