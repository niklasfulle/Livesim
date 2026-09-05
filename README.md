# LifeSim

LifeSim ist eine skalierbare Survival- und Lebenssimulation als Desktop-Anwendung. Sie wird mit Electron, TypeScript und Vite entwickelt und folgt einem testgetriebenen Entwicklungsansatz (TDD).

Im Mittelpunkt steht zunächst ein einzelner Bewohner, dessen Verhalten und Überlebensablauf schrittweise verfeinert werden. Später soll die Simulation auf größere Welten, mehrere Bewohner und umfangreichere Spielsysteme erweitert werden.

## Aktueller Funktionsumfang

- prozedural erzeugte, große Karte mit Gras, Sand, Wasser und kleinen Seen
- frei bewegliche Kamera mit Zoom per Mausrad
- Tag-Nacht-Rhythmus mit 15-Minuten-Simulationsschritten
- beschleunigte Nacht, sobald alle lebenden Bewohner schlafen
- Bewohner mit Bewegung, Fitness, Hunger, Gesundheit und Schlaf
- Erkundungsverhalten mit einem nach vorne gerichteten Sichtfeld
- begrenztes Gedächtnis für Gewässer, Bäume und Beerensträucher
- Sammeln von Holz, Pflanzen, Beeren und Fisch
- mehrschrittige Abbauaktionen und fehlgeschlagene Angelversuche
- Inventare für Bewohner und Haus
- Kochen von Mahlzeiten sowie Verderben von Ressourcen
- vollständiger Bewohnerlog in der Oberfläche und als lokale Datei
- schwebende, minimalistische Benutzeroberfläche
- Pixel-Art-Terrain und ausgerichtete Bewohner-Sprites
- Detailansicht für Bewohner und Patches

## Survival-Ablauf

Der grundlegende Ablauf eines Bewohners ist:

1. Nahrung aufnehmen und Vorräte prüfen
2. bekannte Ressourcen aufsuchen oder die Welt erkunden
3. Ressourcen sammeln
4. rechtzeitig zum Haus zurückkehren
5. Ressourcen einlagern und Mahlzeiten kochen
6. schlafen und Fitness regenerieren

Mahlzeiten werden gegenüber Beeren bevorzugt und sättigen den Bewohner vollständig. Beeren sind eine kleinere, direkt verfügbare Nahrungsquelle. Hunger steigt nachts langsamer an. Bei Hunger oder Erschöpfung verliert der Bewohner Gesundheit; bei null Gesundheit stirbt er dauerhaft.

Die detaillierten Regeln und aktuellen Einschränkungen stehen in [SURVIVAL.md](SURVIVAL.md). Zentrale Begriffe des Domänenmodells sind in [CONTEXT.md](CONTEXT.md) dokumentiert.

## Voraussetzungen

- Node.js
- pnpm 11 oder neuer
- optional: eine erreichbare SonarQube-Instanz

## Installation

```powershell
pnpm install
```

## Entwicklung

Die Anwendung im Entwicklungsmodus starten:

```powershell
pnpm dev
```

Dabei werden der Vite-Entwicklungsserver, der TypeScript-Compiler und Electron gemeinsam gestartet.

## Tests und Qualität

Alle Tests einmalig ausführen:

```powershell
pnpm test
```

Tests während der Entwicklung beobachten:

```powershell
pnpm test:watch
```

Coverage-Bericht erzeugen:

```powershell
pnpm test:coverage
```

TypeScript prüfen:

```powershell
pnpm typecheck
```

Das Projekt wird testgetrieben entwickelt: Neue Simulationsregeln und Fehlerkorrekturen erhalten zuerst einen fehlschlagenden Test, anschließend die kleinstmögliche Implementierung und danach ein Refactoring.

## Build

Renderer und Electron-Hauptprozess bauen:

```powershell
pnpm build
```

Die erzeugten Dateien landen im Verzeichnis `out/`.

## SonarQube

Das PowerShell-Skript führt zuerst die Tests mit Coverage und anschließend die SonarQube-Analyse aus. Der Token wird verdeckt abgefragt und nicht im Repository gespeichert:

```powershell
$token = Read-Host "SonarQube Token" -MaskInput
.\sonar.ps1 -SonarHostUrl "http://localhost:9000" -Token $token
```

Bei einem abweichenden Projektschlüssel:

```powershell
.\sonar.ps1 -SonarHostUrl "http://localhost:9000" -Token $token -ProjectKey "Livesim"
```

## Projektstruktur

```text
src/
├── engine/      Simulationslogik, Welt, Kamera und Ressourcen
├── main/        Electron-Hauptprozess und Bewohnerlog
├── preload/     sichere Schnittstelle zwischen Electron und Renderer
└── renderer/    Benutzeroberfläche, Canvas-Rendering und Texturen
```

Die Tests liegen jeweils direkt neben dem getesteten TypeScript-Modul.

## Status

LifeSim befindet sich in einer frühen Entwicklungsphase. Aktuell wird bewusst ein einzelner Bewohner perfektioniert, bevor mehrere Bewohner, ein Startmenü, Spielstände und weitere Simulationssysteme hinzukommen.
