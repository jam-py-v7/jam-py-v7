(function ($) {
    'use strict';

    /*
     * Jam.py V7 Builder — Stage 2 navigation enhancement
     * Strict Monaco-only context rule for builder-inspector-options.
     */

    var RECENT_LIMIT = 10;
    var bootAttempts = 0;
    var MAX_BOOT_ATTEMPTS = 200;
    var selectionTimer;
    var actionTimer;
    var layoutTimer;
    var inspectorActionSeq = 0;
    var breadcrumbCache = {};

    /* =====================================================================
       Command Palette / Global Quick Search (Ctrl+K)
       ===================================================================== */
    var paletteActiveIndex = 0;

    function paletteText(value) {
        return $('<div>').text(value == null ? '' : String(value)).text()
            .replace(/\s+/g, ' ').trim();
    }

    function paletteIconClass(iconClass) {
        var icon = paletteText(iconClass || 'bi bi-lightning-charge');
        if (!icon) {
            return 'bi bi-lightning-charge';
        }
        return icon.indexOf('bi ') === 0 ? icon : 'bi ' + icon;
    }

    function findPaletteObject(task, objectName) {
        var source;
        var result;

        objectName = paletteText(objectName);
        if (!task || !task.sys_items || !objectName) {
            return null;
        }

        try {
            source = task.sys_items.copy({handlers: false, details: false});
            source.set_where({f_item_name: objectName});
            source.open({fields: [
                'id', 'parent', 'f_name', 'f_item_name', 'f_table_name',
                'type_id', 'task_id', 'f_virtual_table'
            ]});

            if (source.rec_count) {
                result = {
                    id: Number(source.id.value),
                    parent: Number(source.parent.value || 0),
                    name: paletteText(source.f_name.value),
                    objectName: paletteText(source.f_item_name.value),
                    tableName: paletteText(source.f_table_name && source.f_table_name.value),
                    typeId: Number(source.type_id.value || 0),
                    virtualTable: !!(source.f_virtual_table && source.f_virtual_table.value)
                };
                return result;
            }
        }
        catch (e) {}

        return null;
    }

    function selectPaletteObjectInCenter(task, objectId, openEditor, attempts) {
        var item = task && task.sys_items;

        attempts = attempts || 0;
        if (!item || !objectId || attempts > 30) {
            return false;
        }

        try {
            if (item.rec_count && item.locate('id', objectId)) {
                if (openEditor && typeof item.edit_record === 'function') {
                    item.edit_record();
                }
                else if (item.view_table && typeof item.view_table.focus === 'function') {
                    item.view_table.focus();
                }
                return true;
            }
        }
        catch (e) {}

        window.setTimeout(function () {
            selectPaletteObjectInCenter(task, objectId, openEditor, attempts + 1);
        }, 80);
        return false;
    }

    function openPaletteObject(task, objectName, objectId, openEditor) {
        var object = findPaletteObject(task, objectName);
        var targetId = objectId ? Number(objectId) : (object && object.id);
        var parentId = object && object.parent;
        var targetType = object && Number(object.typeId);
        var types = task && task.item_types ? task.item_types : {};

        if (openEditor === undefined) {
            openEditor = [
                types.ITEM_TYPE,
                types.JOURNAL_TYPE,
                types.TABLE_TYPE,
                types.REPORT_TYPE,
                types.DETAIL_TYPE
            ].indexOf(targetType) !== -1;
        }

        if (!object && !targetId) {
            return false;
        }

        clearTreeSearch(false);

        try {
            if (parentId && task.item_tree && task.item_tree.locate('id', parentId)) {
                if (task.tree && task.tree.selected_node) {
                    try {
                        task.tree.expand(task.tree.selected_node);
                    }
                    catch (e) {}
                }
                selectPaletteObjectInCenter(task, targetId, openEditor);
                return true;
            }

            if (targetId && task.item_tree && task.item_tree.locate('id', targetId)) {
                if (task.tree && task.tree.selected_node) {
                    try {
                        task.tree.expand(task.tree.selected_node);
                    }
                    catch (e) {}
                }

                if (openEditor) {
                    selectPaletteObjectInCenter(task, targetId, true);
                }
                return true;
            }
        }
        catch (e) {}

        if (targetId) {
            selectPaletteObjectInCenter(task, targetId, openEditor);
            return true;
        }

        return false;
    }

    function buildPaletteEntries(task) {
        var entries = [];
        var objectEntries = [];
        var objectKeys = {};

        var projectOptions = [
            { key: 'project_params', title: 'Parameters settings', icon: 'bi bi-gear', category: 'Project Options' },
            { key: 'db', title: 'Database settings', icon: 'bi bi-database-gear', category: 'Project Options' },
            { key: 'export', title: 'Export project', icon: 'bi bi-file-earmark-zip', category: 'Project Options' },
            { key: 'import', title: 'Import metadata', icon: 'bi bi-upload', category: 'Project Options' },
            { key: 'find', title: 'Find in project', icon: 'bi bi-search', category: 'Project Options' },
            { key: 'print', title: 'Print project code', icon: 'bi bi-printer', category: 'Project Options' }
        ];

        projectOptions.forEach(function(opt) {
            objectEntries.push({
                category: opt.category,
                title: opt.title,
                subtitle: 'Project action',
                icon: opt.icon,
                navigationKey: 'action',
                actionKey: opt.key,
                searchText: opt.title
            });
        });

        var taskOptions = [
            { key: 'client_module', title: 'Client module', icon: 'bi bi-filetype-js', category: 'Task Options' },
            { key: 'server_module', title: 'Server module', icon: 'bi bi-filetype-py', category: 'Task Options' },
            { key: 'templates', title: 'templates.html', icon: 'bi bi-filetype-txt', category: 'Task Options' },
            { key: 'index.html', title: 'index.html', icon: 'bi bi-filetype-html', category: 'Task Options' },
            { key: 'project.css', title: 'project.css', icon: 'bi bi-filetype-css', category: 'Task Options' },
            { key: 'lookup_lists', title: 'Lookup lists', icon: 'bi bi-card-list', category: 'Task Options', isEditRecord: true }
        ];

        taskOptions.forEach(function(opt) {
            objectEntries.push({
                category: opt.category,
                title: opt.title,
                subtitle: 'Task action (Monaco Editor)',
                icon: opt.icon,
                navigationKey: opt.isEditRecord ? 'edit_record_action' : 'action',
                actionKey: opt.key,
                searchText: opt.title
            });
        });

        if (task && task.sys_items) {
            try {
                var source = task.sys_items.copy({handlers: false, details: false});
                source.set_where({});
                source.set_order_by(['f_name']);
                source.open({fields: [
                    'id', 'parent', 'f_name', 'f_item_name', 'f_table_name',
                    'type_id', 'task_id', 'f_virtual_table'
                ]});

                source.each(function (obj) {
                    var id = Number(obj.id.value);
                    var objectName = paletteText(obj.f_item_name.value);
                    var title = paletteText(obj.f_name.value);
                    var tableName = paletteText(obj.f_table_name && obj.f_table_name.value);
                    var typeId = Number(obj.type_id.value || 0);
                    var key = objectName.toLowerCase();
                    var subtitle;

                    if (!id || !objectName || objectKeys[key]) {
                        return;
                    }

                    objectKeys[key] = true;
                    subtitle = 'Edit system item';
                    if (tableName) {
                        subtitle += ' • Table: ' + tableName;
                    }

                    objectEntries.push({
                        category: 'System Items',
                        title: title || objectName,
                        subtitle: subtitle,
                        icon: tableName ? 'bi bi-table' : 'bi bi-box',
                        navigationKey: 'edit_record',
                        objectName: objectName,
                        objectId: id,
                        openEditor: true,
                        searchText: [title, objectName, tableName, typeCaption(task, typeId)].join(' ')
                    });
                });
            }
            catch (e) {}
        }

        return entries.concat(objectEntries);
    }

    function renderPaletteResults(entries, query) {
        var $container = $('#builder-command-results');
        var filtered;

        if (!$container.length) {
            return;
        }

        query = paletteText(query).toLowerCase();
        filtered = entries.filter(function (entry) {
            if (!query) {
                return true;
            }
            return paletteText(entry.title).toLowerCase().indexOf(query) !== -1 ||
                paletteText(entry.category).toLowerCase().indexOf(query) !== -1 ||
                paletteText(entry.subtitle).toLowerCase().indexOf(query) !== -1 ||
                paletteText(entry.searchText).toLowerCase().indexOf(query) !== -1;
        });

        $container.empty();

        if (!filtered.length) {
            $('<div class="p-3 text-center text-body-secondary small">')
                .append($('<i class="bi bi-exclamation-circle d-block fs-4 mb-1">'))
                .append($('<span>').text('No matching items found'))
                .appendTo($container);
            paletteActiveIndex = 0;
            return;
        }

        filtered.forEach(function (entry, index) {
            var $item = $('<button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-3 text-start">');
            var $icon = $('<div class="command-icon flex-shrink-0">');
            var $body = $('<div class="min-w-0 flex-grow-1">');
            var $title = $('<div class="fw-semibold text-truncate fs-7">').text(entry.title);
            var $subtitle = $('<div class="small text-body-secondary text-truncate">').text(entry.subtitle);
            var $category = $('<span class="badge text-bg-light border fs-7 text-uppercase flex-shrink-0">').text(entry.category);

            $icon.append($('<i>').attr('class', paletteIconClass(entry.icon)));
            $body.append($title, $subtitle);
            $item.append($icon, $body, $category);

            if (index === 0) {
                $item.addClass('active');
            }

            /*$item.on('click.builderPalette', function () {
                var modalEl = document.getElementById('builder-command-palette-modal');
                var bsModal = window.bootstrap && modalEl ? bootstrap.Modal.getInstance(modalEl) : null;

                if (bsModal) {
                    bsModal.hide();
                }

                window.setTimeout(function () {
                    var task = getTask();
                    if (entry.navigationKey === 'edit_record' || entry.navigationKey === 'edit_record_action') {
                        if (entry.actionKey === 'lookup_lists') {
                            invokeButtonInfo(task, 'lookup_lists');
                        } else {
                            openPaletteObject(task, entry.objectName, entry.objectId, true);
                        }
                    } else if (entry.navigationKey === 'action') {
                        invokeButtonInfo(task, entry.actionKey);
                    }
                }, 120);
            });*/
			$item.on('click.builderPalette', function () {
                var modalEl = document.getElementById('builder-command-palette-modal');
                var bsModal = window.bootstrap && modalEl ? bootstrap.Modal.getInstance(modalEl) : null;

                if (bsModal) {
                    bsModal.hide();
                }

                window.setTimeout(function () {
                    var task = getTask();
                    if (entry.navigationKey === 'edit_record' || entry.navigationKey === 'edit_record_action') {
                        if (entry.actionKey === 'lookup_lists') {
                            invokeButtonInfo(task, 'lookup_lists');
                        } else {
                            openPaletteObject(task, entry.objectName, entry.objectId, true);
                        }
                    } else if (entry.navigationKey === 'action') {
                        // FIX: If it's a task module action (client_module or server_module), 
                        // explicitly target the main task record where id = 1 in sys_items.
                        if ((entry.actionKey === 'client_module' || entry.actionKey === 'server_module') && task && task.sys_items) {
                            try {
                                task.sys_items.copy({handlers: false, details: false});
                                task.sys_items.open({where: {id: 1}});
                                if (task.sys_items.rec_count) {
                                    var info = getButtonInfo(task, entry.actionKey);
                                    if (info && info.handler) {
                                        info.handler.call(task.sys_items, task.sys_items, task.language && task.language[entry.actionKey] || entry.actionKey);
                                        return;
                                    }
                                }
                            } catch (e) {}
                        }
                        
                        // Fallback for other project options / actions
                        invokeButtonInfo(task, entry.actionKey);
                    }
                }, 120);
            });

            $container.append($item);
        });

        paletteActiveIndex = 0;
    }

    function setupCommandPalette(task) {
        var $modal = $('#builder-command-palette-modal');
        var $input = $('#builder-command-input');

        if (!$modal.length || !$input.length) {
            return;
        }

        $(window).add(document)
            .off('keydown.builderCommandPalette')
            .on('keydown.builderCommandPalette', function (e) {
                var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                var isTrigger = (isMac ? e.metaKey : e.ctrlKey) &&
                    (e.key === 'k' || e.key === 'K' || e.keyCode === 75);

                if (!isTrigger) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                var modalEl = document.getElementById('builder-command-palette-modal');
                if (modalEl && window.bootstrap) {
                    var bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
                    bsModal.show();
                }
            });
			
		$('#command_palete_btn').click(function(e) {
			e.preventDefault();
                e.stopPropagation();

                var modalEl = document.getElementById('builder-command-palette-modal');
                if (modalEl && window.bootstrap) {
                    var bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
                    bsModal.show();
                }
		});

        $modal.off('shown.bs.modal.builderPalette')
            .on('shown.bs.modal.builderPalette', function () {
                var entries = buildPaletteEntries(task);
                $input.val('').trigger('focus');
                renderPaletteResults(entries, '');

                $input.off('input.builderPalette')
                    .on('input.builderPalette', function () {
                        renderPaletteResults(entries, $(this).val());
                    });
            });

        $input.off('keydown.builderPaletteNav')
            .on('keydown.builderPaletteNav', function (e) {
                var $items = $('#builder-command-results .list-group-item-action');

                if (!$items.length) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        var modal = bootstrap.Modal.getInstance(document.getElementById('builder-command-palette-modal'));
                        if (modal) {
                            modal.hide();
                        }
                    }
                    return;
                }

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    $items.eq(paletteActiveIndex).removeClass('active');
                    paletteActiveIndex = (paletteActiveIndex + 1) % $items.length;
                    $items.eq(paletteActiveIndex).addClass('active')[0].scrollIntoView({block: 'nearest'});
                }
                else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    $items.eq(paletteActiveIndex).removeClass('active');
                    paletteActiveIndex = (paletteActiveIndex - 1 + $items.length) % $items.length;
                    $items.eq(paletteActiveIndex).addClass('active')[0].scrollIntoView({block: 'nearest'});
                }
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    $items.eq(paletteActiveIndex).trigger('click');
                }
            });

        $modal.off('hidden.bs.modal.builderPalette')
            .on('hidden.bs.modal.builderPalette', function () {
                $input.val('');
            });
    }

    function getTask() {
        return window.task;
    }

    function builderReady(task) {
        return !!(
            task &&
            task.item_tree &&
            task.tree &&
            task.buttons_info &&
            $('#tree-panel').length
        );
    }

    function waitForBuilder() {
        var task = getTask();

        if (builderReady(task)) {
            init(task);
            return;
        }

        bootAttempts += 1;
        if (bootAttempts < MAX_BOOT_ATTEMPTS) {
            window.setTimeout(waitForBuilder, 100);
        }
    }

    function storageKey() {
        return 'jam.py.builder.recent.v2:' + window.location.origin + window.location.pathname;
    }

    function loadRecent() {
        try {
            var value = window.sessionStorage.getItem(storageKey());
            if (!value) {
                return [];
            }
            var parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (e) {
            return [];
        }
    }

    function saveRecent(items) {
        try {
            window.sessionStorage.setItem(storageKey(), JSON.stringify(items));
        }
        catch (e) {}
    }

    function typeCaption(task, typeId) {
        var types = task.item_types || {};

        if (typeId === types.ROOT_TYPE) return 'Project';
        if (typeId === types.USERS_TYPE) return 'Users';
        if (typeId === types.ROLES_TYPE) return 'Roles';
        if (typeId === types.TASKS_TYPE) return 'Tasks';
        if (typeId === types.TASK_TYPE) return 'Task';
        if (typeId === types.ITEMS_TYPE) return 'Group';
        if (typeId === types.JOURNALS_TYPE) return 'Journal group';
        if (typeId === types.TABLES_TYPE) return 'Table group';
        if (typeId === types.REPORTS_TYPE) return 'Report group';
        if (typeId === types.ITEM_TYPE) return 'Item';
        if (typeId === types.JOURNAL_TYPE) return 'Journal';
        if (typeId === types.TABLE_TYPE) return 'Table';
        if (typeId === types.REPORT_TYPE) return 'Report';
        if (typeId === types.DETAIL_TYPE) return 'Detail';
        return 'Object';
    }

    function currentTitle(task) {
        var title = task.cur_item_title || $('#title-left').text() || '';
        return $('<div>').html(title).text().replace(/\s+/g, ' ').trim();
    }

    function currentId(task) {
        if (!task.item_tree || !task.item_tree.rec_count) {
            return 0;
        }
        var value = Number(task.item_tree.id && task.item_tree.id.value);
        return Number.isFinite(value) ? value : 0;
    }

    function currentType(task) {
        if (!task.item_tree || !task.item_tree.rec_count) {
            return null;
        }
        return Number(task.item_tree.type_id && task.item_tree.type_id.value);
    }

    function rememberCurrent(task) {
        var id = currentId(task);
        var title = currentTitle(task);

        if (!id || !title) {
            return;
        }

        var items = loadRecent().filter(function (item) {
            return Number(item.id) !== id;
        });

        items.unshift({
            id: id,
            title: title,
            type: currentType(task),
            at: Date.now()
        });

        saveRecent(items.slice(0, RECENT_LIMIT));
        renderRecent(task);
    }

    function renderRecent(task) {
        var $menu = $('#builder-recent-menu');
        var items;

        if (!$menu.length) {
            return;
        }

        items = loadRecent();
        $menu.empty();

        if (!items.length) {
            $menu.append(
                '<li><span class="dropdown-item-text text-body-secondary small">No recent objects</span></li>'
            );
            return;
        }

        items.forEach(function (item) {
            var type = typeCaption(task, Number(item.type));
            var $li = $('<li>');
            var $button = $('<button type="button" class="dropdown-item builder-recent-item">');

            $button.attr('data-builder-recent-id', String(item.id));
            $button.append(
                $('<div class="builder-recent-item-title fw-medium text-truncate">').text(item.title)
            );
            $button.append(
                $('<div class="builder-recent-item-meta text-body-secondary">').text(type)
            );
            $li.append($button);
            $menu.append($li);
        });

        $menu.append('<li><hr class="dropdown-divider"></li>');
        $menu.append(
            '<li><button type="button" class="dropdown-item small text-body-secondary" id="builder-clear-recent">' +
            '<i class="bi bi-trash3 me-2"></i>Clear recent</button></li>'
        );
    }

    function clearTreeSearch(focusInput) {
        var $input = $('#builder-tree-search');
        if ($input.length) {
            $input.val('').trigger('input');
            if (focusInput !== false) {
                $input.focus();
            }
        }
    }

    function applyTreeSearch() {
        var $input = $('#builder-tree-search');
        var $tree = $('#tree-panel .dbtree');
        var query;
        var matched = 0;
        var $items;

        if (!$input.length || !$tree.length) {
            return;
        }

        query = $input.val().toString().toLowerCase().trim();
        $items = $tree.find('li');

        $tree.toggleClass('builder-tree-filtering', !!query);
        $items.removeClass('builder-tree-filter-hidden builder-tree-match');

        if (!query) {
            $('#builder-tree-search-clear').addClass('d-none');
            $('#builder-search-count').addClass('d-none').text('');
            $('#builder-search-hint').text('Ctrl+Shift+E to focus');
            return;
        }

        $('#builder-tree-search-clear').removeClass('d-none');

        $tree.find('span.tree-text').each(function () {
            var $span = $(this);
            var value = ($span.data('name') || $span.text() || '').toString().toLowerCase().trim();

            if (value.indexOf(query) !== -1) {
                var $li = $span.closest('li');
                matched += 1;
                $li.removeClass('builder-tree-filter-hidden').addClass('builder-tree-match');
                $li.parents('li').removeClass('builder-tree-filter-hidden');
            }
        });

        $items.filter(function () {
            return !$(this).hasClass('builder-tree-match') &&
                !$(this).find('.builder-tree-match').length;
        }).addClass('builder-tree-filter-hidden');

        $('#builder-search-count')
            .removeClass('d-none')
            .text(matched + (matched === 1 ? ' match' : ' matches'));

        $('#builder-search-hint').text(matched ? 'Click a result to navigate' : 'No matching objects');
    }

    function getItemById(task, id) {
        var source;
        var cached;

        id = Number(id);
        if (!id || !task || !task.item_tree) {
            return null;
        }

        if (breadcrumbCache[id]) {
            return breadcrumbCache[id];
        }

        if (currentId(task) === id && task.item_tree.rec_count) {
            cached = {
                id: Number(task.item_tree.id.value),
                parent: Number(task.item_tree.parent.value || 0),
                label: task.item_tree.f_name.value || '',
                type_id: Number(task.item_tree.type_id.value)
            };
            breadcrumbCache[id] = cached;
            return cached;
        }

        try {
            source = task.item_tree.copy({handlers: false, details: false});
            source.set_where({id: id});
            source.open({fields: ['id', 'parent', 'f_name', 'type_id']});
            if (source.rec_count) {
                cached = {
                    id: Number(source.id.value),
                    parent: Number(source.parent.value || 0),
                    label: source.f_name.value || '',
                    type_id: Number(source.type_id.value)
                };
                breadcrumbCache[id] = cached;
                return cached;
            }
        }
        catch (e) {}

        return null;
    }

    function buildBreadcrumbs(task) {
        var $container = $('#builder-breadcrumbs');
        var path = [];
        var id = currentId(task);
        var guard = 0;
        var current;

        if (!$container.length) {
            return;
        }

        while (id && guard < 40) {
            current = getItemById(task, id);
            if (!current) {
                break;
            }

            if (current.label) {
                path.unshift(current);
            }

            if (!current.parent || current.parent === current.id) {
                break;
            }

            id = current.parent;
            guard += 1;
        }

        $container.empty();

        if (!path.length) {
            $container.append('<span class="text-body-tertiary">Project</span>');
            return;
        }

        path.forEach(function (part, index) {
            if (index > 0) {
                $container.append('<span class="builder-breadcrumb-separator">/</span>');
            }

            if (index === path.length - 1) {
                $container.append(
                    $('<span class="fw-medium text-body-secondary">').text(part.label)
                );
                return;
            }

            var $button = $('<button type="button" class="builder-breadcrumb-link">')
                .attr('aria-label', 'Navigate to ' + part.label)
                .text(part.label);

            (function (targetId) {
                $button.on('click.builderNavigation', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    clearTreeSearch();

                    try {
                        task.item_tree.locate('id', targetId);
                        if (task.tree && task.tree.selected_node) {
                            task.tree.expand(task.tree.selected_node);
                        }
                        scheduleSelectionUpdate(task);
                    }
                    catch (err) {}
                });
            }(part.id));

            $container.append($button);
        });
    }

    function updateContext(task) {
        var title = currentTitle(task);
        var type = currentType(task);
        var caption = typeCaption(task, type);

        $('#builder-context-badge')
            .toggleClass('d-none', !type)
            .text(type ? caption : '');

        $('#builder-inspector-context').text(title || 'Select an object');
        buildBreadcrumbs(task);
    }

    function tooltipText($button) {
        var $clone = $button.clone();
        var shortcut = $button.find('small.muted').text().replace(/[\[\]]/g, '').trim();
        $clone.find('i, small').remove();
        var label = $clone.text().replace(/\s+/g, ' ').trim();

        if (shortcut && label) {
            return label + ' — ' + shortcut;
        }
        return label || shortcut;
    }

    function inspectorFieldValue(field) {
        if (field === undefined || field === null) {
            return '';
        }

        if (typeof field === 'object' && Object.prototype.hasOwnProperty.call(field, 'value')) {
            return field.value;
        }

        return field;
    }

    function getButtonInfo(task, key) {
        return task && task.buttons_info ? task.buttons_info[key] : null;
    }

    function inspectorActionLabel(task, key) {
        var info = getButtonInfo(task, key);
        var label = task && task.language ? task.language[key] : '';

        if (!label) {
            label = key.replace(/_/g, ' ');
        }

        return {
            label: paletteText(label),
            icon: paletteIconClass(info && info.icon || 'bi bi-arrow-right'),
            shortcut: paletteText(info && info.short_cut || '')
        };
    }

    function invokeButtonInfo(task, key) {
        var info = getButtonInfo(task, key);
        var target;

        if (!info || !info.handler) {
            return false;
        }

        target = info.item || task;
        try {
            info.handler.call(target, target, task.language && task.language[key] || key);
            return true;
        }
        catch (e) {
            return false;
        }
    }

    function loadCodeEditorObject(task, itemId) {
        var source;
        var fields = [
            'id', 'parent', 'task_id', 'type_id', 'table_id',
            'f_name', 'f_item_name', 'f_table_name', 'f_master_field'
        ];

        itemId = Number(inspectorFieldValue(itemId) || 0);
		
        if (!task || !task.sys_items || !Number.isFinite(itemId) || itemId <= 0) {
            return null;
        }

        /*
         * task.sys_items is normally positioned on the CHILDREN of the
         * currently selected Explorer node. Its current record therefore
         * must NOT be used as the Monaco object.
         *
         * task.tabs[tag].item_id is the real system-item ID assigned by
         * admin.js in edit_code(). Fetch that exact record explicitly.
         */
        try {
			//skipp project task
			if (itemId > 1) {
            source = task.sys_items.copy({handlers: false, details: false});
			source.set_where({id: itemId});
			source.open({fields: fields});
            /*source.open({
                fields: fields,
                where: {id: itemId}
            });*/

            /*if (source.rec_count &&
                Number(inspectorFieldValue(source.id)) === itemId) {*/
			if (source.rec_count) {
				//console.log(source.f_item_name.value);
                return source;
            }	else {
				console.log('Item not found!');
			}
			}
        }
        catch (e) {
            console.error('Monaco inspector: cannot load system item by ID', itemId, e);
        }

        return null;
    }

    function getFocusedEditorTag(task) {
        var domTag = $('#task-tabs li button.nav-link.active').first().attr('id');
        var tag = domTag || (task && task.currentTag);

        if (!tag || tag === 'admin') {
            return null;
        }

        /* Keep admin.js' currentTag synchronized with the actual focused tab. */
        if (task && task.currentTag !== tag) {
            task.currentTag = tag;
        }

        return tag;
    }

    function getSystemItemField(task, itemId, fieldName) {
        var value;
        var source;

        itemId = Number(itemId);
        if (!task || !task.sys_items || !itemId) {
            return null;
        }

        /* Fast path: the system-items dataset may already contain the record. */
        try {
            if (typeof task.sys_items.field_by_id === 'function') {
                value = task.sys_items.field_by_id(itemId, fieldName);
                if (value !== undefined && value !== null) {
                    return inspectorFieldValue(value);
                }
            }
        }
        catch (e) {}

        /* Fallback: use an isolated record copy. */
        source = loadCodeEditorObject(task, itemId);
        if (!source || !source.rec_count || !source[fieldName]) {
            return null;
        }

        return inspectorFieldValue(source[fieldName]);
    }

    /*
     * The focused Monaco tab is the source of truth:
     *   task.tabs[tag].item_id -> system item id
     *   task.tabs[tag].name    -> focused document name
     *
     * builder-inspector-options itself is never hidden. Outside Monaco it
     * simply contains no contextual actions; while Monaco is focused it is
     * populated from the corresponding system item.
     */
    function getActiveMonacoInspectorContext(task) {
        var tag, info, itemId, object, typeId, moduleType, title, parentId;

        if (!task || !task.sys_items) {
            return null;
        }

        tag = getFocusedEditorTag(task);
        
        // Fallback: if task.tabs doesn't have it, parse the active tab directly from DOM
        if (!tag) {
            var $activeTab = $('#task-tabs li button.nav-link.active').first();
            if ($activeTab.length) {
                var domId = $activeTab.attr('id');
                if (domId && domId !== 'admin') {
                    tag = domId;
                }
            }
        }

        if (!tag) {
            return null;
        }

        // Try reading from task.tabs if available
        info = task.tabs && task.tabs[tag] ? task.tabs[tag] : null;
        itemId = info ? Number(inspectorFieldValue(info.item_id) || 0) : 0;
		
        // Fallback: if itemId is missing from task.tabs, resolve it by name from the tag (e.g. "companies-client" -> "companies")
        if (!itemId || !Number.isFinite(itemId) || itemId <= 0) {
            var match = tag.match(/^(.*?)-(client|server|report)$/);
            var itemName = match ? match[1] : tag;
            
            var resolvedObj = findPaletteObject(task, itemName);
            if (resolvedObj && resolvedObj.id) {
                itemId = Number(resolvedObj.id);
            }
        }

        if (!Number.isFinite(itemId) || itemId <= 0) {
            return null;
        }

        object = loadCodeEditorObject(task, itemId);
		
        if (!object || !object.rec_count) {
            return null;
        }

        typeId = Number(inspectorFieldValue(object.type_id) || 0);
        parentId = Number(inspectorFieldValue(object.parent) || 0);
        title = paletteText(
            inspectorFieldValue(object.f_name) ||
            inspectorFieldValue(object.f_item_name) ||
            (info && info.name) ||
            tag
        );

        if (tag.indexOf('client') !== -1 || (info && info.ext === 'js')) {
            moduleType = 'client_module';
        }
        else if (tag.indexOf('server') !== -1 || (info && info.ext === 'py')) {
            moduleType = 'server_module';
        }

        return {
            id: itemId,
            parentId: parentId,
            typeId: typeId,
            object: object,
            info: info || { name: title },
            tag: tag,
            activeModuleType: moduleType,
            title: title
        };
    }
    /*
     * Mirrors Events3.init_buttons() in admin.js for the focused system item.
     * The selected Explorer node is deliberately not used.
     */
    function getObjectActionKeys(task, object, activeModuleType) {
        var types = task && task.item_types ? task.item_types : {};
        //var typeId = Number(inspectorFieldValue(object && object.type_id) || 0);
		//var typeId = Number(object.item_type_id);
		var typeId = task.cur_item._dataset[0][4];
        var masterField = inspectorFieldValue(object && object.f_master_field);
        var keys = [];
		
		//console.log(task.cur_item._dataset[0][4]);

        if (!object) {
            return [];
        }

        // Standard Jam.py type ID fallbacks if task.item_types is not populated
        var TASKS_TYPE = types.TASKS_TYPE !== undefined ? Number(types.TASKS_TYPE) : 4;
        var TASK_TYPE = types.TASK_TYPE !== undefined ? Number(types.TASK_TYPE) : 5;
        var ITEMS_TYPE = types.ITEMS_TYPE !== undefined ? Number(types.ITEMS_TYPE) : 8;
        var TABLES_TYPE = types.TABLES_TYPE !== undefined ? Number(types.TABLES_TYPE) : 9;
        var REPORTS_TYPE = types.REPORTS_TYPE !== undefined ? Number(types.REPORTS_TYPE) : 7;
        var ITEM_TYPE = types.ITEM_TYPE !== undefined ? Number(types.ITEM_TYPE) : 10;
        var JOURNAL_TYPE = types.JOURNAL_TYPE !== undefined ? Number(types.JOURNAL_TYPE) : 11;
        var TABLE_TYPE = types.TABLE_TYPE !== undefined ? Number(types.TABLE_TYPE) : 12;
        var REPORT_TYPE = types.REPORT_TYPE !== undefined ? Number(types.REPORT_TYPE) : 13;

		//typeId = TASKS_TYPE;
		
        //if (typeId === TASKS_TYPE) {
		if (typeId == 4) {
            keys = [
                'client_module',
                'server_module',
                'templates',
                'index.html',
                'project.css',
                'lookup_lists'
            ];
        }
        //else if (typeId === TASK_TYPE) {
		else if (typeId == 5) {
            keys = [
                'client_module',
                'server_module'
            ];
        }
        //else if (typeId === ITEMS_TYPE || typeId === TABLES_TYPE) {
		else if (typeId == 10) {
            keys = [
                'client_module',
                'server_module',
                'viewing',
                'editing',
                'filters',
                'details',
                'order',
                'indices',
                'reports',
                'privileges'
            ];
        }
        /*else if (typeId === ITEM_TYPE ||
                 typeId === TABLE_TYPE ||
                 typeId === JOURNAL_TYPE) {*/
		else if (typeId == 10) {
            if (masterField) {
                keys = [
                    'viewing',
                    'editing',
                    'order',
                    'privileges'
                ];
            }
            else {
                keys = [
                    'client_module',
                    'server_module',
                    'viewing',
                    'editing',
                    'order',
                    'privileges'
                ];
            }
        }
        //else if (typeId === REPORT_TYPE || typeId === REPORTS_TYPE) {
		else if (typeId == 13) {
            keys = [
                'client_module',
                'server_module',
                'report_params',
                'report_templates',
                'privileges'
            ];
        }
        else {
            // Universal fallback so standard items/tables always display actions
            keys = [
                'client_module',
                'server_module',
                'viewing',
                'editing',
                'order',
                'privileges'
            ];
        }

        return keys;
    }

    function invokeInspectorObjectAction(task, key, objectId) {
        var info = getButtonInfo(task, key);
        var target;

        if (!info || !info.handler || !task) {
            return false;
        }

        objectId = Number(inspectorFieldValue(objectId) || 0);

        try {
            /*
             * Position the main task.sys_items dataset directly onto the 
             * target system item record so admin.js handlers open the correct modal.
             */
            if (info.item === task.sys_items && Number.isFinite(objectId) && objectId > 0) {
                if (typeof task.sys_items.locate === 'function' && task.sys_items.locate('id', objectId)) {
                    // Record successfully located on the active dataset
                } else if (typeof task.sys_items.open === 'function') {
                    task.sys_items.open({where: {id: objectId}});
                }
                target = task.sys_items;
            }
            else {
                target = info.item || task;
            }

            info.handler.call(
                target,
                target,
                task.language && task.language[key] || key
            );

            hideBootstrapDropdown('builder-inspector-options');
            renderInspectorOptions(task);
            return true;
        }
        catch (e) {
            console.error('Error executing Monaco system-item action:', e);
            return false;
        }
    }
	
	function hideBootstrapDropdown(toggleId) {
        var el = document.getElementById(toggleId);
        var dropdown;

        if (!el || !window.bootstrap || !bootstrap.Dropdown) {
            return;
        }

        try {
            dropdown = bootstrap.Dropdown.getInstance(el) || bootstrap.Dropdown.getOrCreateInstance(el);
            dropdown.hide();
        }
        catch (e) {}
    }

    function renderInspectorOptions(task) {
        var $menu = $('#builder-inspector-options-menu');
        var $button = $('#builder-inspector-options');
        var context;
        var keys;
        var objectName;

        if (!$menu.length || !$button.length) {
            return;
        }

        $menu.empty();
        context = getActiveMonacoInspectorContext(task);

        $button
            .removeClass('d-none')
            .css('display', '')
            .attr('aria-hidden', 'false');

        if (!context) {
            $button
                .attr('data-builder-object-id', '')
                .attr('data-builder-object-type', '')
                .attr('title', 'Monaco editor object actions');
            $('#builder-inspector-context').text('Editor Actions');
            $menu.append('<li><span class="dropdown-item-text small text-body-secondary">Open a system-item module in Monaco</span></li>');
            return;
        }

        keys = getObjectActionKeys(task, context.object, context.activeModuleType);
        objectName = context.title;

        $('#builder-inspector-context').text(objectName || 'Editor Actions');
        $button
            .attr('data-builder-object-id', String(context.id))
            .attr('data-builder-object-type', String(context.typeId))
            .attr('data-builder-system-item-id', String(context.id))
            .attr('data-builder-system-item-name', objectName || '')
            .attr('title', 'Actions for — ' + objectName);

        if (!keys.length) {
            $menu.append('<li><span class="dropdown-item-text small text-body-secondary">No actions available for this system item</span></li>');
            return;
        }

        keys.forEach(function (key) {
            var meta = inspectorActionLabel(task, key);
            var $li = $('<li>');
            var $buttonItem = $('<button type="button" class="dropdown-item d-flex align-items-center gap-2">')
                .attr('data-builder-action-key', key)
                .attr('data-builder-object-id', String(context.id))
                .attr('aria-label', meta.label);

            $buttonItem.append($('<i>').attr('class', meta.icon));
            $buttonItem.append($('<span class="text-truncate flex-grow-1">').text(meta.label));
            if (meta.shortcut) {
                $buttonItem.append($('<span class="builder-action-shortcut">').text(meta.shortcut));
            }

            $li.append($buttonItem);
            $menu.append($li);
        });
    }

    function update_inspector_actions(task, item) {
        /* Object Actions are intentionally Monaco-only. */
        renderInspectorOptions(task);
    }

    // Expose globally for integration hooks
    window.update_inspector_actions = update_inspector_actions;

    function setupInspector(task) {
        renderInspectorOptions(task);

        $(document).off('click.builderInspector', '#builder-inspector-options-menu [data-builder-action-key]')
            .on('click.builderInspector', '#builder-inspector-options-menu [data-builder-action-key]', function (e) {
                e.preventDefault();
                e.stopPropagation();

                invokeInspectorObjectAction(
                    task,
                    $(this).attr('data-builder-action-key'),
                    Number($(this).attr('data-builder-object-id') || 0)
                );
            });

        $(document).off('show.bs.dropdown.builderInspector', '#builder-inspector-options')
            .on('show.bs.dropdown.builderInspector', '#builder-inspector-options', function () {
                renderInspectorOptions(task);
            });

        $(document)
            .off('click.builderInspectorTab', '#task-tabs button.nav-link')
            .on('click.builderInspectorTab', '#task-tabs button.nav-link', function () {
                window.setTimeout(function () {
                    renderInspectorOptions(task);
                }, 0);
            });

        $(document)
            .off('shown.bs.tab.builderInspectorTab', '#task-tabs button.nav-link')
            .on('shown.bs.tab.builderInspectorTab', '#task-tabs button.nav-link', function () {
                renderInspectorOptions(task);
            });

        $(document)
            .off('focusin.builderInspectorEditor', '#code-editor')
            .on('focusin.builderInspectorEditor', '#code-editor', function () {
                renderInspectorOptions(task);
            });
    }

    function enhanceDynamicActions() {
        var task = getTask();
        renderInspectorOptions(task);
        var $buttons = $('#btns-panel button.btn');

        $buttons.each(function () {
            var $button = $(this);
            var label = tooltipText($button);

            if (!$button.attr('aria-label') && label) {
                $button.attr('aria-label', label);
            }

            if (!$button.attr('title') && label && ($button.find('small.muted').length || $button.text().trim().length === 0)) {
                $button.attr('title', label);
            }
        });
    }

    function scheduleActionEnhancement() {
        window.clearTimeout(actionTimer);
        actionTimer = window.setTimeout(function () {
            enhanceDynamicActions();
        }, 20);
    }

    function scheduleSelectionUpdate(task) {
        window.clearTimeout(selectionTimer);
        selectionTimer = window.setTimeout(function () {
            updateContext(task);
            rememberCurrent(task);
            scheduleActionEnhancement();
        }, 30);
    }

    function scheduleLayoutRefresh(task) {
        window.clearTimeout(layoutTimer);
        layoutTimer = window.setTimeout(function () {
            try {
                if (task && typeof task.resize_elements === 'function') {
                    task.resize_elements(task);
                }
            }
            catch (e) {}
        }, 60);
    }

    function setupLayoutObserver(task) {
        var viewPanel = document.getElementById('view-panel');
        var tabContent = document.getElementById('tab-content');
        var buttonPanel = document.getElementById('btns-panel');

        scheduleLayoutRefresh(task);

        if (window.MutationObserver && viewPanel) {
            var viewObserver = new MutationObserver(function () {
                scheduleLayoutRefresh(task);
            });
            viewObserver.observe(viewPanel, {childList: true, subtree: false});
        }

        if (window.ResizeObserver && tabContent) {
            var resizeObserver = new ResizeObserver(function () {
                scheduleLayoutRefresh(task);
            });
            resizeObserver.observe(tabContent);
            task._builder_stage2_resize_observer = resizeObserver;
        }

        if (window.MutationObserver && buttonPanel) {
            var commandObserver = new MutationObserver(function () {
                scheduleLayoutRefresh(task);
            });
            commandObserver.observe(buttonPanel, {childList: true, subtree: false});
        }
    }

    function openDeveloperShortcut(task, key) {
        if (!task || !task.buttons_info) {
            return;
        }
        invokeButtonInfo(task, key);
    }

    function setupDeveloperShortcuts(task) {
        $('#builder-shortcut-templates')
            .off('click.builderShortcuts')
            .on('click.builderShortcuts', function (e) {
                e.preventDefault();
                openDeveloperShortcut(task, 'templates');
            });

        $('#builder-shortcut-lookups')
            .off('click.builderShortcuts')
            .on('click.builderShortcuts', function (e) {
                e.preventDefault();
                openDeveloperShortcut(task, 'lookup_lists');
            });

        $('#builder-shortcut-css')
            .off('click.builderShortcuts')
            .on('click.builderShortcuts', function (e) {
                e.preventDefault();
                openDeveloperShortcut(task, 'project.css');
            });
    }	

    function setupSearch(task) {
        var $input = $('#builder-tree-search');
        var $clear = $('#builder-tree-search-clear');

        if (!$input.length) {
            return;
        }

        $input.off('.builderNavigation').on('input.builderNavigation', applyTreeSearch);
        $input.on('keydown.builderNavigation', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                clearTreeSearch();
            }
        });

        $clear.off('.builderNavigation').on('click.builderNavigation', function (e) {
            e.preventDefault();
            clearTreeSearch();
        });
    }

    function setupRecent(task) {
        renderRecent(task);

        $(document).off('click.builderRecent', '#builder-recent-menu .builder-recent-item')
            .on('click.builderRecent', '#builder-recent-menu .builder-recent-item', function (e) {
                e.preventDefault();
                var id = Number($(this).attr('data-builder-recent-id'));

                if (!id || !task.item_tree) {
                    return;
                }

                clearTreeSearch();

                try {
                    task.item_tree.locate('id', id);
                    if (task.tree && task.tree.selected_node) {
                        task.tree.expand(task.tree.selected_node);
                    }
                }
                catch (err) {}
            });

        $(document).off('click.builderRecentClear', '#builder-clear-recent')
            .on('click.builderClearRecent', '#builder-clear-recent', function (e) {
                e.preventDefault();
                saveRecent([]);
                renderRecent(task);
            });
    }

    function setupObservers(task) {
        var title = document.getElementById('title-left');
        var buttons = document.getElementById('btns-panel');

        if (window.MutationObserver && title) {
            var titleObserver = new MutationObserver(function () {
                scheduleSelectionUpdate(task);
            });
            titleObserver.observe(title, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        if (window.MutationObserver && buttons) {
            var buttonObserver = new MutationObserver(function () {
                scheduleActionEnhancement();
            });
            buttonObserver.observe(buttons, {
                childList: true,
                subtree: true
            });
        }

        $(window).off('focus.builderNavigation').on('focus.builderNavigation', function () {
            scheduleSelectionUpdate(task);
            renderInspectorOptions(task);
        });

        $(document).off('visibilitychange.builderNavigation').on('visibilitychange.builderNavigation', function () {
            if (document.visibilityState === 'visible') {
                scheduleSelectionUpdate(task);
                renderInspectorOptions(task);
            }
        });
    }

    function init(task) {
        if (task._builder_stage2_navigation) {
            return;
        }

        task._builder_stage2_navigation = true;

        setupSearch(task);
        setupRecent(task);
        setupInspector(task);
        setupDeveloperShortcuts(task);
        setupCommandPalette(task);
        setupLayoutObserver(task);
        setupObservers(task);
        updateContext(task);
        rememberCurrent(task);
        enhanceDynamicActions();
    }

    waitForBuilder();

}(jQuery));