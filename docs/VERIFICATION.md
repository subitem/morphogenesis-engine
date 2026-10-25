# Generische Volumenmorphologie — Prüfbericht

Datum: 2026-10-25. Diese Revision ersetzt die motivbasierte Level-1-Geometrie aus Commit 0bb2e31. Die SPA und ihre Bedienung bleiben bestehen. Fremde README-Änderung, .vscode und ursprüngliches Starter-ZIP bleiben erhalten.

## Umsetzung
Ein numerisches Gray-Scott-System integriert zwei Konzentrationen auf einem 112×96-Gitter über 480 Schritte. Das zweidimensionale chemische Feld beeinflusst Wandstärke und Höhe eines dreidimensionalen, räumlich verzerrten mehrskaligen Membranfeldes. Ein generischer Marching-Tetrahedra-Mesher akzeptiert beliebige positive Dichtefunktionen, interpoliert Nullstellen und erzeugt tatsächlich räumliche Grenzflächen. Die Tetraeder-Dichte bestimmt die Außenausrichtung. Gemeinsame Schnittpunkte werden in ein indexiertes Mesh verschweißt; dessen Flächen bestimmen die geglätteten Normalen. Farbe und Grenzzonen stammen aus der Chemie desselben Feldes. Die Szene enthält keine platzierten Ring-, Kugel-, Korallen- oder Sockelprimitive.

Die GPU-Animation ist eine kontinuierliche räumliche Verformung mit analytischer Jacobi-Matrix und korrekter Kofaktor-Normalentransformation. Sie verändert weder Netzkonnektivität noch chemische Konzentrationen. Das ist eine echte numerische Ausgangsfeldberechnung und geometrische Verformung, keine validierte biologische Simulation und keine laufende topologische Morphogenese.

## Verifikation
| Prüfung | Ergebnis | Beleg und Grenze |
|---|---|---|
| TypeScript | passed | npm run check |
| Automatisierte Tests | passed | npm test: 10/10 |
| Mesher | passed | Analytische Kugel: Radius, endliche Einheitsnormalen, Außenausrichtung; gemeinsame Kanten zweifach belegt; planare Nullstellen, leere Felder, Einmal-Abtastung, ungültige Eingaben und extreme Dichtewerte |
| Dünne Membranen | passed | Regression reproduzierte falsche Orientierung durch übergreifende Gradienten; lokale Tetraederorientierung behebt sie |
| Chemie | passed | Numerische Entwicklung gegenüber Anfangszustand, Reproduzierbarkeit, Seed-Unterschiede, endliche Konzentrationen, räumlicher Kontrast, kontinuierliches Feld, leere Außengrenzen |
| Weltintegration | passed | Räumliche Ausdehnung; Qualitätswechsel auf andere echte Geometrie; Wiederverwendung; Ressourcen genau einmal freigegeben |
| Produktionsbuild | passed | npm run build; JS 576,89 kB, gzip 147,30 kB; bekannte Größenwarnung |
| Diff | passed | git diff --check |
| Desktop | passed | Produktionspreview, Chromium 1440×900; rund 470.496 Dreiecke hoch, 200.704 reduziert bei Seed 42 |
| Animation | passed | Canvas bei Pause bytegleich; bei Wiedergabe geändert; Seed-Neugenerierung ändert gerendertes Bild |
| Bedienung | passed | Preset Aufbruch setzt Geschwindigkeit 1,6 und Deformation 1,25; Detailgrad ändert Dreieckszahl; Tastatur dreht/zoomt |
| Dialog | passed | Escape schließt Hilfe, Fokus kehrt zur Hilfeschaltfläche zurück |
| Mobile | passed | 390×844 ohne horizontalen Überlauf; Porträtprojektion erhält Weltansicht |
| Reduced Motion | passed | Animationsstart pausiert |
| Grafikfehler | passed | Verweigerter WebGL2-Zugriff: deaktivierte Wiedergabe, verständliche Meldung, geladenes Referenzbild |
| Kontextwiederherstellung | passed | Echter WEBGL_lose_context-Verlust, Hinweis, Wiederherstellung und erneute Seed-Erzeugung ohne Warnung/Fehler |
| Unabhängiges Review | passed | Chemisches Modell, Mesher, Weltintegration, Indexierung, Freigabe und Deformationsmathematik geprüft; keine verbleibenden P0/P1 im beauftragten Umfang |
| Veröffentlichung, weitere Browser, Axe/Screenreader, Referenzhardware-Profiling | not executed | Keine entsprechende Abnahme behauptet |

## Grenzen und nächste Arbeit
P0 0, P1 0; zwei nicht blockierende P2: Initiales Three.js-Bundle größer als 500 kB; synchrone Feldberechnung, Extraktion und Verschweißung können beim Start, beim ersten Detailwechsel oder beim Seed-Wechsel mehrere Sekunden den Hauptthread belegen. Worker mit übertragbaren TypedArrays ist die nächste sinnvolle Laufzeitoptimierung. Reduzierte Auflösung kann dünne Strukturen gröber abbilden; die Netzoberfläche ist eine endliche Approximation des Feldes. Der Begriff kontinuierlich bezieht sich auf das implizite Feld, nicht auf eine garantierte einzige topologische Komponente. Keine garantierten 60 FPS auf unbekannter Hardware.

Browserbilder: artifacts/field-final-desktop.png und artifacts/field-final-mobile.png. Temporäre Agentenevidenz: .agents/. Fachliche Grundlagen und Startanleitung: [START.md](START.md). Architektur und Ausbaustufen: [PLAN.md](../PLAN.md).
