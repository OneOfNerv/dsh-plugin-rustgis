# RustGIS for DeepSeek Harness

[English](README.en.md) · 简体中文

在 DeepSeek Harness（DSH）里处理矢量、遥感栅格、地形、水文和 LiDAR 数据。Windows x64 安装包内含 RustGIS CLI 0.6.0 和 GeoLibre runner 1.8.2，无需另装桌面 GIS。这个版本的运行时组合共加载 1,105 个地理处理工具，其中 1,062 个来自 GeoLibre。

## 安装

使用 DSH `0.2.2-rc.3` 和 Node.js 24.9 或更新版本。按下方「本地开发」步骤生成安装包后，在包所在目录运行以下命令。

```powershell
dsh plugin --profile web add ./dsh-plugin-rustgis-0.1.0.tgz
dsh web
```

如果 Web 使用自定义 profile，把 `web` 换成实际 profile 名。启用插件后，可在会话里输入“查看工作区里的 `dem.tif`，计算坡度，把结果另存为 `slope.tif`”。

## 工具

| 工具 | 用途 |
| --- | --- |
| `gis_search` | 按关键词查找 GIS 命令和算法，可限制返回条数 |
| `gis_describe` | 按 `kind` 和精确 `id` 查看参数 |
| `gis_run` | 加载本地 `data` 或 `project`，顺序执行 `steps`，可用 `save` 保存 `.rgis` 项目 |

每次 `gis_run` 创建一个独立 CLI 会话。要保留中间图层，可将多个步骤放在同一次调用，或保存项目后在下一次调用中载入。用 `share.exportLayer` 导出矢量，用 `share.exportRaster` 导出 GeoTIFF。参数中的相对文件路径基于 DSH 会话工作目录。CLI 的输出和诊断会随工具结果返回。若后续步骤失败，先前已导出的文件可能仍然存在。

例如，在工作区放入名为 `dem.tif` 的高程栅格后，用下列 `gis_run` 参数计算坡度。

```json
{
  "data": ["dem.tif"],
  "steps": [
    { "id": "gp.run", "params": { "tool": "geolibre:slope", "params": { "input": "dem" } } },
    { "id": "share.exportRaster", "params": { "layer": "Slope", "path": "slope.tif" } }
  ]
}
```

第三方 RustGIS 插件、桌面界面和凭据管理不属于这版的工具接口。部分数据格式仍依赖外部 GDAL 或 DuckDB。

已验证隔离的 DSH profile 可安装插件，并用原生运行时完成矢量缓冲、NDVI 和 DEM 坡度导出。DSH 对话中的沙箱执行和长任务取消仍待端到端验证。

## 本地开发

```powershell
npm ci
npm test
npm run stage:windows -- <rustgis-cli.exe> <geolibre.exe> <third-party-notices.txt>
npm pack
```

原生程序可从 [RustGIS v0.6.0](https://github.com/opengeos/RustGIS/releases/tag/v0.6.0) 的 Windows x64 portable zip 和 [GeoLibre v1.8.2](https://github.com/opengeos/geolibre-rust/releases/tag/v1.8.2) 的 Windows x64 runner zip 提取。第三方声明文件应包含两个运行时发布包的许可和第三方声明。`stage:windows` 检查可执行文件架构并记录 SHA-256，`npm pack` 会重新核对暂存文件。
