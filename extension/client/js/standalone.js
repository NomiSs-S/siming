/*
 * SIMING : page d'un outil seul (panneau « SIMING – <Outil> »).
 *   SIMING.startStandalone({ root, list, bridge, toolId }) -> { status, view, mounted, ready }
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    SIMING.startStandalone = function ({ root, list, bridge, toolId }) {
        const meta = list.tools.find((t) => t.id === toolId);
        const status = ui.statusLine({ right: 'v' + list.version });
        const view = h('section', { class: 's-view', tabindex: '-1' });
        root.replaceChildren(h('div', { class: 's-app is-standalone' }, h('main', { class: 's-views' }, view), status));
        if (!meta) {
            view.append(h('div', { class: 's-error', text: 'Outil introuvable : ' + toolId }));
            status.set('Outil introuvable : ' + toolId, 'error');
            return { status, view, mounted: null, ready: Promise.resolve() };
        }
        const mounted = SIMING.mountTool(view, meta, { bridge, ui, status, settings: SIMING.settings, keys: SIMING.keys }, {});
        SIMING.keys.attach(global.document);   // raccourcis de l'outil (réglés dans le hub, mémoire commune)
        return { status, view, mounted, ready: (mounted && mounted.ready) || Promise.resolve() };
    };
})(window);
