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
 *  Initialize Content => BackgroundPage messaging
 */
(function (advblocker) {

    'use strict';

    /**
     * Contains event listeners from content pages
     */
    var eventListeners = Object.create(null);

    /**
     * Adds event listener from content page
     * @param message
     * @param sender
     */
    function processAddEventListener(message, sender) {
        var listenerId = advblocker.listeners.addSpecifiedListener(message.events, function () {
            var sender = eventListeners[listenerId];
            if (sender) {
                advblocker.tabs.sendMessage(sender.tab.tabId, {
                    type: 'notifyListeners',
                    args: Array.prototype.slice.call(arguments)
                });
            }
        });
        eventListeners[listenerId] = sender;
        return { listenerId: listenerId };
    }

    /**
     * Constructs objects that uses on extension pages, like: options.html, thankyou.html etc
     */
    function processInitializeFrameScriptRequest() {

        var enabledFilters = Object.create(null);

        var AntiBannerFiltersId = advblocker.utils.filters.ids;

        for (var key in AntiBannerFiltersId) {
            if (AntiBannerFiltersId.hasOwnProperty(key)) {
                var filterId = AntiBannerFiltersId[key];
                var enabled = advblocker.filters.isFilterEnabled(filterId);
                if (enabled) {
                    enabledFilters[filterId] = true;
                }
            }
        }

        return {
            userSettings: advblocker.settings.getAllSettings(),
            enabledFilters: enabledFilters,
            filtersMetadata: advblocker.subscriptions.getFilters(),
            requestFilterInfo: advblocker.requestFilter.getRequestFilterInfo(),
            syncStatusInfo: advblocker.sync.syncService.getSyncStatus(),
            environmentOptions: {
                isMacOs: advblocker.utils.browser.isMacOs(),
                canBlockWebRTC: advblocker.stealthService.canBlockWebRTC(),
                isChrome: advblocker.utils.browser.isChromeBrowser(),
                Prefs: {
                    locale: advblocker.app.getLocale(),
                    mobile: advblocker.prefs.mobile || false,
                },
                appVersion: advblocker.app.getVersion(),
            },
            constants: {
                AntiBannerFiltersId: advblocker.utils.filters.ids,
                EventNotifierTypes: advblocker.listeners.events,
            },
        };
    }

    /**
     * Saves css hits from content-script.
     * Message includes stats field. [{filterId: 1, ruleText: 'rule1'}, {filterId: 2, ruleText: 'rule2'}...]
     * @param tab
     * @param stats
     */
    function processSaveCssHitStats(tab, stats) {
        if (!advblocker.webRequestService.isCollectingCosmeticRulesHits(tab)) {
            return;
        }
        var frameUrl = advblocker.frames.getMainFrameUrl(tab);
        for (let i = 0; i < stats.length; i += 1) {
            const stat = stats[i];
            const rule = advblocker.rules.builder.createRule(stat.ruleText, stat.filterId);
            advblocker.webRequestService.recordRuleHit(tab, rule, frameUrl);
            advblocker.filteringLog.addCosmeticEvent(tab, stat.element, tab.url, advblocker.RequestTypes.DOCUMENT, rule);
        }
    }


    /**
     * Main function for processing messages from content-scripts
     *
     * @param message
     * @param sender
     * @param callback
     * @returns {*}
     */
    function handleMessage(message, sender, callback) {
        switch (message.type) {
            case 'unWhiteListFrame':
                advblocker.userrules.unWhiteListFrame(message.frameInfo);
                break;
            case 'addEventListener':
                return processAddEventListener(message, sender);
            case 'removeListener':
                var listenerId = message.listenerId;
                advblocker.listeners.removeListener(listenerId);
                delete eventListeners[listenerId];
                break;
            case 'initializeFrameScript':
                return processInitializeFrameScriptRequest();
            case 'changeUserSetting':
                advblocker.settings.setProperty(message.key, message.value);
                break;
            case 'checkRequestFilterReady':
                return { ready: advblocker.requestFilter.isReady() };
            case 'addAndEnableFilter':
                advblocker.filters.addAndEnableFilters([message.filterId]);
                break;
            case 'disableAntiBannerFilter':
                if (message.remove) {
                    advblocker.filters.uninstallFilters([message.filterId]);
                } else {
                    advblocker.filters.disableFilters([message.filterId]);
                }
                break;
            case 'removeAntiBannerFilter':
                advblocker.filters.removeFilter(message.filterId);
                break;
            case 'enableFiltersGroup':
                advblocker.categories.enableFiltersGroup(message.groupId);
                break;
            case 'disableFiltersGroup':
                advblocker.categories.disableFiltersGroup(message.groupId);
                break;
            case 'changeDefaultWhiteListMode':
                advblocker.whitelist.changeDefaultWhiteListMode(message.enabled);
                break;
            case 'getWhiteListDomains':
                var whiteListDomains = advblocker.whitelist.getWhiteListDomains();
                return { content: whiteListDomains.join('\r\n') };
            case 'saveWhiteListDomains': {
                const domains = message.content.split(/[\r\n]+/)
                    .map(string => string.trim())
                    .filter(string => string.length > 0);
                advblocker.whitelist.updateWhiteListDomains(domains);
                break;
            }
            case 'getUserRules':
                advblocker.userrules.getUserRulesText((content) => {
                    callback({ content: content });
                });
                return true;
            case 'saveUserRules':
                advblocker.userrules.updateUserRulesText(message.content);
                break;
            case 'addUserRule':
                advblocker.userrules.addRules([message.ruleText]);
                if (message.advblockerDetected || advblocker.frames.isTabadvblockerDetected(sender.tab)) {
                    advblocker.integration.addRuleToApp(message.ruleText);
                }
                break;
            case 'removeUserRule':
                advblocker.userrules.removeRule(message.ruleText);
                if (message.advblockerDetected || advblocker.frames.isTabadvblockerDetected(sender.tab)) {
                    advblocker.integration.removeRuleFromApp(message.ruleText);
                }
                break;
            case 'checkAntiBannerFiltersUpdate':
                advblocker.ui.checkFiltersUpdates();
                break;
            case 'loadCustomFilterInfo':
                advblocker.filters.loadCustomFilterInfo(message.url, { title: message.title }, (filter) => {
                    callback({ filter });
                }, (error) => {
                    callback({ error });
                });
                return true;
            case 'subscribeToCustomFilter': {
                const { url, title, trusted } = message;
                advblocker.filters.loadCustomFilter(url, { title, trusted }, (filter) => {
                    advblocker.filters.addAndEnableFilters([filter.filterId], () => {
                        callback(filter);
                    });
                }, () => {
                    callback();
                });
                return true;
            }
            case 'getFiltersMetadata':
                return advblocker.categories.getFiltersMetadata();
            case 'setFiltersUpdatePeriod':
                advblocker.settings.setFiltersUpdatePeriod(message.updatePeriod);
                break;
            case 'openThankYouPage':
                advblocker.ui.openThankYouPage();
                break;
            case 'openExtensionStore':
                advblocker.ui.openExtensionStore();
                break;
            case 'openFilteringLog':
                advblocker.ui.openFilteringLog(message.tabId);
                break;
            case 'openExportRulesTab':
                advblocker.ui.openExportRulesTab(message.whitelist);
                break;
            case 'openSafebrowsingTrusted':
                advblocker.safebrowsing.addToSafebrowsingTrusted(message.url);
                advblocker.tabs.getActive(function (tab) {
                    advblocker.tabs.reload(tab.tabId, message.url);
                });
                break;
            case 'openTab':
                advblocker.ui.openTab(message.url, message.options);
                break;
            case 'resetBlockedAdsCount':
                advblocker.frames.resetBlockedAdsCount();
                break;
            case 'getSelectorsAndScripts':
                return advblocker.webRequestService.processGetSelectorsAndScripts(sender.tab, message.documentUrl) || {};
            case 'checkPageScriptWrapperRequest':
                var block = advblocker.webRequestService.checkPageScriptWrapperRequest(sender.tab, message.elementUrl, message.documentUrl, message.requestType);
                return { block: block, requestId: message.requestId };
            case 'processShouldCollapse':
                var collapse = advblocker.webRequestService.processShouldCollapse(sender.tab, message.elementUrl, message.documentUrl, message.requestType);
                return { collapse: collapse, requestId: message.requestId };
            case 'processShouldCollapseMany':
                var requests = advblocker.webRequestService.processShouldCollapseMany(sender.tab, message.documentUrl, message.requests);
                return { requests: requests };
            case 'onOpenFilteringLogPage':
                advblocker.filteringLog.onOpenFilteringLogPage();
                break;
            case 'onCloseFilteringLogPage':
                advblocker.filteringLog.onCloseFilteringLogPage();
                break;
            case 'reloadTabById':
                if (!message.preserveLogEnabled) {
                    advblocker.filteringLog.clearEventsByTabId(message.tabId);
                }
                advblocker.tabs.reload(message.tabId);
                break;
            case 'clearEventsByTabId':
                advblocker.filteringLog.clearEventsByTabId(message.tabId);
                break;
            case 'getTabFrameInfoById':
                if (message.tabId) {
                    var frameInfo = advblocker.frames.getFrameInfo({ tabId: message.tabId });
                    return { frameInfo: frameInfo };
                } else {
                    advblocker.tabs.getActive(function (tab) {
                        var frameInfo = advblocker.frames.getFrameInfo(tab);
                        callback({ frameInfo: frameInfo });
                    });
                    return true; // Async
                }
            case 'getFilteringInfoByTabId':
                var filteringInfo = advblocker.filteringLog.getFilteringInfoByTabId(message.tabId);
                return { filteringInfo: filteringInfo };
            case 'synchronizeOpenTabs':
                advblocker.filteringLog.synchronizeOpenTabs(function (tabs) {
                    callback({ tabs: tabs });
                });
                return true; // Async
            case 'addFilterSubscription': {
                if (advblocker.frames.isTabadvblockerDetected(sender.tab)) {
                    break;
                }
                const { url, title } = message;
                const hashOptions = {
                    action: 'add_filter_subscription',
                    title,
                    url,
                };
                advblocker.ui.openSettingsTab('antibanner0', hashOptions);
                break;
            }
            case 'showAlertMessagePopup':
                advblocker.ui.showAlertMessagePopup(message.title, message.text);
                break;
            // Popup methods
            case 'addWhiteListDomainPopup':
                advblocker.tabs.getActive(function (tab) {
                    advblocker.ui.whiteListTab(tab);
                });
                break;
            case 'removeWhiteListDomainPopup':
                advblocker.tabs.getActive(function (tab) {
                    advblocker.ui.unWhiteListTab(tab);
                });
                break;
            case 'changeApplicationFilteringDisabled':
                advblocker.ui.changeApplicationFilteringDisabled(message.disabled);
                break;
            case 'openSiteReportTab':
                advblocker.ui.openSiteReportTab(message.url);
                break;
            case 'openAbuseTab':
                advblocker.ui.openAbuseTab(message.url);
                break;
            case 'openSettingsTab':
                advblocker.ui.openSettingsTab();
                break;
            case 'openAssistant':
                advblocker.ui.openAssistant();
                break;
            case 'getTabInfoForPopup':
                advblocker.tabs.getActive(function (tab) {
                    const frameInfo = advblocker.frames.getFrameInfo(tab);
                    callback({
                        frameInfo: frameInfo,
                        options: {
                            showStatsSupported: true,
                            isFirefoxBrowser: advblocker.utils.browser.isFirefoxBrowser(),
                            showInfoAboutFullVersion: advblocker.settings.isShowInfoAboutadvblockerFullVersion(),
                            isMacOs: advblocker.utils.browser.isMacOs(),
                            notification: advblocker.notifications.getCurrentNotification(),
                            isDisableShowadvblockerPromoInfo: advblocker.settings.isDisableShowadvblockerPromoInfo(),
                        },
                    });
                });
                return true; // Async
            case 'setNotificationViewed':
                advblocker.notifications.setNotificationViewed(message.withDelay);
                break;
            case 'getStatisticsData':
                // There can't be data till localstorage is initialized
                if (!advblocker.localStorage.isInitialized()) {
                    return {};
                }
                callback({
                    stats: advblocker.pageStats.getStatisticsData(),
                });
                return true;
            case 'resizePanelPopup':
                advblocker.browserAction.resize(message.width, message.height);
                break;
            case 'closePanelPopup':
                advblocker.browserAction.close();
                break;
            case 'sendFeedback':
                advblocker.backend.sendUrlReport(message.url, message.topic, message.comment);
                break;
            case 'saveCssHitStats':
                processSaveCssHitStats(sender.tab, message.stats);
                break;
            // Sync messages
            case 'setSyncProvider':
                advblocker.sync.syncService.setSyncProvider(message.provider);
                break;
            case 'setOAuthToken':
                if (advblocker.sync.oauthService.setToken(message.provider, message.token, message.csrfState, message.expires)) {
                    advblocker.sync.syncService.setSyncProvider(message.provider);
                    advblocker.tabs.remove(sender.tab.tabId);
                }
                break;
            case 'getSyncStatus':
                return advblocker.sync.syncService.getSyncStatus();
            case 'authSync':
                advblocker.sync.oauthService.authorize(message.provider);
                break;
            case 'dropAuthSync':
                advblocker.listeners.notifyListeners(advblocker.listeners.SYNC_BAD_OR_EXPIRED_TOKEN, message.provider);
                break;
            case 'toggleSync':
                advblocker.sync.syncService.toggleSyncStatus();
                break;
            case 'syncNow':
                advblocker.listeners.notifyListeners(advblocker.listeners.SYNC_REQUIRED, {force: true});
                break;
            case 'setSyncOptions':
                advblocker.sync.syncService.setSyncOptions(message.options);
                break;
            case 'syncChangeDeviceName':
                advblocker.sync.syncService.changeDeviceName(message.deviceName);
                break;
            case 'loadSettingsJson':
                advblocker.sync.settingsProvider.loadSettingsBackup(callback);
                return true; // Async
            case 'applySettingsJson':
                advblocker.sync.settingsProvider.applySettingsBackup(message.json);
                break;
            case 'disableGetPremiumNotification':
                advblocker.settings.disableShowadvblockerPromoInfo();
                break;
            default:
                // Unhandled message
                return true;
        }
    }

    // Add event listener from content-script messages
    advblocker.runtime.onMessage.addListener(handleMessage);

    /**
     * There is no messaging in Safari popover context,
     * so we have to expose this method to keep the message-like style that is used in other browsers for communication between popup and background page.
     */
    advblocker.runtime.onMessageHandler = handleMessage;

})(advblocker);
