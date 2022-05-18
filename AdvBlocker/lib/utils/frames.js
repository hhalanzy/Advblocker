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
 * Object that contains info about every browser tab.
 */
advblocker.frames = (function (advblocker) {
    'use strict';

    /**
     * Adds frame to map. This method is called on first document request.
     * If this is a main frame - saves this info in frame data.
     *
     * @param tab       Tab object
     * @param frameId   Frame ID
     * @param url       Page URL
     * @param type      Request content type (UrlFilterRule.contentTypes)
     * @returns Frame data
     */
    var recordFrame = function (tab, frameId, url, type) {
        var frame = advblocker.tabs.getTabFrame(tab.tabId, frameId);

        var previousUrl = '';
        if (type === advblocker.RequestTypes.DOCUMENT) {
            advblocker.tabs.clearTabFrames(tab.tabId);
            advblocker.tabs.clearTabMetadata(tab.tabId);
            if (frame) {
                previousUrl = frame.url;
            }
        }

        advblocker.tabs.recordTabFrame(tab.tabId, frameId, url, advblocker.utils.url.getDomainName(url));

        if (type === advblocker.RequestTypes.DOCUMENT) {
            advblocker.tabs.updateTabMetadata(tab.tabId, { previousUrl: previousUrl });
            reloadFrameData(tab);
        }
    };

    /**
     * Gets frame URL
     *
     * @param tab       Tab
     * @param frameId   Frame ID
     * @returns Frame URL
     */
    var getFrameUrl = function (tab, frameId) {
        var frame = advblocker.tabs.getTabFrame(tab.tabId, frameId);
        return frame ? frame.url : null;
    };

    /**
     * Gets main frame URL
     *
     * @param tab    Tab
     * @returns Frame URL
     */
    var getMainFrameUrl = function (tab) {
        return getFrameUrl(tab, advblocker.MAIN_FRAME_ID);
    };

    /**
     * Gets frame Domain
     *
     * @param tab       Tab
     * @returns Frame Domain
     */
    var getFrameDomain = function (tab) {
        var frame = advblocker.tabs.getTabFrame(tab.tabId, 0);
        return frame ? frame.domainName : null;
    };

    /**
     * @param tab Tab
     * @returns true if Tab have white list rule
     */
    var isTabWhiteListed = function (tab) {
        var frameWhiteListRule = advblocker.tabs.getTabMetadata(tab.tabId, 'frameWhiteListRule');
        return frameWhiteListRule && frameWhiteListRule.isDocumentWhiteList();
    };

    /**
     * @param tab Tab
     * @returns true if Tab have white list rule and white list isn't invert
     */
    var isTabWhiteListedForSafebrowsing = function (tab) {
        return isTabWhiteListed(tab) && advblocker.whitelist.isDefaultMode();
    };

    /**
     * @param tab Tab
     * @returns true if protection is paused
     */
    var isTabProtectionDisabled = function (tab) {
        return advblocker.tabs.getTabMetadata(tab.tabId, 'applicationFilteringDisabled');
    };

    /**
     * Returns true if advblocker for Windows/Android/Mac is detected in this tab.
     *
     * @param tab   Tab
     * @returns true if advblocker for Windows/Android/Mac is detected
     */
    var isTabadvblockerDetected = function (tab) {
        return advblocker.integration.isEnabled() && advblocker.tabs.getTabMetadata(tab.tabId, 'advblockerDetected');
    };

    /**
     * Returns true if advblocker for Windows/Android/Mac is detected in this tab and tab in white list
     *
     * @param tab Tab
     * @returns true if advblocker for Windows/Android/Mac is detected and tab in white list
     */
    var isTabadvblockerWhiteListed = function (tab) {
        var advblockerDetected = isTabadvblockerDetected(tab);
        var advblockerDocumentWhiteListed = advblocker.tabs.getTabMetadata(tab.tabId, 'advblockerDocumentWhiteListed');
        return advblockerDetected && advblockerDocumentWhiteListed;
    };

    /**
     * @param tab   Tab
     * @returns advblocker whitelist rule in user filter associated with this tab
     */
    var getTabadvblockerUserWhiteListRule = function (tab) {
        var advblockerDetected = isTabadvblockerDetected(tab);
        var advblockerUserWhiteListed = advblocker.tabs.getTabMetadata(tab.tabId, 'advblockerUserWhiteListed');
        if (advblockerDetected && advblockerUserWhiteListed) {
            return advblocker.tabs.getTabMetadata(tab.tabId, 'advblockerWhiteListRule');
        }
        return null;
    };

    /**
     * Update tab info if advblocker for Windows/Android/Mac is detected
     *
     * @param tab                   Tab
     * @param advblockerDetected       True if advblocker detected
     * @param documentWhiteListed   True if Tab whitelisted by advblocker rule
     * @param userWhiteListed       True if advblocker whitelist rule in user filter
     * @param headerWhiteListRule   advblocker whitelist rule object
     * @param advblockerProductName    advblocker product name
     * @param advblockerRemoveRuleNotSupported True if advblocker Api not supported remove rule
     */
    var recordadvblockerIntegrationForTab = function (tab, advblockerDetected, documentWhiteListed, userWhiteListed, headerWhiteListRule, advblockerProductName, advblockerRemoveRuleNotSupported) {
        advblocker.tabs.updateTabMetadata(tab.tabId, {
            advblockerDetected: advblockerDetected,
            advblockerDocumentWhiteListed: documentWhiteListed,
            advblockerUserWhiteListed: userWhiteListed,
            advblockerWhiteListRule: headerWhiteListRule,
            advblockerProductName: advblockerProductName,
            advblockerRemoveRuleNotSupported: advblockerRemoveRuleNotSupported,
        });
    };

    /**
     * Gets whitelist rule for the specified tab
     * @param tab Tab to check
     * @returns whitelist rule applied to that tab (if any)
     */
    var getFrameWhiteListRule = function (tab) {
        return advblocker.tabs.getTabMetadata(tab.tabId, 'frameWhiteListRule');
    };

    /**
     * Reloads tab data (checks whitelist and filtering status)
     *
     * @param tab Tab to reload
     */
    var reloadFrameData = function (tab) {
        var frame = advblocker.tabs.getTabFrame(tab.tabId, 0);
        if (frame) {
            var applicationFilteringDisabled = advblocker.settings.isFilteringDisabled();
            var frameWhiteListRule = null;
            if (!applicationFilteringDisabled) {
                var url = frame.url;
                frameWhiteListRule = advblocker.whitelist.findWhiteListRule(url);
                if (!frameWhiteListRule) {
                    frameWhiteListRule = advblocker.requestFilter.findWhiteListRule(url, url, advblocker.RequestTypes.DOCUMENT);
                }
            }
            advblocker.tabs.updateTabMetadata(tab.tabId, {
                frameWhiteListRule: frameWhiteListRule,
                applicationFilteringDisabled: applicationFilteringDisabled,
            });
        }
    };

    /**
     * Attach referrer url to the tab's main frame object.
     * This referrer is then used on safebrowsing "Access Denied" for proper "Go Back" behavior.
     *
     * @param tab Tab
     * @param referrerUrl Referrer to record
     */
    var recordFrameReferrerHeader = function (tab, referrerUrl) {
        advblocker.tabs.updateTabMetadata(tab.tabId, { referrerUrl: referrerUrl });
    };

    /**
     * Gets main frame data
     *
     * @param tab Tab
     * @returns frame data
     */
    var getFrameInfo = function (tab) {
        var tabId = tab.tabId;
        var frame = advblocker.tabs.getTabFrame(tabId);

        var url = tab.url;
        if (!url && frame) {
            url = frame.url;
        }

        const localStorageInitialized = advblocker.localStorage.isInitialized();
        const urlFilteringDisabled = !advblocker.utils.url.isHttpRequest(url);

        // application is available for tabs where url is with http schema
        // and when localstorage is initialized
        const applicationAvailable = localStorageInitialized && !urlFilteringDisabled;
        let documentWhiteListed = false;
        let userWhiteListed = false;
        let canAddRemoveRule = false;
        let frameRule;

        let advblockerProductName = '';

        const advblockerDetected = isTabadvblockerDetected(tab);
        const totalBlocked = advblocker.pageStats.getTotalBlocked() || 0;
        const totalBlockedTab = advblocker.tabs.getTabMetadata(tabId, 'blocked') || 0;
        let applicationFilteringDisabled = advblocker.settings.isFilteringDisabled();

        if (applicationAvailable) {
            if (advblockerDetected) {
                advblockerProductName = advblocker.tabs.getTabMetadata(tabId, 'advblockerProductName');

                documentWhiteListed = advblocker.tabs.getTabMetadata(tabId, 'advblockerDocumentWhiteListed');
                userWhiteListed = advblocker.tabs.getTabMetadata(tabId, 'advblockerUserWhiteListed');
                canAddRemoveRule = !advblocker.tabs.getTabMetadata(tabId, 'advblockerRemoveRuleNotSupported')
                    && !(documentWhiteListed && !userWhiteListed);
                applicationFilteringDisabled = false;

                const advblockerWhiteListRule = advblocker.tabs.getTabMetadata(tabId, 'advblockerWhiteListRule');
                if (advblockerWhiteListRule) {
                    frameRule = {
                        filterId: advblocker.utils.filters.WHITE_LIST_FILTER_ID,
                        ruleText: advblockerWhiteListRule.ruleText,
                    };
                }
            } else {
                documentWhiteListed = isTabWhiteListed(tab);
                if (documentWhiteListed) {
                    const rule = getFrameWhiteListRule(tab);
                    userWhiteListed = advblocker.utils.filters.isWhiteListFilterRule(rule)
                        || advblocker.utils.filters.isUserFilterRule(rule);
                    frameRule = {
                        filterId: rule.filterId,
                        ruleText: rule.ruleText,
                    };
                }
                // It means site in exception
                canAddRemoveRule = !(documentWhiteListed && !userWhiteListed);
            }
        }

        const domainName = getFrameDomain(tab);

        return {
            url,
            applicationAvailable,
            domainName,
            applicationFilteringDisabled,
            urlFilteringDisabled,
            documentWhiteListed,
            userWhiteListed,
            canAddRemoveRule,
            frameRule,
            advblockerDetected,
            advblockerProductName,
            totalBlockedTab,
            totalBlocked,
        };
    };

    /**
     * Update count of blocked requests
     *
     * @param tab - Tab
     * @param blocked - count of blocked requests
     * @returns  updated count of blocked requests
     */
    var updateBlockedAdsCount = function (tab, blocked) {
        advblocker.pageStats.updateTotalBlocked(blocked);

        blocked = (advblocker.tabs.getTabMetadata(tab.tabId, 'blocked') || 0) + blocked;
        advblocker.tabs.updateTabMetadata(tab.tabId, { blocked: blocked });

        return blocked;
    };

    /**
     * Reset count of blocked requests for tab or overall stats
     * @param tab - Tab (optional)
     */
    var resetBlockedAdsCount = function (tab) {
        if (tab) {
            advblocker.tabs.updateTabMetadata(tab.tabId, { blocked: 0 });
        } else {
            advblocker.pageStats.resetStats();
        }
    };

    /**
     * Is tab in incognito mode?
     * @param tab Tab
     */
    var isIncognitoTab = function (tab) {
        return advblocker.tabs.isIncognito(tab.tabId);
    };

    /**
     * Checks if we should process request further
     * @param {object} tab
     * @returns {boolean}
     */
    const shouldStopRequestProcess = (tab) => {
        return isTabadvblockerDetected(tab) ||
            isTabProtectionDisabled(tab) ||
            isTabWhiteListed(tab);
    };

    // Records frames on application initialization
    advblocker.listeners.addListener(function (event) {
        if (event === advblocker.listeners.APPLICATION_INITIALIZED) {
            advblocker.tabs.forEach(function (tab) {
                recordFrame(tab, 0, tab.url, advblocker.RequestTypes.DOCUMENT);
            });
        }
    });

    return {
        recordFrame: recordFrame,
        getFrameUrl: getFrameUrl,
        getMainFrameUrl: getMainFrameUrl,
        getFrameDomain: getFrameDomain,
        isTabWhiteListed: isTabWhiteListed,
        isTabWhiteListedForSafebrowsing: isTabWhiteListedForSafebrowsing,
        isTabProtectionDisabled: isTabProtectionDisabled,
        isTabadvblockerDetected: isTabadvblockerDetected,
        isTabadvblockerWhiteListed: isTabadvblockerWhiteListed,
        getTabadvblockerUserWhiteListRule: getTabadvblockerUserWhiteListRule,
        recordadvblockerIntegrationForTab: recordadvblockerIntegrationForTab,
        getFrameWhiteListRule: getFrameWhiteListRule,
        reloadFrameData: reloadFrameData,
        recordFrameReferrerHeader: recordFrameReferrerHeader,
        getFrameInfo: getFrameInfo,
        updateBlockedAdsCount: updateBlockedAdsCount,
        resetBlockedAdsCount: resetBlockedAdsCount,
        isIncognitoTab: isIncognitoTab,
        shouldStopRequestProcess: shouldStopRequestProcess,
    };
})(advblocker);
