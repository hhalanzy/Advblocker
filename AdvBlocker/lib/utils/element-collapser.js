/**
 * This file is part of advblocker Browser Extension (https://github.com/advblockerTeam/advblockerBrowserExtension).
 *
 * advblocker Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * advblocker Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with advblocker Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global CSS */

/**
 * Object that collapses or hides DOM elements and able to roll it back.
 */
var ElementCollapser = (function () { // jshint ignore:line

    /**
     * The <style> node that contains all the collapsing styles
     */
    var styleNode;

    /**
     * Adds "selectorText { display:none!important; }" style
     * @param selectorText
     * @param cssText optional
     */
    var hideBySelector = function (selectorText, cssText) {
        var rule = selectorText + '{' + (cssText || "display: none!important;") + '}';

        if (!styleNode) {
            styleNode = document.createElement("style");
            styleNode.setAttribute("type", "text/css");
            (document.head || document.documentElement).appendChild(styleNode);
        }

        styleNode.sheet.insertRule(rule, styleNode.sheet.cssRules.length);
    };

    /**
     * Adds "selectorText { display:none!important; }" style
     */
    var hideBySelectorAndTagName = function (selectorText, tagName) {
        if (tagName === "frame" || tagName === "iframe") {
            // Use specific style for frames due to these issues:
            // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/346
            // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/355
            // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/347
            // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/733
            hideBySelector(selectorText, "visibility: hidden!important; height: 0px!important; min-height: 0px!important;");
        } else {
            hideBySelector(selectorText, null);
        }
    };

    /**
     * Creates selector for specified tagName and src attribute
     */
    var createSelectorForSrcAttr = function (srcAttrValue, tagName) {
        return tagName + '[src="' + CSS.escape(srcAttrValue) + '"]';
    };

    /**
     * Clears priority for specified styles
     *
     * @param {HTMLElement} element element affected
     * @param {Array.<string>} styles array of style names
     */
    var clearElStylesPriority = function (element, styles) {
        var elementStyle = element.style;

        styles.forEach(function (prop) {
            var elCssPriority = elementStyle.getPropertyPriority(prop);
            if (elCssPriority && elCssPriority.toLowerCase() === 'important') {
                var elCssValue = elementStyle.getPropertyValue(prop);
                elementStyle.setProperty(prop, elCssValue, null);
            }
        });
    };

    /**
     * Collapses the specified element using a CSS style if possible (or inline style if not)
     *
     * @param {HTMLElement} element Element to collapse
     * @param {string} elementUrl Element's source url
     */
    var collapseElement = function (element, elementUrl) {

        if (isCollapsed(element)) {
            return;
        }

        var tagName = element.tagName.toLowerCase();

        if (elementUrl) {

            // Check that element still has the same "src" attribute
            // If it has changed, we do not need to collapse it anymore
            if (element.src === elementUrl) {
                // To not to keep track of changing src for elements, we are going to collapse it with a CSS rule
                // But we take element url, cause current source could be already modified
                // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/408
                var srcAttribute = element.getAttribute('src');
                var srcSelector = createSelectorForSrcAttr(srcAttribute, tagName);
                hideBySelectorAndTagName(srcSelector, tagName);

                // Remove important priority from the element style
                // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/733
                clearElStylesPriority(element, ['display', 'visibility', 'height', 'min-height']);
            }

            // Do not process it further in any case
            return;
        }

        var cssProperty = "display";
        var cssValue = "none";
        var cssPriority = "important";

        if (tagName == "frame") {
            cssProperty = "visibility";
            cssValue = "hidden";
        }

        var elementStyle = element.style;
        var elCssValue = elementStyle.getPropertyValue(cssProperty);
        var elCssPriority = elementStyle.getPropertyPriority(cssProperty);

        // <input type="image"> elements try to load their image again
        // when the "display" CSS property is set. So we have to check
        // that it isn't already collapsed to avoid an infinite recursion.
        if (elCssValue != cssValue || elCssPriority != cssPriority) {
            elementStyle.setProperty(cssProperty, cssValue, cssPriority);
        }
    };

    /**
     * Checks if specified element is already collapsed or not.
     * There is a big chance that we've already done it from the background page (see collapseElement method in webrequest.js)
     * 
     * @param {HTMLElement} element Element to check
     */
    var isCollapsed = function (element) {
        var computedStyle = window.getComputedStyle(element);
        return (computedStyle && computedStyle.display === "none");
    };

    /**
     * Removes the collapser's style node
     */
    var clear = function() {
        if (!styleNode) {
            return;
        }

        styleNode.parentNode.removeChild(styleNode);
    };

    // EXPOSE
    return {
        collapseElement: collapseElement,
        isCollapsed: isCollapsed,
        clear: clear
    };
})();