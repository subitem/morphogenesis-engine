# Level 2 — Desktop-Abnahme

Datum: 2026-10-25. Ausgang: 2f699cc. Auftrag: nächste Ausbaustufe auf Basis der generischen Volumenmorphologie; Browserprüfungen ausschließlich Desktop. Ergebnis: Level-2-Funktionsumfang lokal bestanden. Mobile ist bewusst vertagt, eine allgemeine Produktionsfreigabe nicht behauptet.

## Geliefertes Verhalten
Zwölf numerisch berechnete chemische Zustände (480 + n×96 Gray–Scott-Schritte) erzeugen jeweils ein neu extrahiertes Netz. Die Timeline pausiert und wählt einen Zustand; Wiedergabe wartet auf berechnete Zustände und endet bei Zustand 12. Die ergänzende GPU-Verformung bleibt getrennt von der chemischen Entwicklung. Neue Geometrie wird diskret eingesetzt, weil verschiedene Zustände unterschiedliche Vernetzung besitzen.

Simulation, Abtastung, Verschweißung, Normalen und Farb-Baking laufen vollständig im Modul-Worker. Die Darstellung erhält übertragene Attribut- und Indexbuffer ohne erneute CPU-Generierung. Neue Aufträge beenden alte Worker; Request-IDs und Viewer-Epochen verhindern veraltete Ergebnisse. Vier Zustände beziehungsweise 64 MiB begrenzen den CPU-Cache; GPU-Geometrie wird bei jedem Austausch freigegeben. Die bisherige Szene bleibt beim Berechnen und bei Fehlern erhalten. Import/Export speichert einen einzelnen quantisierten MGE2-Zustand mit validierten Metadaten und Indizes.

## Prüfmatrix
| Prüfung | Status | Beleg |
|---|---|---|
| Saubere Installation | passed | Eigener Vite-Prozess vor npm ci gestoppt; 30 Pakete installiert, npm meldet 0 Schwachstellen |
| TypeScript | passed | npm run check |
| Automatisierte Tests | passed | npm test: 26/26 |
| Chemische Timeline | passed | 480 gegenüber 960 Schritten numerisch verschieden und reproduzierbar |
| Bake | passed | Derselbe Auftrag ergibt identische Positions-, Normalen-, Farb- und Indexarrays; Fortschrittsstufen monoton |
| MGE2 | passed | Quantisierungs-Roundtrip, Normalen/Farben/Positionen, Metadaten, konstante Achsen; ungültige Header, Counts, Seed-Bereiche, Körperlängen, Normalen und Indizes abgewiesen |
| Worker-Lifecycle | passed | Fake-Worker-Tests für Abbruch, Dispose, alte IDs/Callbacks, Fehler und Recovery; LRU-Anzahl und Bytebudget; Cache-Hit verdrängt laufenden Worker |
| Welt/GPU | passed | Synthetic-Frame-Tests: direkte geteilte CPU-Arrays, geometrischer Austausch, Freigabe genau einmal, kein CPU-Pipelineimport im Viewer/Welt-Modul |
| Produktionsbuild | passed | npm run build: separater Worker 116,43 kB; Hauptbundle 581,58 kB, gzip 148,30 kB |
| Diff | passed | git diff --check |
| Desktop-Layout | passed | Chromium 1366×768, 1440×1080 und 1920×1080; kein horizontaler Überlauf |
| UI während Generierung | passed | Hilfedialog während laufender Berechnung geöffnet/geschlossen, bisherige Dreieckszahl sichtbar; 25-ms-Herzschlag lief 204-mal bis zum Ergebnis weiter |
| Timeline | passed | Zustand 6 zeigt 960 Schritte; tatsächlicher laufender Auftrag 7 durch Auftrag 4 ersetzt, ausschließlich Zustand 4 mit 768 Schritten angewendet |
| Pause während Autoplay | passed | Ausstehende automatische Weiterentwicklung abgebrochen, Zustand 2 bleibt sichtbar; Canvas-Screenshots über 500 ms bytegleich |
| Wiedergabeende | passed | Zustand 11 entwickelt sich zu 12 mit 1536 Schritten, pausiert und bleibt ohne Rücksprung bestehen |
| Qualitätsfehler und Retry | passed | Gezielter Worker-Ausfall beim Wechsel auf reduziert; derselbe Wechsel anschließend erfolgreich wiederholt |
| Export/Import | passed | Echter Download 9.304.935 Bytes: Seed 42, Frame 1, hoch; nach Zustand 5 geladen und Zustand 2/576 Schritte wiederhergestellt |
| Ungültiger Import | passed | Defekte MGE-Datei meldet Fehler und behält Zustand 2 sowie Canvas |
| Kontextverlust | passed | Produktionspreview: fertiger Zustand 3/672 Schritte wiederhergestellt; laufender manueller Auftrag für Zustand 7 nach Wiederherstellung korrekt fortgesetzt; keine WebGL-Warnungen/Fehler |
| Reduced Motion | passed | Desktop-Emulation startet pausiert |
| Fehlendes WebGL 2 | passed | Produktionspreview: Wiedergabe deaktiviert, verständliche Meldung und geladenes Referenzbild |
| Unabhängiges Review | passed | Worker/Bake, Viewer/Welt und UI-Integration getrennt geprüft; keine verbleibenden P0/P1. Qualitäts-Retry-Befund korrigiert und im Browser reproduziert/geprüft |
| Mobile | not executed | Ausdrücklich auf später verschoben |
| Weitere Browser, Axe/Screenreader, Dauerlast/Peak-RAM, Referenz-GPU-Profiling | not executed | Keine entsprechenden Abnahmen behauptet |
| Öffentliche Bereitstellung/Live-Release | not executed | Lokaler Repository-Auftrag |

## Grenzen
P0 0, P1 0 im vereinbarten Level-2-Umfang. Nicht blockierendes P2: Hauptbundle >500 kB. Der Worker beseitigt den mehrsekündigen CPU-Generierungsblock im UI-Thread, macht die Berechnung selbst aber nicht schneller. Upload und Import-/Export-Validierung verbleiben auf dem Hauptthread; keine garantierte Millisekunden-Latenz oder 60-FPS-Aussage. Zwölf Zustände werden bei Bedarf erzeugt, nicht als gesamte Sequenz exportiert. Kein fließender Topologieübergang, keine automatische Loop-Korrektur, kein VAT-Sequenzcontainer und kein WebGPU-Compute. Die diskrete Geometrie ist eine endliche Approximation des kontinuierlichen Feldes; Quantisierung kann sehr kleine Dreiecke kollabieren lassen.

Dokumentation: [START.md](START.md), [ASSET_FORMAT.md](ASSET_FORMAT.md), [PLAN.md](../PLAN.md). Lokale Artefakte: artifacts/level2-desktop-final.png und artifacts/level2-state.mge. Agenten-Rohbelege bleiben unter .agents/ und werden nicht als Anwendungszustand eingecheckt. Fremde README-Änderung, .vscode und ursprüngliches Starter-ZIP bleiben erhalten.
