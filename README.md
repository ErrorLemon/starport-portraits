# Starport Portraits — Star Citizen Fleet Portrait & Nameplate Creator

Starport Portraits is an offline tool for creating Star Citizen fleet portraits and personalized pilot nameplates. Available for Android and desktop browsers, it includes 248 ship models and 494 transparent ship images, with scaling based on official ship lengths.

Import fleet lists from Excel, arrange ships in radial or compact layouts, customize titles, text, logos and backgrounds, and export images at up to 4K resolution. Your fleet data and projects stay on your device.

[Download the Android APK and offline desktop edition](https://github.com/ErrorLemon/starport-portraits/releases/latest)

An unofficial fan project. Star Citizen artwork and ship designs belong to their respective rights holders.

---

## 星港合影

开发：斯曼达洛舰队-Lemon_ACE

星际公民舰队全家福与个人名牌工具。电脑版和 Android 版均可离线运行，内置 248 个型号、494 张透明舰船图片，以及 3 张名牌背景。

## 下载与使用

到仓库的 **Releases** 页面下载：

- `starport-portraits-v版本号-android.apk`：Android 10 及以上，安装后打开“星港合影”。
- `starport-portraits-v版本号-web-offline.zip`：完整解压后打开 `index.html`。
- `SHA256SUMS.txt`：对应下载文件的 SHA-256 校验值。

全家福支持 Excel 导入、标准名称下拉模板、成员数量、统一比例、紧凑排列、Logo、自定义标题位置及字号、逐项说明开关和 4K 导出。个人名牌可选择舰船、自定义背景与 Logo。所有图片保留固定开发者署名。

成员、图片修改及工程保存在使用者的本地浏览器或应用内部，不会由本工具上传到 GitHub。换设备、清除数据或卸载前，请导出工程备份。电脑版帮助见 [使用说明](web/使用说明.md)，安卓帮助见 [安卓说明](android/使用与维护说明.md)。

## 维护项目

| 路径 | 用途 |
|---|---|
| `web/` | 电脑版源码、图库、背景、名称来源和第三方许可 |
| `android/` | Android 工程、触屏适配和原生文件保存 |
| `docs/舰队标准导入模板.xlsx` | 空白标准模板，供成员填写 |
| `tests/` | 舰船比例、紧凑布局、Excel 解析和模板检查 |
| `.github/workflows/check.yml` | 推送到 main 或提交 PR 后自动检查并生成测试版 |
| `.github/workflows/release.yml` | 更新版本文件、手动或版本标签触发正式发布 |

修改电脑版后执行：

```sh
python3 scripts/prepare_assets.py
python3 scripts/check_repo.py
node tests/test_compact_v04.cjs
node tests/test_excel_errors.cjs
node tests/test_standard_template.cjs
```

网页版的内嵌图片脚本和 Android 打包资源由上述命令生成，不提交重复的生成文件。更换舰船图片或资料后提交原始文件和元数据即可。首次从源码构建 APK 前也要先运行该命令；CI 会自动运行。构建环境为 Python 3.11 及以上、JDK 17、Android SDK 36、Build Tools 36.0.0，Gradle Wrapper 8.13。`android/gradlew` 已包含在源码中。首次配置构建依赖需要联网；安装后的软件运行不需要联网。

## 自动发布

首次设置见 [GitHub 发布配置](docs/发布配置.md)。更新 `release.json` 并推送到 main 后会自动构建、签名并发布对应版本。也可以在 **Actions → Publish release → Run workflow** 中填写版本号，一次运行完成签名 APK、网页版 ZIP、校验文件和 Releases 发布。也可以推送相同版本标签触发，例如 `v0.6.0`。

每次新版本都需要同步修改 `release.json` 的 version、`android/app/build.gradle` 的 versionName，并增加 versionCode。不能用旧标签重复覆盖已发布版本。测试 APK 使用不同包名和调试签名，不能替代正式版的覆盖升级。

本地保存文件后仍需提交、推送，GitHub 才会运行工作流。首次上传前或尚未配置签名 Secret 时，仓库里不会出现可下载的正式版本。

## 来源与许可

本工具为玩家作品。舰船素材及游戏背景的权利归各自权利人。中文名称、社区资料与第三方依赖的来源和许可见 [NOTICE](NOTICE.md) 及 [中文名称来源与许可](web/中文名称来源与许可.md)。不能把这些第三方素材视为本项目统一授权的原创素材。

源码仓库不包含私人舰队名单、已填写的 Excel、工程备份、安卓密钥或密码。
