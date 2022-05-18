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

(function (syncApi, advblocker) {

    var timeoutId = null;
    var pending = false;
    var running = false;

    /**
     * Checks at least one section was updated since the last sync
     * @param callback
     */
    function isSectionsUpdated(callback) {
        lookupSectionsUpdated(function (sections) {
            var updated = sections && sections.length > 0;
            callback(updated);
        });
    }

    function lookupSectionsUpdated(callback) {
        var dfds = [];
        var updated = [];

        var localManifest = syncApi.settingsProvider.loadLocalManifest();
        localManifest.sections.forEach(function (section) {
            var dfd = new advblocker.utils.Promise();
            dfds.push(dfd);

            syncApi.sections.loadLocalSection(section.name, function (data) {
                if (syncApi.sections.isSectionUpdated(section.name, data)) {
                    updated.push(section.name);
                }
                dfd.resolve();
            });
        });

        advblocker.utils.Promise.all(dfds).then(function () {
            callback(updated);
        });
    }

    function sync(callback) {

        lookupSectionsUpdated(function (updated) {
            if (updated && updated.length > 0) {
                var localManifest = syncApi.settingsProvider.loadLocalManifest();
                syncApi.settingsProvider.syncLocalManifest(localManifest, Date.now(), updated);
            }
            syncApi.syncService.syncSettings(callback);
        });
    }

    function onSyncFinished() {
        running = false;
        if (pending) {
            syncListener(advblocker.listeners.SYNC_REQUIRED);
            pending = false;
        }
    }

    var syncListener = function (event, options) {

        if (options && options.syncSuppress) {
            return;
        }

        if (running) {
            pending = true;
            return;
        }

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (options && options.force) {
            running = true;
            sync(onSyncFinished);
        } else {
            timeoutId = setTimeout(function () {
                running = true;
                sync(onSyncFinished);
            }, 5000);
        }
    };

    function initialize() {
        advblocker.listeners.addSpecifiedListener([advblocker.listeners.SYNC_REQUIRED], syncListener);
        syncApi.syncService.init();
    }

    advblocker.listeners.addSpecifiedListener([advblocker.listeners.APPLICATION_INITIALIZED], function () {
        // Sync local state
        isSectionsUpdated(initialize);
    });

    advblocker.listeners.addSpecifiedListener([advblocker.listeners.SYNC_BAD_OR_EXPIRED_TOKEN], function (event, provider) {
        syncApi.oauthService.clearAndRevokeToken(provider);
        syncApi.syncService.shutdown();
    });

})(advblocker.sync, advblocker);
