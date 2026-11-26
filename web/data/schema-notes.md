# 数据约定 0.3

图库格式 `sc-fleet-library`，结构版本 `schema_version = 1`，程序 / 初始数据版本 `library_version = 0.3.0`。型号稳定键 `ships[].id` 采用 FleetYards slug，自定义键采用 `custom-UUID`；成员拥有记录通过此键引用，名称可修改。

`dimensions_m` 单位米，`dimensions_basis` 为 `rsi_detail_structured`、`rsi_matrix`、`manual` 或保留的第三方依据。默认官网详情长度；`sources.rsi` 同时保留详情和矩阵数值、官方 ID、日期、来源 URL 和页面 SHA-256。`official_conflict_axes` 记录相差超过 1% 的轴，不自动消除差异。第三方原值继续保存在 `sources.fleetyards / wiki`。

`assets` 对象通过 ID 引用，视角为 `top / angled`。`library.json` 不含二进制；`library.js`、完整图库备份、工程备份内含 `image_data[id] = data:image/...;base64,...`，不接受远程图片 URL。

每张图片的 `calibration` 包含：

- `reference_span_px`：对应舰长的素材像素跨度；初始俯视图为 Alpha ≥ 8 的轮廓 X 跨度。
- `reference_length_m / pixels_per_meter`：对应长度及建库换算值；引擎始终用当前 `ship.dimensions_m.length / reference_span_px` 计算，避免修改长度后沿用旧倍率。
- `crop_bbox`：原始素材像素坐标 `[left,top,right,bottom]`，右和下为开区间。
- `method`：`top_view_alpha_extent_x`、`angled_extent_approximation`、`manual_two_point` 或 `manual_reference`。
- `status`：`official_length_bound` 表示官网长度绑定，`approximate` 表示近似，`manual_reference` 表示人工参考，`unverified` 表示未建立有效关系。它们均不宣称全部 3D 几何已验证。
- `points`：人工两点原图坐标；斜视的两点仍不能解出相机透视。
- `flags`：官方数值差异、来源共享图像、轮廓长宽比异常。绘制时会根据当前长度 / 宽度重新检查轮廓比例。

图片的 Alpha、分辨率、哈希、来源与 `shared_with` 独立记录。透明通道或哈希检查通过，不代表型号外观、涂装、姿态已逐张人工核实。

工程格式 `sc-fleet-project`，`schema_version = 1`：`rows[{id,member,ship_id,quantity}]`、`positions[实例ID]={x,y}`、`locks[实例ID]`、`ppm`、`view`、字号、间距、标题、背景、队徽等。实例 ID 为 `拥有记录id:序号`，数量变化时保留已有实例的对应关系。导出工程包含 `library`，浏览器暂存的工程本体与图库暂存分开。

画布逻辑尺寸 2400 × 1350；导出 3840 × 2160。`ppm` 以逻辑画布像素 / 米记录。4K 输出统一乘 1.6；全体舰船共用此倍率，不允许逐艘独立缩放。两轴同倍率，保留图像比例。锁定记录约束位置，自动排布包含标签避让；缺图或缺比例不入画并报告。


中文名称：`names_revision=community-2026-10-21`。`ships[].community_name` 保留社区原始字符串、提取后的显示名、出处、提交、匹配方法与许可。`previous_seed_name / previous_seed_aliases` 只用于旧版升级，不作为本版名称来源或搜索别名。`name_zh_status=community_sourced` 表示显示名来自社区数据；用户修改中文名后标记 `name_zh_manual=true / name_zh_status=user`。社区俗称另有 `community_aliases` 来源记录。代码不把猜测的直译或拼写纠正自动作为新别名。

Excel 拥有记录在基本字段外增加 `member_id`（规范化 username）、`member_username`、`member_zh` 与 `import_sources[{sheet,row,column,original}]`。`row` 为 Excel 的一基行号，`column` 为零基列索引。拥有数量按真实单元格累计，稳定成员 ID 避免中文昵称碰撞；来源逐单元格保存。

工程 `excel_aliases` 记录使用者确认的名称对应关系，键使用 NFKC、大小写及空格/连接符标准化，值为型号 ID 或明确跳过标记 `__skip__`；`import_history` 保存文件指纹、工作表与列配置组合键、文件名、应用日期和数量。同一配置重复追加拒绝，显式替换可重新应用。解析器优先使用文件 SHA-256；不支持 WebCrypto 的环境以大小加 FNV-1a 指纹做重复提醒。名称对应与导入历史保存在工程备份，不进入图库备份。

表格输入是数据，不执行任何单元格指令、公式、宏或外部链接。实际单元格范围独立计算，以兼容源表 `!ref` 不完整；表格中的错误单元格和无缓存公式另行报告。全批校验后提交拥有记录；任意校验失败时不改当前工程。
