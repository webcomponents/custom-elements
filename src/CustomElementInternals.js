/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as Utilities from './Utilities.js';
import Deferred from './Deferred.js';
import CEState from './CustomElementState.js';

const PENDING_LAZY_DEFINITION = {};

export default class CustomElementInternals {
  constructor(preferPerformance) {
    /**
     * @private
     * @type {!Map<string, !Deferred<undefined>>}
     */
    this._whenDefinedDeferred = new Map();

    /**
     * The default flush callback triggers the document walk synchronously.
     * @type {!Function}
     */
    this.flushCallback = fn => fn();

    /**
     * @private
     * @type {boolean}
     */
    this._flushPending = false;

    /**
     * @private
     * @type {!Array<!CustomElementDefinition|CustomElementLazyDefinition>}
     */
    this._pendingDefinitions = [];

    /** @type {!Map<string, !CustomElementDefinition>} */
    this._localNameToDefinition = new Map();

    this._localNameToLazyDefinition = new Map();

    /** @type {!Map<!Function, !CustomElementDefinition>} */
    this._constructorToDefinition = new Map();

    /** @type {!Array<!function(!Node)>} */
    this._patchesNode = [];

    /** @type {!Array<!function(!Element)>} */
    this._patchesElement = [];

    /** @type {boolean} */
    this._hasPatches = false;

    /** @type {boolean} */
    this.elementDefinitionIsRunning = false;

    /** @type {boolean} */
    this.preferPerformance = preferPerformance || false;
  }

  /**
   * @param {string} localName
   * @param {!Function} constructor
   */
  setupDefinition(localName, constructor) {
    this.elementDefinitionIsRunning = true;
    let connectedCallback;
    let disconnectedCallback;
    let adoptedCallback;
    let attributeChangedCallback;
    let observedAttributes;
    let errorGettingCallbacks = false;
    try {
      /** @type {!Object} */
      const prototype = constructor.prototype;
      if (!(prototype instanceof Object)) {
        throw new TypeError('The custom element constructor\'s prototype is not an object.');
      }

      function getCallback(name) {
        const callbackValue = prototype[name];
        if (callbackValue !== undefined && !(callbackValue instanceof Function)) {
          throw new Error(`The '${name}' callback must be a function.`);
        }
        return callbackValue;
      }

      connectedCallback = getCallback('connectedCallback');
      disconnectedCallback = getCallback('disconnectedCallback');
      adoptedCallback = getCallback('adoptedCallback');
      attributeChangedCallback = getCallback('attributeChangedCallback');
      observedAttributes = constructor['observedAttributes'] || [];
    } catch (e) {
      errorGettingCallbacks = true;
    }
    this.elementDefinitionIsRunning = false;
    if (errorGettingCallbacks) {
      return;
    }

    const definition = {
      localName,
      constructorFunction: constructor,
      connectedCallback,
      disconnectedCallback,
      adoptedCallback,
      attributeChangedCallback,
      observedAttributes,
      constructionStack: []
    };

    this.setDefinition(localName, definition);

    return definition;
  }

  /**
   * @param {string} localName
   * @param {!CustomElementDefinition} definition
   */
  setDefinition(localName, definition) {
    this._localNameToDefinition.set(localName, definition);
    this._constructorToDefinition.set(definition.constructorFunction, definition);
  }

  /**
   * @param {string} localName
   * @param {!Function} constructorGenerator
   */
  setupLazyDefinition(localName, constructorGenerator) {
    const definition = {
      localName,
      constructorGenerator
    };
    this.setLazyDefinition(localName, definition);
    return definition;
  }

  /**
   * @param {string} localName
   * @param {!Function|undefined|Object} lazyDefinition
   */
  setLazyDefinition(localName, lazyDefinition) {
    this._localNameToLazyDefinition.set(localName, lazyDefinition);
  }

