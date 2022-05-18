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
 * Filter categories service
 */
advblocker.categories = (function (advblocker) {
    'use strict';

    /**
     * @returns {Array.<*>} filters
     */
    var getFilters = function () {
        var result = advblocker.subscriptions.getFilters().filter(function (f) {
            return !f.removed;
        });

        var tags = advblocker.tags.getTags();

        result.forEach(function (f) {
            f.tagsDetails = [];
            f.tags.forEach(function (tagId) {
                var tagDetails = tags.find(function (tag) {
                    return tag.tagId === tagId;
                });

                if (tagDetails) {
                    if (tagDetails.keyword.startsWith('reference:')) {
                        // Hide 'reference:' tags
                        return;
                    }

                    if (!tagDetails.keyword.startsWith('lang:')) {
                        // Hide prefixes except of 'lang:'
                        tagDetails.keyword = tagDetails.keyword.substring(tagDetails.keyword.indexOf(':') + 1);
                    }

                    f.tagsDetails.push(tagDetails);
                }
            });
        });

        return result;
    };

    /**
     * Selects filters by groupId
     *
     * @param groupId
     * @param filters
     * @returns {Array.<SubscriptionFilter>}
     */
    const selectFiltersByGroupId = function (groupId, filters) {
        return filters.filter(filter => filter.groupId === groupId);
    };

    /**
     * Constructs filters metadata for options.html page
     */
    var getFiltersMetadata = function () {
        var groupsMeta = advblocker.subscriptions.getGroups();
        var filters = getFilters();

        var categories = [];

        for (var i = 0; i < groupsMeta.length; i += 1) {
            var category = groupsMeta[i];
            category.filters = selectFiltersByGroupId(category.groupId, filters);
            categories.push(category);
        }

        return {
            filters: filters,
            categories: categories,
        };
    };

    /**
     * If filter has mobile tag we check if platform is mobile, in other cases we do not check
     * @param filter
     * @returns {boolean}
     */
    const doesFilterMatchPlatform = (filter) => {
        if (advblocker.tags.isMobileFilter(filter)) {
            return !!advblocker.prefs.mobile;
        }
        return true;
    };

    /**
     * Returns recommended filters, which meet next requirements
     * 1. filter has recommended tag
     * 2. if filter has language tag, tag should match with user locale
     * 3. filter should correspond to platform mobile or desktop
     * @param groupId
     * @returns {Array} recommended filters by groupId
     */
    const getRecommendedFilterIdsByGroupId = function (groupId) {
        const metadata = getFiltersMetadata();
        const result = [];
        const langSuitableFilters = advblocker.subscriptions.getLangSuitableFilters();
        for (let i = 0; i < metadata.categories.length; i += 1) {
            const category = metadata.categories[i];
            if (category.groupId === groupId) {
                category.filters.forEach(filter => {
                    if (advblocker.tags.isRecommendedFilter(filter) && doesFilterMatchPlatform(filter)) {
                        // get ids intersection to enable recommended filters matching the lang tag
                        // only if filter has language
                        if (filter.languages && filter.languages.length > 0) {
                            if (langSuitableFilters.includes(filter.filterId)) {
                                result.push(filter.filterId);
                            }
                        } else {
                            result.push(filter.filterId);
                        }
                    }
                });
                return result;
            }
        }
        return result;
    };

    /**
     * If group doesn't have enabled property we consider that group is enabled for the first time
     * On first group enable we add and enable recommended filters by groupId
     * On the next calls we just enable group
     * @param {number} groupId
     */
    const enableFiltersGroup = function (groupId) {
        const group = advblocker.subscriptions.getGroup(groupId);
        if (group && typeof group.enabled === 'undefined') {
            const recommendedFiltersIds = getRecommendedFilterIdsByGroupId(groupId);
            advblocker.filters.addAndEnableFilters(recommendedFiltersIds);
        }
        advblocker.filters.enableGroup(groupId);
    };

    /**
     * Disables group
     * @param {number} groupId
     */
    const disableFiltersGroup = function (groupId) {
        advblocker.filters.disableGroup(groupId);
    };

    return {
        getFiltersMetadata: getFiltersMetadata,
        enableFiltersGroup: enableFiltersGroup,
        disableFiltersGroup: disableFiltersGroup,
    };
})(advblocker);

