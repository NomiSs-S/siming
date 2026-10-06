'use strict';
/* Hub : rail, pile de vues, réglages, à propos, outils cassés, clavier, débordement, thème. */
const assert = require('assert');
const { loadHost, makeDom, hostEvalScript } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/ui/rail.js',
    'js/bridge.js', 'js/keys.js', 'js/hub.js', 'tools/unparent.js'];

const LIST = {
    version: '1.0.0', repository: 'OWNER/siming',
    tools: [
        { id: 'unparent', name: 'Unparent', icon: 'delier', version: '2.0.0', script: 'tools/unparent.js' },
        { id: 'demo', name: 'Démo', icon: 'ancre', version: '0.1.0', script: 'tools/demo.js' },
        { id: 'casse', name: 'Cassé', icon: 'null', version: '0.1.0', script: 'tools/casse.js' },
        { id: 'absent', name: 'Absent', icon: 'menu', version: '0.1.0', script: 'tools/absent.js' },
    ],
};

function setup(opts) {
    opts = opts || {};
    const { sandbox } = loadHost();
    const win = opts.win || makeDom(SCRIPTS);
    win.SIMING.registerTool('demo', { help: 'aide démo', mount(view) { view.append('vue démo'); return {}; } });
    win.SIMING.registerTool('casse', { help: '', mount() { throw new Error('boum'); } });
    const opened = [];
    const hub = win.SIMING.startHub({
        root: win.document.getElementById('app'), list: LIST,
        bridge: win.SIMING.createBridge(hostEvalScript(sandbox)),
        openExtension: opts.noOpen ? null : (id) => opened.push(id),
    });
    const $ = (sel) => win.document.querySelector(sel);
    return { win, hub, opened, $ };
}
const visible = (hub) => Array.from(hub.views.entries()).filter(([, v]) => !v.hidden).map(([k]) => k);

