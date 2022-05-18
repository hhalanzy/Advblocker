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

/* global Promise */

/**
 * advblocker sync settings provider
 * Documentation: TODO: link
 */
(function (api, advblocker) { // jshint ignore:line

    'use strict';

    var advblocker_CLIENT_ID = 'advblocker-browser-extension';
    var advblocker_PROVIDER_NAME = 'advblocker_SYNC';

    var advblockerClient = (function () {

        var DEFAULT_PING_TIMEOUT = 40 * 1000;

        var FILE_SYNC_TIMESTAMP_PROP = 'sync-advblocker-provider-filesync-timestamp';
        var fileSyncTimestamp = null;

        var httpAuthApiEndpoint = 'https://testauth.advblocker.com';
        var httpApiEndpoint = 'https://testsync.advblocker.com/1';
        var wsApiEndpoint = 'wss://testsync.advblocker.com/1';

        var webSocket;
        var checkConnectionTimeoutId;
        var pingTimeout = DEFAULT_PING_TIMEOUT;
        var lastPingTime;

        function checkInvalidToken(status) {
            if (status === 401) {
                advblocker.listeners.notifyListeners(advblocker.listeners.SYNC_BAD_OR_EXPIRED_TOKEN, advblocker_PROVIDER_NAME);
            }
        }

        function getSyncTimestamp() {
            if (fileSyncTimestamp === null) {
                fileSyncTimestamp = parseInt(advblocker.localStorage.getItem(FILE_SYNC_TIMESTAMP_PROP) || 0);
            }
            return fileSyncTimestamp;
        }

        function updateSyncTimestamp(timestamp) {
            if (timestamp !== getSyncTimestamp()) {
                fileSyncTimestamp = timestamp;
                advblocker.localStorage.setItem(FILE_SYNC_TIMESTAMP_PROP, timestamp);
                return true;
            }
            return false;
        }

        var webSocketConnect = function () {

            webSocketDisconnect();

            lastPingTime = Date.now() - DEFAULT_PING_TIMEOUT + Math.floor(DEFAULT_PING_TIMEOUT / 4);

            initWebSocketConnection();
            watchConnectionIsAlive();
        };

        function initWebSocketConnection() {
            webSocket = new WebSocket(wsApiEndpoint + '/websocket?authorization=' + api.oauthService.getToken(advblocker_PROVIDER_NAME));
            webSocket.onopen = function () {
                lastPingTime = Date.now();
            };
            webSocket.onmessage = function (e) {
                pingTimeout = DEFAULT_PING_TIMEOUT;
                onWebSocketMessage(e.data);
            };
        }

        function onWebSocketMessage(data) {
            try {
                var message = JSON.parse(data);
                if (message.type === 'ping') {
                    lastPingTime = Date.now();
                }
                if (message.type === 'push' && updateSyncTimestamp(message.timestamp)) {
                    advblocker.listeners.notifyListeners(advblocker.listeners.SYNC_REQUIRED);
                }
            } catch (e) {
                advblocker.console.error('advblocker sync error {0}', e);
            }
        }

        function watchConnectionIsAlive() {
            if (checkConnectionTimeoutId) {
                clearInterval(checkConnectionTimeoutId);
            }
            checkConnectionTimeoutId = setInterval(function () {
                if (Date.now() - lastPingTime > pingTimeout) {
                    advblocker.console.info('Have not seen ping message, reconnecting');
                    pingTimeout = Math.min(10 * 60 * 1000, pingTimeout * 2);
                    webSocketConnect();
                }
            }, 5 * 1000);
        }

        function webSocketDisconnect() {
            if (webSocket) {
                webSocket.close();
                webSocket = null;
            }
            if (checkConnectionTimeoutId) {
                clearInterval(checkConnectionTimeoutId);
            }
        }

        function makeRequest(url, options) {

            return new Promise(function (resolve, reject) {

                var xhr = new XMLHttpRequest();

                var params = options.params || {};
                var headers = options.headers || {};
                var requestProps = options.requestProps || {};
                var body = options.body;

                var query = [];
                Object.keys(params).forEach(function (key) {
                    query.push(key + '=' + encodeURIComponent(params[key]));
                });
                if (query.length > 0) {
                    url += '?' + query.join('&');
                }
                xhr.open('POST', url, true);

                if ('accessToken' in options) {
                    xhr.setRequestHeader('Authorization', 'Bearer ' + options.accessToken);
                }
                Object.keys(headers).forEach(function (key) {
                    xhr.setRequestHeader(key, headers[key]);
                });
                Object.keys(requestProps).forEach(function (key) {
                    xhr[key] = requestProps[key];
                });

                xhr.onload = function () {
                    var status = xhr.status;
                    if (status === 200) {
                        if (xhr.responseType === 'blob') {
                            var fileReader = new FileReader();
                            fileReader.onload = function () {
                                try {
                                    resolve(JSON.parse(this.result));
                                } catch (ex) {
                                    reject({error: ex});
                                }
                            };
                            fileReader.onerror = function (error) {
                                reject({error: error});
                            };
                            fileReader.readAsText(xhr.response);
                        } else {
                            resolve(xhr.responseText);
                        }
                    } else {
                        checkInvalidToken(xhr.status);
                        reject({status: status, error: new Error(xhr.statusText)});
                    }
                };

                xhr.onerror = function () {
                    checkInvalidToken(xhr.status);
                    reject({status: xhr.status, error: new Error(xhr.statusText)});
                };

                xhr.send(body);
            });
        }

        function syncFiles() {
            return makeRequest(httpApiEndpoint + '/files/sync', {
                accessToken: api.oauthService.getToken(advblocker_PROVIDER_NAME)
            });
        }

        var filesDownload = function (name) {
            return makeRequest(httpApiEndpoint + '/files/download', {
                accessToken: api.oauthService.getToken(advblocker_PROVIDER_NAME),
                headers: {
                    'advblocker-API-Arg': JSON.stringify({name: name})
                },
                requestProps: {responseType: 'blob'}
            });
        };

        var filesUpload = function (name, contents) {
            return makeRequest(httpApiEndpoint + '/files/upload', {
                accessToken: api.oauthService.getToken(advblocker_PROVIDER_NAME),
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'advblocker-API-Arg': JSON.stringify({name: name})
                },
                body: contents
            }).then(JSON.parse).then(function (file) {
                // Upload local timestamp
                updateSyncTimestamp(file.modified);
            });
        };

        var init = function () {
            syncFiles()
                .then(JSON.parse)
                .then(function (sync) {
                    if (updateSyncTimestamp(sync.timestamp)) {
                        advblocker.listeners.notifyListeners(advblocker.listeners.SYNC_REQUIRED);
                    }
                })
                .catch(function (error) {
                    advblocker.console.error('advblocker sync error {0}', error);
                });
            // Open websocket connection for receiving notifications
            webSocketConnect();
        };

        var getAuthenticationUrl = function (redirectUri, csrfState) {
            var params = {
                client_id: advblocker_CLIENT_ID,
                redirect_uri: redirectUri,
                response_type: 'token',
                state: csrfState
            };
            var query = [];
            Object.keys(params).forEach(function (key) {
                query.push(key + '=' + encodeURIComponent(params[key]));
            });
            return httpAuthApiEndpoint + '/oauth/authorize?' + query.join('&');
        };

        var shutdown = function () {
            webSocketDisconnect();
        };

        var revokeToken = function (token) {
            return makeRequest(httpAuthApiEndpoint + '/oauth/revoke_token', {
                accessToken: token
            });
        };

        return {
            filesDownload: filesDownload,
            filesUpload: filesUpload,
            init: init,
            getAuthenticationUrl: getAuthenticationUrl,
            shutdown: shutdown,
            revokeToken: revokeToken
        };

    })();

    var load = function (name, callback) {

        advblockerClient.filesDownload(name)
            .then(function (response) {
                callback(response);
            })
            .catch(function (error) {
                if (error.status === 404) {
                    callback(null);
                } else {
                    advblocker.console.error('advblocker sync error {0}', error);
                    callback(false);
                }
            });
    };

    var save = function (name, data, callback) {
        var contents = JSON.stringify(data);
        advblockerClient.filesUpload(name, contents)
            .then(function () {
                callback(true);
            })
            .catch(function (error) {
                advblocker.console.error('advblocker sync error {0}', error);
                callback(false);
            });
    };

    var init = function () {
        advblocker.console.info('Initialize {0} sync provider', advblocker_PROVIDER_NAME);
        advblockerClient.init();
    };

    var shutdown = function () {
        advblocker.console.info('Shutdown {0} sync provider', advblocker_PROVIDER_NAME);
        advblockerClient.shutdown();
    };

    var getAuthUrl = function (redirectUri, csrfState) {
        return advblockerClient.getAuthenticationUrl(redirectUri, csrfState);
    };

    var revokeToken = function (token) {
        advblockerClient.revokeToken(token);
    };

    // EXPOSE
    api.syncProviders.register(advblocker_PROVIDER_NAME, {
        isOAuthSupported: true,
        title: advblocker.i18n.getMessage("sync_provider_advblocker"),
        // Storage api
        load: load,
        save: save,
        init: init,
        shutdown: shutdown,
        // Auth api
        getAuthUrl: getAuthUrl,
        revokeToken: revokeToken
    });

})(advblocker.sync, advblocker);