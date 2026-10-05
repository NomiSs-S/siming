/*
 * SIMING : utilitaires DOM du panneau.
 *   ui.h(tag, props, ...enfants)  crée un élément (textes toujours en textContent)
 *   ui.icon(nom, taille)          icône SVG de la charte (couleur = currentColor)
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const ui = SIMING.ui = SIMING.ui || {};
    const SVG_NS = 'http://www.w3.org/2000/svg';

    ui.h = function (tag, props, ...children) {
        const el = global.document.createElement(tag);
        if (props) {
            for (const [key, value] of Object.entries(props)) {
                if (value === undefined || value === null || value === false) continue;
                if (key === 'class') el.className = value;
                else if (key === 'text') el.textContent = value;
                else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
                else if (value === true) el.setAttribute(key, '');
                else el.setAttribute(key, String(value));
            }
        }
        for (const child of children.flat(Infinity)) {
            if (child === undefined || child === null || child === false) continue;
            el.append(child.nodeType ? child : String(child));
        }
        return el;
    };

    ui.icon = function (name, size) {
        const doc = global.document;
        const px = String(size || 16);
        const svg = doc.createElementNS(SVG_NS, 'svg');
        const attrs = {
            class: 's-icon', width: px, height: px, viewBox: '0 0 16 16', fill: 'none',
            stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round',
            'stroke-linejoin': 'round', 'aria-hidden': 'true',
        };
        for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
        let dash = null;
        for (const prim of (SIMING.ICONS && SIMING.ICONS[name]) || []) {
            if (Object.prototype.hasOwnProperty.call(prim, 'dash')) { dash = prim.dash; continue; }
            let el = null;
            if (prim.path) {
                el = doc.createElementNS(SVG_NS, 'path');
                el.setAttribute('d', prim.path);
            } else if (prim.circle) {
                el = doc.createElementNS(SVG_NS, 'circle');
                el.setAttribute('cx', prim.circle[0]); el.setAttribute('cy', prim.circle[1]); el.setAttribute('r', prim.circle[2]);
            } else if (prim.rect) {
                el = doc.createElementNS(SVG_NS, 'rect');
                el.setAttribute('x', prim.rect[0]); el.setAttribute('y', prim.rect[1]);
                el.setAttribute('width', prim.rect[2]); el.setAttribute('height', prim.rect[3]);
                if (prim.rect[4]) el.setAttribute('rx', prim.rect[4]);
            }
            if (!el) continue;
            if (dash) el.setAttribute('stroke-dasharray', dash.join(' '));
            svg.appendChild(el);
        }
        return svg;
    };
})(window);
