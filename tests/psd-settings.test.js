'use strict';
/* Réglages de l'import des PSD (js/psd/settings.js) : validation, lecture, onglet Réglages › Import PSD. */
const assert = require('assert');
const { makeDom, loadHost } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/psd/settings.js'];
const ALL_ON = { texts: true, shapes: true, labels: true, crop: true, anchors: true };

function setup() {
    const win = makeDom(SCRIPTS);
    const status = win.SIMING.ui.statusLine();
    const pane = win.document.createElement('div');
    win.document.body.append(pane);
    const api = win.SIMING.psdSettings.pane(pane, { status });
    const $ = (sel) => pane.querySelector(sel);
    const type = (role, text) => {
        const input = $('[data-role=' + role + '] input');
        input.value = text;
        input.dispatchEvent(new win.Event('change', { bubbles: true }));
    };
    const stored = (key) => win.localStorage.getItem('siming.' + key);
    return { win, ps: win.SIMING.psdSettings, status, pane, api, $, type, stored };
}

module.exports = function (test) {
    test('réglages PSD : valeurs par défaut (dossier des PSD, chutier de dépose, toutes les étapes)', () => {
        const t = setup();
        assert.deepEqual(t.ps.read(), { sourcePath: '02_RESSOURCES/02_ASSET', bin: '02_ASSET', steps: ALL_ON });
        assert.deepEqual(t.ps.DEFAULTS, { sourcePath: '02_RESSOURCES/02_ASSET', bin: '02_ASSET' });
        assert.deepEqual(t.ps.STEPS.map((s) => s.id), ['shapes', 'texts', 'labels', 'crop', 'anchors'], 'dans l\'ordre où l\'hôte les fait');
    });

    test('réglages PSD : checkPath normalise les séparateurs et refuse vide, absolu, « .. », caractères interdits, nom finissant par un point', () => {
        const { ps } = setup();
        assert.deepEqual(ps.checkPath('  A\\B//C/ '), { ok: true, value: 'A/B/C' });
        assert.deepEqual(ps.checkPath('02_RESSOURCES/02_ASSET/'), { ok: true, value: '02_RESSOURCES/02_ASSET' });
        assert.deepEqual(ps.checkPath('.cache'), { ok: true, value: '.cache' });
        for (const bad of ['', '   ', '/', '/abs', '\\\\serveur\\x', 'C:\\x', 'c:x', '..', 'a/../b', './a', 'a/./b', 'a:b', 'a<b', 'a>b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\u0001b', 'fin.', 'a/fin /b', null, undefined]) {
            const r = ps.checkPath(bad);
            assert.strictEqual(r.ok, false, JSON.stringify(bad));
            assert.ok(r.error, 'raison pour ' + JSON.stringify(bad));
        }
    });

    test('réglages PSD : read garde les défauts pour une valeur enregistrée invalide ; une étape vaut faux seulement à « 0 »', () => {
        const t = setup();
        t.win.localStorage.setItem('siming.psd.bin', '../dehors');
        t.win.localStorage.setItem('siming.psd.sourcePath', 'Mes\\PSD');
        t.win.localStorage.setItem('siming.psd.step.crop', '0');
        t.win.localStorage.setItem('siming.psd.step.labels', 'n\'importe quoi');
        assert.deepEqual(t.ps.read(), { sourcePath: 'Mes/PSD', bin: '02_ASSET', steps: Object.assign({}, ALL_ON, { crop: false }) });
    });

    test('réglages PSD : l\'onglet montre les valeurs par défaut, 5 étapes cochées, un bouton Rétablir', () => {
        const t = setup();
        assert.strictEqual(t.$('[data-role=psd-sourcePath] input').value, '02_RESSOURCES/02_ASSET');
        assert.strictEqual(t.$('[data-role=psd-bin] input').value, '02_ASSET');
        const rows = Array.from(t.pane.querySelectorAll('[data-role=psd-steps] .s-check-row'));
        assert.deepEqual(rows.map((r) => r.querySelector('.s-row-name').textContent), t.ps.STEPS.map((s) => s.label));
        assert.deepEqual(rows.map((r) => r.querySelector('input').checked), [true, true, true, true, true]);
        assert.strictEqual(t.$('[data-role=psd-reset]').textContent, 'Rétablir');
        assert.deepEqual(Array.from(t.pane.querySelectorAll('.s-section-label')).map((e) => e.textContent), ['Dossier des PSD', 'Chutier de dépose', 'Étapes de l\'import']);
        assert.strictEqual(t.pane.querySelector('.s-btn-primary'), null, 'pas de bouton principal');
    });

    test('réglages PSD : un chemin valide est normalisé, enregistré et lu par read ; statut « ok »', () => {
        const t = setup();
        t.type('psd-sourcePath', ' Mes\\PSD\\ ');
        assert.strictEqual(t.stored('psd.sourcePath'), 'Mes/PSD');
        assert.strictEqual(t.$('[data-role=psd-sourcePath] input').value, 'Mes/PSD');
        assert.strictEqual(t.status.text, 'Dossier des PSD : Mes/PSD');
        assert.strictEqual(t.status.level, 'ok');
        t.type('psd-bin', 'Import/PSD');
        assert.strictEqual(t.stored('psd.bin'), 'Import/PSD');
        assert.deepEqual(t.ps.read(), { sourcePath: 'Mes/PSD', bin: 'Import/PSD', steps: ALL_ON });
    });

    test('réglages PSD : une valeur vide ou invalide n\'est pas enregistrée, le champ retrouve la valeur gardée, avertissement sur la ligne de statut', () => {
        const t = setup();
        t.type('psd-bin', 'Dépose');
        for (const bad of ['', '   ', '/abs', 'C:\\x', '../x', 'a?b', 'fin.']) {
            t.type('psd-bin', bad);
            assert.strictEqual(t.stored('psd.bin'), 'Dépose', 'non enregistré : ' + JSON.stringify(bad));
            assert.strictEqual(t.$('[data-role=psd-bin] input').value, 'Dépose', 'champ rétabli : ' + JSON.stringify(bad));
            assert.strictEqual(t.status.level, 'warn');
            assert.ok(/^Chutier de dépose : .* · valeur gardée$/.test(t.status.text), t.status.text);
        }
        t.type('psd-sourcePath', '..');
        assert.strictEqual(t.status.text, 'Dossier des PSD : « .. » n\'est pas permis · valeur gardée');
        t.type('psd-sourcePath', '');
        assert.strictEqual(t.stored('psd.sourcePath'), null, 'rien d\'enregistré');
        assert.strictEqual(t.$('[data-role=psd-sourcePath] input').value, '02_RESSOURCES/02_ASSET', 'le défaut reste');
        assert.ok(/^Dossier des PSD : le chemin est vide/.test(t.status.text));
    });

    test('réglages PSD : décocher une étape l\'enregistre (« 0 ») et read la donne fausse ; la recocher la rétablit', () => {
        const t = setup();
        const box = (i) => t.pane.querySelectorAll('[data-role=psd-steps] .s-check-row input')[i];
        box(3).click();   // recadrer
        assert.strictEqual(t.stored('psd.step.crop'), '0');
        assert.strictEqual(t.stored('psd.step.texts'), '1');
        assert.deepEqual(t.ps.read().steps, Object.assign({}, ALL_ON, { crop: false }));
        assert.strictEqual(t.status.text, 'Étapes de l\'import : 4 sur 5');
        box(1).click();   // textes
        assert.deepEqual(t.ps.read().steps, Object.assign({}, ALL_ON, { crop: false, texts: false }));
        box(3).click();
        assert.strictEqual(t.ps.read().steps.crop, true);
    });

    test('réglages PSD : Rétablir remet chemins et étapes par défaut, dans les champs et dans les réglages', () => {
        const t = setup();
        t.type('psd-sourcePath', 'Autre');
        t.type('psd-bin', 'X/Y');
        t.pane.querySelectorAll('[data-role=psd-steps] .s-check-row input')[0].click();
        t.pane.querySelectorAll('[data-role=psd-steps] .s-check-row input')[4].click();
        assert.strictEqual(t.ps.read().steps.shapes, false);
        t.$('[data-role=psd-reset]').click();
        assert.deepEqual(t.ps.read(), { sourcePath: '02_RESSOURCES/02_ASSET', bin: '02_ASSET', steps: ALL_ON });
        assert.strictEqual(t.$('[data-role=psd-sourcePath] input').value, '02_RESSOURCES/02_ASSET');
        assert.strictEqual(t.$('[data-role=psd-bin] input').value, '02_ASSET');
        assert.deepEqual(Array.from(t.pane.querySelectorAll('[data-role=psd-steps] input')).map((i) => i.checked), [true, true, true, true, true]);
        assert.strictEqual(t.status.text, 'Réglages de l\'import des PSD rétablis');
    });

    test('réglages PSD : checkPath (panneau) et cleanRelPath (hôte) acceptent, refusent et normalisent les mêmes chemins', () => {
        const t = setup();
        const core = loadHost().sandbox.SIMING.getTool('psdimport')._core;
        const paths = [
            '02_RESSOURCES/02_ASSET', 'A\\B', ' A / B ', 'A//B/', 'A/B/', 'Mes PSD/é', '/abs', '\\abs', 'C:\\x', 'C:x', 'a:b', 'a?b', 'a*', 'a<b', 'a>b', 'a"b', 'a|b',
            'x.', 'x /y', 'x ', '.', '..', '../x', './x', 'a/./b', 'a/../b', '', '   ', '/', 'a\u0001b', 'a.b', '.cache',
        ];
        for (const raw of paths) {
            const c = t.ps.checkPath(raw);
            assert.strictEqual(core.cleanRelPath(raw), c.ok ? c.value : null, JSON.stringify(raw));
        }
    });

    test('réglages PSD : refresh relit les réglages (changés ailleurs)', () => {
        const t = setup();
        t.win.localStorage.setItem('siming.psd.bin', 'Ailleurs');
        t.win.localStorage.setItem('siming.psd.step.anchors', '0');
        t.api.refresh();
        assert.strictEqual(t.$('[data-role=psd-bin] input').value, 'Ailleurs');
        assert.deepEqual(Array.from(t.pane.querySelectorAll('[data-role=psd-steps] input')).map((i) => i.checked), [true, true, true, true, false]);
    });
};
