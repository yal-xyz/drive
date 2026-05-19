# GPX Track Map

A local-first Vue app for loading GPX files from a folder, viewing tracks on an interactive Leaflet map, and exporting the visible tracks as a clean PNG image.

## Run

```powershell
corepack pnpm install
corepack pnpm run dev
```

If this machine's package-manager shim gets in the way, run Vite directly:

```powershell
.\node_modules\.bin\vite.CMD --host 127.0.0.1 --port 5173
```

Then open <http://127.0.0.1:5173>.

## Build

```powershell
.\node_modules\.bin\vue-tsc.CMD -b
.\node_modules\.bin\vite.CMD build
```

## Notes

- `Choose Folder` uses the browser directory picker when available and falls back to a directory file input.
- Only GPX tracks (`trk`, `trkseg`, `trkpt`) are parsed in this version.
- `Export PNG` exports visible tracks only, without basemap tiles, using `drive_{folderName}_{timestamp}.png`.
- Display settings can switch between per-track colors and one shared track color. Lower opacity makes repeated or overlapping routes build up visually.
