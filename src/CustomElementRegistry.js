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

    if (!internals.preferPerformance) {
      /**
      * @private
      * @type {!DocumentConstructionObserver}
      */
      this._documentConstructionObserver = new DocumentConstructionObserver(internals, document);
    }
  }

  _validateDefinition(localName, constructor) {
    if (!(constructor instanceof Function)) {
      throw new TypeError('Custom element constructors must be functions.');
    }

    if (!Utilities.isValidCustomElementName(localName)) {
      throw new SyntaxError(`The element name '${localName}' is not valid.`);
    }

    if (this._internals.localNameToDefinition(localName) ||
        this._internals.localNameToLazyDefinition(localName)) {
      throw new Error(`A custom element with name '${localName}' has already been defined.`);
    }

    if (this._internals.elementDefinitionIsRunning) {
      throw new Error('A custom element is already being defined.');
    }
    return true;
  }

  /**
   * @param {string} localName
   * @param {!Function} constructorOrGenerator
   * @param {boolean} isGenerator
   */
  _define(localName, constructorOrGenerator, isGenerator = false) {
    if (!this._validateDefinition(localName, constructorOrGenerator)) {
      return;
    }
    const definition = isGenerator ?
      this._internals.setupLazyDefinition(localName, constructorOrGenerator) :
      this._internals.setupDefinition(localName, constructorOrGenerator);
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
   * @param {!Function} classGenerator
   */
  polyfillDefineLazy(localName, classGenerator) {
    this._define(localName, classGenerator, true);
  }

  upgrade(element) {
    this._internals.patchAndUpgradeTree(element);
  }

  /**
   * @param {string} localName
   * @return {Function|undefined}
   */
  get(localName) {
    let definition = this._internals.localNameToDefinition(localName);
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

  polyfillWrapFlushCallback(outer) {
    if (this._documentConstructionObserver) {
      this._documentConstructionObserver.disconnect();
    }
    const inner = this._internals.flushCallback;
    this._internals.flushCallback = flush => outer(() => inner(flush));
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
