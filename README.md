# RustGIS for DeepSeek Harness

[English](README.en.md) · 简体中文

`dsh-plugin-rustgis` 是面向 Windows x64 的 DeepSeek Harness（DSH）插件。它以 RustGIS CLI 为地理处理核心，集成 GeoLibre runner，让 DSH 在对话中查找 GIS 算法、读取工作区数据、执行多步分析，并把结果导出为文件。

## 项目目标

让 DSH 在一次会话中组织从数据检查、算法选择到结果交付的 GIS 工作流。以一批 DEM 为例，DSH 可以先检查输入数据、查询坡度算法及其参数，再按区域执行分析、导出 GeoTIFF，最后根据工具结果核对输出文件。RustGIS CLI 负责读取数据、运行算法和写入文件，GeoLibre runner 提供扩展算法，DSH 把这些操作串成可检查、可继续执行的步骤。

### 长线任务执行

`gis_run` 为单次调用声明 30 分钟的超时预算，可按顺序执行 1–32 条 RustGIS 命令。在同一次调用中，下游命令可以直接使用前面生成的中间图层，例如计算坡度后立即导出。对于耗时较长或涉及多批数据的任务，可以按区域、数据批次或处理阶段拆成多次调用，用导出的文件或可重新打开的 `.rgis` 项目衔接。某批次失败后，可以根据诊断修正输入或参数，从已有产物继续处理。

插件将 DSH 工具调用的取消信号传给原生子进程。当前任务以会话中的工具调用为单位推进，跨调用继续执行依赖已落盘的产物。后台排队、自动重试和断点恢复属于后续可扩展的方向。

### DSH 会话可观测性

GIS 操作通过 DSH 的工具调用和结果进入会话记录。回看调用参数，可以核对输入文件、算法 ID、运行参数、步骤顺序和计划导出路径。执行成功时，`gis_run` 返回工作目录 `cwd`、标准输出 `stdout`、标准错误 `stderr` 和输出截断标记 `truncated`。原生进程异常退出时，工具错误会包含退出码或信号，以及可用的诊断文本。用户和 DSH 可以据此定位问题并决定下一步。

当前可观测性以工具调用和返回结果为粒度。原生进程的输出在调用结束后返回，实时进度与逐步状态是后续可扩展的方向。DSH 对话中的沙箱执行和长任务取消仍待端到端验证。

## 主要功能

| 场景 | 可以做什么 |
| --- | --- |
| 矢量分析 | 查看图层和属性表，筛选要素，执行缓冲区等空间分析，再导出结果图层 |
| 遥感与栅格 | 处理影像波段，计算 NDVI 等指数，导出 GeoTIFF |
| 地形与水文 | 对 DEM 计算坡度，查找流向、汇流等水文分析算法 |
| LiDAR | 查找 GeoLibre 提供的点云处理算法，并查看各算法支持的输入和参数 |
| 多步工作流 | 在一次调用中接续使用中间图层，也可保存 `.rgis` 项目供后续调用读取 |

## 为什么在 DSH 里使用 RustGIS

- **对话负责组织步骤，GIS 引擎负责计算。** DSH 可以根据自然语言请求查找算法、读取参数定义，再将明确的命令和参数交给 RustGIS CLI。数据处理和文件导出由原生运行时完成。
- **可以无界面运行。** 安装插件即可获得包内运行时，无需另装桌面 GIS。相对路径以 DSH 会话的工作目录为基准，工具结果会返回 CLI 输出和诊断信息，便于定位输入、参数或导出问题。



## 安装

