import Native from './Native.js';
import CustomElementInternals from '../CustomElementInternals.js';
import * as Utilities from '../Utilities.js';

/**
 * @param {!CustomElementInternals} internals
 */
export default function(internals) {
  if (!ShadowRoot) return;

  if (Native.ShadowRoot_innerHTML) {
    Object.defineProperty(ShadowRoot.prototype, 'innerHTML', {
      enumerable: Native.ShadowRoot_innerHTML.enumerable,
      configurable: true,
      get: Native.ShadowRoot_innerHTML.get,
      set: /** @this {ShadowRoot} */ function(htmlString) {
        const isConnected = Utilities.isConnected(this);

        /** @type {!Array<!Element>} */
        const removedElements = [];
        // IE11 does not support `firstChildElement`.
        for (let child = this.firstChild; child !== null; child = child.nextSibling) {
          if (child instanceof Element) {
            removedElements.push(child);
          }
        }

        baseDescriptor.set.call(this, htmlString);

        for (let i = 0; i < removedElements.length; i++) {
          internals.disconnectTree(element);
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
};
