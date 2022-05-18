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

advblocker.webRequestService = (function (advblocker) {

    'use strict';

    var onRequestBlockedChannel = advblocker.utils.channels.newChannel();

    /**
     * Checks if we can collect hit stats for this tab:
     * Option "Send ad filters usage" is enabled and tab isn't incognito and integration mode is disabled
     * @param {object} tab
     * @returns {boolean}
     */
    var canCollectHitStatsForTab = function (tab) {
        if (!tab) {
            return advblocker.settings.collectHitsCount();
        }

        return tab &&
            advblocker.settings.collectHitsCount() &&
            !advblocker.frames.isIncognitoTab(tab) &&
            !advblocker.frames.isTabadvblockerDetected(tab);
    };

    /**
     * Records filtering rule hit
     *
     * @param tab            Tab object
     * @param requestRule    Rule to record
     * @param requestUrl     Request URL
     */
    var recordRuleHit = function (tab, requestRule, requestUrl) {
        if (requestRule &&
            !advblocker.utils.filters.isUserFilterRule(requestRule) &&
            !advblocker.utils.filters.isWhiteListFilterRule(requestRule) &&
            canCollectHitStatsForTab(tab)) {
            var domain = advblocker.frames.getFrameDomain(tab);
            advblocker.hitStats.addRuleHit(domain, requestRule.ruleText, requestRule.filterId, requestUrl);
        }
    };

    /**
     * An object with the selectors and scripts to be injected into the page
     * @typedef {Object} SelectorsAndScripts
     * @property {SelectorsData} selectors An object with the CSS styles that needs to be applied
     * @property {string} scripts Javascript to be injected into the page
     * @property {boolean} collapseAllElements If true, content script must force the collapse check of the page elements
     */

    /**
     * Prepares CSS and JS which should be injected to the page.
     *
     * @param tab                       Tab data
     * @param documentUrl               Document URL
     * @param cssFilterOptions          Bitmask for the CssFilter
     * @param {boolean} retrieveScripts Indicates whether to retrieve JS rules or not
     *
     * When cssFilterOptions and retrieveScripts are undefined, we handle it in a special way
     * that depends on whether the browser supports inserting CSS and scripts from the background page
     *
     * @returns {SelectorsAndScripts} an object with the selectors and scripts to be injected into the page
     */
    var processGetSelectorsAndScripts = function (tab, documentUrl, cssFilterOptions, retrieveScripts) {

        var result = Object.create(null);

        if (!tab) {
            return result;
        }

        if (!advblocker.requestFilter.isReady()) {
            result.requestFilterReady = false;
            return result;
        }

        if (advblocker.frames.isTabadvblockerDetected(tab) ||
            advblocker.frames.isTabProtectionDisabled(tab)) {
            return result;
        }

        // Looking for the whitelist rule
        var whitelistRule = advblocker.frames.getFrameWhiteListRule(tab);
        if (!whitelistRule) {
            //Check whitelist for current frame
            var mainFrameUrl = advblocker.frames.getMainFrameUrl(tab);
            whitelistRule = advblocker.requestFilter.findWhiteListRule(documentUrl, mainFrameUrl, advblocker.RequestTypes.DOCUMENT);
        }

        let CssFilter = advblocker.rules.CssFilter;


        // Check what exactly is disabled by this rule
        var elemHideFlag = whitelistRule && whitelistRule.isElemhide();
        var genericHideFlag = whitelistRule && whitelistRule.isGenericHide();

        // content-message-handler calls it in this way
        if (typeof cssFilterOptions === 'undefined' && typeof retrieveScripts === 'undefined') {
            // Build up default flags.
            let canUseInsertCSSAndExecuteScript = advblocker.prefs.features.canUseInsertCSSAndExecuteScript;
            // If tabs.executeScript is unavailable, retrieve JS rules now.
            retrieveScripts = !canUseInsertCSSAndExecuteScript;
            if (!elemHideFlag) {
                cssFilterOptions = CssFilter.RETRIEVE_EXTCSS;
                if (!canUseInsertCSSAndExecuteScript) {
                    cssFilterOptions += CssFilter.RETRIEVE_TRADITIONAL_CSS;
                }
                if (genericHideFlag) {
                    cssFilterOptions += CssFilter.GENERIC_HIDE_APPLIED;
                }
            }
        } else {
            if (!elemHideFlag && genericHideFlag) {
                cssFilterOptions += CssFilter.GENERIC_HIDE_APPLIED;
            }
        }

        var retrieveSelectors = !elemHideFlag && (cssFilterOptions & (CssFilter.RETRIEVE_TRADITIONAL_CSS + CssFilter.RETRIEVE_EXTCSS)) !== 0;

        // It's important to check this after the recordRuleHit call
        // as otherwise we will never record $document rules hit for domain
        if (advblocker.frames.isTabWhiteListed(tab)) {
            return result;
        }

        if (retrieveSelectors) {
            result.collapseAllElements = advblocker.requestFilter.shouldCollapseAllElements();
            result.selectors = advblocker.requestFilter.getSelectorsForUrl(documentUrl, cssFilterOptions);
        }

        if (retrieveScripts) {
            var jsInjectFlag = whitelistRule && whitelistRule.isJsInject();
            if (!jsInjectFlag) {
                // JS rules aren't disabled, returning them
                result.scripts = advblocker.requestFilter.getScriptsStringForUrl(documentUrl, tab);
            }
        }
        // https://github.com/advblockerTeam/advblockerBrowserExtension/issues/1337
        result.collectRulesHits = elemHideFlag ? false : advblocker.webRequestService.isCollectingCosmeticRulesHits(tab);

        return result;
    };

    /**
     * Checks if request that is wrapped in page script should be blocked.
     * We do this because browser API doesn't have full support for intercepting all requests, e.g. WebSocket or WebRTC.
     *
     * @param tab           Tab
     * @param requestUrl    request url
     * @param referrerUrl   referrer url
     * @param requestType   Request type (WEBSOCKET or WEBRTC)
     * @returns {boolean}   true if request is blocked
     */
    var checkPageScriptWrapperRequest = function (tab, requestUrl, referrerUrl, requestType) {

        if (!tab) {
            return false;
        }

        var requestRule = getRuleForRequest(tab, requestUrl, referrerUrl, requestType);
        requestRule = postProcessRequest(tab, requestUrl, referrerUrl, requestType, requestRule);

        advblocker.requestContextStorage.recordEmulated(requestUrl, referrerUrl, requestType, tab, requestRule);

        return isRequestBlockedByRule(requestRule);
    };

    /**
     * Checks if request is blocked
     *
     * @param tab           Tab
     * @param requestUrl    request url
     * @param referrerUrl   referrer url
     * @param requestType   one of RequestType
     * @returns {boolean}   true if request is blocked
     */
    var processShouldCollapse = function (tab, requestUrl, referrerUrl, requestType) {

        if (!tab) {
            return false;
        }

        var requestRule = getRuleForRequest(tab, requestUrl, referrerUrl, requestType);
        return isRequestBlockedByRule(requestRule);
    };

    /**
     * Checks if requests are blocked
     *
     * @param tab               Tab
     * @param referrerUrl       referrer url
     * @param collapseRequests  requests array
     * @returns {*}             requests array
     */
    var processShouldCollapseMany = function (tab, referrerUrl, collapseRequests) {

        if (!tab) {
            return collapseRequests;
        }

        for (var i = 0; i < collapseRequests.length; i++) {
            var request = collapseRequests[i];
            var requestRule = getRuleForRequest(tab, request.elementUrl, referrerUrl, request.requestType);
            request.collapse = isRequestBlockedByRule(requestRule);
        }

        return collapseRequests;
    };

    /**
     * Checks if request is blocked by rule
     *
     * @param requestRule
     * @returns {*|boolean}
     */
    var isRequestBlockedByRule = function (requestRule) {
        return requestRule && !requestRule.whiteListRule &&
            !requestRule.getReplace() &&
            !requestRule.isBlockPopups();
    };

    /**
     * Checks if popup is blocked by rule
     * @param requestRule
     * @returns {*|boolean|true}
     */
    var isPopupBlockedByRule = function (requestRule) {
        return requestRule && !requestRule.whiteListRule && requestRule.isBlockPopups();
    };

    /**
     * Gets blocked response by rule
     * See https://developer.chrome.com/extensions/webRequest#type-BlockingResponse or https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/BlockingResponse for details
     * @param requestRule Request rule or null
     * @param requestType Request type
     * @returns {*} Blocked response or null
     */
    const getBlockedResponseByRule = function (requestRule, requestType) {
        if (isRequestBlockedByRule(requestRule)) {
            if (requestRule.isRedirectRule()) {
                const redirectOption = requestRule.getRedirect();
                const redirectUrl = redirectOption.getRedirectUrl();
                return { redirectUrl };
            }

            // Don't block main_frame request
            if (requestType !== advblocker.RequestTypes.DOCUMENT) {
                return { cancel: true };
            }
        }
        return null;
    };

    /**
     * Finds rule for request
     *
     * @param tab           Tab
     * @param requestUrl    request url
     * @param referrerUrl   referrer url
     * @param requestType   one of RequestType
     * @returns {*}         rule or null
     */
    var getRuleForRequest = function (tab, requestUrl, referrerUrl, requestType) {

        if (advblocker.frames.isTabadvblockerDetected(tab) || advblocker.frames.isTabProtectionDisabled(tab)) {
            // don't process request
            return null;
        }
        let whitelistRule;
        /**
         * Background requests will be whitelisted if their referrer
         * url will match with user whitelist rule
         * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/1032
         */
        if (tab.tabId === advblocker.BACKGROUND_TAB_ID) {
            whitelistRule = advblocker.whitelist.findWhiteListRule(referrerUrl);
        } else {
            whitelistRule = advblocker.frames.getFrameWhiteListRule(tab);
        }

        if (whitelistRule && whitelistRule.isDocumentWhiteList()) {
            // Frame is whitelisted by the main frame's $document rule
            // We do nothing more in this case - return the rule.
            return whitelistRule;
        } else if (!whitelistRule) {
            // If whitelist rule is not found for the main frame, we check it for referrer
            whitelistRule = advblocker.requestFilter.findWhiteListRule(requestUrl, referrerUrl, advblocker.RequestTypes.DOCUMENT);
        }

        return advblocker.requestFilter.findRuleForRequest(requestUrl, referrerUrl, requestType, whitelistRule);
    };

    /**
     * Finds all content rules for the url
     * @param tab Tab
     * @param documentUrl Document URL
     * @returns collection of content rules or null
     */
    var getContentRules = function (tab, documentUrl) {

        if (advblocker.frames.shouldStopRequestProcess(tab)) {
            // don't process request
            return null;
        }

        var whitelistRule = advblocker.requestFilter.findWhiteListRule(documentUrl, documentUrl, advblocker.RequestTypes.DOCUMENT);
        if (whitelistRule && whitelistRule.isContent()) {
            return null;
        }

        return advblocker.requestFilter.getContentRulesForUrl(documentUrl);
    };

    /**
     * Find CSP rules for request
     * @param tab           Tab
     * @param requestUrl    Request URL
     * @param referrerUrl   Referrer URL
     * @param requestType   Request type (DOCUMENT or SUBDOCUMENT)
     * @returns {Array}     Collection of rules or null
     */
    const getCspRules = function (tab, requestUrl, referrerUrl, requestType) {

        if (advblocker.frames.shouldStopRequestProcess(tab)) {
            // don't process request
            return null;
        }

        // @@||example.org^$document or @@||example.org^$urlblock — disables all the $csp rules on all the pages matching the rule pattern.
        let whitelistRule = advblocker.requestFilter.findWhiteListRule(requestUrl, referrerUrl, advblocker.RequestTypes.DOCUMENT);
        if (whitelistRule && whitelistRule.isUrlBlock()) {
            return null;
        }

        return advblocker.requestFilter.getCspRules(requestUrl, referrerUrl, requestType);
    };

    /**
     * Find cookie rules for request
     * @param tab           Tab
     * @param requestUrl    Request URL
     * @param referrerUrl   Referrer URL
     * @param requestType   Request type
     * @returns {Array}     Collection of rules or null
     */
    const getCookieRules = (tab, requestUrl, referrerUrl, requestType) => {

        if (advblocker.frames.shouldStopRequestProcess(tab)) {
            // Don't process request
            return null;
        }

        const whitelistRule = advblocker.requestFilter.findWhiteListRule(requestUrl, referrerUrl, advblocker.RequestTypes.DOCUMENT);
        if (whitelistRule && whitelistRule.isDocumentWhiteList()) {
            // $cookie rules are not affected by regular exception rules (@@) unless it's a $document exception.
            return null;
        }

        // Get all $cookie rules matching the specified request
        return advblocker.requestFilter.getCookieRules(requestUrl, referrerUrl, requestType);
    };

    /**
     * Find replace rules for request
     * @param tab
     * @param requestUrl
     * @param referrerUrl
     * @param requestType
     * @returns {*} Collection of rules or null
     */
    const getReplaceRules = (tab, requestUrl, referrerUrl, requestType) => {
        if (advblocker.frames.shouldStopRequestProcess(tab)) {
            // don't process request
            return null;
        }

        const whitelistRule = advblocker.requestFilter.findWhiteListRule(requestUrl, referrerUrl, advblocker.RequestTypes.DOCUMENT);

        if (whitelistRule && whitelistRule.isContent()) {
            return null;
        }

        return advblocker.requestFilter.getReplaceRules(requestUrl, referrerUrl, requestType);
    };

    /**
     * Processes HTTP response.
     * It could do the following:
     * 1. Detect desktop AG and switch to integration mode
     * 2. Add event to the filtering log (for DOCUMENT requests)
     * 3. Record page stats (if it's enabled)
     *
     * @param tab Tab object
     * @param requestUrl Request URL
     * @param referrerUrl Referrer URL
     * @param requestType Request type
     * @param responseHeaders Response headers
     * @return {object} Request rule parsed from integration headers or null
     */
    var processRequestResponse = function (tab, requestUrl, referrerUrl, requestType, responseHeaders) {
        if (requestType === advblocker.RequestTypes.DOCUMENT) {
            // Check headers to detect advblocker application
            if (advblocker.integration.isSupported() && // Integration module may be missing
                !advblocker.prefs.mobile && // Mobile Firefox doesn't support integration mode
                !advblocker.utils.browser.isEdgeBrowser()) {
                // TODO[Edge]: Integration mode is not fully functional in Edge (cannot
                // redefine Referer header yet and Edge doesn't intercept requests from
                // background page)
                advblocker.integration.checkHeaders(tab, responseHeaders, requestUrl);
            }
        }

        // add page view to stats
        if (requestType === advblocker.RequestTypes.DOCUMENT) {
            var domain = advblocker.frames.getFrameDomain(tab);
            if (canCollectHitStatsForTab(tab)) {
                advblocker.hitStats.addDomainView(domain);
            }
        }

        // In integration mode, binds rule from headers or nothing to the request
        if (advblocker.integration.isSupported() && advblocker.frames.isTabadvblockerDetected(tab)) {
            // Parse rule applied to request from response headers
            return advblocker.integration.parseadvblockerRuleFromHeaders(responseHeaders);
        }

        return null;
    };

    /**
     * Request post processing, firing events, add log records etc.
     *
     * @param tab           Tab
     * @param requestUrl    request url
     * @param referrerUrl   referrer url
     * @param requestType   one of RequestType
     * @param requestRule   rule
     * @return {object} Request rule if suitable by its own type and request type or null
     */
    var postProcessRequest = function (tab, requestUrl, referrerUrl, requestType, requestRule) {

        if (advblocker.frames.isTabadvblockerDetected(tab)) {
            // Do nothing, rules from integrated app will be processed on response
            return;
        }

        if (requestRule && !requestRule.whiteListRule) {

            var isRequestBlockingRule = isRequestBlockedByRule(requestRule);
            var isPopupBlockingRule = isPopupBlockedByRule(requestRule);
            var isReplaceRule = !!requestRule.getReplace();

            // Url blocking rules are not applicable to the main_frame
            if (isRequestBlockingRule && requestType === advblocker.RequestTypes.DOCUMENT) {
                requestRule = null;
            }
            // Popup blocking rules are applicable to the main_frame only
            if (isPopupBlockingRule && requestType !== advblocker.RequestTypes.DOCUMENT) {
                requestRule = null;
            }
            // Replace rules are processed in content-filtering.js
            if (isReplaceRule) {
                requestRule = null;
            }

            if (requestRule) {
                advblocker.listeners.notifyListenersAsync(advblocker.listeners.ADS_BLOCKED, requestRule, tab, 1);
                var details = {
                    tabId: tab.tabId,
                    requestUrl: requestUrl,
                    referrerUrl: referrerUrl,
                    requestType: requestType
                };
                details.rule = requestRule.ruleText;
                details.filterId = requestRule.filterId;
                onRequestBlockedChannel.notify(details);
            }
        }

        return requestRule;
    };

    const isCollectingCosmeticRulesHits = (tab) => {
        /**
         * Edge browser doesn't support css content attribute for node elements except
         * :before and :after
         * Due to this we can't use cssHitsCounter for edge browser
         */
        return !advblocker.utils.browser.isEdgeBrowser()
            && (canCollectHitStatsForTab(tab) || advblocker.filteringLog.isOpen());
    };


    // EXPOSE
    return {
        processGetSelectorsAndScripts,
        checkPageScriptWrapperRequest,
        processShouldCollapse,
        processShouldCollapseMany,
        isRequestBlockedByRule,
        isPopupBlockedByRule,
        getBlockedResponseByRule,
        getRuleForRequest,
        getCspRules,
        getCookieRules,
        getContentRules,
        getReplaceRules,
        processRequestResponse,
        postProcessRequest,
        recordRuleHit,
        onRequestBlocked: onRequestBlockedChannel,
        isCollectingCosmeticRulesHits,
    };

})(advblocker);
