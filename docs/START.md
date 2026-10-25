# Morphogenesis Engine starten

Voraussetzung: Node.js 22.12+ oder 24+ mit npm und ein Browser mit WebGL 2. Installation im Repository: `npm ci`, anschließend `npm run dev`. Die ausgegebene lokale Adresse öffnen. `npm run check`, `npm test` und `npm run build` prüfen Typen, Geometrieverträge und Produktionsbuild. `npm run preview` zeigt den gebauten Stand. Für statisches Hosting den Inhalt von `dist/` ausliefern; bei Unterverzeichnissen den Vite-Basispfad anpassen.

Die SPA lädt keine externen Laufzeitressourcen, benötigt kein Backend und speichert keine personenbezogenen Daten. Die Szene wird deterministisch aus einem Seed generiert. Mausziehen dreht die Kamera, das Mausrad zoomt; Touch wird durch OrbitControls unterstützt. Die Oberfläche stellt zusätzliche Steuerelemente bereit. Bei bevorzugter reduzierter Bewegung startet die Animation pausiert.

## Umfang
Level 1 ist eine prozedurale 3D-Interpretation der Bildvorlage, keine pixelgenaue Rekonstruktion und keine biologische Simulation. Der Renderer nutzt WebGL 2. Level 2 (VAT/Baking) und Level 3 (WebGPU/Streaming) sind ausschließlich geplant; siehe ../PLAN.md. Die GPU-Leistung hängt vom Gerät ab. Das ursprüngliche Starterarchiv und die bestehende README bleiben erhalten.

## Architektur
`src/contracts.ts`: gemeinsame Verträge. `src/world.ts`: Geometrie und Animation. `src/viewer.ts`: GPU-Ressourcen, Kamera, Zeit und Resize. `src/ui.ts` und `src/style.css`: Oberfläche. `src/main.ts`: Integration. Die Anwendung hat eine einzige Ansicht ohne Router oder Serverzustand.

Technische Grundlage: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer), [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) und [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html).