module.exports = function (test) {
    test('hub : rail dans l\'ordre de tools.json + Réglages, premier outil affiché', async () => {
        const t = setup();
        await t.hub.ready;
        const ids = Array.from(t.win.document.querySelectorAll('.s-rail-btn[data-tool]')).map((b) => b.getAttribute('data-tool'));
        assert.deepEqual(ids, ['unparent', 'demo', 'casse', 'absent', '__settings']);
        assert.strictEqual(t.hub.current, 'unparent');
        assert.deepEqual(visible(t.hub), ['unparent']);
        assert.ok(t.$('.s-rail-btn[data-tool=unparent]').classList.contains('is-active'));
        assert.strictEqual(t.$('.s-status-right').textContent, 'v1.0.0');
    });

    test('hub : clic sur le rail change d\'outil et mémorise le dernier', () => {
        const t = setup();
        t.$('.s-rail-btn[data-tool=demo]').click();
        assert.strictEqual(t.hub.current, 'demo');
        assert.deepEqual(visible(t.hub), ['demo']);
        assert.strictEqual(t.win.localStorage.getItem('siming.lastTool'), 'demo');
        const again = setup({ win: t.win });
        assert.strictEqual(again.hub.current, 'demo', 'redémarre sur le dernier outil');
    });

    test('hub : réglage « outil au lancement »', () => {
        const t = setup();
        t.$('.s-rail-btn[data-tool=__settings]').click();
        const radio = t.win.document.querySelector('[data-role=start-tool] input[value=unparent]');
        radio.checked = true;
        radio.dispatchEvent(new t.win.Event('change'));
        assert.strictEqual(t.win.localStorage.getItem('siming.startTool'), 'unparent');
        t.$('.s-rail-btn[data-tool=demo]').click();
        const again = setup({ win: t.win });
        assert.strictEqual(again.hub.current, 'unparent');
    });

    test('hub : touches 1…n (rangée de chiffres) changent d\'outil, sauf dans un champ ou au pavé numérique', () => {
        const t = setup();
        t.win.document.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: '2', code: 'Digit2', bubbles: true }));
        assert.strictEqual(t.hub.current, 'demo');
        const input = t.win.document.querySelector('[data-role=start-tool] input');
        input.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true }));
        assert.strictEqual(t.hub.current, 'demo');
        t.win.document.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: '1', code: 'Numpad1', bubbles: true }));
        assert.strictEqual(t.hub.current, 'demo', 'le pavé numérique est réservé aux outils');
    });

    test('hub : orderTools, ids inconnus ignorés, oubliés à la fin', () => {
        const t = setup();
        const ids = (order) => t.win.SIMING.orderTools(LIST.tools, order).map((x) => x.id);
        assert.deepEqual(ids(''), ['unparent', 'demo', 'casse', 'absent']);
        assert.deepEqual(ids('casse, demo,inconnu,demo'), ['casse', 'demo', 'unparent', 'absent']);
    });

    test('hub : Réglages › ordre des outils : rail, touches et infobulles suivent, mémorisé', () => {
        const t = setup();
        const doc = t.win.document;
        t.$('.s-rail-btn[data-tool=__settings]').click();
        const rows = () => Array.from(doc.querySelectorAll('[data-role=tool-order] .s-order-row')).map((r) => r.getAttribute('data-tool'));
        const railIds = () => Array.from(doc.querySelectorAll('.s-rail-btn[data-tool]')).map((b) => b.getAttribute('data-tool'));
        assert.deepEqual(rows(), ['unparent', 'demo', 'casse', 'absent']);
        const ups = () => doc.querySelectorAll('[data-role=tool-order] [data-role=order-up]');
        const downs = () => doc.querySelectorAll('[data-role=tool-order] [data-role=order-down]');
        assert.strictEqual(ups()[0].disabled, true, 'premier : pas de Monter');
        assert.strictEqual(downs()[3].disabled, true, 'dernier : pas de Descendre');
        ups()[1].click();                                   // Démo monte
        assert.deepEqual(rows(), ['demo', 'unparent', 'casse', 'absent']);
        assert.deepEqual(railIds(), ['demo', 'unparent', 'casse', 'absent', '__settings']);
        assert.strictEqual(t.win.localStorage.getItem('siming.toolOrder'), 'demo,unparent,casse,absent');
        doc.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true, cancelable: true }));
        assert.strictEqual(t.hub.current, 'demo', 'la touche 1 suit le rail');
        assert.strictEqual(t.$('.s-rail-btn[data-tool=demo]').title, 'Démo (1)');
        assert.strictEqual(t.$('.s-rail-btn[data-tool=unparent]').title, 'Unparent (2)');
        assert.deepEqual(Array.from(doc.querySelectorAll('[data-role=shortcuts] [data-action^="hub.show."]')).map((b) => b.textContent), ['1', '2', '3', '4']);
        downs()[3].click();
        assert.deepEqual(rows(), ['demo', 'unparent', 'casse', 'absent'], 'dernier : Descendre inerte');
        const again = setup({ win: t.win });
        assert.deepEqual(Array.from(again.win.document.querySelectorAll('.s-rail-btn[data-tool]')).map((b) => b.getAttribute('data-tool')).slice(0, 2), ['demo', 'unparent']);
        assert.deepEqual(again.hub.tools().map((x) => x.id), ['demo', 'unparent', 'casse', 'absent']);
    });

    test('hub : Réglages › raccourcis : capture, conflit signalé, infobulle du rail, Retour, Échap, rétablir', () => {
        const t = setup();
        const doc = t.win.document;
        const press = (init) => doc.dispatchEvent(new t.win.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)));
        const keyBtn = (id) => t.$('[data-role=shortcuts] [data-action="' + id + '"]');
        t.$('.s-rail-btn[data-tool=__settings]').click();
        assert.deepEqual(Array.from(doc.querySelectorAll('[data-role=shortcuts] .s-keys-group')).map((g) => g.textContent), ['Panneau']);
        assert.strictEqual(keyBtn('hub.show.demo').textContent, '2');
        assert.strictEqual(keyBtn('hub.settings').textContent, '—');
        keyBtn('hub.show.demo').click();
        assert.strictEqual(keyBtn('hub.show.demo').textContent, 'Appuie sur une touche…');
        press({ key: 'q', code: 'KeyQ', ctrlKey: true });
        assert.strictEqual(keyBtn('hub.show.demo').textContent, 'Ctrl + Q');
        assert.strictEqual(t.$('.s-rail-btn[data-tool=demo]').title, 'Démo (Ctrl + Q)');
        assert.strictEqual(t.hub.current, '__settings', 'la frappe capturée n\'a pas changé d\'outil');
        press({ key: 'q', code: 'KeyQ', ctrlKey: true });
        assert.strictEqual(t.hub.current, 'demo');
        t.$('.s-rail-btn[data-tool=__settings]').click();
        press({ key: '2', code: 'Digit2' });
        assert.strictEqual(t.hub.current, '__settings', 'l\'ancienne touche ne fait plus rien');
        // Conflit : « Afficher Cassé » prend la touche 1 d'Unparent, qui perd la sienne
        keyBtn('hub.show.casse').click();
        press({ key: '1', code: 'Digit1' });
        assert.strictEqual(t.hub.status.level, 'warn');
        assert.ok(/Raccourci repris à : Afficher Unparent/.test(t.hub.status.text), t.hub.status.text);
        assert.strictEqual(keyBtn('hub.show.unparent').textContent, '—');
        assert.strictEqual(t.$('.s-rail-btn[data-tool=unparent]').title, 'Unparent');
        assert.strictEqual(keyBtn('hub.show.casse').textContent, '1');
        // Retour arrière = aucun ; Échap = annuler
        keyBtn('hub.show.casse').click();
        press({ key: 'Backspace', code: 'Backspace' });
        assert.strictEqual(keyBtn('hub.show.casse').textContent, '—');
        assert.strictEqual(t.hub.status.level, 'ok');
        keyBtn('hub.show.absent').click();
        press({ key: 'Escape', code: 'Escape' });
        assert.strictEqual(keyBtn('hub.show.absent').textContent, '4', 'annulé : inchangé');
        // Mémoire sur une autre page, puis rétablir
        const again = setup({ win: t.win });
        assert.strictEqual(again.$('.s-rail-btn[data-tool=demo]').title, 'Démo (Ctrl + Q)');
        again.$('[data-role=keys-reset]').click();
        assert.strictEqual(again.$('[data-role=shortcuts] [data-action="hub.show.demo"]').textContent, '2');
        assert.strictEqual(again.$('[data-role=shortcuts] [data-action="hub.show.unparent"]').textContent, '1');
        assert.strictEqual(again.$('.s-rail-btn[data-tool=demo]').title, 'Démo (2)');
        assert.strictEqual(t.win.localStorage.getItem('siming.keys'), '{}');
    });

    test('hub : outil cassé ou sans script isolé, les autres fonctionnent', async () => {
        const t = setup();
        await t.hub.ready;
        assert.ok(/Erreur au démarrage de « Cassé » : boum/.test(t.hub.views.get('casse').textContent));
        assert.ok(/introuvable/.test(t.hub.views.get('absent').textContent));
        t.$('.s-rail-btn[data-tool=demo]').click();
        assert.ok(/vue démo/.test(t.hub.views.get('demo').textContent));
    });

    test('hub : à propos liste SIMING et chaque outil avec sa version', () => {
        const t = setup();
        const about = t.$('[data-role=about]').textContent;
        assert.ok(about.includes('SIMING') && about.includes('1.0.0'));
        assert.ok(about.includes('Unparent') && about.includes('2.0.0'));
    });

    test('hub : « Ouvrir dans un panneau » et aide', () => {
        const t = setup();
        t.hub.views.get('unparent').querySelector('[data-role=open-standalone]').click();
        assert.deepEqual(t.opened, ['com.siming.tool.unparent']);
        t.hub.views.get('demo').querySelector('[data-role=help]').click();
        const dlg = t.$('[data-role=dialog]');
        assert.ok(/Démo 0\.1\.0/.test(dlg.querySelector('.s-dialog-title').textContent));
        assert.strictEqual(dlg.querySelector('.s-dialog-msg').textContent, 'aide démo');
        const sansPanneau = setup({ noOpen: true });
        assert.strictEqual(sansPanneau.hub.views.get('unparent').querySelector('[data-role=open-standalone]'), null);
    });

    test('rail : débordement vers le menu « … »', () => {
        const t = setup();
        const rail = t.hub.rail;
        Object.defineProperty(rail, 'clientWidth', { value: 4 * 46, configurable: true });
        rail.layout();
        assert.strictEqual(t.$('[data-role=rail-more]').hidden, false);
        assert.deepEqual(rail.overflow.map((x) => x.id), ['demo', 'casse', 'absent']);
        t.$('[data-role=rail-more]').click();
        const items = t.win.document.querySelectorAll('[data-role=rail-menu] .s-menu-item');
        assert.strictEqual(items.length, 3);
        items[0].click();
        assert.strictEqual(t.hub.current, 'demo');
        assert.strictEqual(t.$('[data-role=rail-menu]').hidden, true);
    });

    test('thème : setPanelColor décale les gris, borné à ±16', () => {
        const t = setup();
        const style = t.win.document.documentElement.style;
        assert.strictEqual(t.win.SIMING.setPanelColor(35, 35, 35), 0);
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(35, 35, 35)');
        assert.strictEqual(t.win.SIMING.setPanelColor(60, 60, 60), 16);
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(51, 51, 51)');
        const handlers = [];
        let color = { red: 40, green: 40, blue: 40 };
        const cs = {
            getHostEnvironment: () => ({ appSkinInfo: { panelBackgroundColor: { color } } }),
            addEventListener: (name, fn) => handlers.push([name, fn]),
        };
        t.win.SIMING.applyTheme(cs);
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(40, 40, 40)');
        assert.strictEqual(handlers[0][0], 'com.adobe.csxs.events.ThemeColorChanged');
        color = { red: 30, green: 30, blue: 30 };
        handlers[0][1]();
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(30, 30, 30)');
    });
};
