import Native from './Native.js';
import CustomElementInternals from '../CustomElementInternals.js';
import * as Utilities from '../Utilities.js';

import PatchInnerHTML from './Method/innerHTML.js';

/**
 * @param {!CustomElementInternals} internals
 */
export default function(internals) {
  if (!ShadowRoot) return;

  if (Native.ShadowRoot_innerHTML) {
    PatchInnerHTML(internals, ShadowRoot.prototype, Native.ShadowRoot_innerHTML);
  }
};
