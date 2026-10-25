# Morphogenesis Engine starten

Voraussetzung: Node.js 22.12+ oder 24+ mit npm und ein Browser mit WebGL 2. Installation im Repository: `npm ci`, anschließend `npm run dev`. Die ausgegebene lokale Adresse öffnen. `npm run check`, `npm test` und `npm run build` prüfen Typen, Geometrieverträge und Produktionsbuild. `npm run preview` zeigt den gebauten Stand. Für statisches Hosting den Inhalt von `dist/` ausliefern; bei Unterverzeichnissen den Vite-Basispfad anpassen.

Die SPA lädt keine externen Laufzeitressourcen, benötigt kein Backend und speichert keine personenbezogenen Daten. Die Szene wird deterministisch aus einem Seed generiert. Mausziehen dreht die Kamera, das Mausrad zoomt; Touch wird durch OrbitControls unterstützt. Bei fokussierter Szene drehen die Pfeiltasten die Kamera, + und − zoomen. Die Oberfläche bietet Wiedergabe, Geschwindigkeit, Deformationsstärke, Detailgrad, neuen Seed und Kamerareset. Bei bevorzugter reduzierter Bewegung startet die Animation pausiert.

## Umfang
Beim Erzeugen einer Welt wird ein seed-initialisiertes chemisches Gray-Scott-Reaktions-Diffusionsfeld auf einem diskreten Gitter numerisch iteriert. Das resultierende Konzentrationsfeld steuert ein räumlich verzerrtes Dichtefeld mit mehreren Größenskalen. Marching Tetrahedra extrahiert daraus die triangulierte Oberfläche eines kontinuierlich beschriebenen impliziten Volumens mit Poren und organischen Übergängen. Die Farbzonen kennzeichnen Bereiche dieses Feldes. Die Struktur wird aus dem Dichtefeld berechnet.

Die laufende Animation verformt diese Oberfläche räumlich auf der GPU. Geschwindigkeit und Deformationsstärke verändern diese Bewegung; der Seed berechnet das Ausgangsfeld und die Geometrie neu. Während der Wiedergabe wird das chemische Feld nicht weiter iteriert. Die Netzverbindungen bleiben erhalten, sodass diese Animation keine fortlaufenden topologischen Übergänge simuliert. Das numerische chemische Modell ist keine validierte biologische Simulation.

Der Renderer nutzt WebGL 2. Level 2 (VAT/Baking) und Level 3 (WebGPU/Streaming) sind weitere Ausbaustufen; siehe [PLAN.md](../PLAN.md). Die GPU-Leistung hängt vom Gerät ab. Das ursprüngliche Starterarchiv und die bestehende README bleiben erhalten.

## Architektur
`src/contracts.ts`: gemeinsame Verträge. `src/world.ts`: Integration von chemischem Ausgangsfeld, implizitem Volumen, extrahierter Oberfläche und GPU-Deformation. `src/viewer.ts`: GPU-Ressourcen, Kamera, Zeit und Resize. `src/ui.ts` und `src/style.css`: Oberfläche. `src/main.ts`: Integration. Die Anwendung hat eine einzige Ansicht ohne Router oder Serverzustand.

Technische Grundlage: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer) und [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html).

## Mathematische Grundlagen
Die diskrete Gray-Scott-Integration folgt den Reaktionsgleichungen und dem Neunpunkt-Laplace-Operator aus [Karl Sims: Reaction-Diffusion Tutorial](https://www.karlsims.com/rd.html). Die generische Oberflächenextraktion folgt dem Prinzip der sechs kompatiblen Tetraeder pro Gitterzelle, beschrieben in [Paul Bourke: Polygonising a Scalar Field Using Tetrahedrons](https://paulbourke.org/geometry/polygonise/). Die Anwendung implementiert diese Verfahren selbst; die räumliche Kopplung, Hüllkurve, Feldverzerrung und Materialabbildung sind projektspezifisch.

Die Initialberechnung und Oberflächenverschweißung laufen derzeit synchron. Beim Start, ersten Detailwechsel und Seed-Wechsel sind je nach Gerät Wartezeiten von mehreren Sekunden möglich. Eine Worker-Auslagerung ist noch offen; die Framerate nach der Erzeugung sagt nichts über diese Ladezeit aus.
