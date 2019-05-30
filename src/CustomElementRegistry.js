/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import CustomElementInternals from './CustomElementInternals.js';
import DocumentConstructionObserver from './DocumentConstructionObserver.js';
import * as Utilities from './Utilities.js';

/**
 * @unrestricted
 */
export default class CustomElementRegistry {

  /**
   * @param {!CustomElementInternals} internals
   */
  constructor(internals) {

    /**
     * @private
     * @type {!CustomElementInternals}
     */
    this._internals = internals;

    /**
    * @private
    * @type {!DocumentConstructionObserver|undefined}
    */
    this._documentConstructionObserver = internals.preferPerformance ?
      undefined : new DocumentConstructionObserver(internals, document);
  }

  /**
   * @param {string} localName
   * @param {!Function} constructorOrGetter
   * @param {boolean} isGetter
   */
  _define(localName, constructorOrGetter, isGetter = false) {
    this._internals.assertCanDefine(localName, constructorOrGetter);
    const definition = isGetter ?
      this._internals.setupLazyDefinition(localName, constructorOrGetter) :
      this._internals.setupDefinition(localName, constructorOrGetter);
    if (definition) {
      this._internals.processDefinition(definition);
    }
  }

  /**
   * @param {string} localName
   * @param {!Function} constructor
   */
  define(localName, constructor) {
    this._define(localName, constructor);
  }

  /**
   * @param {string} localName
   * @param {!Function} classGetter
   */
  polyfillDefineLazy(localName, classGetter) {
    this._define(localName, classGetter, true);
  }

  upgrade(element) {
    this._internals.patchAndUpgradeTree(element);
  }

  /**
   * @param {string} localName
   * @return {Function|undefined}
   */
  get(localName) {
    const definition = this._internals.localNameToDefinition(localName);
    if (definition) {
      return definition.constructorFunction;
    }

    return undefined;
  }

  /**
   * @param {string} localName
   * @return {!Promise<undefined>}
   */
  whenDefined(localName) {
    if (!Utilities.isValidCustomElementName(localName)) {
      return Promise.reject(new SyntaxError(`'${localName}' is not a valid custom element name.`));
    }
    return this._internals.whenDefined(localName);
  }

  /**
   * @param {!Function} callback
   */
  polyfillWrapFlushCallback(callback) {
    if (this._documentConstructionObserver) {
      this._documentConstructionObserver.disconnect();
    }
    this._internals.wrapFlushCallback(callback);
  }
}

// Closure compiler exports.
window['CustomElementRegistry'] = CustomElementRegistry;
CustomElementRegistry.prototype['define'] = CustomElementRegistry.prototype.define;
CustomElementRegistry.prototype['polyfillDefineLazy'] = CustomElementRegistry.prototype.polyfillDefineLazy;
CustomElementRegistry.prototype['upgrade'] = CustomElementRegistry.prototype.upgrade;
CustomElementRegistry.prototype['get'] = CustomElementRegistry.prototype.get;
CustomElementRegistry.prototype['whenDefined'] = CustomElementRegistry.prototype.whenDefined;
CustomElementRegistry.prototype['polyfillWrapFlushCallback'] = CustomElementRegistry.prototype.polyfillWrapFlushCallback;