  processDefinition(definition) {
    this._pendingDefinitions.push(definition);

    // If we've already called the flush callback and it hasn't called back yet,
    // don't call it again.
    if (!this._flushPending) {
      this._flushPending = true;
      this.flushCallback(() => this._flush());
    }
  }

  _flush() {
    // If no new definitions were defined, don't attempt to flush. This could
    // happen if a flush callback keeps the function it is given and calls it
    // multiple times.
    if (this._flushPending === false) return;
    this._flushPending = false;

    const pendingDefinitions = this._pendingDefinitions;

    /**
     * Unupgraded elements with definitions that were defined *before* the last
     * flush, in document order.
     * @type {!Array<!HTMLElement>}
     */
    const elementsWithStableDefinitions = [];

    /**
     * A map from `localName`s of definitions that were defined *after* the last
     * flush to unupgraded elements matching that definition, in document order.
     * @type {!Map<string, !Array<!HTMLElement>>}
     */
    const elementsWithPendingDefinitions = new Map();
    for (let i = 0; i < pendingDefinitions.length; i++) {
      elementsWithPendingDefinitions.set(pendingDefinitions[i].localName, []);
    }

    this.patchAndUpgradeTree(document, {
      upgrade: element => {
        // Ignore the element if it has already upgraded or failed to upgrade.
        if (element.__CE_state !== undefined) return;

        const localName = element.localName;

        // If there is an applicable pending definition for the element, add the
        // element to the list of elements to be upgraded with that definition.
        const pendingElements = elementsWithPendingDefinitions.get(localName);
        if (pendingElements) {
          pendingElements.push(element);
        // If there is *any other* applicable definition for the element, add it
        // to the list of elements with stable definitions that need to be upgraded.
        } else if (this.localNameToDefinition(localName) ||
            this.localNameToLazyDefinition(localName)) {
          elementsWithStableDefinitions.push(element);
        }
      },
    });

    // Upgrade elements with 'stable' definitions first.
    for (let i = 0; i < elementsWithStableDefinitions.length; i++) {
      this.upgradeElement(elementsWithStableDefinitions[i]);
    }

    // Upgrade elements with 'pending' definitions in the order they were defined.
    while (pendingDefinitions.length > 0) {
      const definition = pendingDefinitions.shift();
      const localName = definition.localName;

      // Attempt to upgrade all applicable elements.
      const pendingUpgradableElements = elementsWithPendingDefinitions.get(definition.localName);
      for (let i = 0; i < pendingUpgradableElements.length; i++) {
        this.upgradeElement(pendingUpgradableElements[i]);
      }

      // Resolve any promises created by `whenDefined` for the definition.
      const deferred = this._whenDefinedDeferred.get(localName);
      if (deferred) {
        deferred.resolve(undefined);
      }
    }
  }

  /**
   *
   * @param {string} localName
   */
  flushLazyDefinition(localName) {
    const pendingLazyDefinition = this.localNameToLazyDefinition(localName);

    // only process this pending definition the first time and not while it's pending.
    if (!pendingLazyDefinition && pendingLazyDefinition !== PENDING_LAZY_DEFINITION) {
      return;
    }

    // mark this definition in a pending state.
    this.setLazyDefinition(localName, PENDING_LAZY_DEFINITION);

    let constructorOrPromise;
    try {
      constructorOrPromise = pendingLazyDefinition.constructorGenerator();
    } catch (e) {}
    if (!constructorOrPromise) {
      return;
    }

    // if it's a promise, defer processing.
    if (typeof constructorOrPromise.then === 'function') {
      constructorOrPromise.then((constructor) => {
        const definition = this.setupDefinition(localName, constructor);
        if (definition) {
          this.setLazyDefinition(localName, undefined);
          this.processDefinition(definition);
        }
      });
    } else {
      const definition = this.setupDefinition(localName, constructorOrPromise);
      if (definition) {
        this.setLazyDefinition(localName, undefined);
        return definition;
      }
    }
  }

