# Morphogenesis Engine — SPA und Level 1

## Revision — generische Volumenmorphologie
Die Benutzerkorrektur ersetzt die dekorative Motivkonstruktion vollständig: keine platzierten Torus-, Kugel- oder Zylinderkörper als Strukturersatz. `src/morphology.ts` integriert ein deterministisches Gray–Scott-Reaktions-Diffusions-System; die Konzentration steuert ein räumlich verzerrtes, mehrskaliges implizites Membranfeld mit variabler Wandstärke und Hüllkurve. `src/isosurface.ts` trianguliert beliebige positive Dichtefelder mittels Marching Tetrahedra und liefert gradientenbasierte Außennormalen. `src/world.ts` verbindet beide Module zu einer tatsächlichen porösen Oberfläche; Farbe und Materialzonen beziehen sich auf dieselbe Chemie. Die kontinuierliche GPU-Verformung nutzt eine analytische Jacobi-Matrix für Normalen. Sie verändert keine Topologie und ist keine fortlaufende chemische Simulation. Qualität schaltet die tatsächliche Abtastauflösung um. Die ursprünglichen Level-1-Motivaufgaben unten dokumentieren den abgelösten Stand.

Prüfgates der Revision: numerische chemische Entwicklung und Seed-Reproduzierbarkeit; Feldkontinuität und leere Außengrenzen; Mesher gegen analytische Kugel mit nach außen gerichteten Normalen und korrekter Dreieckswindung; echte räumliche Ausdehnung und freigegebene GPU-Ressourcen; Typecheck, Tests, Build und Desktop-/Mobilprüfung einschließlich Pause, Seed, Detailgrad und Kontextwiederherstellung. Die Oberfläche enthält keine vorgefertigten Motivprimitive. Grenzen und Browserbelege werden im Prüfbericht aktualisiert.

## Grundlage und Design
Stand 2026-10-25: Repository enthält ein Starter-ZIP, eine fremd geänderte README und lokale VS-Code-Einstellungen, aber keinen Anwendungscode. Diese Dateien werden unverändert erhalten. Ziel ist eine lokal ausführbare, statisch auslieferbare Single Page Application ohne Backend, Konten oder externe Dienste. Das Referenzbild liegt unverändert in public/reference.png. Visuelle Richtung: dunkles Forschungsinstrument, elfenbeinfarbene Typografie, türkisgrüne Zellen, goldene Küsten, Korallen und schwebende Ringe. Die 3D-Welt ist der Mittelpunkt; eine schmale Werkzeugleiste und ein Parameterpanel rahmen sie ein.

## Architektur und gemeinsame Verträge
TypeScript, Vite, Three.js und WebGL2; WebGPU bleibt eine spätere Erweiterung. src/contracts.ts besitzt alle gemeinsamen Typen. src/world.ts erzeugt deterministische Geometrie und Animation. src/viewer.ts besitzt Renderer, Kamera, OrbitControls, Resize und GPU-Lebenszyklus. src/ui.ts und src/style.css besitzen SPA-Oberfläche und Eingaben. src/main.ts integriert. Keine Laufzeit-CDNs. Globaler Zeitwert in Sekunden, rechtshändig, Y-up. Level 1 nutzt prozedurale Echtzeitanimation; keine Behauptung echter Simulation oder topologischer Übergänge.

## Level 1 — Living Canvas (jetzt autorisiert)
- [x] P1-WORLD: Seed-basierte organische Zelllandschaft, goldene Küste, Korallen, Ringe, Partikel und sanfte Animation. Eigentümer Sherlock Holmes: src/world.ts und tests/world.test.ts. Konsumiert WorldSettings, liefert createWorld(seed): WorldHandle. Prüfen: deterministische Geometrie, endliche Bounds, dispose, sichtbares Ergebnis.
- [x] P1-VIEWER: Renderer, interaktive Kamera, Zeitsteuerung, Qualitätsauswahl, Resize, Fehlerzustände und Ressourcenfreigabe. Eigentümer Princess Leia: src/viewer.ts. Konsumiert createWorld und Verträge, liefert createViewer(container,onStats): ViewerHandle. Prüfen: Typecheck, Browser, Pause, Kamerareset, Resize, Kontextverlust.
- [x] P1-UI: Responsive SPA mit Presets, Play/Pause, Geschwindigkeit, Intensität, Seed-Neugenerierung, Kamerareset, Hilfe und Referenzansicht. Eigentümer Ellen Ripley: src/ui.ts und src/style.css. Liefert mountUI(root): UIHandle. Prüfen: Typecheck und Desktop/Mobile/Keyboard.
- [x] P2-INTEGRATION: Orchestrator besitzt Konfiguration, src/main.ts, Tests, Dokumentation und Build. npm run check, npm test, npm run build, git diff --check; Browser-Smoke auf Desktop und Mobile. Status und Grenzen in docs/VERIFICATION.md.
- [x] P2-DELIVERY: Startanleitung, CI und Quellpaket; nur aufgabenbezogene Dateien committen und pushen. Keine öffentliche Bereitstellung beauftragt.

## Level 2 — Morphogenesis System (geplant)
Python-Baking, VAT-Manifest, feste Mesh-Topologie, quantisierte Positionen und Normalen, deterministische Loops. Erst nach Level-1-Gate. Gate: validiertes Assetformat, numerischer Fehlervergleich und visuelle Loopprüfung.

## Level 3 — Hypercomplex Ecosystem (geplant)
WebGPU-Compute, SDF-Übergänge, Streaming, adaptive LODs, KTX2 und Kamerachoreografie. Gate: Profiling auf benannter Referenzhardware, visuelle Abnahme und Fallback-Prüfung. Keine garantierten 60 FPS ohne Messung.

## Abhängigkeiten, Risiken und Abschluss
Verträge werden vor dem Fan-out seriell festgelegt. Drei getrennte Dateibereiche, maximal vier aktive Agenten einschließlich Orchestrator. Integration nach Abschluss der Teilmodule; danach unabhängiges Review. Browser ohne WebGL2 müssen einen verständlichen Fehler samt Referenzbild erhalten. Reduced Motion startet pausiert. Keine geheimen Daten oder Persistenz. Build und Quelltests beweisen keine GPU-Performance; Browserbelege und Einschränkungen werden separat dokumentiert. Ausgang: P0 0, P1 3, P2 2; alle Implementierungsgates zunächst offen.
