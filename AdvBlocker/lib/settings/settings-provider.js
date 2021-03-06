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
 * Application settings provider.
 */
(function (api, advblocker) { // jshint ignore:line

    var PROTOCOL_VERSION = "1.0";
    var APP_ID = "advblocker-browser-extension";

    var FILTERS_SECTION = "filters.json";
    var GENERAL_SECTION = "general-settings.json";
    var EXTENSION_SPECIFIC_SECTION = "extension-specific-settings.json";

    var SYNC_MANIFEST_PROP = "sync-manifest";

    var BACKUP_PROTOCOL_VERSION = "1.0";

    /**
     * Loads local manifest object
     */
    var loadLocalManifest = function () {
        var manifest = {
            "protocol-version": PROTOCOL_VERSION,
            "min-compatible-version": PROTOCOL_VERSION,
            "app-id": APP_ID,
            "timestamp": 0,
            "sections": [
                {
                    "name": FILTERS_SECTION,
                    "timestamp": 0
                },
                {
                    "name": GENERAL_SECTION,
                    "timestamp": 0
                },
                {
                    "name": EXTENSION_SPECIFIC_SECTION,
                    "timestamp": 0
                }
            ]
        };
        var item = advblocker.localStorage.getItem(SYNC_MANIFEST_PROP);
        if (!item) {
            return manifest;
        }
        try {
            var localManifest = JSON.parse(item);
            manifest.timestamp = localManifest.timestamp;
            manifest.sections = localManifest.sections;
        } catch (ex) {
            advblocker.console.error('Error parsing local manifest {0}, {1}', item, ex);
        }
        return manifest;
    };

    /**
     * Creates empty settings manifest.
     */
    var getEmptyLocalManifest = function () {
        return {
            "protocol-version": PROTOCOL_VERSION,
            "min-compatible-version": PROTOCOL_VERSION,
            "app-id": APP_ID,
            "timestamp": 0,
            "sections": [
                {
                    "name": FILTERS_SECTION,
                    "timestamp": 0
                },
                {
                    "name": GENERAL_SECTION,
                    "timestamp": 0
                },
                {
                    "name": EXTENSION_SPECIFIC_SECTION,
                    "timestamp": 0
                }
            ]
        };
    };

    /**
     * Collect enabled filters ids without custom filters
     * @returns {Array}
     */
    const collectEnabledFilterIds = () => {
        const enabledFilters = advblocker.filters.getEnabledFilters();
        return enabledFilters
            .filter(filter => !filter.customUrl)
            .map(filter => filter.filterId);
    };

    /**
     * Collects data about added custom filters to the extension
     * @returns {CustomFilterInitial} - returns data enough to import custom filter
     */
    const collectCustomFiltersData = () => {
        const customFilters = advblocker.subscriptions.getCustomFilters();
        return customFilters.map(filter => {
            return {
                customUrl: filter.customUrl,
                enabled: filter.enabled,
                title: filter.name || '',
                trusted: filter.trusted,
            };
        });
    };

    const collectEnabledGroupIds = () => {
        const groups = advblocker.subscriptions.getGroups();
        return groups
            .filter(group => group.enabled)
            .map(group => group.groupId);
    };

    /**
     * Loads filters settings section
     * @param callback
     */
    const loadFiltersSection = (callback) => {
        const enabledFilterIds = collectEnabledFilterIds();
        const enabledGroupIds = collectEnabledGroupIds();
        const customFiltersData = collectCustomFiltersData();

        // Collect whitelist/blacklist domains and whitelist mode
        const whiteListDomains = advblocker.whitelist.getWhiteListedDomains() || [];
        const blockListDomains = advblocker.whitelist.getBlockListedDomains() || [];
        const defaultWhiteListMode = !!advblocker.whitelist.isDefaultMode();

        // Collect user rules
        advblocker.userrules.getUserRulesText(function (content) {
            const section = {
                'filters': {
                    'enabled-groups': enabledGroupIds,
                    'enabled-filters': enabledFilterIds,
                    'custom-filters': customFiltersData,
                    'user-filter': {
                        'rules': content,
                        'disabled-rules': '',
                    },
                    'whitelist': {
                        'inverted': !defaultWhiteListMode,
                        'domains': whiteListDomains,
                        'inverted-domains': blockListDomains,
                    },
                },
            };

            callback(section);
        });
    };

    /**
     * Loads general settings section
     * @param callback
     */
    const loadGeneralSettingsSection = function (callback) {

        const enabledFilterIds = collectEnabledFilterIds();
        // TODO update self search settings on filter status change
        const allowAcceptableAds = enabledFilterIds.indexOf(advblocker.utils.filters.ids.SEARCH_AND_SELF_PROMO_FILTER_ID) >= 0;

        const section = {
            'general-settings': {
                'app-language': advblocker.app.getLocale(),
                'allow-acceptable-ads': allowAcceptableAds,
                'show-blocked-ads-count': advblocker.settings.showPageStatistic(),
                'autodetect-filters': advblocker.settings.isAutodetectFilters(),
                'safebrowsing-enabled': advblocker.settings.getSafebrowsingInfo().enabled,
                'safebrowsing-help': advblocker.settings.getSafebrowsingInfo().sendStats,
                'filters-update-period': advblocker.settings.getFiltersUpdatePeriod(),
            },
        };

        callback(section);
    };

    /**
     * Loads extension specific settings section
     * @param callback
     */
    var loadExtensionSpecificSettingsSection = function (callback) {

        var section = {
            "extension-specific-settings": {
                "use-optimized-filters": advblocker.settings.isUseOptimizedFiltersEnabled(),
                "collect-hits-count": advblocker.settings.collectHitsCount(),
                "show-context-menu": advblocker.settings.showContextMenu(),
                "show-info-about-advblocker": advblocker.settings.isShowInfoAboutadvblockerFullVersion(),
                "show-app-updated-info": advblocker.settings.isShowAppUpdatedNotification()
            }
        };

        callback(section);
    };

    /**
     * Saves manifest and its sections timestamps. If syncTime is passed, timestamps are updated with this value
     * @param manifest Manifest
     * @param syncTime Synchronization time
     * @param sections updated sections names array
     */
    var syncLocalManifest = function (manifest, syncTime, sections) {
        if (syncTime) {
            manifest.timestamp = syncTime;
            for (var i = 0; i < manifest.sections.length; i++) {
                var section = manifest.sections[i];
                if (sections) {
                    if (sections.indexOf(section.name) >= 0) {
                        section.timestamp = syncTime;
                    }
                } else {
                    section.timestamp = syncTime;
                }
            }
        }
        advblocker.localStorage.setItem(SYNC_MANIFEST_PROP, JSON.stringify(manifest));
    };

    /**
     * Applies general section settings to application
     * @param section Section
     * @param callback Finish callback
     */
    const applyGeneralSettingsSection = function (section, callback) {
        const syncSuppressOptions = {
            syncSuppress: true,
        };

        const set = section['general-settings'];

        advblocker.settings.changeShowPageStatistic(!!set['show-blocked-ads-count'], syncSuppressOptions);
        advblocker.settings.changeAutodetectFilters(!!set['autodetect-filters'], syncSuppressOptions);
        advblocker.settings.changeEnableSafebrowsing(!!set['safebrowsing-enabled'], syncSuppressOptions);
        advblocker.settings.changeSendSafebrowsingStats(!!set['safebrowsing-help'], syncSuppressOptions);
        advblocker.settings.setFiltersUpdatePeriod(set['filters-update-period'], syncSuppressOptions);

        if (!!set['allow-acceptable-ads']) {
            advblocker.filters.addAndEnableFilters([advblocker.utils.filters.ids.SEARCH_AND_SELF_PROMO_FILTER_ID], function () {
                callback(true);
            }, syncSuppressOptions);
        } else {
            advblocker.filters.disableFilters([advblocker.utils.filters.ids.SEARCH_AND_SELF_PROMO_FILTER_ID], syncSuppressOptions);
            callback(true);
        }
    };

    /**
     * Applies extension specific section settings to application
     * @param section
     * @param callback
     */
    var applyExtensionSpecificSettingsSection = function (section, callback) {
        var syncSuppressOptions = {
            syncSuppress: true
        };

        var set = section["extension-specific-settings"];

        advblocker.settings.changeUseOptimizedFiltersEnabled(!!set["use-optimized-filters"], syncSuppressOptions);
        advblocker.settings.changeCollectHitsCount(!!set["collect-hits-count"], syncSuppressOptions);
        advblocker.settings.changeShowContextMenu(!!set["show-context-menu"], syncSuppressOptions);
        advblocker.settings.changeShowInfoAboutadvblockerFullVersion(!!set["show-info-about-advblocker"], syncSuppressOptions);
        advblocker.settings.changeShowAppUpdatedNotification(!!set["show-app-updated-info"], syncSuppressOptions);

        callback(true);
    };

    /**
     * Initial data needed to add custom filter from the scratch
     * @typedef {Object} CustomFilterInitial
     * @property {string} customUrl - url of the custom filter
     * @property {boolean} enabled - state of custom filter
     * @property {number} [filterId] - identifier of the filter
     * @property {boolean} [trusted] - trusted flag of the filter
     * @property {string} [title] - title of the filter
     */

    /**
     * Add a custom filter
     * @param {CustomFilterInitial} customFilterData - initial data of imported custom filter
     * @param {{syncSuppress: boolean}} syncSuppressOptions
     * @returns {Promise<any>} SubscriptionFilter
     */
    const addCustomFilter = (customFilterData, syncSuppressOptions) => {
        const {
            customUrl, title, trusted,
        } = customFilterData;

        const { syncSuppress } = syncSuppressOptions;
        return new Promise((resolve, reject) => {
            const options = { title, trusted, syncSuppress };
            advblocker.filters.loadCustomFilter(
                customUrl,
                options,
                (filter) => {
                    resolve(filter);
                },
                () => {
                    reject();
                }
            );
        });
    };

    const addCustomFilters = (absentCustomFiltersInitials, syncSuppressOptions) => absentCustomFiltersInitials
        .reduce((promiseAcc, customFilterInitial) => {
            return promiseAcc
                .then((acc) => {
                    return addCustomFilter(customFilterInitial, syncSuppressOptions)
                        .then(customFilter => {
                            advblocker.console.info(`Settings sync: Was added custom filter: ${customFilter.customUrl}`);
                            return [...acc, { error: null, filter: customFilter }];
                        })
                        .catch(() => {
                            const { customUrl } = customFilterInitial;
                            const message = `Settings sync: Some error happened while downloading: ${customUrl}`;
                            advblocker.console.info(message);
                            return [...acc, { error: message }];
                        });
                });
        }, Promise.resolve([]));

    /**
     * Remove existing custom filters before adding new custom filters
     */
    const removeCustomFilters = (filterIds) => {
        filterIds.forEach(filterId => {
            advblocker.filters.removeFilter(filterId);
        });
        advblocker.console.info(`Settings sync: Next filters were removed: ${filterIds}`);
    };

    /**
     * Returns filterId which not listed in the filtersToAdd list, but listed in the existingFilters
     * @param existingFilters
     * @param filtersToAdd
     * @returns {array<number>}
     */
    const getCustomFiltersToRemove = (existingFilters, filtersToAdd) => {
        const customUrlsToAdd = filtersToAdd.map(f => f.customUrl);
        const filtersToRemove = existingFilters.filter(f => !customUrlsToAdd.includes(f.customUrl));
        return filtersToRemove.map(f => f.filterId);
    };

    /**
     * Adds custom filters if there were not added one by one to the subscriptions list
     * @param {Array<CustomFilterInitial>} customFiltersInitials
     * @param {{syncSuppress: boolean}} syncSuppressOptions
     * @returns {Promise<any>} Promise object which represents array with filter ids
     */
    const syncCustomFilters = (customFiltersInitials, syncSuppressOptions) => {
        const presentCustomFilters = advblocker.subscriptions.getCustomFilters();

        const enrichedFiltersInitials = customFiltersInitials.map(filterToAdd => {
            presentCustomFilters.forEach(existingFilter => {
                if (existingFilter.customUrl === filterToAdd.customUrl) {
                    filterToAdd.filterId = existingFilter.filterId;
                }
            });
            return filterToAdd;
        });

        const customFiltersToAdd = enrichedFiltersInitials.filter(f => !f.filterId);
        const existingCustomFiltersInitials = enrichedFiltersInitials.filter(f => f.filterId);
        const redundantExistingCustomFiltersIds = getCustomFiltersToRemove(presentCustomFilters, customFiltersInitials);

        if (redundantExistingCustomFiltersIds.length > 0) {
            removeCustomFilters(redundantExistingCustomFiltersIds);
        }

        if (customFiltersToAdd.length === 0) {
            return Promise.resolve(enrichedFiltersInitials.map(f => f.filterId));
        }

        return addCustomFilters(customFiltersToAdd, syncSuppressOptions)
            .then(customFiltersAddResult => {
                // get results without errors, not to enable not existing filters
                const addedCustomFiltersIdsWithoutError = customFiltersAddResult
                    .filter(f => f.error === null)
                    .map(f => f.filter.filterId);

                advblocker.console.info(`Settings sync: Were added custom filters: ${addedCustomFiltersIdsWithoutError}`);
                const existingCustomFiltersIds = existingCustomFiltersInitials.map(f => f.filterId);

                return [...existingCustomFiltersIds, ...addedCustomFiltersIdsWithoutError];
            });
    };

    /**
     * Enables filters by filterId and disables those filters which were not in the list of enabled filters
     * @param {array<number>} filterIds - ids to enable
     * @param {{syncSuppress: boolean}} syncSuppressOptions
     * @returns {Promise<any>}
     */
    const syncEnabledFilters = (filterIds, syncSuppressOptions) => {
        return new Promise(resolve => {
            advblocker.filters.addAndEnableFilters(filterIds, function () {
                const enabledFilters = advblocker.filters.getEnabledFilters();
                const filtersToDisable = enabledFilters
                    .filter(enabledFilter => !filterIds.includes(enabledFilter.filterId))
                    .map(filter => filter.filterId);
                advblocker.filters.disableFilters(filtersToDisable, syncSuppressOptions);
                resolve();
            }, syncSuppressOptions);
        });
    };

    /**
     * Enables groups by groupId and disable those groups which were not in the list
     * @param {array<number>} enabledGroups
     * @param {{syncSuppress: boolean}} options syncSuppressOptions
     */
    const syncEnabledGroups = (enabledGroups, options) => {
        enabledGroups.forEach(groupId => {
            advblocker.filters.enableGroup(groupId, options);
        });
        advblocker.console.info(`Settings sync: Next groups were enabled: ${enabledGroups}`);

        // disable groups not listed in the imported list
        const groups = advblocker.subscriptions.getGroups();

        const groupIdsToDisable = groups
            .map(group => group.groupId)
            .filter(groupId => !enabledGroups.includes(groupId));

        groupIdsToDisable.forEach(groupId => {
            advblocker.filters.disableGroup(groupId, options);
        });
    };

    /**
     * Applies filters section settings to application
     * @param section Section
     * @param callback Finish callback
     */
    const applyFiltersSection = function (section, callback) {
        const syncSuppressOptions = {
            syncSuppress: true,
        };

        const whiteListSection = section.filters['whitelist'] || {}; // jshint ignore:line
        const whitelistDomains = whiteListSection.domains || [];
        const blacklistDomains = whiteListSection['inverted-domains'] || [];

        // Apply whitelist/blacklist domains and whitelist mode
        advblocker.whitelist.configure(whitelistDomains, blacklistDomains, !whiteListSection.inverted, syncSuppressOptions);

        const userFilterSection = section.filters['user-filter'] || {};
        const userRules = userFilterSection.rules || '';

        // Apply user rules
        advblocker.userrules.updateUserRulesText(userRules, syncSuppressOptions);

        // Apply custom filters
        const customFiltersData = section.filters['custom-filters'] || [];

        // STEP 1 sync custom filters
        syncCustomFilters(customFiltersData, syncSuppressOptions)
            .then(customFiltersIdsToEnable => {
                // STEP 2 sync enabled filters
                const enabledFilterIds = section.filters['enabled-filters'] || [];
                return syncEnabledFilters([...enabledFilterIds, ...customFiltersIdsToEnable], syncSuppressOptions);
            })
            .then(() => {
                // STEP 3 sync enabled groups
                const enabledGroups = section.filters['enabled-groups'] || [];
                syncEnabledGroups(enabledGroups, syncSuppressOptions);
                callback(true);
            })
            .catch(err => {
                advblocker.console.error(err);
            });
    };

    /**
     * Checks section is supported
     * @param sectionName Section name
     */
    var isSectionSupported = function (sectionName) {
        return sectionName === FILTERS_SECTION
            || sectionName === GENERAL_SECTION
            || sectionName === EXTENSION_SPECIFIC_SECTION;
    };

    /**
     * Constructs section from application settings
     * @param sectionName Section name
     * @param callback Finish callback
     */
    var loadSection = function (sectionName, callback) {
        switch (sectionName) {
            case FILTERS_SECTION:
                loadFiltersSection(callback);
                break;
            case GENERAL_SECTION:
                loadGeneralSettingsSection(callback);
                break;
            case EXTENSION_SPECIFIC_SECTION:
                loadExtensionSpecificSettingsSection(callback);
                break;
            default:
                advblocker.console.error('Section {0} is not supported', sectionName);
                callback(false);
        }
    };

    /**
     * Apply section to application.
     *
     * @param sectionName Section name
     * @param section Section object
     * @param callback Finish callback
     */
    var applySection = function (sectionName, section, callback) {
        switch (sectionName) {
            case FILTERS_SECTION:
                applyFiltersSection(section, callback);
                break;
            case GENERAL_SECTION:
                applyGeneralSettingsSection(section, callback);
                break;
            case EXTENSION_SPECIFIC_SECTION:
                applyExtensionSpecificSettingsSection(section, callback);
                break;
            default:
                advblocker.console.error('Section {0} is not supported', sectionName);
                callback(false);
        }
    };

    /**
     * Exports settings set in json format
     */
    var loadSettingsBackupJson = function (callback) {

        var result = {
            "protocol-version": BACKUP_PROTOCOL_VERSION
        };

        loadGeneralSettingsSection(function (section) {
            result["general-settings"] = section["general-settings"];

            loadExtensionSpecificSettingsSection(function (section) {
                result["extension-specific-settings"] = section["extension-specific-settings"];

                loadFiltersSection(function (section) {
                    result["filters"] = section["filters"];

                    callback(JSON.stringify(result));
                });
            });
        });
    };

    /**
     * Imports settings set from json format
     */
    var applySettingsBackupJson = function (json) {
        function onFinished(success) {
            if (success) {
                advblocker.console.info('Settings import finished successfully');
            } else {
                advblocker.console.error('Error importing settings');
            }

            advblocker.listeners.notifyListeners(advblocker.listeners.SETTINGS_UPDATED, success);
        }

        var input = null;

        try {
            input = JSON.parse(json);
        } catch (ex) {
            advblocker.console.error('Error parsing input json {0}, {1}', json, ex);
            onFinished(false);
            return;
        }

        if (!input || input['protocol-version'] !== BACKUP_PROTOCOL_VERSION) {
            advblocker.console.error('Json input is invalid {0}', json);
            onFinished(false);
            return;
        }

        applyGeneralSettingsSection(input, function (success) {
            if (!success) {
                onFinished(false);
                return;
            }

            applyExtensionSpecificSettingsSection(input, function (success) {
                if (!success) {
                    onFinished(false);
                    return;
                }

                applyFiltersSection(input, function (success) {
                    onFinished(success);
                });
            });
        });
    };

    // EXPOSE
    api.settingsProvider = {

        /**
         * Loads app settings manifest
         */
        loadLocalManifest: loadLocalManifest,

        /**
         * Gets empty settings manifest
         */
        getEmptyLocalManifest: getEmptyLocalManifest,

        /**
         * Saves manifest to local storage
         */
        syncLocalManifest: syncLocalManifest,

        /**
         * Checks section is supported
         */
        isSectionSupported: isSectionSupported,

        /**
         * Loads section of app settings
         */
        loadSection: loadSection,

        /**
         * Apply section to application
         */
        applySection: applySection,

        /**
         * Loads settings backup json
         */
        loadSettingsBackup: loadSettingsBackupJson,

        /**
         * Applies settings backup json
         */
        applySettingsBackup: applySettingsBackupJson
    };

})(advblocker.sync, advblocker);
