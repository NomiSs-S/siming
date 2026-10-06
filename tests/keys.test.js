'use strict';
/* Raccourcis clavier : identifiant d'une frappe, libellés, registre, liaisons, conflits, écouteur, capture. */
const assert = require('assert');
const { makeDom, loadClientScripts } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/keys.js'];

function setup() {
    const win = makeDom(SCRIPTS);
    const doc = win.document;
    const press = (init, target) => {
        const e = new win.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
        (target || doc).dispatchEvent(e);
        return e;
    };
    return { win, keys: win.SIMING.keys, doc, press };
}

module.exports = function (test) {
    test('raccourcis : identifiant d\'une frappe (code physique, modificateurs, Maj ignorée sur les chiffres)', () => {
        const { keys, win } = setup();
        const ev = (init) => new win.KeyboardEvent('keydown', init);
        assert.strictEqual(keys.describe(ev({ code: 'KeyE', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+KeyE');
        assert.strictEqual(keys.describe(ev({ code: 'Digit1', shiftKey: true })), 'Digit1', 'AZERTY : « 1 » se tape avec Maj');
        assert.strictEqual(keys.describe(ev({ code: 'NumpadEnter' })), 'Enter');
        assert.strictEqual(keys.describe(ev({ code: 'ShiftLeft', shiftKey: true })), null, 'modificateur seul');
        assert.strictEqual(keys.describe(ev({ code: '' })), null);
        assert.strictEqual(keys.describe(ev({ code: 'KeyA', altKey: true, metaKey: true })), 'Alt+Meta+KeyA');
    });

    test('raccourcis : libellés en français, touche réellement frappée pour les lettres', () => {
        const { keys, win } = setup();
        assert.strictEqual(keys.label('Ctrl+Shift+KeyE'), 'Ctrl + Maj + E');
        assert.strictEqual(keys.label('Numpad5'), 'Pavé 5');
        assert.strictEqual(keys.label('Digit1'), '1');
        assert.strictEqual(keys.label('Enter'), 'Entrée');
        assert.strictEqual(keys.label('Meta+ArrowUp'), 'Cmd + ↑');
        assert.strictEqual(keys.label('F2'), 'F2');
        assert.strictEqual(keys.label(''), '');
        const e = new win.KeyboardEvent('keydown', { code: 'KeyQ', key: 'a', ctrlKey: true });   // AZERTY : la touche A est à la place du Q
        assert.strictEqual(keys.labelFor(e, keys.describe(e)), 'Ctrl + A');
        const d = new win.KeyboardEvent('keydown', { code: 'Digit1', key: '&' });
        assert.strictEqual(keys.labelFor(d, keys.describe(d)), '1', 'chiffres : toujours le chiffre');
        const sp = new win.KeyboardEvent('keydown', { code: 'Space', key: ' ' });
        assert.strictEqual(keys.labelFor(sp, keys.describe(sp)), 'Espace');
    });

    test('raccourcis : registre, liaisons par défaut et choisies, conflits, mémoire, rétablir', () => {
        const { keys, win } = setup();
        const noop = () => {};
        keys.register({ id: 'hub.show.a', label: 'Afficher A', group: keys.HUB_GROUP, defaultKey: 'Digit1', run: noop });
        keys.register({ id: 'hub.show.b', label: 'Afficher B', group: keys.HUB_GROUP, defaultKey: 'Digit2', run: noop });
        keys.register({ id: 'x.go', label: 'Go', group: 'X', run: noop });
        keys.register({ id: 'y.go', label: 'Go Y', group: 'Y', run: noop });
        assert.deepEqual(keys.actions().map((a) => a.id), ['hub.show.a', 'hub.show.b', 'x.go', 'y.go']);
        assert.deepEqual(keys.binding('hub.show.a'), { code: 'Digit1', label: '1', user: false });
        assert.strictEqual(keys.binding('x.go'), null);
        // X prend la touche 1 : le raccourci par défaut de « Afficher A » (hub, toujours actif) est retiré
        assert.deepEqual(keys.setBinding('x.go', { code: 'Digit1', label: '1' }), ['Afficher A']);
        assert.strictEqual(keys.binding('hub.show.a'), null);
        assert.deepEqual(keys.binding('x.go'), { code: 'Digit1', label: '1', user: true });
        // Y (autre outil) peut partager la touche 1 avec X : jamais actifs ensemble
        assert.deepEqual(keys.setBinding('y.go', { code: 'Digit1' }), []);
        assert.strictEqual(keys.binding('x.go').code, 'Digit1');
        assert.strictEqual(keys.binding('y.go').label, '1', 'libellé déduit du code');
        keys.setBinding('hub.show.b', null);
        assert.strictEqual(keys.binding('hub.show.b'), null, 'délié');
        const stored = JSON.parse(win.localStorage.getItem('siming.keys'));
        assert.deepEqual(stored['x.go'], { code: 'Digit1', label: '1' });
        assert.strictEqual(stored['hub.show.b'], null);
        // Rechargement de la page : les choix sont relus et les conflits toujours résolus
        loadClientScripts(win, ['js/keys.js']);
        const k2 = win.SIMING.keys;
        k2.register({ id: 'hub.show.a', label: 'Afficher A', group: k2.HUB_GROUP, defaultKey: 'Digit1', run: noop });
        k2.register({ id: 'x.go', label: 'Go', group: 'X', run: noop });
        assert.strictEqual(k2.binding('x.go').code, 'Digit1');
        assert.strictEqual(k2.binding('hub.show.a'), null);
        k2.reset();
        assert.strictEqual(k2.binding('hub.show.a').code, 'Digit1');
        assert.strictEqual(k2.binding('x.go'), null);
        assert.strictEqual(win.localStorage.getItem('siming.keys'), '{}');
        k2.unregisterGroup(k2.HUB_GROUP);
        assert.deepEqual(k2.actions().map((a) => a.id), ['x.go']);
        assert.throws(() => k2.setBinding('nope', null), /Action inconnue/);
        assert.throws(() => k2.register({ id: 'bad' }), /Action invalide/);
        win.localStorage.setItem('siming.keys', '{pas du json');
        loadClientScripts(win, ['js/keys.js']);
        win.SIMING.keys.register({ id: 'x.go', label: 'Go', group: 'X', defaultKey: 'KeyG', run: noop });
        assert.strictEqual(win.SIMING.keys.binding('x.go').code, 'KeyG', 'mémoire illisible : défauts');
    });

    test('raccourcis : écouteur unique, when(), champs, boutons (Entrée / Espace), dialogue, déjà traitée', () => {
        const { keys, doc, press, win } = setup();
        const ran = [];
        let visible = true;
        keys.register({ id: 'a', label: 'A', group: 'T', defaultKey: 'Numpad5', when: () => visible, run: () => ran.push('a') });
        keys.register({ id: 'b', label: 'B', group: 'T', defaultKey: 'Enter', when: () => visible, run: () => ran.push('b') });
        keys.register({ id: 'c', label: 'C', group: 'U', defaultKey: 'Numpad5', when: () => !visible, run: () => ran.push('c') });
        const detach = keys.attach(doc);
        let e = press({ code: 'Numpad5', key: '5' });
        assert.deepEqual(ran, ['a']);
        assert.strictEqual(e.defaultPrevented, true, 'frappe consommée');
        visible = false;
        press({ code: 'Numpad5', key: '5' });
        assert.deepEqual(ran, ['a', 'c'], 'même touche, autre outil visible');
        visible = true;
        press({ code: 'NumpadEnter', key: 'Enter' });
        assert.deepEqual(ran, ['a', 'c', 'b'], 'Entrée du pavé = Entrée');
        const input = doc.createElement('input');
        const btn = doc.createElement('button');
        doc.body.append(input, btn);
        press({ code: 'Enter', key: 'Enter' }, input);
        press({ code: 'Enter', key: 'Enter' }, btn);
        press({ code: 'Space', key: ' ' }, btn);
        assert.deepEqual(ran, ['a', 'c', 'b'], 'champ, et Entrée / Espace sur un bouton : le navigateur garde la main');
        press({ code: 'Numpad5', key: '5' }, btn);
        assert.deepEqual(ran, ['a', 'c', 'b', 'a'], 'autre touche sur un bouton : action');
        e = press({ code: 'Numpad9', key: '9' });
        assert.strictEqual(e.defaultPrevented, false, 'touche libre : rien');
        const dlg = doc.createElement('div');
        dlg.setAttribute('data-role', 'dialog');
        doc.body.append(dlg);
        press({ code: 'Numpad5', key: '5' });
        assert.strictEqual(ran.length, 4, 'dialogue ouvert : rien');
        dlg.remove();
        const pre = new win.KeyboardEvent('keydown', { code: 'Numpad5', key: '5', bubbles: true, cancelable: true });
        pre.preventDefault();
        doc.dispatchEvent(pre);
        assert.strictEqual(ran.length, 4, 'déjà traitée ailleurs : rien');
        keys.attach(doc);
        press({ code: 'Numpad5', key: '5' });
        assert.strictEqual(ran.length, 5, 'un seul écouteur par document');
        detach();
        press({ code: 'Numpad5', key: '5' });
        assert.strictEqual(ran.length, 5, 'détaché');
    });

    test('raccourcis : capture d\'une frappe (modificateur seul ignoré, Retour = aucun, Échap = annuler, écouteur suspendu)', () => {
        const { keys, doc, press } = setup();
        const ran = [], got = [];
        keys.register({ id: 'a', label: 'A', group: 'T', defaultKey: 'Numpad5', run: () => ran.push('a') });
        keys.attach(doc);
        keys.record(doc, (r) => got.push(r));
        assert.strictEqual(keys.isRecording(), true);
        press({ code: 'ShiftLeft', key: 'Shift', shiftKey: true });
        assert.deepEqual(got, [], 'modificateur seul : on attend');
        const e = press({ code: 'Numpad5', key: '5' });
        assert.deepEqual(got, [{ code: 'Numpad5', label: 'Pavé 5' }]);
        assert.deepEqual(ran, [], 'pendant la capture, l\'écouteur ne fait rien');
        assert.strictEqual(e.defaultPrevented, true);
        assert.strictEqual(keys.isRecording(), false);
        keys.record(doc, (r) => got.push(r));
        press({ code: 'Backspace', key: 'Backspace' });
        assert.strictEqual(got[1], null, 'Retour arrière = aucun raccourci');
        keys.record(doc, (r) => got.push(r));
        press({ code: 'Escape', key: 'Escape' });
        assert.strictEqual(got[2], false, 'Échap = annulé');
        const cancel = keys.record(doc, (r) => got.push(r));
        cancel();
        cancel();
        assert.deepEqual(got.slice(3), [false], 'annuler() une seule fois');
        press({ code: 'Numpad5', key: '5' });
        assert.deepEqual(ran, ['a'], 'écouteur rendu après la capture');
    });

    test('raccourcis : combinaison Ctrl + Alt + 5 capturée (modificateurs suivis, AltGr), puis déclenchée', () => {
        const { keys, doc, press } = setup();
        keys.attach(doc);
        const ran = [];
        keys.register({ id: 'a', label: 'A', group: 'Outil', run: () => ran.push('a') });
        const got = [], held = [];
        keys.record(doc, (r) => got.push(r), (t) => held.push(t));
        press({ code: 'ControlLeft', key: 'Control', ctrlKey: true });
        press({ code: 'AltLeft', key: 'Alt', ctrlKey: true, altKey: true });
        doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keyup', { code: 'AltLeft', key: 'Alt', ctrlKey: true, bubbles: true }));
        press({ code: 'AltLeft', key: 'Alt', ctrlKey: true, altKey: true });
        press({ code: 'Digit5', key: '[', ctrlKey: true, altKey: true });   // AZERTY : AltGr + 5 = [
        assert.deepEqual(held, ['Ctrl', 'Ctrl + Alt', 'Ctrl', 'Ctrl + Alt']);
        assert.deepEqual(got, [{ code: 'Ctrl+Alt+Digit5', label: 'Ctrl + Alt + 5' }]);
        keys.setBinding('a', got[0]);
        press({ code: 'Digit5', key: '5' });
        assert.deepEqual(ran, [], '5 seul : rien');
        press({ code: 'Digit5', key: '[', ctrlKey: true, altKey: true });
        assert.deepEqual(ran, ['a']);
        const e = new doc.defaultView.KeyboardEvent('keydown', { code: 'KeyE', key: '€', ctrlKey: true, altKey: true });
        assert.strictEqual(keys.labelFor(e, 'Ctrl+Alt+KeyE'), 'Ctrl + Alt + E', 'AltGr + E = € : la touche, pas le caractère');
        keys.record(doc, (r) => got.push(r));
        press({ code: 'Backspace', key: 'Backspace', ctrlKey: true });
        assert.deepEqual(got[1], { code: 'Ctrl+Backspace', label: 'Ctrl + Retour' }, 'avec un modificateur, Retour arrière est une touche');
    });

    test('raccourcis : touches réclamées à After Effects (Windows, macOS, capture), avis de changement', async () => {
        const { keys, doc } = setup();
        let notes = 0;
        keys.onChange(() => notes++);
        keys.register({ id: 'a', label: 'A', group: 'Outil', defaultKey: 'Ctrl+Alt+Digit5', run() {} });
        keys.register({ id: 'b', label: 'B', group: 'Outil', defaultKey: 'Numpad7', run() {} });
        keys.register({ id: 'c', label: 'C', group: 'Outil', defaultKey: 'Meta+KeyS', run() {} });
        keys.register({ id: 'd', label: 'D', group: 'Outil', defaultKey: 'Enter', run() {} });
        await Promise.resolve();
        assert.strictEqual(notes, 1, 'un seul avis pour une série de changements');
        assert.deepEqual(keys.interest('win'), [
            { keyCode: 0x35, ctrlKey: true, altKey: true }, { keyCode: 0x35, ctrlKey: true, altKey: true, shiftKey: true },
            { keyCode: 0x67 }, { keyCode: 0x53, metaKey: true }, { keyCode: 0x0D },
        ]);
        assert.deepEqual(keys.interest('mac'), [
            { keyCode: 0x17, ctrlKey: true, altKey: true }, { keyCode: 0x17, ctrlKey: true, altKey: true, shiftKey: true },
            { keyCode: 0x59 }, { keyCode: 0x01, metaKey: true }, { keyCode: 0x24 }, { keyCode: 0x4C },
        ]);
        assert.strictEqual(keys.keyCodeOf('F12', 'win'), 0x7B);
        assert.strictEqual(keys.keyCodeOf('Semicolon', 'win'), null, 'touche inconnue : pas réclamée');
        keys.setBinding('b', null);
        await Promise.resolve();
        assert.strictEqual(notes, 2);
        assert.ok(!keys.interest('win').some((k) => k.keyCode === 0x67), 'raccourci retiré : touche rendue');
        const cancel = keys.record(doc, () => {});
        await Promise.resolve();
        assert.strictEqual(notes, 3, 'début de capture');
        const all = keys.interest('win');
        assert.ok(all.length > 500, 'pendant la capture : toutes les touches, toutes les combinaisons');
        assert.ok(all.some((k) => k.keyCode === 0x41 && k.ctrlKey && k.altKey && k.shiftKey));
        cancel();
        await Promise.resolve();
        assert.strictEqual(notes, 4, 'fin de capture');
        assert.strictEqual(keys.interest('win').length, 4);
    });
};
