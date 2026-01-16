# Tauri + Vanilla TS

This template should help get you started developing with Tauri in vanilla HTML, CSS and Typescript.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

Tile Exports with GDAL:

```bash
gdal2tiles.py -p raster --xyz -z 0-6 --jpeg 80 -w none Xanadu-terrain-20250226.png Xanadu-terrain-20250226-tiles

gdal2tiles.py -p raster --xyz -z 0-5 --jpeg 80 -w none Independence-terrain-20250226.png Independence-terrain-20250226
```

Copy Files to R2 (with config) with RClone (needs R/W perms in access token)

```bash
rclone copy Xanadu-terrain-20250226-tiles wurm-map-tiles:wurm-tiled-maps/xanadu/2025/terrain --progress --transfers 16 --checkers 16 --fast-list

rclone copy Independence-terrain-20250226 wurm-map-tiles:wurm-tiled-maps/independence/2025/terrain --progress --transfers 16 --checkers 16 --fast-list
```
