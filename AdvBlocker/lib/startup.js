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

/* global advblocker */

/**
 * Extension initialize logic. Called from start.js
 */
advblocker.initialize = function () {
    function onLocalStorageLoaded() {
        advblocker.console.info('Starting advblocker... Version: {0}. Id: {1}', advblocker.app.getVersion(), advblocker.app.getId());

        // Initialize popup button
        advblocker.browserAction.setPopup({
            popup: advblocker.getURL('pages/popup.html'),
        });

        // Set uninstall page url
        const uninstallUrl = 'https://forms.gle/aoqiCcPbTkNEdc4X9';
        advblocker.runtime.setUninstallURL(uninstallUrl, () => {
            if (advblocker.runtime.lastError) {
                advblocker.console.error(advblocker.runtime.lastError);
                return;
            }
            advblocker.console.info(`Uninstall url was set to: ${uninstallUrl}`);
        });

        advblocker.whitelist.init();
        advblocker.filteringLog.init();
        advblocker.ui.init();

        /**
         * Start application
         */
        advblocker.filters.start({
            onInstall(callback) {
                // Process installation
                /**
                 * Show UI installation page
                 */
                advblocker.ui.openFiltersDownloadPage();

                // Retrieve filters and install them
                advblocker.filters.offerFilters((filterIds) => {
                    advblocker.filters.addAndEnableFilters(filterIds, callback);
                });
            },
        }, () => {
            // Doing nothing
        });
    }

    advblocker.rulesStorage.init(() => {
        advblocker.localStorage.init(onLocalStorageLoaded);
    });
};
