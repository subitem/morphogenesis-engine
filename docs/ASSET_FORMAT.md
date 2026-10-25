# MGE2 — Einzelzustand-Bake, Version 1

Kanonische Implementierung: [src/asset-format.ts](../src/asset-format.ts). Die Datei enthält einen einzelnen geometrischen Zustand mit Seed, Qualitätsstufe und chemischem Zeitpunkt. Sie ist kein vollständiger Sequenzcontainer und enthält keinen ausführbaren Inhalt. Alle Mehrbyte-Zahlen sind Little Endian. Es gibt keine Ausrichtungslücken zwischen den Datenblöcken; der Decoder verwendet DataView.

## Header: 96 Bytes
| Byte | Typ | Bedeutung |
|---|---|---|
| 0 | 4 ASCII-Bytes | MGE2 |
| 4 | uint16 | Formatversion 1 |
| 6 | uint16 | Headergröße 96 |
| 8 | uint32 | Encoding 1 |
| 12 | uint32 | Anzahl Vertices V |
| 16 | uint32 | Anzahl Dreiecksindizes I |
| 20 | float64 | Ganzzahliger Seed im uint32-Bereich |
| 28 | uint32 | Timeline-Index 0…11 |
| 32 | uint32 | Chemische Schritte = 480 + Index×96 |
| 36 | uint32 | Qualität: 0 reduziert, 1 hoch |
| 40 | float64 | Nichtnegative ursprüngliche Generierungsdauer in Millisekunden |
| 48 | 3×float64 | Positionsminimum X/Y/Z |
| 72 | 3×float64 | Positionsmaximum X/Y/Z |

## Datenblöcke
Ab Byte 96 folgen Positionen als uint16[3V], Normalen als int16[3V], lineare RGB-Farben als uint8[3V] und Indizes als uint32[I]. Exakte Dateigröße: 96 + 15V + 4I Bytes. Positionen werden je Achse auf das im Header gespeicherte Intervall abgebildet; ein konstantes Intervall verwendet Nullwerte. Normalen sind auf ±32767 skaliert und werden nach dem Lesen normalisiert. Farben werden auf 0…255 gerundet. Indizes bleiben verlustfrei.

Der ideale Positionsfehler je Achse beträgt höchstens Intervallbreite/(2×65535); die Rückgabe als Float32 fügt deren Rundungsfehler hinzu. Farbfehler höchstens 0,5/255 zuzüglich Float32-Rundung. Normalenfehler wird in den Tests numerisch geprüft. Quantisierung verändert die Netzkonnektivität nicht, kann aber bei sehr kleinen Flächen deren Geometrie zusammenfallen lassen; das Format garantiert keine verlustfreie Mikrotopologie.

## Validierung und Grenzen
Maximal 64 MiB Dateigröße, eine Million Vertices und sechs Millionen Indizes. V mindestens 3; I mindestens 3 und durch 3 teilbar. Der Header, exakte Dateigröße, finite Metadaten und Float32-darstellbare Positionsgrenzen werden vor den decodierten Attribut-Arrays geprüft. Gepackte Normalen müssen annähernd Einheitslänge besitzen, konstante Achsen kanonisch codiert und alle Indizes kleiner V sein. Unbekannte Versionen, Encodings oder Qualitäten werden abgelehnt. Vor GPU-Allokation wird der vollständige gepackte Inhalt geprüft.

Es gibt keine Kompression, Verschlüsselung oder Integritäts-/Signaturprüfung. Die Validierung prüft strukturelle Nutzbarkeit, nicht die wissenschaftliche Herkunft der gespeicherten Geometrie. Ein Import kann daher eine andere gültige Oberfläche mit konsistenten Metadaten enthalten. Die nachfolgende Timeline-Berechnung rekonstruiert aus dem gespeicherten Seed das projektspezifische Verfahren.
