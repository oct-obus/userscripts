// ==UserScript==
// @name         Fritz!Box Mesh Page Fix
// @namespace    https://github.com/oct-obus/userscripts
// @version      1.0.0
// @description  Fixes mesh page freezing via DOM diffing, response deduplication, and rAF batching
// @author       Zen
// @match        http://fritz.box/*
// @match        https://fritz.box/*
// @match        http://192.168.178.1/*
// @match        https://192.168.178.1/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=fritz.box
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/oct-obus/userscripts/main/fritz-mesh-fix.user.js
// @downloadURL  https://raw.githubusercontent.com/oct-obus/userscripts/main/fritz-mesh-fix.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ─── morphdom 2.7.4 (Patrick Steele-Idem, MIT) ────────────────────────────
  // Inlined to avoid CDN dependency — Fritz!Box is local-only and may lack internet.
  /* eslint-disable */
  const morphdom=(function(){var DOCUMENT_FRAGMENT_NODE=11;function morphAttrs(fromNode,toNode){var toNodeAttrs=toNode.attributes;var attr;var attrName;var attrNamespaceURI;var attrValue;var fromValue;if(toNode.nodeType===DOCUMENT_FRAGMENT_NODE||fromNode.nodeType===DOCUMENT_FRAGMENT_NODE){return}for(var i=toNodeAttrs.length-1;i>=0;i--){attr=toNodeAttrs[i];attrName=attr.name;attrNamespaceURI=attr.namespaceURI;attrValue=attr.value;if(attrNamespaceURI){attrName=attr.localName||attrName;fromValue=fromNode.getAttributeNS(attrNamespaceURI,attrName);if(fromValue!==attrValue){if(attr.prefix==="xmlns"){attrName=attr.name}fromNode.setAttributeNS(attrNamespaceURI,attrName,attrValue)}}else{fromValue=fromNode.getAttribute(attrName);if(fromValue!==attrValue){fromNode.setAttribute(attrName,attrValue)}}}var fromNodeAttrs=fromNode.attributes;for(var d=fromNodeAttrs.length-1;d>=0;d--){attr=fromNodeAttrs[d];attrName=attr.name;attrNamespaceURI=attr.namespaceURI;if(attrNamespaceURI){attrName=attr.localName||attrName;if(!toNode.hasAttributeNS(attrNamespaceURI,attrName)){fromNode.removeAttributeNS(attrNamespaceURI,attrName)}}else{if(!toNode.hasAttribute(attrName)){fromNode.removeAttribute(attrName)}}}}var range;var NS_XHTML="http://www.w3.org/1999/xhtml";var doc=typeof document==="undefined"?undefined:document;var HAS_TEMPLATE_SUPPORT=!!doc&&"content"in doc.createElement("template");var HAS_RANGE_SUPPORT=!!doc&&doc.createRange&&"createContextualFragment"in doc.createRange();function createFragmentFromTemplate(str){var template=doc.createElement("template");template.innerHTML=str;return template.content.childNodes[0]}function createFragmentFromRange(str){if(!range){range=doc.createRange();range.selectNode(doc.body)}var fragment=range.createContextualFragment(str);return fragment.childNodes[0]}function createFragmentFromWrap(str){var fragment=doc.createElement("body");fragment.innerHTML=str;return fragment.childNodes[0]}function toElement(str){str=str.trim();if(HAS_TEMPLATE_SUPPORT){return createFragmentFromTemplate(str)}else if(HAS_RANGE_SUPPORT){return createFragmentFromRange(str)}return createFragmentFromWrap(str)}function compareNodeNames(fromEl,toEl){var fromNodeName=fromEl.nodeName;var toNodeName=toEl.nodeName;var fromCodeStart,toCodeStart;if(fromNodeName===toNodeName){return true}fromCodeStart=fromNodeName.charCodeAt(0);toCodeStart=toNodeName.charCodeAt(0);if(fromCodeStart<=90&&toCodeStart>=97){return fromNodeName===toNodeName.toUpperCase()}else if(toCodeStart<=90&&fromCodeStart>=97){return toNodeName===fromNodeName.toUpperCase()}else{return false}}function createElementNS(name,namespaceURI){return!namespaceURI||namespaceURI===NS_XHTML?doc.createElement(name):doc.createElementNS(namespaceURI,name)}function moveChildren(fromEl,toEl){var curChild=fromEl.firstChild;while(curChild){var nextChild=curChild.nextSibling;toEl.appendChild(curChild);curChild=nextChild}return toEl}function syncBooleanAttrProp(fromEl,toEl,name){if(fromEl[name]!==toEl[name]){fromEl[name]=toEl[name];if(fromEl[name]){fromEl.setAttribute(name,"")}else{fromEl.removeAttribute(name)}}}var specialElHandlers={OPTION:function(fromEl,toEl){var parentNode=fromEl.parentNode;if(parentNode){var parentName=parentNode.nodeName.toUpperCase();if(parentName==="OPTGROUP"){parentNode=parentNode.parentNode;parentName=parentNode&&parentNode.nodeName.toUpperCase()}if(parentName==="SELECT"&&!parentNode.hasAttribute("multiple")){if(fromEl.hasAttribute("selected")&&!toEl.selected){fromEl.setAttribute("selected","selected");fromEl.removeAttribute("selected")}parentNode.selectedIndex=-1}}syncBooleanAttrProp(fromEl,toEl,"selected")},INPUT:function(fromEl,toEl){syncBooleanAttrProp(fromEl,toEl,"checked");syncBooleanAttrProp(fromEl,toEl,"disabled");if(fromEl.value!==toEl.value){fromEl.value=toEl.value}if(!toEl.hasAttribute("value")){fromEl.removeAttribute("value")}},TEXTAREA:function(fromEl,toEl){var newValue=toEl.value;if(fromEl.value!==newValue){fromEl.value=newValue}var firstChild=fromEl.firstChild;if(firstChild){var oldValue=firstChild.nodeValue;if(oldValue==newValue||!newValue&&oldValue==fromEl.placeholder){return}firstChild.nodeValue=newValue}},SELECT:function(fromEl,toEl){if(!toEl.hasAttribute("multiple")){var selectedIndex=-1;var i=0;var curChild=fromEl.firstChild;var optgroup;var nodeName;while(curChild){nodeName=curChild.nodeName&&curChild.nodeName.toUpperCase();if(nodeName==="OPTGROUP"){optgroup=curChild;curChild=optgroup.firstChild}else{if(nodeName==="OPTION"){if(curChild.hasAttribute("selected")){selectedIndex=i;break}i++}curChild=curChild.nextSibling;if(!curChild&&optgroup){curChild=optgroup.nextSibling;optgroup=null}}}fromEl.selectedIndex=selectedIndex}}};var ELEMENT_NODE=1;var DOCUMENT_FRAGMENT_NODE$1=11;var TEXT_NODE=3;var COMMENT_NODE=8;function noop(){}function defaultGetNodeKey(node){if(node){return node.getAttribute&&node.getAttribute("id")||node.id}}function morphdomFactory(morphAttrs){return function morphdom(fromNode,toNode,options){if(!options){options={}}if(typeof toNode==="string"){if(fromNode.nodeName==="#document"||fromNode.nodeName==="HTML"||fromNode.nodeName==="BODY"){var toNodeHtml=toNode;toNode=doc.createElement("html");toNode.innerHTML=toNodeHtml}else{toNode=toElement(toNode)}}else if(toNode.nodeType===DOCUMENT_FRAGMENT_NODE$1){toNode=toNode.firstElementChild}var getNodeKey=options.getNodeKey||defaultGetNodeKey;var onBeforeNodeAdded=options.onBeforeNodeAdded||noop;var onNodeAdded=options.onNodeAdded||noop;var onBeforeElUpdated=options.onBeforeElUpdated||noop;var onElUpdated=options.onElUpdated||noop;var onBeforeNodeDiscarded=options.onBeforeNodeDiscarded||noop;var onNodeDiscarded=options.onNodeDiscarded||noop;var onBeforeElChildrenUpdated=options.onBeforeElChildrenUpdated||noop;var skipFromChildren=options.skipFromChildren||noop;var addChild=options.addChild||function(parent,child){return parent.appendChild(child)};var childrenOnly=options.childrenOnly===true;var fromNodesLookup=Object.create(null);var keyedRemovalList=[];function addKeyedRemoval(key){keyedRemovalList.push(key)}function walkDiscardedChildNodes(node,skipKeyedNodes){if(node.nodeType===ELEMENT_NODE){var curChild=node.firstChild;while(curChild){var key=undefined;if(skipKeyedNodes&&(key=getNodeKey(curChild))){addKeyedRemoval(key)}else{onNodeDiscarded(curChild);if(curChild.firstChild){walkDiscardedChildNodes(curChild,skipKeyedNodes)}}curChild=curChild.nextSibling}}}function removeNode(node,parentNode,skipKeyedNodes){if(onBeforeNodeDiscarded(node)===false){return}if(parentNode){parentNode.removeChild(node)}onNodeDiscarded(node);walkDiscardedChildNodes(node,skipKeyedNodes)}function indexTree(node){if(node.nodeType===ELEMENT_NODE||node.nodeType===DOCUMENT_FRAGMENT_NODE$1){var curChild=node.firstChild;while(curChild){var key=getNodeKey(curChild);if(key){fromNodesLookup[key]=curChild}indexTree(curChild);curChild=curChild.nextSibling}}}indexTree(fromNode);function handleNodeAdded(el){onNodeAdded(el);var curChild=el.firstChild;while(curChild){var nextSibling=curChild.nextSibling;var key=getNodeKey(curChild);if(key){var unmatchedFromEl=fromNodesLookup[key];if(unmatchedFromEl&&compareNodeNames(curChild,unmatchedFromEl)){curChild.parentNode.replaceChild(unmatchedFromEl,curChild);morphEl(unmatchedFromEl,curChild)}else{handleNodeAdded(curChild)}}else{handleNodeAdded(curChild)}curChild=nextSibling}}function cleanupFromEl(fromEl,curFromNodeChild,curFromNodeKey){while(curFromNodeChild){var fromNextSibling=curFromNodeChild.nextSibling;if(curFromNodeKey=getNodeKey(curFromNodeChild)){addKeyedRemoval(curFromNodeKey)}else{removeNode(curFromNodeChild,fromEl,true)}curFromNodeChild=fromNextSibling}}function morphEl(fromEl,toEl,childrenOnly){var toElKey=getNodeKey(toEl);if(toElKey){delete fromNodesLookup[toElKey]}if(!childrenOnly){var beforeUpdateResult=onBeforeElUpdated(fromEl,toEl);if(beforeUpdateResult===false){return}else if(beforeUpdateResult instanceof HTMLElement){fromEl=beforeUpdateResult;indexTree(fromEl)}morphAttrs(fromEl,toEl);onElUpdated(fromEl);if(onBeforeElChildrenUpdated(fromEl,toEl)===false){return}}if(fromEl.nodeName!=="TEXTAREA"){morphChildren(fromEl,toEl)}else{specialElHandlers.TEXTAREA(fromEl,toEl)}}function morphChildren(fromEl,toEl){var skipFrom=skipFromChildren(fromEl,toEl);var curToNodeChild=toEl.firstChild;var curFromNodeChild=fromEl.firstChild;var curToNodeKey;var curFromNodeKey;var fromNextSibling;var toNextSibling;var matchingFromEl;outer:while(curToNodeChild){toNextSibling=curToNodeChild.nextSibling;curToNodeKey=getNodeKey(curToNodeChild);while(!skipFrom&&curFromNodeChild){fromNextSibling=curFromNodeChild.nextSibling;if(curToNodeChild.isSameNode&&curToNodeChild.isSameNode(curFromNodeChild)){curToNodeChild=toNextSibling;curFromNodeChild=fromNextSibling;continue outer}curFromNodeKey=getNodeKey(curFromNodeChild);var curFromNodeType=curFromNodeChild.nodeType;var isCompatible=undefined;if(curFromNodeType===curToNodeChild.nodeType){if(curFromNodeType===ELEMENT_NODE){if(curToNodeKey){if(curToNodeKey!==curFromNodeKey){if(matchingFromEl=fromNodesLookup[curToNodeKey]){if(fromNextSibling===matchingFromEl){isCompatible=false}else{fromEl.insertBefore(matchingFromEl,curFromNodeChild);if(curFromNodeKey){addKeyedRemoval(curFromNodeKey)}else{removeNode(curFromNodeChild,fromEl,true)}curFromNodeChild=matchingFromEl;curFromNodeKey=getNodeKey(curFromNodeChild)}}else{isCompatible=false}}}else if(curFromNodeKey){isCompatible=false}isCompatible=isCompatible!==false&&compareNodeNames(curFromNodeChild,curToNodeChild);if(isCompatible){morphEl(curFromNodeChild,curToNodeChild)}}else if(curFromNodeType===TEXT_NODE||curFromNodeType==COMMENT_NODE){isCompatible=true;if(curFromNodeChild.nodeValue!==curToNodeChild.nodeValue){curFromNodeChild.nodeValue=curToNodeChild.nodeValue}}}if(isCompatible){curToNodeChild=toNextSibling;curFromNodeChild=fromNextSibling;continue outer}if(curFromNodeKey){addKeyedRemoval(curFromNodeKey)}else{removeNode(curFromNodeChild,fromEl,true)}curFromNodeChild=fromNextSibling}if(curToNodeKey&&(matchingFromEl=fromNodesLookup[curToNodeKey])&&compareNodeNames(matchingFromEl,curToNodeChild)){if(!skipFrom){addChild(fromEl,matchingFromEl)}morphEl(matchingFromEl,curToNodeChild)}else{var onBeforeNodeAddedResult=onBeforeNodeAdded(curToNodeChild);if(onBeforeNodeAddedResult!==false){if(onBeforeNodeAddedResult){curToNodeChild=onBeforeNodeAddedResult}if(curToNodeChild.actualize){curToNodeChild=curToNodeChild.actualize(fromEl.ownerDocument||doc)}addChild(fromEl,curToNodeChild);handleNodeAdded(curToNodeChild)}}curToNodeChild=toNextSibling;curFromNodeChild=fromNextSibling}cleanupFromEl(fromEl,curFromNodeChild,curFromNodeKey);var specialElHandler=specialElHandlers[fromEl.nodeName];if(specialElHandler){specialElHandler(fromEl,toEl)}}var morphedNode=fromNode;var morphedNodeType=morphedNode.nodeType;var toNodeType=toNode.nodeType;if(!childrenOnly){if(morphedNodeType===ELEMENT_NODE){if(toNodeType===ELEMENT_NODE){if(!compareNodeNames(fromNode,toNode)){onNodeDiscarded(fromNode);morphedNode=moveChildren(fromNode,createElementNS(toNode.nodeName,toNode.namespaceURI))}}else{morphedNode=toNode}}else if(morphedNodeType===TEXT_NODE||morphedNodeType===COMMENT_NODE){if(toNodeType===morphedNodeType){if(morphedNode.nodeValue!==toNode.nodeValue){morphedNode.nodeValue=toNode.nodeValue}return morphedNode}else{morphedNode=toNode}}}if(morphedNode===toNode){onNodeDiscarded(fromNode)}else{if(toNode.isSameNode&&toNode.isSameNode(morphedNode)){return}morphEl(morphedNode,toNode,childrenOnly);if(keyedRemovalList){for(var i=0,len=keyedRemovalList.length;i<len;i++){var elToRemove=fromNodesLookup[keyedRemovalList[i]];if(elToRemove){removeNode(elToRemove,elToRemove.parentNode,false)}}}}if(!childrenOnly&&morphedNode!==fromNode&&fromNode.parentNode){if(morphedNode.actualize){morphedNode=morphedNode.actualize(fromNode.ownerDocument||doc)}fromNode.parentNode.replaceChild(morphedNode,fromNode)}return morphedNode}}return morphdomFactory(morphAttrs)})();
  /* eslint-enable */

  // ─── Configuration ─────────────────────────────────────────────────────────
  const LOG_PREFIX = '[MeshFix]';

  // ─── Per-page-session state (reset on each navigation to mesh) ─────────────
  let firstRender = true;
  let lastDataHash = null;
  let stats = { renders: 0, skips: 0 };

  function resetState() {
    firstRender = true;
    lastDataHash = null;
    stats = { renders: 0, skips: 0 };
  }

  // ─── Response deduplication ────────────────────────────────────────────────
  // Hash the data payload, excluding fields that change every cycle without
  // affecting the visual output (e.g. server-side timestamp).
  function hashData(data) {
    try {
      const { timestamp, ...rest } = data;
      return JSON.stringify(rest);
    } catch {
      return null; // unhashable → always render
    }
  }

  // ─── DOM morphing via patched replaceChildren ──────────────────────────────
  // AVM's dom.js utility calls `parent.replaceChildren(fragment)` which nukes
  // the entire subtree. We override it on #content to use morphdom instead,
  // preserving stable DOM nodes, Web Component state, and GIF animations.
  //
  // The patch is scoped: it only applies morphdom while on the mesh page.
  // On any other page, it falls through to the native method so that AVM's
  // Web Component lifecycle (connectedCallback etc.) works normally.
  function patchContentElement() {
    const el = document.getElementById('content');
    if (!el || el._meshFixPatched) return;

    const nativeReplaceChildren = HTMLElement.prototype.replaceChildren.bind(el);
    el._meshFixPatched = true;
    el.replaceChildren = function (...children) {
      if (!location.hash.startsWith('#/mesh')) {
        return nativeReplaceChildren(...children);
      }
      const wrapper = document.createElement('div');
      for (const child of children) wrapper.appendChild(child);
      morphdom(this, wrapper, { childrenOnly: true });
    };
  }

  // ─── Wrap a paintFunc with dedup + rAF + morphdom ──────────────────────────
  function createPaintWrapper(originalPaint) {
    return function wrappedPaint(data) {
      // First render: let it through unmodified so the initial DOM is built,
      // then patch #content for all subsequent renders.
      if (firstRender) {
        firstRender = false;
        lastDataHash = hashData(data);
        originalPaint(data);
        patchContentElement();
        stats.renders++;
        console.log(LOG_PREFIX, 'Initial render complete — morphdom active');
        return;
      }

      // Response deduplication: skip render if data hasn't changed.
      const hash = hashData(data);
      if (hash !== null && hash === lastDataHash) {
        stats.skips++;
        return;
      }

      // Schedule the render at the start of the next frame to avoid
      // mid-composite DOM mutations. Hash is updated inside the callback
      // so dedup state always reflects what's actually on screen.
      requestAnimationFrame(() => {
        lastDataHash = hash;
        originalPaint(data);
        stats.renders++;
        console.log(LOG_PREFIX, `Render #${stats.renders} (${stats.skips} skipped)`);
      });
    };
  }

  // ─── Hook into Fritz!Box refresh timer system ─────────────────────────────
  // window.main.setRefreshTimers is set by main.js and is the public entry
  // point that every page module calls to register its polling timers.
  // We wrap it to intercept the mesh page's timer registration and replace
  // its paintFunc (buildPage) with our optimised version.
  function installHook() {
    if (!window.main || typeof window.main.setRefreshTimers !== 'function') {
      setTimeout(installHook, 50);
      return;
    }

    const origSetRefreshTimers = window.main.setRefreshTimers;

    window.main.setRefreshTimers = function (timers) {
      const isMeshPage =
        timers?.initial?.pid === 'homeNet' ||
        timers?.refresh?.pid === 'homeNet';

      if (isMeshPage) {
        resetState();
        for (const id of ['initial', 'refresh']) {
          if (timers[id]?.paintFunc) {
            timers[id].paintFunc = createPaintWrapper(timers[id].paintFunc);
          }
        }
        console.log(LOG_PREFIX, 'Mesh page detected — hooks installed');
      }

      return origSetRefreshTimers.apply(this, arguments);
    };

    console.log(LOG_PREFIX, 'Ready');
  }

  installHook();
})();
