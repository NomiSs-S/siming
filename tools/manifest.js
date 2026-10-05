'use strict';
/*
 * Génère extension/CSXS/manifest.xml depuis extension/client/tools.json.
 *   node tools/manifest.js
 * Ne jamais modifier le manifeste à la main : il est régénéré par dev-install et release.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOOLS_JSON = path.join(ROOT, 'extension', 'client', 'tools.json');
const MANIFEST = path.join(ROOT, 'extension', 'CSXS', 'manifest.xml');
const MIN_AE = '24.0';   // After Effects 2024 : à ajuster selon la plus ancienne version de l'équipe
const CSXS = '11.0';

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function readList() {
    return JSON.parse(fs.readFileSync(TOOLS_JSON, 'utf8'));
}

function validate(list) {
    if (!/^\d+\.\d+\.\d+$/.test(String(list.version))) throw new Error('version invalide dans tools.json : ' + list.version);
    if (!Array.isArray(list.tools)) throw new Error('tools.json : « tools » doit être une liste');
    const seen = new Set();
    for (const t of list.tools) {
        if (!/^[a-z][a-z0-9-]*$/.test(String(t.id))) throw new Error("id d'outil invalide : " + t.id);
        if (seen.has(t.id)) throw new Error('id en double : ' + t.id);
        seen.add(t.id);
        for (const k of ['name', 'icon', 'version', 'script']) {
            if (!t[k]) throw new Error('champ « ' + k + ' » manquant pour ' + t.id);
        }
    }
    return list;
}

function panel(x) {
    return [
        '    <Extension Id="' + x.id + '">',
        '      <DispatchInfo>',
        '        <Resources>',
        '          <MainPath>' + x.page + '</MainPath>',
        '          <ScriptPath>./host/siming.jsx</ScriptPath>',
        '          <CEFCommandLine>',
        '            <Parameter>--allow-file-access-from-files</Parameter>',
        '            <Parameter>--allow-file-access</Parameter>',
        '          </CEFCommandLine>',
        '        </Resources>',
        '        <Lifecycle>',
        '          <AutoVisible>true</AutoVisible>',
        '        </Lifecycle>',
        '        <UI>',
        '          <Type>Panel</Type>',
        '          <Menu>' + esc(x.name) + '</Menu>',
        '          <Geometry>',
        '            <Size><Height>' + x.size[1] + '</Height><Width>' + x.size[0] + '</Width></Size>',
        '            <MinSize><Height>300</Height><Width>260</Width></MinSize>',
        '          </Geometry>',
        '        </UI>',
        '      </DispatchInfo>',
        '    </Extension>',
    ].join('\n');
}

function buildManifest(list) {
    validate(list);
    const v = list.version;
    const panels = [{ id: 'com.siming.hub', name: 'SIMING', page: './client/index.html', size: [340, 640] }]
        .concat(list.tools.map((t) => ({ id: 'com.siming.tool.' + t.id, name: 'SIMING – ' + t.name, page: './client/tool.html', size: [320, 560] })));
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ExtensionManifest Version="' + CSXS + '" ExtensionBundleId="com.siming" ExtensionBundleVersion="' + v + '" ExtensionBundleName="SIMING" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '  <ExtensionList>',
        panels.map((x) => '    <Extension Id="' + x.id + '" Version="' + v + '"/>').join('\n'),
        '  </ExtensionList>',
        '  <ExecutionEnvironment>',
        '    <HostList>',
        '      <Host Name="AEFT" Version="[' + MIN_AE + ',99.9]"/>',
        '    </HostList>',
        '    <LocaleList>',
        '      <Locale Code="All"/>',
        '    </LocaleList>',
        '    <RequiredRuntimeList>',
        '      <RequiredRuntime Name="CSXS" Version="' + CSXS + '"/>',
        '    </RequiredRuntimeList>',
        '  </ExecutionEnvironment>',
        '  <DispatchInfoList>',
        panels.map(panel).join('\n'),
        '  </DispatchInfoList>',
        '</ExtensionManifest>',
        '',
    ].join('\n');
}

function writeManifest() {
    const xml = buildManifest(readList());
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, xml, 'utf8');
    return xml;
}

module.exports = { buildManifest, validate, readList, writeManifest, MANIFEST, TOOLS_JSON, ROOT, MIN_AE, CSXS };

if (require.main === module) {
    try {
        writeManifest();
        console.log('Manifeste écrit : ' + MANIFEST);
    } catch (e) {
        console.error('Échec : ' + e.message);
        process.exit(1);
    }
}
