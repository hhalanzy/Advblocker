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

/**
 * advblocker.integration is used for integration of advblocker extension and advblocker for Windows/Mac/Android versions.
 */
advblocker.integration = (function (advblocker) {

    'use strict';

    /**
     * Looking for this header in HTTP response.
     * If this header is present - request is filtered by advblocker for Windows/Mac/Android
     */
    var advblocker_APP_HEADER = "X-advblocker-Filtered";

    /**
     * X-advblocker-Rule header contains the rule which was applied to the HTTP request
     * If no rule applied - header won't be present in the response.
     */
    var advblocker_RULE_HEADER = "X-advblocker-Rule";

    /**
     * Full mode means that extension can manage filtering status of the website.
     * That also means that advblocker returns X-advblocker-Rule header (older version can't do it)
     * Possible with advblocker 5.10.1180+
     */
    var INTEGRATION_MODE_FULL = "FULL";

    /**
     * advblocker 5.10+. Extension cannot manage filtering status (only element blocking)
     */
    var INTEGRATION_MODE_DEFAULT = "DEFAULT";

    /**
     * Older versions of advblocker. The only difference from default mode is API location
     */
    var INTEGRATION_MODE_OLD = "OLD";

    /**
     * Detected advblocker product name and version
     */
    var advblockerProductName = null;
    var advblockerAppVersion = null;

    var integrationMode = INTEGRATION_MODE_FULL;

    var integrationModeForceDisabled = false;
    var integrationModeLastCheckTime = 0;
    var INTEGRATION_CHECK_PERIOD_MS = 30 * 60 * 1000; // 30 minutes

    /**
     * https://github.com/advblockerTeam/advblockerBrowserExtension/issues/963
     */
    function reCheckIntegrationMode() {

        if (Date.now() - integrationModeLastCheckTime > INTEGRATION_CHECK_PERIOD_MS) {

            integrationModeLastCheckTime = Date.now();

            // Sending request that should be intercepted by the advblocker App
            advblocker.backend.getResponseHeaders(advblocker.backend.injectionsUrl + '/generate_204', function (headers) {
                if (headers === null) {
                    // Unable to retrieve response
                    integrationModeForceDisabled = false;
                    return;
                }
                var advblockerAppHeaderValue = advblocker.utils.browser.getHeaderValueByName(headers, advblocker_APP_HEADER);
                // Unable to find X-advblocker-Filtered header
                integrationModeForceDisabled = !advblockerAppHeaderValue;
            });
        }
    }

    /**
     * Parses advblocker version from X-advblocker-Filtered header
     *
     * @param header Header value
     * @returns {{advblockerProductName: null, advblockerAppVersion: null, integrationMode: null}}
     * @private
     */
    function parseAppHeader(header) {
        var result = {
            advblockerProductName: null,
            advblockerAppVersion: null,
            integrationMode: null
        };
        if (/([a-z\s]+);\s+version=([a-z0-9.-]+)/i.test(header)) {
            //new version of advblocker
            var productName = RegExp.$1;
            // header is either advblocker for Mac or advblocker for Windows
            // depending on it we use localized product name
            if (advblocker.utils.strings.containsIgnoreCase(productName, "mac")) {
                result.advblockerProductName = advblocker.i18n.getMessage("advblocker_product_mac");
            } else {
                result.advblockerProductName = advblocker.i18n.getMessage("advblocker_product_windows");
            }
            result.advblockerAppVersion = RegExp.$2;
            result.integrationMode = INTEGRATION_MODE_FULL;
        } else {
            if (/advblocker\s+(\d\.\d)/.test(header)) {
                result.advblockerAppVersion = RegExp.$1;
            }
            if (result.advblockerAppVersion === "5.8") {
                result.integrationMode = INTEGRATION_MODE_OLD;
            } else {
                result.integrationMode = INTEGRATION_MODE_DEFAULT;
            }
        }
        return result;
    }

    /**
     * Parses rule and filterId from X-advblocker-Rule header
     * @param header Header value
     * @private
     */
    function createRuleFromHeader(header) {

        var parts = header.split('; ');
        var headerInfo = Object.create(null);
        for (var i = 0; i < parts.length; i++) {
            var keyAndValue = parts[i].split('=');
            headerInfo[keyAndValue[0]] = decodeURIComponent(keyAndValue[1]);
        }

        return advblocker.rules.builder.createRule(headerInfo.rule, headerInfo.filterId - 0);
    }

    /**
     * Parses advblocker version from X-advblocker-Rule header
     *
     * @param header Header value
     * @param tabUrl Tab Url
     * @returns {{documentWhiteListed: boolean, userWhiteListed: boolean, headerRule: null}}
     * @private
     */
    function parseRuleHeader(header, tabUrl) {
        var ruleInfo = {
            documentWhiteListed: false,
            userWhiteListed: false,
            headerRule: null
        };
        if (!header) {
            return ruleInfo;
        }

        var rule = createRuleFromHeader(header);
        if (rule && rule.whiteListRule &&
            rule instanceof advblocker.rules.UrlFilterRule &&
            rule.isFiltered(tabUrl, false, advblocker.RequestTypes.DOCUMENT) &&
            rule.isDocumentWhiteList()) {

            ruleInfo.headerRule = rule;
            ruleInfo.documentWhiteListed = true;
            ruleInfo.userWhiteListed = rule.filterId === advblocker.utils.filters.USER_FILTER_ID;
        }

        return ruleInfo;
    }

    /**
     * Detects advblocker for Windows/Mac/Android
     * Checks if X-advblocker-Filtered header is present
     *
     * @param tab       Tab data
     * @param headers   Response headers
     * @param frameUrl  Frame url
     */
    var checkHeaders = function (tab, headers, frameUrl) {

        // Check for X-advblocker-Filtered header
        var advblockerAppHeaderValue = advblocker.utils.browser.getHeaderValueByName(headers, advblocker_APP_HEADER);
        if (!advblockerAppHeaderValue) {
            // No X-advblocker-Filtered header, disable integration mode for this tab
            advblocker.frames.recordadvblockerIntegrationForTab(tab, false, false, false, null, null, false);
            return;
        }

        // Re-check integration status to prevent attack by the script, that adds X-advblocker-Filtered header
        reCheckIntegrationMode();

        // Set advblocker detected in frame
        var appInfo = parseAppHeader(advblockerAppHeaderValue);

        advblockerProductName = appInfo.advblockerProductName;
        advblockerAppVersion = appInfo.advblockerAppVersion;
        integrationMode = appInfo.integrationMode;

        var isFullIntegrationMode = integrationMode === INTEGRATION_MODE_FULL;

        // Check for white list rule in frame
        var ruleInfo = Object.create(null);
        if (isFullIntegrationMode) {
            var advblockerRuleHeaderValue = advblocker.utils.browser.getHeaderValueByName(headers, advblocker_RULE_HEADER);
            ruleInfo = parseRuleHeader(advblockerRuleHeaderValue, frameUrl);
        }

        // Save integration info to framesMap
        var advblockerRemoveRuleNotSupported = !isFullIntegrationMode;
        advblocker.frames.recordadvblockerIntegrationForTab(tab, true, ruleInfo.documentWhiteListed, ruleInfo.userWhiteListed, ruleInfo.headerRule, appInfo.advblockerProductName, advblockerRemoveRuleNotSupported);

        advblocker.settings.changeShowInfoAboutadvblockerFullVersion(false);
    };

    /**
     * Parse X-advblocker-Rule and returns request rule (if present)
     * @param headers
     */
    var parseadvblockerRuleFromHeaders = function (headers) {
        var header = advblocker.utils.browser.findHeaderByName(headers, advblocker_RULE_HEADER);
        if (header) {
            return createRuleFromHeader(header.value);
        }
        return null;
    };

    /**
     * Adds rule to User Filter
     *
     * @param ruleText  Rule text
     * @param callback  Finish callback
     */
    var addRuleToApp = function (ruleText, callback) {
        switch (integrationMode) {
            case INTEGRATION_MODE_OLD:
                advblocker.backend.advblockerAppAddRuleOld(ruleText, callback, callback);
                break;
            default:
                advblocker.backend.advblockerAppAddRule(ruleText, callback, callback);
                break;
        }
    };

    /**
     * Removes specified rule from User Filter
     *
     * @param ruleText  Rule text
     * @param callback  Finish callback
     */
    var removeRuleFromApp = function (ruleText, callback) {
        advblocker.backend.advblockerAppRemoveRule(ruleText, callback, callback);
    };

    /**
     * If page URL is whitelisted in desktop advblocker, we should forcibly set Referer header value to this page URL.
     * The problem is that standalone advblocker looks at the page referrer to check if it should bypass this request or not.
     * Also there's an issue with Opera browser, it misses referrer for some requests.
     *
     * @param tab Tab
     */
    var shouldOverrideReferrer = function (tab) {
        return advblocker.frames.isTabadvblockerWhiteListed(tab);
    };

    /**
     * Checks if request is for AG desktop app to intercept
     * @param url request URL
     */
    var isIntegrationRequest = function (url) {
        return url && url.indexOf(advblocker.backend.advblockerAppUrl) === 0;
    };

    /**
     * Gets base url for requests to desktop AG
     */
    var getIntegrationBaseUrl = function () {
        return advblocker.backend.advblockerAppUrl;
    };

    /**
     * Gets headers used to authorize request to desktop AG
     * In our case we set Referer header. It can't be forget by the webpage so it's enough.
     */
    var getAuthorizationHeaders = function () {
        return [{
            name: 'Referer',
            value: advblocker.backend.injectionsUrl
        }];
    };

    return {

        checkHeaders: checkHeaders,
        parseadvblockerRuleFromHeaders: parseadvblockerRuleFromHeaders,

        addRuleToApp: addRuleToApp,
        removeRuleFromApp: removeRuleFromApp,
        isIntegrationRequest: isIntegrationRequest,
        getAuthorizationHeaders: getAuthorizationHeaders,

        shouldOverrideReferrer: shouldOverrideReferrer,
        getIntegrationBaseUrl: getIntegrationBaseUrl,

        /**
         * In some cases we have to force disable integration mode
         * See `reCheckIntegrationMode` for details
         * @returns {boolean}
         */
        isEnabled: function () {
            return advblocker.settings.isIntegrationModeEnabled() && !integrationModeForceDisabled;
        },

        /**
         * In simple api integration module may be missed
         * @returns {boolean}
         */
        isSupported: function () {
            return true;
        }
    };

})(advblocker);
