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

(function (advblocker) {

    'use strict';

    const CSP_HEADER_NAME = 'Content-Security-Policy';

    /**
     * In the case of the tabs.insertCSS API support we're trying to collapse a blocked element from the background page.
     * In order to do it we need to have a mapping requestType<->tagNames.
     */
    const REQUEST_TYPE_COLLAPSE_TAG_NAMES = {
        [advblocker.RequestTypes.SUBDOCUMENT]: ["frame", "iframe"],
        [advblocker.RequestTypes.IMAGE]: ["img"]
    };

    /**
     * In the newer versions of Firefox and Chromium we're able to inject CSS and scripts
     * using a better approach -- `browser.tabs.insertCSS` and `browser.tabs.executeScript`
     * instead of the traditional one (messaging to the content script).
     */
    const shouldUseInsertCSSAndExecuteScript = advblocker.prefs.features.canUseInsertCSSAndExecuteScript;

    /**
     * Retrieve referrer url from request details.
     * Extract referrer by priority:
     * 1. referrerUrl in requestDetails
     * 2. url of frame where request was created
     * 3. url of main frame
     *
     * @param requestDetails
     * @returns {*|Frame}
     */
    function getReferrerUrl(requestDetails) {
        return requestDetails.referrerUrl ||
            advblocker.frames.getFrameUrl(requestDetails.tab, requestDetails.requestFrameId) ||
            advblocker.frames.getMainFrameUrl(requestDetails.tab);
    }

    /**
     * Process request
     *
     * @param {RequestDetails} requestDetails
     * @returns {boolean|{Object}} False if request must be blocked, object if url was redirected
     */
    function onBeforeRequest(requestDetails) {
        const tab = requestDetails.tab;
        const tabId = tab.tabId;
        const requestId = requestDetails.requestId;
        const requestUrl = requestDetails.requestUrl;
        const originUrl = requestDetails.originUrl;
        const requestType = requestDetails.requestType;
        const frameId = requestDetails.frameId;
        const requestFrameId = requestDetails.requestFrameId || 0;

        if (requestType === advblocker.RequestTypes.DOCUMENT || requestType === advblocker.RequestTypes.SUBDOCUMENT) {
            advblocker.frames.recordFrame(tab, frameId, requestUrl, requestType);
        }

        if (requestType === advblocker.RequestTypes.DOCUMENT) {
            // Reset tab button state
            advblocker.listeners.notifyListeners(advblocker.listeners.UPDATE_TAB_BUTTON_STATE, tab, true);

            // Record request context for the main frame
            advblocker.requestContextStorage.record(requestId, requestUrl, requestUrl, originUrl, requestType, tab);

            // Strip tracking parameters
            const cleansedUrl = advblocker.stealthService.removeTrackersFromUrl(requestId);
            if (cleansedUrl) {
                return { redirectUrl: cleansedUrl };
            }

            /**
             * Just to remember!
             * In the case of the "about:newtab" pages we don't receive onResponseReceived event for the main_frame
             * Also if chrome://newtab is overwritten, we won't receive any webRequest events for the main_frame
             * Unfortunately, we can't do anything in this case and just must remember about it
             */

            /**
             * Binds rule to the main_frame request
             * In integration mode, rule from the headers will override this value
             */
            const tabRequestRule = advblocker.frames.getFrameWhiteListRule(tab);
            if (tabRequestRule) {
                advblocker.requestContextStorage.update(requestId, { requestRule: tabRequestRule });
            }

            return;
        }

        if (!advblocker.utils.url.isHttpOrWsRequest(requestUrl)) {
            // Do not mess with other extensions
            return;
        }

        const referrerUrl = getReferrerUrl(requestDetails);

        // Record request for other types
        advblocker.requestContextStorage.record(requestId, requestUrl, referrerUrl, originUrl, requestType, tab);

        // Strip tracking parameters
        const cleansedUrl = advblocker.stealthService.removeTrackersFromUrl(requestId);
        if (cleansedUrl) {
            return { redirectUrl: cleansedUrl };
        }

        let requestRule = advblocker.webRequestService.getRuleForRequest(
            tab,
            requestUrl,
            referrerUrl,
            requestType
        );
        requestRule = advblocker.webRequestService.postProcessRequest(
            tab,
            requestUrl,
            referrerUrl,
            requestType,
            requestRule
        );

        if (requestRule) {
            advblocker.requestContextStorage.update(requestId, { requestRule });
        }

        const response = advblocker.webRequestService.getBlockedResponseByRule(
            requestRule,
            requestType
        );

        if (response && response.cancel) {
            collapseElement(tabId, requestFrameId, requestUrl, referrerUrl, requestType);
        }

        return response;
    }

    /**
     * Tries to collapse a blocked element using tabs.insertCSS.
     *
     * This method of collapsing has numerous advantages over the traditional one.
     * First of all, it prevents blocked elements flickering as it occurs earlier.
     * Second, it is harder to detect as there's no custom <style> node required.
     *
     * However, we're still keeping the old approach intact - we have not enough information
     * here to properly collapse elements that use relative URLs (<img src='../path_to_element'>).
     *
     * @param {number} tabId Tab id
     * @param {number} requestFrameId Id of a frame request was sent from
     * @param {string} requestUrl Request URL
     * @param {string} referrerUrl Referrer URL
     * @param {string} requestType A member of advblocker.RequestTypes
     */
    function collapseElement(tabId, requestFrameId, requestUrl, referrerUrl, requestType) {
        if (!shouldUseInsertCSSAndExecuteScript) {
            return;
        }

        let tagNames = REQUEST_TYPE_COLLAPSE_TAG_NAMES[requestType];
        if (!tagNames) {
            // Collapsing is not supported for this request type
            return;
        }

        // Collapsing is not supported for the requests which happen out of the tabs, e.g. other extensions
        if (tabId === -1) {
            return;
        }

        // Strip the protocol and host name (for first-party requests) from the selector
        let thirdParty = advblocker.utils.url.isThirdPartyRequest(requestUrl, referrerUrl);
        let srcUrlStartIndex = requestUrl.indexOf("//");
        if (!thirdParty) {
            srcUrlStartIndex = requestUrl.indexOf("/", srcUrlStartIndex + 2);
        }
        let srcUrl = requestUrl.substring(srcUrlStartIndex);

        const collapseStyle = "{ display: none!important; visibility: hidden!important; height: 0px!important; min-height: 0px!important; }";
        let css = "";
        let iTagNames = tagNames.length;

        while (iTagNames--) {
            css += tagNames[iTagNames] + "[src$=\"" + srcUrl + "\"] " + collapseStyle + "\n";
        }

        advblocker.tabs.insertCssCode(tabId, requestFrameId, css);
    }

    /**
     * Called before request is sent to the remote endpoint.
     * This method is used to modify request in case of working in integration mode,
     * to modify headers for stealth service and also to record referrer header in frame data.
     *
     * @param requestDetails Request details
     * @returns {*} headers to send
     */
    function onBeforeSendHeaders(requestDetails) {

        var tab = requestDetails.tab;
        var requestId = requestDetails.requestId;
        var requestHeaders = requestDetails.requestHeaders;
        var requestType = requestDetails.requestType;

        advblocker.requestContextStorage.update(requestId, { requestHeaders });

        let requestHeadersModified = false;

        if (advblocker.integration.shouldOverrideReferrer(tab) &&
            (requestType === advblocker.RequestTypes.DOCUMENT || advblocker.frames.isTabadvblockerDetected(tab))) {

            // Retrieve main frame url
            var mainFrameUrl = advblocker.frames.getMainFrameUrl(tab);
            requestHeaders = advblocker.utils.browser.setHeaderValue(requestHeaders, 'Referer', mainFrameUrl);
            requestHeadersModified = true;
        }

        if (requestType === advblocker.RequestTypes.DOCUMENT) {
            // Save ref header
            var refHeader = advblocker.utils.browser.findHeaderByName(requestHeaders, 'Referer');
            if (refHeader) {
                advblocker.frames.recordFrameReferrerHeader(tab, refHeader.value);
            }
        }

        if (advblocker.cookieFiltering.filterRequestHeaders(requestId, requestHeaders)) {
            requestHeadersModified = true;
        }

        if (advblocker.stealthService.processRequestHeaders(requestId, requestHeaders)) {
            requestHeadersModified = true;
        }

        if (requestHeadersModified) {
            advblocker.requestContextStorage.update(requestId, { modifiedRequestHeaders: requestHeaders });
            return { requestHeaders };
        }

        return {};
    }

    /**
     * On headers received callback function.
     * We do check request for safebrowsing
     * and check if websocket connections should be blocked.
     *
     * @param requestDetails Request details
     * @returns {{responseHeaders: *}} Headers to send
     */
    function onHeadersReceived(requestDetails) {

        var tab = requestDetails.tab;
        var requestUrl = requestDetails.requestUrl;
        var responseHeaders = requestDetails.responseHeaders || [];
        var requestType = requestDetails.requestType;
        var referrerUrl = getReferrerUrl(requestDetails);
        var requestId = requestDetails.requestId;
        var statusCode = requestDetails.statusCode;
        var method = requestDetails.method;

        advblocker.requestContextStorage.update(requestId, { responseHeaders });

        const requestRule = advblocker.webRequestService.processRequestResponse(tab, requestUrl, referrerUrl, requestType, responseHeaders);
        // Overrides rule in integration mode
        if (advblocker.frames.isTabadvblockerDetected(tab)) {
            advblocker.requestContextStorage.update(requestId, { requestRule });
        }

        // Safebrowsing check
        if (requestType === advblocker.RequestTypes.DOCUMENT &&
            // Don't apply safebrowsing filter in case of redirect
            // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/995
            statusCode !== 301 && statusCode !== 302) {
            filterSafebrowsing(tab, requestUrl);
        }

        if (advblocker.contentFiltering) {
            var contentType = advblocker.utils.browser.getHeaderValueByName(responseHeaders, 'content-type');
            advblocker.contentFiltering.apply(tab, requestUrl, referrerUrl, requestType, requestId, statusCode, method, contentType);
        }

        let responseHeadersModified = false;

        if (requestType === advblocker.RequestTypes.DOCUMENT || requestType === advblocker.RequestTypes.SUBDOCUMENT) {
            const cspHeaders = getCSPHeaders(requestDetails);
            if (cspHeaders && cspHeaders.length > 0) {
                responseHeaders = responseHeaders.concat(cspHeaders);
                responseHeadersModified = true;
            }
        }

        if (advblocker.cookieFiltering.filterResponseHeaders(requestId, responseHeaders)) {
            responseHeadersModified = true;
        }

        if (responseHeadersModified) {
            advblocker.requestContextStorage.update(requestId, { modifiedResponseHeaders: responseHeaders });
            return { responseHeaders };
        }
    }

    /**
     * Before the introduction of $CSP rules, we used another approach for modifying Content-Security-Policy header.
     * We are looking for URL blocking rule that matches some request type and protocol (ws:, blob:, stun:)
     * e.g. "$webrtc,domain=hdmoza.com"
     *
     * @param tab Tab
     * @param frameUrl Frame URL
     * @returns matching rule
     */
    function findLegacyCspRule(tab, frameUrl) {
        return advblocker.webRequestService.getRuleForRequest(tab, 'stun:advblockerwebrtc.check', frameUrl, advblocker.RequestTypes.WEBRTC);
    }

    /**
     * Modify CSP header to block WebSocket, prohibit data: and blob: frames and WebWorkers
     * @param requestDetails
     * @returns {{responseHeaders: *}} CSP headers
     */
    function getCSPHeaders(requestDetails) {

        // Please note, that we do not modify response headers in Edge before Creators update:
        // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/401
        // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8796739/
        if (advblocker.utils.browser.isEdgeBeforeCreatorsUpdate()) {
            return;
        }

        var tab = requestDetails.tab;
        var requestId = requestDetails.requestId;
        var requestUrl = requestDetails.requestUrl;
        var requestType = requestDetails.requestType;
        var frameUrl = advblocker.frames.getFrameUrl(tab, requestDetails.frameId);

        var cspHeaders = [];

        const legacyCspRule = findLegacyCspRule(tab, frameUrl);
        if (advblocker.webRequestService.isRequestBlockedByRule(legacyCspRule)) {
            cspHeaders.push({
                name: CSP_HEADER_NAME,
                value: advblocker.rules.CspFilter.DEFAULT_DIRECTIVE,
            });
        }
        if (legacyCspRule) {
            advblocker.requestContextStorage.update(requestId, { cspRules: [legacyCspRule] });
        }

        /**
         * Retrieve $CSP rules specific for the request
         * https://github.com/advblockerteam/advblockerbrowserextension/issues/685
         */
        const cspRules = advblocker.webRequestService.getCspRules(tab, requestUrl, frameUrl, requestType);
        if (cspRules) {
            for (let i = 0; i < cspRules.length; i += 1) {
                let rule = cspRules[i];
                // Don't forget: getCspRules returns all $csp rules, we must directly check that the rule is blocking.
                if (advblocker.webRequestService.isRequestBlockedByRule(rule)) {
                    cspHeaders.push({
                        name: CSP_HEADER_NAME,
                        value: rule.cspDirective,
                    });
                }
            }
            if (cspRules.length > 0) {
                advblocker.requestContextStorage.update(requestId, { cspRules });
            }
        }

        /**
         * Websocket connection is blocked by connect-src directive
         * https://www.w3.org/TR/CSP2/#directive-connect-src
         *
         * Web Workers is blocked by child-src directive
         * https://www.w3.org/TR/CSP2/#directive-child-src
         * https://www.w3.org/TR/CSP3/#directive-worker-src
         * We have to use child-src as fallback for worker-src, because it isn't supported
         * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/worker-src#Browser_compatibility
         *
         * We also need the frame-src restriction since CSPs are not inherited from the parent for documents with data: and blob: URLs
         * https://bugs.chromium.org/p/chromium/issues/detail?id=513860
         */
        return cspHeaders;
    }

    /**
     * Safebrowsing check
     *
     * @param tab
     * @param mainFrameUrl
     */
    function filterSafebrowsing(tab, mainFrameUrl) {

        if (advblocker.frames.isTabadvblockerDetected(tab) ||
            advblocker.frames.isTabProtectionDisabled(tab) ||
            advblocker.frames.isTabWhiteListedForSafebrowsing(tab)) {
            return;
        }

        var referrerUrl = advblocker.utils.browser.getSafebrowsingBackUrl(tab);
        var incognitoTab = advblocker.frames.isIncognitoTab(tab);

        advblocker.safebrowsing.checkSafebrowsingFilter(mainFrameUrl, referrerUrl, function (safebrowsingUrl) {
            // Chrome doesn't allow open extension url in incognito mode
            // So close current tab and open new
            if (advblocker.utils.browser.isChromium() && incognitoTab) {
                // Closing tab before opening a new one may lead to browser crash (Chromium)
                advblocker.ui.openTab(safebrowsingUrl, {}, function () {
                    advblocker.tabs.remove(tab.tabId);
                });
            } else {
                advblocker.tabs.reload(tab.tabId, safebrowsingUrl);
            }
        }, incognitoTab);
    }

    /**
     * Add listeners described above.
     */
    advblocker.webRequest.onBeforeRequest.addListener(onBeforeRequest, ["<all_urls>"]);
    advblocker.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, ["<all_urls>"]);
    advblocker.webRequest.onHeadersReceived.addListener(onHeadersReceived, ["<all_urls>"]);

    // AG for Windows and Mac checks either request signature or request Referer to authorize request.
    // Referer cannot be forged by the website so it's ok for add-on authorization.
    if (advblocker.integration.isSupported() && advblocker.utils.browser.isChromium()) {

        /* global browser */
        advblocker.webRequest.onBeforeSendHeaders.addListener(function callback(requestDetails) {

            var authHeaders = advblocker.integration.getAuthorizationHeaders();
            var requestHeaders = requestDetails.requestHeaders;
            for (var i = 0; i < authHeaders.length; i++) {
                requestHeaders = advblocker.utils.browser.setHeaderValue(requestHeaders, authHeaders[i].name, authHeaders[i].value);
            }

            return { requestHeaders };

        }, [advblocker.integration.getIntegrationBaseUrl() + "*"]);
    }

    var handlerBehaviorTimeout = null;
    advblocker.listeners.addListener(function (event) {
        switch (event) {
            case advblocker.listeners.ADD_RULES:
            case advblocker.listeners.REMOVE_RULE:
            case advblocker.listeners.UPDATE_FILTER_RULES:
            case advblocker.listeners.UPDATE_WHITELIST_FILTER_RULES:
            case advblocker.listeners.FILTER_ENABLE_DISABLE:
                if (handlerBehaviorTimeout !== null) {
                    clearTimeout(handlerBehaviorTimeout);
                }
                handlerBehaviorTimeout = setTimeout(function () {
                    handlerBehaviorTimeout = null;
                    advblocker.webRequest.handlerBehaviorChanged();
                }, 3000);
        }
    });

    if (shouldUseInsertCSSAndExecuteScript) {
        /**
         * Applying CSS/JS rules from the background page.
         * This function implements the algorithm suggested here: https://github.com/advblockerTeam/advblockerBrowserExtension/issues/1029
         * For faster script injection, we prepare scriptText onHeadersReceived event (we can't use onBeforeRequest
         * event because we can't detect advblocker application headers early in order to know should extension inject scripts or no),
         * save it and try to inject twice:
         * first time onResponseStarted event - this event fires early, but is not reliable
         * second time onCommited event - this event fires on when part of document has been received, this event is reliable
         * Every time we try to inject script we check if script wasn't yet executed
         * We use browser.tabs.insertCSS and browser.tabs.executeScript functions to inject our CSS/JS rules.
         * This method can be used in modern Chrome and FF only.
         * Bellow are presented rough event flows in Chrome and Firefox
         * This flows are were tested for Chrome 67.0.3396.87 (64 bit) and Firefox 60.0.2 (64-bit)
         * FLOWS MAY BE MODIFIED IN THE FUTURE
         *
                                                Chrome flow description

                                            +--------------------------------+
                                            |                                |
                                            | webRequest.onHeadersReceived   |     Prepare injection
                                            |                                |
                                            +---------------+----------------+
                                                            |
                                            +---------------v--------------+
                                            |                              |
                                            | webRequest.onResponseStarted |     Try to inject JS
                                            |                              |
                                            +------------------------------+

            onCommited event belongs to      +------------------------------+
            WebNavigation events and fires   |                              |
            independently from               | webNavigation.onCommitted    |     Inject JS and CSS
            onResponseStarted event.         |                              |     Remove injection
            Thats why we try to inject       +------------------------------+
            two times
                                            +------------------------------+
                                            |                              |
                                            | webRequest.onErrorOccured    |     Remove injections on error
                                            |                              |
                                            +------------------------------+


                                                Firefox flow description

            onCommited event in Firefox for  +------------------------------+
            sub_frames fires before          |                              |
            onHeadersReceived event          | webNavigation.onCommited     |
            That's why we inject our code    |                              |
            on onCompletedEvent              +------------------------------+

                                            +--------------------------------+
                                            |                                |
                                            | webRequest.onHeadersReceived   |      Prepare injection
                                            |                                |
                                            +--------------+-----------------+
                                                           |
                                            +--------------v---------------+
                                            |                              |
                                            | webRequest.onResponseStarted |      Try to inject JS code
                                            |                              |
                                            +------------------------------+

                                            +------------------------------+
                                            |                              |
                                            | webNavigation.onCommited     |      Inject JS and CSS for main_frame
                                            |                              |      Remove injection
                                            +------------------------------+

                                            +------------------------------+
                                            |                              |
                                            | webRequest.onCompleted       |      Inject JS and CSS for sub_frame
                                            |                              |      Remove injection
                                            +------------------------------+

                                            +------------------------------+
                                            |                              |
                                            | webRequest.onErrorOccured    |     Remove injections on error
                                            |                              |
                                            +------------------------------+
            On tab close we clear our injections for corresponding tab
            Also our injections removes old injections for iframes when user navigates to other page in the same tab

            In Firefox and Chrome if page has iframes without remote source we can not get rules for this iframe with usual methods,
            That's why we get rules for main frame and inject them.
                                            +- ----------------------------------+
                                            |                                    |     Get injection for main iframe
                                            |  webNavigation.onDOMContentLoaded  |     inject it in the frame without
                                            |                                    |     remote source
                                            +- ----------------------------------+
         */
        (function (advblocker) {
            /**
             * This object is used:
             * 1. to save js and css texts when onHeadersReceived event fires
             * by key corresponding to tabId and frameId
             * 2. to get js and css texts for injection
             * After injection corresponding js and css texts are removed from the object
             */
            let injections = {
                createKey: function (tabId, frameId) {
                    return tabId + '-' + frameId;
                },

                /**
                 * @typedef Injection
                 * @property {Boolean} ready value depends on are css and js texts ready or not. If false we should retry get them later
                 * @property {String} [jsScriptText] prepared JS code text for injection
                 * @property {String} [cssText] prepared CSS code text for injection
                 */

                /**
                 * Saves css, js and ready flag in injection object
                 * @param {Injection} injection
                 */
                set: function (tabId, frameId, injection) {
                    if (frameId === 0) {
                        delete this[tabId];
                    }
                    if (!this[tabId]) {
                        this[tabId] = {};
                    }
                    this[tabId][frameId] = injection;
                },

                get: function (tabId, frameId) {
                    if (this[tabId]) {
                        return this[tabId][frameId];
                    }
                    return undefined;
                },

                /**
                 * Removes injection corresponding to tabId and frameId
                 * @param {Number} tabId
                 * @param {Number} frameId
                 */
                removeTabFrameInjection: function (tabId, frameId) {
                    if (this[tabId]) {
                        delete this[tabId][frameId];
                        if (Object.keys(this[tabId]).length === 0) {
                            delete this[tabId];
                        }
                    }
                },

                /**
                 * Removes all injections corresponding to tabId
                 * @param {Number} tabId
                 */
                removeTabInjection: function (tabId) {
                    delete this[tabId];
                },
            };
            /**
             * Taken from
             * {@link https://github.com/seanl-adg/InlineResourceLiteral/blob/master/index.js#L136}
             * {@link https://github.com/joliss/js-string-escape/blob/master/index.js}
             */
            const reJsEscape = /["'\\\n\r\u2028\u2029]/g;
            function escapeJs(match) {
                switch (match) {
                    case '"':
                    case "'":
                    case '\\':
                        return '\\' + match;
                    case '\n':
                        return '\\n\\\n' // Line continuation character for ease
                    // of reading inlined resource.
                    case '\r':
                        return ''        // Carriage returns won't have
                    // any semantic meaning in JS
                    case '\u2028':
                        return '\\u2028'
                    case '\u2029':
                        return '\\u2029'
                }
            }

            /**
             * We use changing variable name because global properties
             * can be modified across isolated worlds of extension content page and tab page
             * https://bugs.chromium.org/p/project-zero/issues/detail?id=1225&desc=6
             */
            const variableName = 'scriptExecuted' + Date.now();

            function buildScriptText(scriptText) {
                if (!scriptText) {
                    return null;
                }
                /**
                 * Executes scripts in a scope of the page.
                 * In order to prevent multiple script execution checks if script was already executed
                 * Sometimes in Firefox when content-filtering is applied to the page race condition happens.
                 * This causes an issue when the page doesn't have its document.head or document.documentElement at the moment of
                 * injection. So script waits for them. But if a quantity of frame-requests reaches FRAME_REQUESTS_LIMIT then
                 * script stops waiting with the error.
                 * Description of the issue: https://github.com/advblockerTeam/advblockerBrowserExtension/issues/1004
                 */
                let injectedScript = '(function() {\
                    if (window.' + variableName + ') {\
                        return;\
                    }\
                    var script = document.createElement("script");\
                    script.setAttribute("type", "text/javascript");\
                    script.textContent = "' + scriptText.replace(reJsEscape, escapeJs) + '";\
                    var FRAME_REQUESTS_LIMIT = 500;\
                    var frameRequests = 0;\
                    function waitParent () {\
                        frameRequests += 1;\
                        var parent = document.head || document.documentElement;\
                        if (parent) {\
                            try {\
                                parent.appendChild(script);\
                                parent.removeChild(script);\
                            } catch (e) {\
                            } finally {\
                                window.' + variableName + ' = true;\
                                return true;\
                            }\
                        }\
                        if(frameRequests < FRAME_REQUESTS_LIMIT) {\
                            requestAnimationFrame(waitParent);\
                        } else {\
                            console.log("advblocker: document.head or document.documentElement were unavailable too long");\
                        }\
                    }\
                    waitParent();\
                })()';

                return injectedScript;
            }

            /**
             * @param {SelectorsData} selectorsData Selectors data
             * @returns {string} CSS to be supplied to insertCSS or null if selectors data is empty
             */
            function buildCssText(selectorsData) {
                if (!selectorsData || !selectorsData.css) {
                    return null;
                }
                return selectorsData.css.join('\n');
            }

            /**
             * Checks requestType, tabId and event
             * We don't inject CSS or JS if request wasn't related to tab, or if request type
             * is not equal to DOCUMENT or SUBDOCUMENT.
             * @param {String} requestType
             * @param {Number} tabId
             * @param {String} eventName
             * @returns {Boolean}
             */
            function shouldSkipInjection(requestType, tabId, eventName) {
                /**
                 * onCompleted event is used only to inject code to the Firefox iframes
                 * because in current Firefox implementation webNavigation.onCommitted event for iframes
                 * occures early than webRequest.onHeadersReceived event
                 * if onCompleted event fired with requestType DOCUMENT then we skip it, because we
                 * use onCompleted event only for SUBDOCUMENTS
                 */
                if (eventName === 'onCompleted' && requestType === advblocker.RequestTypes.DOCUMENT) {
                    return true;
                }
                if (tabId === advblocker.BACKGROUND_TAB_ID) {
                    return true;
                }
                if (requestType !== advblocker.RequestTypes.DOCUMENT && requestType !== advblocker.RequestTypes.SUBDOCUMENT) {
                    return true;
                }
                return false;
            }

            const REQUEST_FILTER_READY_TIMEOUT = 100;
            /**
             * Prepares injection content (scripts and css) for a given frame.
             * @param {RequestDetails} details
             */
            function prepareInjection(details) {
                let requestType = details.requestType;
                let tab = details.tab;
                let tabId = tab.tabId;
                if (shouldSkipInjection(requestType, tabId)) {
                    return;
                }
                let frameId = details.frameId;
                let url = details.requestUrl;

                let cssFilterOption = advblocker.rules.CssFilter.RETRIEVE_TRADITIONAL_CSS;
                const retrieveScripts = true;
                let result = advblocker.webRequestService.processGetSelectorsAndScripts({ tabId: tabId }, url, cssFilterOption, retrieveScripts);

                if (result.requestFilterReady === false) {
                    injections.set(tabId, frameId, {
                        ready: false,
                    });
                } else {
                    injections.set(tabId, frameId, {
                        ready: true,
                        jsScriptText: buildScriptText(result.scripts),
                        cssText: buildCssText(result.selectors),
                    });
                }
            }

            /**
             * Injects js code in the page on responseStarted event only if event was fired from the main_frame
             * @param {RequestDetails} details Details about the webrequest event
             */
            function tryInjectOnResponseStarted(details) {
                var tab = details.tab;
                var tabId = tab.tabId;
                var requestType = details.requestType;
                var frameId = details.frameId;
                if (shouldSkipInjection(requestType, tabId)) {
                    return;
                }
                var injection = injections.get(tabId, frameId);
                if (injection && injection.jsScriptText) {
                    advblocker.tabs.executeScriptCode(tabId, frameId, injection.jsScriptText);
                }
            }

            /**
             * Injects necessary CSS and scripts into the web page.
             * @param {RequestDetails} details Details about the navigation event
             * @param {String} eventName Event name
             */
            function tryInject(details, eventName) {
                let tab = details.tab;
                let tabId = tab.tabId;
                let frameId = details.frameId;
                let requestType = details.requestType;
                let frameUrl = details.requestUrl;
                if (shouldSkipInjection(requestType, tabId, eventName)) {
                    return;
                }
                const injection = injections.get(tabId, frameId);
                /**
                 * webRequest api doesn't see requests served from service worker like they are served from the cache
                 * https://bugs.chromium.org/p/chromium/issues/detail?id=766433
                 * that's why we can't prepare injections when webRequest events fire
                 * so we try to prepare this injection in the onCommit event again
                 */
                if (requestType === advblocker.RequestTypes.DOCUMENT && !injection) {
                    prepareInjection(details);
                    tryInject(details);
                    return;
                }
                /**
                 * Sometimes it can happen that onCommited event fires earlier than onHeadersReceived
                 * for example onCommited event for iframes in Firefox
                 */
                if (!injection) {
                    return;
                }
                if (!injection.ready) {
                    /**
                     * If injection is not ready yet, we call prepareScripts and tryInject functions again
                     * setTimeout callback lambda function accepts onCommited details and eventName
                     */
                    setTimeout(function (details, eventName) {
                        prepareInjection(details);
                        tryInject(details, eventName);
                    }, REQUEST_FILTER_READY_TIMEOUT, details, eventName);
                    injections.removeTabFrameInjection(tabId, frameId);
                    return;
                }
                if (injection.jsScriptText) {
                    advblocker.tabs.executeScriptCode(tabId, frameId, injection.jsScriptText);
                }
                if (injection.cssText) {
                    advblocker.tabs.insertCssCode(tabId, frameId, injection.cssText);
                }
                const mainFrameUrl = advblocker.frames.getMainFrameUrl({ tabId: tabId });
                if (isIframeWithoutSrc(frameUrl, frameId, mainFrameUrl)) {
                    advblocker.console.warn('Unexpected onCommited event from this frame - frameId: {0}, frameUrl: {1}. See https://github.com/advblockerTeam/advblockerBrowserExtension/issues/1046', frameId, frameUrl);
                }
                injections.removeTabFrameInjection(tabId, frameId);
            }

            /**
             * Removes injection if onErrorOccured event fires for corresponding tabId and frameId
             * @param {RequestDetails} details
             */
            function removeInjection(details) {
                let requestType = details.requestType;
                let tab = details.tab;
                let tabId = tab.tabId;
                if (shouldSkipInjection(requestType, tabId)) {
                    return;
                }
                let frameId = details.frameId;
                injections.removeTabFrameInjection(tabId, frameId);
            }

            /**
             * Checks if iframe does not have a remote source
             * or is src is about:blank, javascript:'', etc
             * We don't include iframes with 'src=data:' because chrome and firefox don't allow to inject
             * in iframes with this type of src, this bug is reported here
             * https://bugs.chromium.org/p/chromium/issues/detail?id=55084
             * @param {string} frameUrl url
             * @param {number} frameId unique id of frame in the tab
             * @param {string} mainFrameUrl url of tab where iframe exists
             */
            function isIframeWithoutSrc(frameUrl, frameId, mainFrameUrl) {
                return (frameUrl === mainFrameUrl ||
                        frameUrl === 'about:blank' ||
                        frameUrl === 'about:srcdoc' ||
                        frameUrl.indexOf('javascript:') > -1)
                    && frameId !== advblocker.MAIN_FRAME_ID;
            }

            /**
             * This method injects css and js code in iframes without remote source
             * Usual webRequest callbacks don't fire for iframes without remote source
             * Also urls in these iframes may be "about:blank", "about:srcdoc", etc.
             * Due to this reason we prepare injections for them as for mainframe
             * and inject them only when onDOMContentLoaded fires
             * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/1046
             * @param {{tabId: Number, url: String, processId: Number, frameId: Number, timeStamp: Number}} details
             */
            function tryInjectInIframesWithoutSrc(details) {
                const { frameId, tabId, url: frameUrl } = details;
                /**
                 * Get url of the tab where iframe exists
                 */
                const mainFrameUrl = advblocker.frames.getMainFrameUrl({ tabId: tabId });
                if (mainFrameUrl && isIframeWithoutSrc(frameUrl, frameId, mainFrameUrl)) {
                    const cssFilterOption = advblocker.rules.CssFilter.RETRIEVE_TRADITIONAL_CSS;
                    const retrieveScripts = true;
                    const result = advblocker.webRequestService.processGetSelectorsAndScripts({ tabId: tabId }, mainFrameUrl, cssFilterOption, retrieveScripts);
                    if (result.requestFilterReady === false) {
                        setTimeout(function (details) {
                            tryInjectInIframesWithoutSrc(details);
                        }, REQUEST_FILTER_READY_TIMEOUT, details);
                        return;
                    }
                    const jsScriptText = buildScriptText(result.scripts);
                    const cssText = buildCssText(result.selectors);
                    if (jsScriptText) {
                        advblocker.tabs.executeScriptCode(tabId, frameId, jsScriptText);
                    }
                    if (cssText) {
                        advblocker.tabs.insertCssCode(tabId, frameId, cssText);
                    }
                }
            }
            /**
             * https://developer.chrome.com/extensions/webRequest
             * https://developer.chrome.com/extensions/webNavigation
             */
            advblocker.webRequest.onHeadersReceived.addListener(prepareInjection, ['<all_urls>']);
            advblocker.webRequest.onResponseStarted.addListener(tryInjectOnResponseStarted, ['<all_urls>']);
            advblocker.webNavigation.onCommitted.addListener(tryInject);
            advblocker.webRequest.onErrorOccurred.addListener(removeInjection, ['<all_urls>']);
            advblocker.webNavigation.onDOMContentLoaded.addListener(tryInjectInIframesWithoutSrc);
            // In the current Firefox version (60.0.2), the onCommitted even fires earlier than onHeadersReceived for SUBDOCUMENT requests
            // This is true only for SUBDOCUMENTS i.e. iframes
            // so we inject code when onCompleted event fires
            if (advblocker.utils.browser.isFirefoxBrowser()) {
                advblocker.webRequest.onCompleted.addListener(function (details) { tryInject(details, 'onCompleted'); }, ['<all_urls>']);
            }
            // Remove injections when tab is closed
            advblocker.tabs.onRemoved.addListener(injections.removeTabInjection);
        })(advblocker);
    }

    /**
     * Request context recording
     */
    advblocker.webRequest.onCompleted.addListener(({ requestId }) => {
        advblocker.cookieFiltering.modifyCookies(requestId);
        advblocker.requestContextStorage.onRequestCompleted(requestId);
    }, ['<all_urls>']);

    advblocker.webRequest.onErrorOccurred.addListener(({ requestId }) => {
        advblocker.cookieFiltering.modifyCookies(requestId);
        advblocker.requestContextStorage.onRequestCompleted(requestId);
    }, ['<all_urls>']);

    /**
     * Handles redirect separately:
     * If a request is redirected to a data:// URL, onBeforeRedirect is the last reported event.
     * https://developer.chrome.com/extensions/webRequest#life_cycle
     */
    advblocker.webRequest.onBeforeRedirect.addListener(({ requestId, redirectUrl }) => {
        if (redirectUrl && redirectUrl.indexOf('data:') === 0) {
            advblocker.requestContextStorage.onRequestCompleted(requestId);
        }
    }, ['<all_urls>']);

    // Subscribe script is executed when onCommitted event fires,
    // because this event is the most reliable
    /**
     * Subscribe script is executed when onCommitted event fires,
     * because this event is the most reliable
     */
    advblocker.webNavigation.onCommitted.addListener((details) => {
        const { tab, requestType, frameId } = details;
        if ((requestType !== advblocker.RequestTypes.DOCUMENT
            && requestType !== advblocker.RequestTypes.SUBDOCUMENT)
            || advblocker.frames.isTabadvblockerDetected(tab)
            || tab.tabId === advblocker.BACKGROUND_TAB_ID) {
            return;
        }
        // load subscribe script on dom content load if integration mode is turned off
        advblocker.tabs.executeScriptFile(tab.tabId, { file: '/lib/content-script/subscribe.js', frameId });
    });
})(advblocker);
