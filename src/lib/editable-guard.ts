// Detects whether a selection lives inside somewhere the user is typing.
//
// Checking only the mouseup target is not enough: the pointer can be released
// outside the field it started in, rich-text editors put the caret in a
// contenteditable subtree, and a focused input can hold a selection the event
// target knows nothing about. So we ask three questions instead of one — what
// has focus, where the selection starts, and where it ends.

const EDITABLE_SELECTORS = [
  "[contenteditable='true']",
  "[contenteditable='']",
  ".CodeMirror",
  ".monaco-editor",
  ".ace_editor",
  "[role='textbox']",
  "[role='combobox']",
  "[role='searchbox']",
].join(", ");

export function isEditableElement(el: Element | null | undefined): boolean {
  if (!el) return false;

  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;

  return el.closest(EDITABLE_SELECTORS) !== null;
}

/** The nearest Element for a node — the node itself, or its parent for text nodes. */
function elementFor(node: Node | null | undefined): Element | null {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}

/**
 * The focused element, descending through shadow roots.
 * `document.activeElement` stops at the shadow host, so a field inside a web
 * component would otherwise look like a plain custom element.
 */
export function deepActiveElement(doc: Document = document): Element | null {
  let active: Element | null = doc.activeElement;
  const seen = new Set<Element>();

  while (active?.shadowRoot?.activeElement) {
    if (seen.has(active)) break; // defensive: never loop on a cyclic root
    seen.add(active);
    active = active.shadowRoot.activeElement;
  }

  return active;
}

export function isSelectionInEditable(selection: Selection | null): boolean {
  if (isEditableElement(deepActiveElement())) return true;
  if (!selection) return false;

  return (
    isEditableElement(elementFor(selection.anchorNode)) ||
    isEditableElement(elementFor(selection.focusNode))
  );
}
