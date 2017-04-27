import CEState from '../../CustomElementState.js';
import * as Utilities from '../../Utilities.js';

export default function PatchInnerHTML(internals, destination, baseDescriptor) {
  Object.defineProperty(destination, 'innerHTML', {
    enumerable: baseDescriptor.enumerable,
    configurable: true,
    get: baseDescriptor.get,
    set: /** @this {!Element|!ShadowRoot} */ function(htmlString) {
      const isConnected = Utilities.isConnected(this);

      // NOTE: In IE11, when using the native `innerHTML` setter, all nodes
      // that were previously descendants of the context element have all of
      // their children removed as part of the set - the entire subtree is
      // 'disassembled'. This work around walks the subtree *before* using the
      // native setter.
      /** @type {!Array<!Element>|undefined} */
      let removedElements = undefined;
      if (isConnected) {
        removedElements = [];
        Utilities.walkDeepDescendantElements(this, element => {
          if (element !== this) {
            removedElements.push(element);
          }
        });
      }

      baseDescriptor.set.call(this, htmlString);

      if (removedElements) {
        for (let i = 0; i < removedElements.length; i++) {
          const element = removedElements[i];
          if (element.__CE_state === CEState.custom) {
            internals.disconnectedCallback(element);
          }
        }
      }

      // Only create custom elements if this element's owner document is
      // associated with the registry.
      if (!this.ownerDocument.__CE_hasRegistry) {
        internals.patchTree(this);
      } else {
        internals.patchAndUpgradeTree(this);
      }
      return htmlString;
    },
  });
}