  /**
   * @param {string} localName
   * @return {!CustomElementDefinition|undefined}
   */
  localNameToDefinition(localName) {
    return this._localNameToDefinition.get(localName);
  }

  /**
   * @param {string} localName
   * @return {!CustomElementLazyDefinition|undefined}
   */
  localNameToLazyDefinition(localName) {
    return this._localNameToLazyDefinition.get(localName);
  }

  /**
   * @param {!Function} constructor
   * @return {!CustomElementDefinition|undefined}
   */
  constructorToDefinition(constructor) {
    return this._constructorToDefinition.get(constructor);
  }

  whenDefined(localName) {
    const prior = this._whenDefinedDeferred.get(localName);
    if (prior) {
      return prior.toPromise();
    }

    const deferred = new Deferred();
    this._whenDefinedDeferred.set(localName, deferred);

    const definition = this.localNameToDefinition(localName);
    // Resolve immediately only if the given local name has a definition *and*
    // the full document walk to upgrade elements with that local name has
    // already happened.
    if (definition && !this._pendingDefinitions.some(d => d.localName === localName)) {
      deferred.resolve(undefined);
    }

    return deferred.toPromise();
  }

  /**
   * @param {!Node} node
   * @param {!function(!Element)} callback
   * @param {!Set<!Node>=} visitedImports
   */
  onElements(node, callback, visitedImports) {
    if (!this.preferPerformance) {
      Utilities.walkDeepDescendantElements(node, callback, visitedImports);
    } else {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = /** @type {!Element} */(node);
        callback(element);
      }
      // most easily gets to document, element, documentFragment
      if (node.querySelectorAll) {
        const sd = window['ShadyDOM'];
        const elements = (!sd || !sd['inUse']) ? node.querySelectorAll('*') :
          sd['nativeMethods'].querySelectorAll.call(node, '*');
        for (let i = 0; i < elements.length; i++) {
          callback(elements[i]);
        }
      }
    }
  }

  /**
   * @param {!function(!Node)} patch
   */
  addNodePatch(patch) {
    this._hasPatches = true;
    this._patchesNode.push(patch);
  }

  /**
   * @param {!function(!Element)} patch
   */
  addElementPatch(patch) {
    this._hasPatches = true;
    this._patchesElement.push(patch);
  }

  /**
   * @param {!Node} node
   */
  patchTree(node) {
    if (!this._hasPatches) return;

    this.onElements(node, element => this.patchElement(element));
  }

  /**
   * @param {!Node} node
   */
  patchNode(node) {
    if (!this._hasPatches) return;

    if (node.__CE_patched) return;
    node.__CE_patched = true;

    for (let i = 0; i < this._patchesNode.length; i++) {
      this._patchesNode[i](node);
    }
  }

  /**
   * @param {!Element} element
   */
  patchElement(element) {
    if (!this._hasPatches) return;

    if (element.__CE_patched) return;
    element.__CE_patched = true;

    for (let i = 0; i < this._patchesNode.length; i++) {
      this._patchesNode[i](element);
    }

    for (let i = 0; i < this._patchesElement.length; i++) {
      this._patchesElement[i](element);
    }
  }

  /**
   * @param {!Node} root
   */
  connectTree(root) {
    const elements = [];

    this.onElements(root, element => {
      if (this.localNameToDefinition(element.localName)) {
        elements.push(element);
      }
    });

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.__CE_state === CEState.custom) {
        this.connectedCallback(element);
      } else {
        this.upgradeElement(element);
      }
    }
  }

  /**
   * @param {!Node} root
   */
  disconnectTree(root) {
    const elements = [];

    this.onElements(root, element => {
      if (this.localNameToDefinition(element.localName)) {
        elements.push(element);
      }
    });

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.__CE_state === CEState.custom) {
        this.disconnectedCallback(element);
      }
    }
  }

  /**
   * Upgrades all uncustomized custom elements at and below a root node for
   * which there is a definition. When custom element reaction callbacks are
   * assumed to be called synchronously (which, by the current DOM / HTML spec
   * definitions, they are *not*), callbacks for both elements customized
   * synchronously by the parser and elements being upgraded occur in the same
   * relative order.
   *
   * NOTE: This function, when used to simulate the construction of a tree that
   * is already created but not customized (i.e. by the parser), does *not*
   * prevent the element from reading the 'final' (true) state of the tree. For
   * example, the element, during truly synchronous parsing / construction would
   * see that it contains no children as they have not yet been inserted.
   * However, this function does not modify the tree, the element will
   * (incorrectly) have children. Additionally, self-modification restrictions
   * for custom element constructors imposed by the DOM spec are *not* enforced.
   *
   *
   * The following nested list shows the steps extending down from the HTML
   * spec's parsing section that cause elements to be synchronously created and
   * upgraded:
   *
   * The "in body" insertion mode:
   * https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inbody
   * - Switch on token:
   *   .. other cases ..
   *   -> Any other start tag
   *      - [Insert an HTML element](below) for the token.
   *
   * Insert an HTML element:
   * https://html.spec.whatwg.org/multipage/syntax.html#insert-an-html-element
   * - Insert a foreign element for the token in the HTML namespace:
   *   https://html.spec.whatwg.org/multipage/syntax.html#insert-a-foreign-element
   *   - Create an element for a token:
   *     https://html.spec.whatwg.org/multipage/syntax.html#create-an-element-for-the-token
   *     - Will execute script flag is true?
   *       - (Element queue pushed to the custom element reactions stack.)
   *     - Create an element:
   *       https://dom.spec.whatwg.org/#concept-create-element
   *       - Sync CE flag is true?
   *         - Constructor called.
   *         - Self-modification restrictions enforced.
   *       - Sync CE flag is false?
   *         - (Upgrade reaction enqueued.)
   *     - Attributes appended to element.
   *       (`attributeChangedCallback` reactions enqueued.)
   *     - Will execute script flag is true?
   *       - (Element queue popped from the custom element reactions stack.
   *         Reactions in the popped stack are invoked.)
   *   - (Element queue pushed to the custom element reactions stack.)
   *   - Insert the element:
   *     https://dom.spec.whatwg.org/#concept-node-insert
   *     - Shadow-including descendants are connected. During parsing
   *       construction, there are no shadow-*excluding* descendants.
   *       However, the constructor may have validly attached a shadow
   *       tree to itself and added descendants to that shadow tree.
   *       (`connectedCallback` reactions enqueued.)
   *   - (Element queue popped from the custom element reactions stack.
   *     Reactions in the popped stack are invoked.)
   *
   * @param {!Node} root
   * @param {{
   *   visitedImports: (!Set<!Node>|undefined),
   *   upgrade: (!function(!Element)|undefined),
   * }=} options
   */
  patchAndUpgradeTree(root, options = {}) {
    const visitedImports = options.visitedImports;
    const upgrade = options.upgrade || (element => this.upgradeElement(element));

    const elements = [];

    const gatherElements = element => {
      if (!this.preferPerformance && element.localName === 'link' &&
          element.getAttribute('rel') === 'import') {
        // The HTML Imports polyfill sets a descendant element of the link to
        // the `import` property, specifically this is *not* a Document.
        const importNode = /** @type {?Node} */ (element.import);

        if (importNode instanceof Node) {
          importNode.__CE_isImportDocument = true;
          // Connected links are associated with the registry.
          importNode.__CE_hasRegistry = true;
        }

        if (importNode && importNode.readyState === 'complete') {
          importNode.__CE_documentLoadHandled = true;
        } else {
          // If this link's import root is not available, its contents can't be
          // walked. Wait for 'load' and walk it when it's ready.
          element.addEventListener('load', () => {
            const importNode = /** @type {!Node} */ (element.import);

            if (importNode.__CE_documentLoadHandled) return;
            importNode.__CE_documentLoadHandled = true;

            // Clone the `visitedImports` set that was populated sync during
            // the `patchAndUpgradeTree` call that caused this 'load' handler to
            // be added. Then, remove *this* link's import node so that we can
            // walk that import again, even if it was partially walked later
            // during the same `patchAndUpgradeTree` call.
            const clonedVisitedImports = new Set(visitedImports);
            clonedVisitedImports.delete(importNode);

            this.patchAndUpgradeTree(importNode, {visitedImports: clonedVisitedImports, upgrade});
          });
        }
      } else {
        if (this._hasPatches) {
          this.patchElement(element);
        }
        if (this.localNameToDefinition(element.localName) ||
            this.localNameToLazyDefinition(element.localName)) {
          elements.push(element);
        }
      }
    };

    // `onElements` populates (and internally checks against)
    // `visitedImports` when traversing a loaded import.
    this.onElements(root, gatherElements, visitedImports);

    for (let i = 0; i < elements.length; i++) {
      upgrade(elements[i]);
    }
  }

  /**
   * @param {!HTMLElement} element
   */
  upgradeElement(element) {
    const currentState = element.__CE_state;
    if (currentState !== undefined) return;

    // Prevent elements created in documents without a browsing context from
    // upgrading.
    //
    // https://html.spec.whatwg.org/multipage/custom-elements.html#look-up-a-custom-element-definition
    //   "If document does not have a browsing context, return null."
    //
    // https://html.spec.whatwg.org/multipage/window-object.html#dom-document-defaultview
    //   "The defaultView IDL attribute of the Document interface, on getting,
    //   must return this Document's browsing context's WindowProxy object, if
    //   this Document has an associated browsing context, or null otherwise."
    const ownerDocument = element.ownerDocument;
    if (
      !ownerDocument.defaultView &&
      !(ownerDocument.__CE_isImportDocument && ownerDocument.__CE_hasRegistry)
    ) return;

    const definition = this.localNameToDefinition(element.localName) ||
      this.flushLazyDefinition(element.localName);
    if (!definition) return;

    definition.constructionStack.push(element);

    const constructor = definition.constructorFunction;
    try {
      try {
        let result = new (constructor)();
        if (result !== element) {
          throw new Error('The custom element constructor did not produce the element being upgraded.');
        }
      } finally {
        definition.constructionStack.pop();
      }
    } catch (e) {
      element.__CE_state = CEState.failed;
      throw e;
    }

    element.__CE_state = CEState.custom;
    element.__CE_definition = definition;

    // Check `hasAttributes` here to avoid iterating when it's not necessary.
    if (definition.attributeChangedCallback && element.hasAttributes()) {
      const observedAttributes = definition.observedAttributes;
      for (let i = 0; i < observedAttributes.length; i++) {
        const name = observedAttributes[i];
        const value = element.getAttribute(name);
        if (value !== null) {
          this.attributeChangedCallback(element, name, null, value, null);
        }
      }
    }

    if (Utilities.isConnected(element)) {
      this.connectedCallback(element);
    }
  }

  /**
   * @param {!Element} element
   */
  connectedCallback(element) {
    const definition = element.__CE_definition;
    if (definition.connectedCallback) {
      definition.connectedCallback.call(element);
    }
  }

  /**
   * @param {!Element} element
   */
  disconnectedCallback(element) {
    const definition = element.__CE_definition;
    if (definition.disconnectedCallback) {
      definition.disconnectedCallback.call(element);
    }
  }

  /**
   * @param {!Element} element
   * @param {string} name
   * @param {?string} oldValue
   * @param {?string} newValue
   * @param {?string} namespace
   */
  attributeChangedCallback(element, name, oldValue, newValue, namespace) {
    const definition = element.__CE_definition;
    if (
      definition.attributeChangedCallback &&
      definition.observedAttributes.indexOf(name) > -1
    ) {
      definition.attributeChangedCallback.call(element, name, oldValue, newValue, namespace);
    }
  }
}
