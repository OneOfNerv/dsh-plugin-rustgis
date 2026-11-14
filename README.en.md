# RustGIS for DeepSeek Harness

[简体中文](README.md) · English

Process vector data, remote-sensing imagery, terrain, hydrology and LiDAR from DeepSeek Harness (DSH). The Windows x64 package bundles RustGIS CLI 0.6.0 and the GeoLibre runner 1.8.2 and runs without a desktop GIS installation. This combination loads 1,105 geoprocessing tools, including 1,062 from GeoLibre.

## Install

Use DSH `0.2.2-rc.3` with Node.js 24.9 or later. Build the tarball as described under [Development](#development), then run these commands from the directory containing it.

```powershell
dsh plugin --profile web add ./dsh-plugin-rustgis-0.1.0.tgz
dsh web
```

If you use a custom Web profile, replace `web` with its name. Open a DSH session in your data workspace and ask it to compute a slope raster from `dem.tif` and export it as `slope.tif`.

## Tools

| Tool | What it does |
| --- | --- |
| `gis_search` | Search GIS commands and algorithms by keyword, with an optional result limit. |
| `gis_describe` | Look up parameters by `kind` and exact `id`. |
| `gis_run` | Open local datasets or a project, execute `steps` in order, and optionally `save` an `.rgis` project. |

Each `gis_run` starts a private CLI session. Keep dependent steps in the same call or save a project and reopen it in a later call. Use `share.exportLayer` for vector output and `share.exportRaster` for GeoTIFF. Relative paths resolve from the DSH session’s working directory. Tool results include CLI output and diagnostics. If a later step fails, files written by earlier steps can remain on disk.

With a DEM named `dem.tif` in the workspace, pass this request to `gis_run`.

```json
{
  "data": ["dem.tif"],
  "steps": [
    { "id": "gp.run", "params": { "tool": "geolibre:slope", "params": { "input": "dem" } } },
    { "id": "share.exportRaster", "params": { "layer": "Slope", "path": "slope.tif" } }
  ]
}
```

The plugin covers headless processing. Desktop UI, third-party RustGIS plugins and credential management are outside its tool interface. Some formats require separately installed GDAL or DuckDB.

We verified installation in an isolated DSH profile and ran vector buffer, NDVI and DEM slope exports using the native binaries. In-chat sandboxed execution and cancellation of long jobs still need end-to-end verification.

## Development

```powershell
npm ci
npm test
npm run stage:windows -- <rustgis-cli.exe> <geolibre.exe> <third-party-notices.txt>
npm pack
```

Extract the executables from the Windows x64 portable ZIP for [RustGIS v0.6.0](https://github.com/opengeos/RustGIS/releases/tag/v0.6.0) and the Windows x64 runner ZIP for [GeoLibre v1.8.2](https://github.com/opengeos/geolibre-rust/releases/tag/v1.8.2). Include both distributions’ licenses and third-party notices in the notices file. The staging script checks executable architecture and records SHA-256 hashes, which `npm pack` verifies before packaging.