需要 Windows x64、可在终端运行的 DSH `0.2.2-rc.3`，以及 Node.js 24.9 或更新版本。已有 `dsh-plugin-rustgis-0.1.0.tgz` 时，可直接安装。只有源码时，按[本地开发与打包](#本地开发与打包)生成安装包。

在安装包所在目录打开 PowerShell，运行以下命令。

```powershell
dsh --version
node --version
dsh plugin --profile web add ./dsh-plugin-rustgis-0.1.0.tgz
dsh web
```

如果 Web 使用自定义 profile，把安装命令里的 `web` 换成实际名称。打开 Web 会话后，将工作目录设为存放数据的目录。可以先发一条请求确认插件能加载算法目录。

> 请用 GIS 工具搜索 `geolibre:slope`，并查看它需要哪些参数。

## 工具接口

| DSH 工具 | 参数与用途 |
| --- | --- |
| `gis_search` | 按 `query` 搜索 RustGIS 命令和地理处理算法。默认返回 20 条，`limit` 会限制在 1–50。可用英文关键词如 `buffer`、`ndvi`、`slope`，也可直接搜索 ID。结果含匹配总数、`kind` 和 `id`。 |
| `gis_describe` | 用搜索结果中的 `kind`（`command` 或 `tool`）和精确 `id` 查看参数定义。 |
| `gis_run` | 通过 `data` 打开本地数据，通过 `project` 打开已有 `.rgis` 项目。按顺序执行 1–32 个 `steps`，每步包含命令 `id` 和可选的 `params`。可通过 `save` 指定要保存的 `.rgis` 项目路径。 |

`command` 是直接放进 `steps[].id` 的 RustGIS 命令，例如 `share.exportRaster`。`tool` 是地理处理算法，例如 `geolibre:slope`，通过 `gp.run` 命令执行。此时外层 `params` 包含 `tool`（算法 ID）和内层 `params`（算法参数）。

每次 `gis_run` 启动独立的 CLI 会话。依赖中间图层的步骤应放在同一次调用中，或者先保存项目，再在后续调用中载入。使用 `share.exportLayer` 导出矢量图层，使用 `share.exportRaster` 导出 GeoTIFF。后续步骤失败时，已经导出的文件可能仍保留在磁盘上。

### 示例：从 DEM 计算坡度

将 `dem.tif` 放入 DSH 会话的工作目录，然后在对话中输入：

> 读取工作区中的 `dem.tif`，用 GeoLibre 计算坡度，并将结果导出为 `slope.tif`。

对应的 `gis_run` 参数如下。第一步生成 `Slope` 图层，第二步将它写入工作目录。

```json
{
  "data": ["dem.tif"],
  "steps": [
    { "id": "gp.run", "params": { "tool": "geolibre:slope", "params": { "input": "dem" } } },
    { "id": "share.exportRaster", "params": { "layer": "Slope", "path": "slope.tif" } }
  ]
}
```

## 本地开发与打包

在插件仓库根目录安装 JavaScript 依赖并运行测试。

```powershell
npm ci
npm test
```

准备 `rustgis-cli.exe`、`geolibre.exe` 和一个汇总两个运行时许可与第三方声明的文本文件。以下示例假定三个文件都放在仓库根目录下的 `.runtime-build` 中。可执行文件分别来自 [RustGIS v0.6.0 的 Windows x64 portable ZIP](https://github.com/opengeos/RustGIS/releases/tag/v0.6.0) 和 [GeoLibre v1.8.2 的 Windows x64 runner ZIP](https://github.com/opengeos/geolibre-rust/releases/tag/v1.8.2)。

```powershell
npm run stage:windows -- ./.runtime-build/rustgis-cli.exe ./.runtime-build/geolibre.exe ./.runtime-build/third-party-notices.txt
npm pack
```

`stage:windows` 检查可执行文件是否为 Windows x64，将其复制到 `native/win32-x64/`，并记录 SHA-256。`npm pack` 会先校验暂存文件，再生成 `dsh-plugin-rustgis-0.1.0.tgz`。

## 调试与排查

### 单独检查原生运行时

在仓库根目录运行以下命令，确认 RustGIS 能列出命令，并加载包内的 GeoLibre 算法目录。

```powershell
$env:RUSTGIS_GEOLIBRE = (Resolve-Path ./native/win32-x64/geolibre.exe).Path
./native/win32-x64/rustgis-cli.exe commands --no-plugins
$tools = ./native/win32-x64/rustgis-cli.exe tools --no-plugins | ConvertFrom-Json
$tools | Where-Object { $_.id -eq 'geolibre:slope' }
```

最后一条命令应返回 `geolibre:slope` 的目录记录。若没有返回，核对环境变量指向的 runner，以及两个可执行文件的版本和架构。

### 在 DSH 中验证插件

安装刚生成的包并重启 DSH Web，在会话中依次搜索 `geolibre:slope`、查看参数、执行上面的 DEM 示例。修改工具注册和参数声明时看 [`src/index.js`](src/index.js)，排查命令拼装、工作目录和进程输出时看 [`src/runtime.js`](src/runtime.js)。

| 现象 | 检查项 |
| --- | --- |
| 会话中找不到 `gis_search` | 检查安装和启动是否使用同一个 profile，Node.js 是否为 Windows x64，以及安装后是否重启了 DSH Web |
| 缺少可执行文件或校验失败 | 检查 `native/win32-x64/`，使用正确版本的原生文件重新执行 `stage:windows` 和 `npm pack` |
| 报未知命令、算法或参数有误 | 用 `gis_search` 获取精确 ID，再用 `gis_describe` 核对参数。算法 ID 应传给 `gp.run` 的 `tool` 字段 |
| 读不到输入或找不到输出 | 核对 DSH 会话工作目录、文件名和沙箱读写权限。查看结果中的 `cwd`、`stdout` 与 `stderr`，或失败时返回的进程诊断 |

已有验证覆盖隔离 DSH profile 中的插件安装，以及使用原生运行时完成矢量缓冲、NDVI 和 DEM 坡度导出。DSH 对话中的沙箱执行与长任务取消仍待端到端验证。
