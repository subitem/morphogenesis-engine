import type { UIAction, UIHandle, ViewerStats, WorldSettings } from './contracts';

const playIcon = '<path d="m8 5 11 7-11 7Z"/>';
const pauseIcon = '<path d="M8 5v14M16 5v14"/>';
const icon = (content: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;

export function mountUI(root: HTMLElement): UIHandle {
  let callback: (action: UIAction) => void = () => {};
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = 42;
  let disposed = false;
  const controller = new AbortController();
  const { signal } = controller;
  root.innerHTML = `
    <div class="studio">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Morphogenesis Engine – Start">${icon('<path d="m12 2 8.6 5v10L12 22l-8.6-5V7Z"/><path d="m3.4 7 8.6 5 8.6-5M12 12v10M7.7 4.5l8.6 5v5l-8.6 5v-10l8.6-5"/>')}<span>MORPHOGENESIS<span class="brand-sub">ENGINE / EXPERIMENTAL WORLDS</span></span></a>
        <div class="chapter"><span class="chapter-number">01</span> Living Canvas <span class="chapter-tag">EXPERIMENT</span></div>
        <button class="icon-button help-button" id="help" aria-label="Bedienung und Hilfe">${icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>')}</button>
      </header>
      <main class="workspace">
        <aside class="sidebar" aria-label="Experiment steuern">
          <div class="intro"><div class="eyebrow"><span class="tiny-line"></span> STUDIE 001</div><h1>Living<br><em>Canvas.</em></h1><p>Wo Mathematik<br>lebendig wird.</p></div>
          <section class="panel-section"><div class="section-heading"><h2>Atmosphäre</h2><span>01—03</span></div><div class="presets" role="group" aria-label="Atmosphäre wählen"><button class="preset selected" data-preset="0" aria-pressed="true"><span class="preset-swatch swatch-0"></span><span>Ursprung<small>Organisch & ausgewogen</small></span><span class="preset-mark">↗</span></button><button class="preset" data-preset="1" aria-pressed="false"><span class="preset-swatch swatch-1"></span><span>Stille<small>Langsam & meditativ</small></span><span class="preset-mark">↗</span></button><button class="preset" data-preset="2" aria-pressed="false"><span class="preset-swatch swatch-2"></span><span>Aufbruch<small>Intensiv & dynamisch</small></span><span class="preset-mark">↗</span></button></div></section>
          <section class="panel-section parameters"><div class="section-heading"><h2>Parameter</h2><span>LIVE</span></div><div class="range-field"><label for="speed">Geschwindigkeit</label><output id="speed-value" for="speed">1,0×</output><input id="speed" type="range" min="0.1" max="2" step="0.1" value="1"></div><div class="range-field"><label for="intensity">Morphogenese</label><output id="intensity-value" for="intensity">70 %</output><input id="intensity" type="range" min="0" max="1.5" step="0.05" value="0.7"></div><div class="quality-field"><label for="quality">Detailgrad</label><select id="quality"><option value="high">Hoch</option><option value="low">Reduziert</option></select></div></section>
          <section class="panel-section seed-section"><div class="section-heading"><h2>Welt-Seed</h2><span id="seed-value">#000042</span></div><button class="regenerate" id="regenerate">${icon('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>')}Neue Welt erzeugen</button></section>
          <div class="sidebar-note"><span class="note-symbol">◈</span><p>Eine kleine Welt.<br>Unendliche Möglichkeiten.</p></div>
        </aside>
        <section class="canvas-column" aria-label="Interaktive 3D-Landschaft">
          <div class="scene-header"><span><span class="status-dot"></span> <span id="motion-state">${playing ? 'LEBENDIGE WELT' : 'WELT PAUSIERT'}</span></span><span class="scene-edition">PROCEDURAL ECOSYSTEM / V.01</span></div>
          <div class="scene-wrap"><div id="viewport" class="viewport" tabindex="0" aria-label="3D-Welt: Ziehen zum Drehen, Mausrad zum Zoomen. Kamera zurücksetzen über die Schaltfläche."></div><div class="scene-index" aria-hidden="true">FIG. 001<span>Emergent structures</span></div><div class="scene-tools"><button id="reference" class="tool-button" aria-label="Originales Referenzbild ansehen">${icon('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 16 5-5 4 4 4-5 5 6"/>')}<span>Referenz</span></button><button id="reset" class="tool-button" aria-label="Kamera zurücksetzen">${icon('<path d="M4 9V4h5M20 15v5h-5M5 5l4 4M19 19l-4-4"/><circle cx="12" cy="12" r="5"/>')}<span>Ansicht</span></button></div><div class="scene-caption"><span class="caption-rule"></span><p>Komplexität entsteht<br><em>aus einfachen Regeln.</em></p></div><div class="orbit-hint">${icon('<path d="M8 8c-5 1-6 5-1 7s13 1 14-2-4-5-8-5M13 5l-4 3 4 3"/>')} ZIEHEN ZUM ENTDECKEN</div></div>
          <div class="transport"><button id="play" class="play-button" aria-label="${playing ? 'Animation pausieren' : 'Animation starten'}" aria-pressed="${playing}">${icon(playing ? pauseIcon : playIcon)}<span>${playing ? 'Pausieren' : 'Abspielen'}</span></button><div class="transport-label"><span class="transport-dot"></span> ECHTZEIT-MORPHOGENESE</div><div class="legend"><span><i class="teal-dot"></i>Zellen</span><span><i class="gold-dot"></i>Küsten</span><span><i class="violet-dot"></i>Organismen</span></div></div>
          <footer class="metrics" aria-label="Gemessene Renderstatistik"><span id="renderer-stat">Renderer wird initialisiert</span><span><strong id="fps-stat">—</strong> FPS</span><span><strong id="objects-stat">—</strong> OBJEKTE</span><span><strong id="triangles-stat">—</strong> DREIECKE</span><span class="metrics-end">MATHEMATICS, MADE VISIBLE.</span></footer>
        </section>
      </main>
      <dialog class="studio-dialog" id="info-dialog" aria-labelledby="dialog-title"><button class="dialog-close icon-button" aria-label="Dialog schließen">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button><div id="dialog-content"></div></dialog>
    </div>`;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const viewport = find<HTMLElement>('#viewport');
  const play = find<HTMLButtonElement>('#play');
  const speed = find<HTMLInputElement>('#speed');
  const intensity = find<HTMLInputElement>('#intensity');
  const quality = find<HTMLSelectElement>('#quality');
  const dialog = find<HTMLDialogElement>('#info-dialog');
  const content = find<HTMLElement>('#dialog-content');
  let dialogTrigger: HTMLElement | null = null;
  const emit = (action: UIAction) => { if (!disposed) callback(action); };
  const deselectPresets = () => root.querySelectorAll<HTMLButtonElement>('.preset').forEach(button => { button.classList.remove('selected'); button.setAttribute('aria-pressed', 'false'); });
  const updateRanges = () => {
    find<HTMLOutputElement>('#speed-value').value = `${Number(speed.value).toLocaleString('de-DE', { minimumFractionDigits: 1 })}×`;
    find<HTMLOutputElement>('#intensity-value').value = `${Math.round(Number(intensity.value) * 100)} %`;
    speed.style.setProperty('--fill', `${(Number(speed.value) - 0.1) / 1.9 * 100}%`);
    intensity.style.setProperty('--fill', `${Number(intensity.value) / 1.5 * 100}%`);
  };
  const setPlayback = () => {
    play.innerHTML = `${icon(playing ? pauseIcon : playIcon)}<span>${playing ? 'Pausieren' : 'Abspielen'}</span>`;
    play.setAttribute('aria-label', playing ? 'Animation pausieren' : 'Animation starten');
    play.setAttribute('aria-pressed', String(playing));
    find('#motion-state').textContent = playing ? 'LEBENDIGE WELT' : 'WELT PAUSIERT';
    emit({ type: 'play', value: playing });
  };
  play.addEventListener('click', () => { playing = !playing; setPlayback(); }, { signal });
  speed.addEventListener('input', () => { updateRanges(); deselectPresets(); emit({ type: 'settings', value: { speed: Number(speed.value) } }); }, { signal });
  intensity.addEventListener('input', () => { updateRanges(); deselectPresets(); emit({ type: 'settings', value: { intensity: Number(intensity.value) } }); }, { signal });
  quality.addEventListener('change', () => emit({ type: 'settings', value: { quality: quality.value === 'low' ? 'low' : 'high' } }), { signal });
  const presets: Pick<WorldSettings, 'speed' | 'intensity'>[] = [{ speed: 1, intensity: 0.7 }, { speed: 0.3, intensity: 0.25 }, { speed: 1.6, intensity: 1.25 }];
  root.querySelectorAll<HTMLButtonElement>('.preset').forEach(button => button.addEventListener('click', () => {
    const preset = presets[Number(button.dataset.preset)];
    deselectPresets(); button.classList.add('selected'); button.setAttribute('aria-pressed', 'true');
    speed.value = String(preset.speed); intensity.value = String(preset.intensity); updateRanges(); emit({ type: 'settings', value: preset });
  }, { signal }));
  find('#regenerate').addEventListener('click', () => { seed = (seed + 7919) % 1000000; find('#seed-value').textContent = `#${String(seed).padStart(6, '0')}`; emit({ type: 'seed', value: seed }); }, { signal });
  find('#reset').addEventListener('click', () => emit({ type: 'reset' }), { signal });
  const openDialog = (trigger: HTMLElement, markup: string) => { dialogTrigger = trigger; content.innerHTML = markup; dialog.showModal(); };
  find('#help').addEventListener('click', () => openDialog(find('#help'), '<div class="eyebrow">FELDNOTIZEN / 001</div><h2 id="dialog-title">Eine Welt entdecken.</h2><p>Zelllandschaften, Korallen und goldene Küsten entstehen aus mathematischen Regeln. Verändere ihre Bewegung oder erzeuge mit einem neuen Seed eine andere Komposition.</p><dl class="help-list"><div><dt>Drehen</dt><dd>Ziehen mit Maus oder einem Finger; bei fokussierter Szene auch Pfeiltasten</dd></div><div><dt>Zoomen</dt><dd>Mausrad oder zwei Finger; auf der Tastatur + und −</dd></div><div><dt>Zurück zum Anfang</dt><dd>„Ansicht“ setzt die Kamera zurück</dd></div><div><dt>Weniger Bewegung</dt><dd>Pausieren oder Atmosphäre „Stille“ wählen</dd></div></dl><p class="dialog-footnote">Level 1 · Prozedurale 3D-Interpretation. Vorberechnete Simulationen folgen in späteren Ausbaustufen.</p>'), { signal });
  find('#reference').addEventListener('click', () => openDialog(find('#reference'), '<div class="eyebrow">VISUELLE GRUNDLAGE</div><h2 id="dialog-title">Der Ursprung.</h2><img class="reference-image" src="/reference.png" alt="Originales Referenzbild der biomorphen Mikrolandschaft"><p class="dialog-footnote">Die 3D-Landschaft interpretiert Komposition, Farbwelt und organische Formen dieser Vorlage.</p>'), { signal });
  find('.dialog-close').addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } }, { signal });
  dialog.addEventListener('close', () => dialogTrigger?.focus(), { signal });
  find('.brand').addEventListener('click', event => { event.preventDefault(); emit({ type: 'reset' }); }, { signal });
  updateRanges();
  return {
    viewport,
    onAction(next) { callback = next; },
    setStats(stats: ViewerStats) {
      find('#fps-stat').textContent = String(Math.round(stats.fps));
      find('#objects-stat').textContent = stats.objects.toLocaleString('de-DE');
      find('#triangles-stat').textContent = stats.triangles.toLocaleString('de-DE');
      find('#renderer-stat').textContent = stats.renderer;
    },
    showError(message) {
      playing = false; setPlayback(); play.disabled = true;
      const fallback = document.createElement('div'); fallback.className = 'scene-error'; fallback.setAttribute('role', 'alert');
      const heading = document.createElement('h2'); heading.textContent = 'Die 3D-Welt ist gerade nicht verfügbar.';
      const explanation = document.createElement('p'); explanation.textContent = message;
      const image = document.createElement('img'); image.src = '/reference.png'; image.alt = 'Referenzbild als alternative Ansicht';
      fallback.append(heading, explanation, image); viewport.replaceChildren(fallback);
      find('#renderer-stat').textContent = 'Referenzansicht · 3D nicht verfügbar';
    },
    dispose() { disposed = true; controller.abort(); if (dialog.open) dialog.close(); root.replaceChildren(); },
  };
}
