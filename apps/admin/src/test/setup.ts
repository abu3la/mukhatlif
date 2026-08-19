import '@testing-library/jest-dom/vitest';

const emptyRectList = [] as unknown as DOMRectList;
const emptyRect = new DOMRect(0, 0, 0, 0);

Range.prototype.getClientRects = () => emptyRectList;
Range.prototype.getBoundingClientRect = () => emptyRect;

function editorElementFromPoint(): Element | null {
  const activeElement = document.activeElement;
  if (activeElement instanceof Element) {
    if (activeElement.matches('.ProseMirror')) return activeElement;
    const activeEditor = activeElement.closest('.ProseMirror');
    if (activeEditor) return activeEditor;
  }
  return document.querySelector('.ProseMirror');
}

Object.defineProperty(Document.prototype, 'elementFromPoint', {
  configurable: true,
  value: editorElementFromPoint,
});
if (typeof ShadowRoot !== 'undefined') {
  Object.defineProperty(ShadowRoot.prototype, 'elementFromPoint', {
    configurable: true,
    value: editorElementFromPoint,
  });
}
Object.defineProperty(Text.prototype, 'getClientRects', {
  configurable: true,
  value: () => emptyRectList,
});
Object.defineProperty(Text.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => emptyRect,
});

if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
