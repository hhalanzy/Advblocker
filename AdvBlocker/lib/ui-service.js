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

advblocker.ui = (function (advblocker) { // jshint ignore:line

    var browserActionTitle = advblocker.i18n.getMessage('name');

    var contextMenuCallbackMappings = {
        'context_block_site_ads': function () {
            openAssistant();
        },
        'context_block_site_element': function () {
            openAssistant(true);
        },
        'context_security_report': function () {
            advblocker.tabs.getActive(function (tab) {
                openSiteReportTab(tab.url);
            });
        },
        'context_complaint_website': function () {
            advblocker.tabs.getActive(function (tab) {
                openAbuseTab(tab.url);
            });
        },
        'context_site_filtering_on': function () {
            advblocker.tabs.getActive(unWhiteListTab);
        },
        'context_site_filtering_off': function () {
            advblocker.tabs.getActive(whiteListTab);
        },
        'context_enable_protection': function () {
            changeApplicationFilteringDisabled(false);
        },
        'context_disable_protection': function () {
            changeApplicationFilteringDisabled(true);
        },
        'context_open_settings': function () {
            openSettingsTab();
        },
        'context_general_settings': function () {
            openSettingsTab('general-settings');
        },
        'context_antibanner': function () {
            openSettingsTab('antibanner');
        },
        'context_safebrowsing': function () {
            openSettingsTab('safebrowsing');
        },
        'context_whitelist': function () {
            openSettingsTab('whitelist');
        },
        'context_userfilter': function () {
            openSettingsTab('userfilter');
        },
        'context_miscellaneous_settings': function () {
            openSettingsTab('miscellaneous-settings');
        },
        'context_open_log': function () {
            openFilteringLog();
        },
        'context_update_antibanner_filters': function () {
            checkFiltersUpdates();
        },
        'context_ads_has_been_removed_by_advblocker': function () {
            openIntegrationModeInfo();
        }
    };

    var nextMenuId = 0;

    var extensionStoreLink = (function () {

        var urlBuilder = ["https://advblocker.com/extension-page.html"];
        urlBuilder.push("?browser=");
        if (advblocker.utils.browser.isOperaBrowser()) {
            urlBuilder.push("opera");
        } else if (advblocker.utils.browser.isFirefoxBrowser()) {
            urlBuilder.push("firefox");
        } else if (advblocker.utils.browser.isYaBrowser()) {
            urlBuilder.push("yabrowser");
        } else if (advblocker.utils.browser.isEdgeBrowser()) {
            urlBuilder.push("edge");
        } else {
            urlBuilder.push("chrome");
        }

        return urlBuilder.join("");
    })();

    var THANKYOU_PAGE_URL = 'pages/options.html';

    /**
     * Update icon for tab
     * @param tab Tab
     * @param options Options for icon or badge values
     */
    function updateTabIcon(tab, options) {
        let icon;
        let badge;
        let badgeColor = '#555';

        try {
            if (options) {
                icon = options.icon;
                badge = options.badge;
            } else {
                let blocked;
                let disabled;

                const tabInfo = advblocker.frames.getFrameInfo(tab);
                if (tabInfo.advblockerDetected) {
                    disabled = tabInfo.documentWhiteListed;
                    blocked = '';
                } else {
                    disabled = tabInfo.applicationFilteringDisabled;
                    disabled = disabled || tabInfo.urlFilteringDisabled;
                    disabled = disabled || tabInfo.documentWhiteListed;

                    if (!disabled && advblocker.settings.showPageStatistic()) {
                        blocked = tabInfo.totalBlockedTab.toString();
                    } else {
                        blocked = '0';
                    }
                }

                if (disabled) {
                    icon = advblocker.prefs.ICONS.ICON_GRAY;
                } else if (tabInfo.advblockerDetected) {
                    icon = advblocker.prefs.ICONS.ICON_BLUE;
                } else {
                    icon = advblocker.prefs.ICONS.ICON_GREEN;
                }

                badge = advblocker.utils.workaround.getBlockedCountText(blocked);

                // If there's an active notification, indicate it on the badge
                const notification = advblocker.notifications.getCurrentNotification();
                if (notification && !tabInfo.advblockerDetected) {
                    badge = notification.badgeText;
                    badgeColor = notification.badgeBgColor;
                }
            }

            advblocker.browserAction.setBrowserAction(tab, icon, badge, badgeColor, browserActionTitle);
        } catch (ex) {
            advblocker.console.error('Error while updating icon for tab {0}: {1}', tab.tabId, new Error(ex));
        }
    }

    var updateTabIconAsync = advblocker.utils.concurrent.debounce(function (tab) {
        updateTabIcon(tab);
    }, 250);

    /**
     * Update extension browser action popup window
     * @param tab - active tab
     */
    function updatePopupStats(tab) {
        var tabInfo = advblocker.frames.getFrameInfo(tab);
        if (!tabInfo) {
            return;
        }
        advblocker.runtimeImpl.sendMessage({
            type: 'updateTotalBlocked',
            tabInfo: tabInfo,
        });
    }

    var updatePopupStatsAsync = advblocker.utils.concurrent.debounce(function (tab) {
        updatePopupStats(tab);
    }, 250);

    /**
     * Creates context menu item
     * @param title Title id
     * @param options Create options
     */
    function addMenu(title, options) {
        var createProperties = {
            contexts: ["all"],
            title: advblocker.i18n.getMessage(title)
        };
        if (options) {
            if (options.id) {
                createProperties.id = options.id;
            }
            if (options.parentId) {
                createProperties.parentId = options.parentId;
            }
            if (options.disabled) {
                createProperties.enabled = false;
            }
            if (options.messageArgs) {
                createProperties.title = advblocker.i18n.getMessage(title, options.messageArgs);
            }
            if (options.contexts) {
                createProperties.contexts = options.contexts;
            }
            if ('checkable' in options) {
                createProperties.checkable = options.checkable;
            }
            if ('checked' in options) {
                createProperties.checked = options.checked;
            }
        }
        var callback;
        if (options && options.action) {
            callback = contextMenuCallbackMappings[options.action];
        } else {
            callback = contextMenuCallbackMappings[title];
        }
        if (typeof callback === 'function') {
            createProperties.onclick = callback;
        }
        advblocker.contextMenus.create(createProperties);
    }

    function customizeContextMenu(tab) {
        function addSeparator() {
            advblocker.contextMenus.create({
                type: 'separator',
            });
        }

        var tabInfo = advblocker.frames.getFrameInfo(tab);

        if (tabInfo.applicationFilteringDisabled) {
            addMenu('context_site_protection_disabled');
            addSeparator();
            addMenu('context_open_log');
            addMenu('context_open_settings');
            addMenu('context_enable_protection');
        } else if (tabInfo.urlFilteringDisabled) {
            addMenu('context_site_filtering_disabled');
            addSeparator();
            addMenu('context_open_log');
            addMenu('context_open_settings');
            addMenu('context_update_antibanner_filters');
        } else {
            if (tabInfo.advblockerDetected) {
                if (tabInfo.advblockerProductName) {
                    addMenu('context_ads_has_been_removed_by_advblocker', {messageArgs: [tabInfo.advblockerProductName]});
                } else {
                    addMenu('context_ads_has_been_removed');
                }
                addSeparator();
            }
            if (tabInfo.documentWhiteListed && !tabInfo.userWhiteListed) {
                addMenu('context_site_exception');
            } else if (tabInfo.canAddRemoveRule) {
                if (tabInfo.documentWhiteListed) {
                    addMenu('context_site_filtering_on');
                } else {
                    addMenu('context_site_filtering_off');
                }
            }
            addSeparator();

            if (!tabInfo.documentWhiteListed) {
                addMenu('context_block_site_ads');
                addMenu('context_block_site_element', {contexts: ["image", "video", "audio"]});
            }
            addMenu('context_security_report');
            addMenu('context_complaint_website');
            addSeparator();
            if (!tabInfo.advblockerDetected) {
                addMenu('context_update_antibanner_filters');
                addSeparator();
                addMenu('context_open_settings');
            }
            addMenu('context_open_log');
            if (!tabInfo.advblockerDetected) {
                addMenu('context_disable_protection');
            }
        }
    }

    function customizeMobileContextMenu(tab) {

        var tabInfo = advblocker.frames.getFrameInfo(tab);

        if (tabInfo.applicationFilteringDisabled) {
            addMenu('popup_site_protection_disabled_android', {
                action: 'context_enable_protection',
                checked: true,
                checkable: true,
            });
            addMenu('popup_open_log_android', { action: 'context_open_log' });
            addMenu('popup_open_settings', { action: 'context_open_settings' });
        } else if (tabInfo.urlFilteringDisabled) {
            addMenu('context_site_filtering_disabled');
            addMenu('popup_open_log_android', { action: 'context_open_log' });
            addMenu('popup_open_settings', { action: 'context_open_settings' });
            addMenu('context_update_antibanner_filters');
        } else {
            addMenu('popup_site_protection_disabled_android', {
                action: 'context_disable_protection',
                checked: false,
                checkable: true
            });
            if (tabInfo.documentWhiteListed && !tabInfo.userWhiteListed) {
                addMenu('popup_in_white_list_android');
            } else if (tabInfo.canAddRemoveRule) {
                if (tabInfo.documentWhiteListed) {
                    addMenu('popup_site_filtering_state', {
                        action: 'context_site_filtering_on',
                        checkable: true,
                        checked: false
                    });
                } else {
                    addMenu('popup_site_filtering_state', {
                        action: 'context_site_filtering_off',
                        checkable: true,
                        checked: true
                    });
                }
            }

            if (!tabInfo.documentWhiteListed) {
                addMenu('popup_block_site_ads_android', {action: 'context_block_site_ads'});
            }
            addMenu('popup_open_log_android', {action: 'context_open_log'});
            addMenu('popup_security_report_android', {action: 'context_security_report'});
            addMenu('popup_open_settings', {action: 'context_open_settings'});
            addMenu('context_update_antibanner_filters');
        }
    }

    /**
     * Update context menu for tab
     * @param tab Tab
     */
    function updateTabContextMenu(tab) {
        // Isn't supported by Android WebExt
        if (!advblocker.contextMenus) {
            return;
        }
        advblocker.contextMenus.removeAll();
        if (advblocker.settings.showContextMenu()) {
            if (advblocker.prefs.mobile) {
                customizeMobileContextMenu(tab);
            } else {
                customizeContextMenu(tab);
            }
            if (typeof advblocker.contextMenus.render === 'function') {
                // In some case we need to manually render context menu
                advblocker.contextMenus.render();
            }
        }
    }

    function closeAllPages() {
        advblocker.tabs.forEach(function (tab) {
            if (tab.url.indexOf(advblocker.getURL('')) >= 0) {
                advblocker.tabs.remove(tab.tabId);
            }
        });
    }

    function getPageUrl(page) {
        return advblocker.getURL('pages/' + page);
    }

    const isadvblockerTab = (tab) => {
        const { url } = tab;
        const parsedUrl = new URL(url);
        const schemeUrl = advblocker.app.getUrlScheme();
        return parsedUrl.protocol.indexOf(schemeUrl) > -1;
    };

    function showAlertMessagePopup(title, text, showForadvblockerTab) {
        advblocker.tabs.getActive(function (tab) {
            if (!showForadvblockerTab && advblocker.frames.isTabadvblockerDetected(tab)) {
                return;
            }
            advblocker.tabs.sendMessage(tab.tabId, {
                type: 'show-alert-popup',
                isadvblockerTab: isadvblockerTab(tab),
                title: title,
                text: text,
            });
        });
    }

    /**
     * Depending on version numbers select proper message for description
     *
     * @param currentVersion
     * @param previousVersion
     */
    function getUpdateDescriptionMessage(currentVersion, previousVersion) {
        if (advblocker.utils.browser.getMajorVersionNumber(currentVersion) > advblocker.utils.browser.getMajorVersionNumber(previousVersion)
          || advblocker.utils.browser.getMinorVersionNumber(currentVersion) > advblocker.utils.browser.getMinorVersionNumber(previousVersion)) {
            return advblocker.i18n.getMessage('options_popup_version_update_description_major');
        }

        return advblocker.i18n.getMessage('options_popup_version_update_description_minor');
    }

    /**
     * Shows application updated popup
     *
     * @param currentVersion
     * @param previousVersion
     */
    function showVersionUpdatedPopup(currentVersion, previousVersion) {
        // Suppress for v3.0 hotfix
        // TODO: Remove this in the next update
        if (advblocker.utils.browser.getMajorVersionNumber(currentVersion) == advblocker.utils.browser.getMajorVersionNumber(previousVersion) &&
          advblocker.utils.browser.getMinorVersionNumber(currentVersion) == advblocker.utils.browser.getMinorVersionNumber(previousVersion)) {
            return;
        }
        const message = {
            type: 'show-version-updated-popup',
            title: advblocker.i18n.getMessage('options_popup_version_update_title', currentVersion),
            description: getUpdateDescriptionMessage(currentVersion, previousVersion),
            changelogHref: 'https://advblocker.com/forward.html?action=github_version_popup&from=version_popup&app=browser_extension',
            changelogText: advblocker.i18n.getMessage('options_popup_version_update_changelog_text'),
            offer: advblocker.i18n.getMessage('options_popup_version_update_offer'),
            offerButtonHref: 'https://advblocker.com/forward.html?action=learn_about_advblocker&from=version_popup&app=browser_extension',
            offerButtonText: advblocker.i18n.getMessage('options_popup_version_update_offer_button_text'),
            disableNotificationText: advblocker.i18n.getMessage('options_popup_version_update_disable_notification'),
        };

        advblocker.tabs.getActive(function (tab) {
            message.isadvblockerTab = isadvblockerTab(tab);
            message.isTabadvblockerDetected = advblocker.frames.isTabadvblockerDetected(tab);
            advblocker.tabs.sendMessage(tab.tabId, message);
        });
    }

    function getFiltersUpdateResultMessage(success, updatedFilters) {
        let title = '';
        let text = '';
        if (success) {
            if (updatedFilters.length === 0) {
                title = '';
                text = advblocker.i18n.getMessage('options_popup_update_not_found');
            } else {
                title = '';
                text = updatedFilters
                    .sort((a, b) => {
                        if (a.groupId === b.groupId) {
                            return a.displayNumber - b.displayNumber;
                        }
                        return a.groupId === b.groupId;
                    })
                    .map(filter => `"${filter.name}"`)
                    .join(', ');
                if (updatedFilters.length > 1) {
                    text += ` ${advblocker.i18n.getMessage('options_popup_update_filters')}`;
                } else {
                    text += ` ${advblocker.i18n.getMessage('options_popup_update_filter')}`;
                }
            }
        } else {
            title = advblocker.i18n.getMessage('options_popup_update_title_error');
            text = advblocker.i18n.getMessage('options_popup_update_error');
        }

        return {
            title: title,
            text: text,
        };
    }

    function getFiltersEnabledResultMessage(enabledFilters) {
        var title = advblocker.i18n.getMessage("alert_popup_filter_enabled_title");
        var text = [];
        enabledFilters.sort(function (a, b) {
            return a.displayNumber - b.displayNumber;
        });
        for (var i = 0; i < enabledFilters.length; i++) {
            var filter = enabledFilters[i];
            text.push(advblocker.i18n.getMessage("alert_popup_filter_enabled_text", [filter.name]).replace("$1", filter.name));
        }
        return {
            title: title,
            text: text
        };
    }

    var updateTabIconAndContextMenu = function (tab, reloadFrameData) {
        if (reloadFrameData) {
            advblocker.frames.reloadFrameData(tab);
        }
        updateTabIcon(tab);
        updateTabContextMenu(tab);
    };

    var openExportRulesTab = function (whitelist) {
        openTab(getPageUrl('export.html' + (whitelist ? '#wl' : '')));
    };

    /**
     * Open settings tab with hash parameters or without them
     * @param anchor
     * @param hashParameters
     */
    var openSettingsTab = function (anchor, hashParameters = {}) {
        if (anchor) {
            hashParameters.anchor = anchor;
        }

        const options = {
            activateSameTab: true,
            hashParameters,
        };

        openTab(getPageUrl('options.html'), options);
    };

    var openSiteReportTab = function (url) {
        var domain = advblocker.utils.url.toPunyCode(advblocker.utils.url.getDomainName(url));
        if (domain) {
            openTab("https://advblocker.com/site.html?domain=" + encodeURIComponent(domain) + "&utm_source=extension&aid=16593");
        }
    };

    /**
     * Generates query string with stealth options information
     * @returns {string}
     */
    const getStealthString = () => {
        const stealthOptions = [
            { queryKey: 'ext_hide_referrer', settingKey: advblocker.settings.HIDE_REFERRER },
            { queryKey: 'hide_search_queries', settingKey: advblocker.settings.HIDE_SEARCH_QUERIES },
            { queryKey: 'DNT', settingKey: advblocker.settings.SEND_DO_NOT_TRACK },
            { queryKey: 'x_client', settingKey: advblocker.settings.BLOCK_CHROME_CLIENT_DATA },
            { queryKey: 'webrtc', settingKey: advblocker.settings.BLOCK_WEBRTC },
            {
                queryKey: 'third_party_cookies',
                settingKey: advblocker.settings.SELF_DESTRUCT_THIRD_PARTY_COOKIES,
                settingValueKey: advblocker.settings.SELF_DESTRUCT_THIRD_PARTY_COOKIES_TIME,
            },
            {
                queryKey: 'first_party_cookies',
                settingKey: advblocker.settings.SELF_DESTRUCT_FIRST_PARTY_COOKIES,
                settingValueKey: advblocker.settings.SELF_DESTRUCT_FIRST_PARTY_COOKIES_TIME,
            },
            { queryKey: 'strip_url', settingKey: advblocker.settings.STRIP_TRACKING_PARAMETERS },
        ];

        const stealthEnabled = !advblocker.settings.getProperty(advblocker.settings.DISABLE_STEALTH_MODE);

        if (!stealthEnabled) {
            return `&stealth.enabled=${stealthEnabled}`;
        }

        const stealthOptionsString = stealthOptions.map(option => {
            const { queryKey, settingKey, settingValueKey } = option;
            const setting = advblocker.settings.getProperty(settingKey);
            let settingString;
            if (!setting) {
                return '';
            }
            if (!settingValueKey) {
                settingString = setting;
            } else {
                settingString = advblocker.settings.getProperty(settingValueKey);
            }
            return `stealth.${queryKey}=${encodeURIComponent(settingString)}`;
        })
            .filter(string => string.length > 0)
            .join('&');

        return `&stealth.enabled=${stealthEnabled}&${stealthOptionsString}`;
    };

    /**
     * Opens site complaint report tab
     * https://github.com/advblockerTeam/ReportsWebApp#pre-filling-the-app-with-query-parameters
     * @param url
     */
    const openAbuseTab = function (url) {
        let browser;
        let browserDetails;

        const supportedBrowsers = ['Chrome', 'Firefox', 'Opera', 'Safari', 'IE', 'Edge'];
        if (supportedBrowsers.includes(advblocker.prefs.browser)) {
            browser = advblocker.prefs.browser;
        } else {
            browser = 'Other';
            browserDetails = advblocker.prefs.browser;
        }

        const filterIds = advblocker.filters.getEnabledFiltersFromEnabledGroups()
            .map(filter => filter.filterId);

        openTab('https://reports.advblocker.com/new_issue.html?product_type=Ext&product_version='
            + encodeURIComponent(advblocker.app.getVersion())
            + '&browser=' + encodeURIComponent(browser)
            + (browserDetails ? '&browser_detail=' + encodeURIComponent(browserDetails) : '')
            + '&url=' + encodeURIComponent(url)
            + '&filters=' + encodeURIComponent(filterIds.join('.'))
            + getStealthString());
    };

    var openFilteringLog = function (tabId) {
        var options = {activateSameTab: true, type: "popup"};
        if (!tabId) {
            advblocker.tabs.getActive(function (tab) {
                var tabId = tab.tabId;
                openTab(getPageUrl('log.html') + (tabId ? "#" + tabId : ""), options);
            });
            return;
        }
        openTab(getPageUrl('log.html') + (tabId ? "#" + tabId : ""), options);
    };

    var openThankYouPage = function () {
        var params = advblocker.utils.browser.getExtensionParams();
        params.push('_locale=' + encodeURIComponent(advblocker.app.getLocale()));
        var thankyouUrl = THANKYOU_PAGE_URL + '?' + params.join('&');

        var filtersDownloadUrl = getPageUrl('filter-download.html');

        advblocker.tabs.getAll(function (tabs) {
            // Finds the filter-download page and reload it within the thank-you page URL
            for (var i = 0; i < tabs.length; i++) {
                var tab = tabs[i];
                if (tab.url === filtersDownloadUrl) {
                    // In YaBrowser don't activate found page
                    if (!advblocker.utils.browser.isYaBrowser()) {
                        advblocker.tabs.activate(tab.tabId);
                    }
                    advblocker.tabs.reload(tab.tabId, thankyouUrl);
                    return;
                }
            }
            openTab(thankyouUrl);
        });
    };

    var openIntegrationModeInfo = function () {
        openTab('https://advblocker.com/advblocker-adblock-browser-extension/integration-mode.html?utm_source=extension&aid=16593#integrationMode');
    };

    var openExtensionStore = function () {
        openTab(extensionStoreLink);
    };

    var openFiltersDownloadPage = function () {
        openTab(getPageUrl('filter-download.html'), {inBackground: advblocker.utils.browser.isYaBrowser()});
    };

    var whiteListTab = function (tab) {
        var tabInfo = advblocker.frames.getFrameInfo(tab);
        advblocker.whitelist.whiteListUrl(tabInfo.url);

        if (advblocker.frames.isTabadvblockerDetected(tab)) {
            var domain = advblocker.utils.url.getHost(tab.url);
            advblocker.integration.addRuleToApp("@@//" + domain + "^$document", function () {
                advblocker.tabs.sendMessage(tab.tabId, {type: 'no-cache-reload'});
            });
        } else {
            updateTabIconAndContextMenu(tab, true);
            advblocker.tabs.reload(tab.tabId);
        }
    };

    var unWhiteListTab = function (tab) {
        var tabInfo = advblocker.frames.getFrameInfo(tab);
        advblocker.userrules.unWhiteListFrame(tabInfo);

        if (advblocker.frames.isTabadvblockerDetected(tab)) {
            var rule = advblocker.frames.getTabadvblockerUserWhiteListRule(tab);
            if (rule) {
                advblocker.integration.removeRuleFromApp(rule.ruleText, function () {
                    advblocker.tabs.sendMessage(tab.tabId, {type: 'no-cache-reload'});
                });
            }
        } else {
            updateTabIconAndContextMenu(tab, true);
            advblocker.tabs.reload(tab.tabId);
        }
    };

    var changeApplicationFilteringDisabled = function (disabled) {
        advblocker.settings.changeFilteringDisabled(disabled);
        advblocker.tabs.getActive(function (tab) {
            updateTabIconAndContextMenu(tab, true);
            advblocker.tabs.reload(tab.tabId);
        });
    };

    /**
     * Checks filters updates
     * @param {Object[]} [filters] optional list of filters
     * @param {boolean} [showPopup = true] show update filters popup
     */
    const checkFiltersUpdates = (filters, showPopup = true) => {
        const showPopupEvent = advblocker.listeners.UPDATE_FILTERS_SHOW_POPUP;
        const successCallback = showPopup
            ? (updatedFilters) => {
                advblocker.listeners.notifyListeners(showPopupEvent, true, updatedFilters);
            }
            : (updatedFilters) => {
                if (updatedFilters && updatedFilters.length > 0) {
                    const updatedFilterStr = updatedFilters.map(f => `Filter ID: ${f.filterId}`).join(', ');
                    advblocker.console.info(`Filters were auto updated: ${updatedFilterStr}`);
                }
            };
        const errorCallback = showPopup
            ? () => {
                advblocker.listeners.notifyListeners(showPopupEvent, false);
            }
            : () => {};

        if (filters) {
            advblocker.filters.checkFiltersUpdates(successCallback, errorCallback, filters);
        } else {
            advblocker.filters.checkFiltersUpdates(successCallback, errorCallback);
        }
    };

    var initAssistant = function (selectElement) {
        var options = {
            addRuleCallbackName: 'addUserRule',
            selectElement: selectElement,
        };

        // init assistant
        advblocker.tabs.getActive(function (tab) {
            advblocker.tabs.sendMessage(tab.tabId, {
                type: 'initAssistant',
                options: options
            });
        });
    };

    /**
     * The `openAssistant` function uses the `tabs.executeScript` function to inject
     * the Assistant code into a page without using messaging.
     * We do it dynamically and not include assistant file into the default content scripts
     * in order to reduce the overall memory usage.
     *
     * Browsers that do not support `tabs.executeScript` function use Assistant from the manifest
     * file manually (Safari for instance).
     * After executing the Assistant code in callback the `initAssistant` function is called.
     * It sends messages to current tab and runs Assistant. Other browsers call `initAssistant`
     * function manually.
     *
     * @param {boolean} selectElement - if true select the element on which the Mousedown event was
     */
    const openAssistant = (selectElement) => {
        if (advblocker.tabs.executeScriptFile) {
            // Load Assistant code to the activate tab immediately
            advblocker.tabs.executeScriptFile(null, { file: '/lib/content-script/assistant/js/assistant.js' }, () => {
                initAssistant(selectElement);
            });
        } else {
            // Manually start assistant
            initAssistant(selectElement);
        }
    };

    /**
     * Appends hash parameters if they exists
     * @param rowUrl
     * @param hashParameters
     * @returns {string} prepared url
     */
    const appendHashParameters = (rowUrl, hashParameters) => {
        if (!hashParameters) {
            return rowUrl;
        }

        if (rowUrl.indexOf('#') > -1) {
            advblocker.console.warn(`Hash parameters can't be applied to the url with hash: '${rowUrl}'`);
            return rowUrl;
        }

        let hashPart;
        const { anchor } = hashParameters;

        if (anchor) {
            delete hashParameters[anchor];
        }

        const hashString = Object.keys(hashParameters)
            .map(key => `${key}=${hashParameters[key]}`)
            .join('&');

        if (hashString.length <= 0) {
            hashPart = anchor && anchor.length > 0 ? `#${anchor}` : '';
            return rowUrl + hashPart;
        }

        hashPart = anchor && anchor.length > 0 ? `replacement=${anchor}&${hashString}` : hashString;
        hashPart = encodeURIComponent(hashPart);
        return `${rowUrl}#${hashPart}`;
    };

    var openTab = function (url, options = {}, callback) {
        const {
            activateSameTab,
            inBackground,
            inNewWindow,
            type,
            hashParameters,
        } = options;

        url = appendHashParameters(url, hashParameters);

        function onTabFound(tab) {
            if (tab.url !== url) {
                advblocker.tabs.reload(tab.tabId, url);
            }
            if (!inBackground) {
                advblocker.tabs.activate(tab.tabId);
            }
            if (callback) {
                callback(tab);
            }
        }

        url = advblocker.utils.strings.contains(url, '://') ? url : advblocker.getURL(url);
        advblocker.tabs.getAll(function (tabs) {
            // try to find between opened tabs
            if (activateSameTab) {
                for (let i = 0; i < tabs.length; i += 1) {
                    let tab = tabs[i];
                    if (advblocker.utils.url.urlEquals(tab.url, url)) {
                        onTabFound(tab);
                        return;
                    }
                }
            }
            advblocker.tabs.create({
                url: url,
                type: type || 'normal',
                active: !inBackground,
                inNewWindow: inNewWindow,
            }, callback);
        });
    };

    const init = () => {
        // update icon on event received
        advblocker.listeners.addListener(function (event, tab, reset) {
            if (event !== advblocker.listeners.UPDATE_TAB_BUTTON_STATE || !tab) {
                return;
            }

            var options;
            if (reset) {
                options = { icon: advblocker.prefs.ICONS.ICON_GRAY, badge: '' };
            }

            updateTabIcon(tab, options);
        });

        // Update tab icon and context menu while loading
        advblocker.tabs.onUpdated.addListener(function (tab) {
            var tabId = tab.tabId;
            // BrowserAction is set separately for each tab
            updateTabIcon(tab);
            advblocker.tabs.getActive(function (aTab) {
                if (aTab.tabId !== tabId) {
                    return;
                }
                // ContextMenu is set for all tabs, so update it only for current tab
                updateTabContextMenu(aTab);
            });
        });

        // Update tab icon and context menu on active tab changed
        advblocker.tabs.onActivated.addListener(function (tab) {
            updateTabIconAndContextMenu(tab, true);
        });
    };

    // Update icon and popup stats on ads blocked
    advblocker.listeners.addListener(function (event, rule, tab, blocked) {

        if (event !== advblocker.listeners.ADS_BLOCKED || !tab) {
            return;
        }

        advblocker.pageStats.updateStats(rule.filterId, blocked, new Date());
        var tabBlocked = advblocker.frames.updateBlockedAdsCount(tab, blocked);
        if (tabBlocked === null) {
            return;
        }
        updateTabIconAsync(tab);

        advblocker.tabs.getActive(function (activeTab) {
            if (tab.tabId === activeTab.tabId) {
                updatePopupStatsAsync(activeTab);
            }
        });
    });

    // Update context menu on change user settings
    advblocker.settings.onUpdated.addListener(function (setting) {
        if (setting === advblocker.settings.DISABLE_SHOW_CONTEXT_MENU) {
            advblocker.tabs.getActive(function (tab) {
                updateTabContextMenu(tab);
            });
        }
    });

    // Update tab icon and context menu on application initialization
    advblocker.listeners.addListener(function (event) {
        if (event === advblocker.listeners.APPLICATION_INITIALIZED) {
            advblocker.tabs.getActive(updateTabIconAndContextMenu);
        }
    });

    // on application updated event
    advblocker.listeners.addListener(function (event, info) {
        if (event === advblocker.listeners.APPLICATION_UPDATED) {
            if (advblocker.settings.isShowAppUpdatedNotification()) {
                showVersionUpdatedPopup(info.currentVersion, info.prevVersion);
            }
        }
    });

    // on filter auto-enabled event
    advblocker.listeners.addListener((event, enabledFilters) => {
        if (event === advblocker.listeners.ENABLE_FILTER_SHOW_POPUP) {
            const result = getFiltersEnabledResultMessage(enabledFilters);
            showAlertMessagePopup(result.title, result.text);
        }
    });

    // on filter enabled event
    advblocker.listeners.addListener((event, payload) => {
        switch (event) {
            case advblocker.listeners.FILTER_ENABLE_DISABLE:
                if (payload.enabled) {
                    checkFiltersUpdates([payload], false);
                }
                break;
            case advblocker.listeners.FILTER_GROUP_ENABLE_DISABLE:
                if (payload.enabled && payload.filters) {
                    const enabledFilters = payload.filters.filter(f => f.enabled);
                    checkFiltersUpdates(enabledFilters, false);
                }
                break;
            default:
                break;
        }
    });

    // on filters updated event
    advblocker.listeners.addListener((event, success, updatedFilters) => {
        if (event === advblocker.listeners.UPDATE_FILTERS_SHOW_POPUP) {
            const result = getFiltersUpdateResultMessage(success, updatedFilters);
            showAlertMessagePopup(result.title, result.text);
        }
    });

    // close all page on unload
    advblocker.unload.when(closeAllPages);

    return {
        init: init,
        openExportRulesTab: openExportRulesTab,
        openSettingsTab: openSettingsTab,
        openSiteReportTab: openSiteReportTab,
        openFilteringLog: openFilteringLog,
        openThankYouPage: openThankYouPage,
        openExtensionStore: openExtensionStore,
        openFiltersDownloadPage: openFiltersDownloadPage,
        openAbuseTab: openAbuseTab,

        updateTabIconAndContextMenu: updateTabIconAndContextMenu,

        whiteListTab: whiteListTab,
        unWhiteListTab: unWhiteListTab,

        changeApplicationFilteringDisabled: changeApplicationFilteringDisabled,
        checkFiltersUpdates: checkFiltersUpdates,
        openAssistant: openAssistant,
        openTab: openTab,

        showAlertMessagePopup: showAlertMessagePopup,
    };

})(advblocker);
