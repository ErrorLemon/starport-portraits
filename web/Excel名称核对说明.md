# Excel 名称核对说明

已按你提供的主表格式完成兼容测试。此文件仅列出名称问题，不包含成员资料。

原表：舰队数据.xlsx，工作表「舰队舰船明细」。读取 147 行成员记录、19 位填有舰船的成员、81 个舰船单元格；空舰船行 128。空格、大小写变体合并后共 50 种名称。

自动识别 37 种名称，其余 13 种（共 16 艘）在导入预览中需要明确选择或跳过。下方候选只是程序检索结果，不能代替你确认原意。

| 表格原名 | 数量 | 候选英文型号（最多三项） |
| --- | ---: | --- |
| 开拓 | 1 | Pioneer |
| 野马 | 2 | Mustang Beta；Mustang Gamma；Mustang Alpha |
| 货轮е | 1 | Hull E；Hull A；Hull B |
| 锐伧 | 1 | Railen |
| 星座天鹰座 | 1 | Constellation Mk IV Aquila；Lynx；Scorpius |
| F8C 闪电民用 | 1 | F8C Lightning；F8C Lightning Executive Edition |
| 阿波罗 医疔 | 1 | Apollo Medivac；Apollo Triage |
| 缇伦 | 1 | Railen；Syulen；Tyilui |
| 白阿波罗 | 1 | Apollo Medivac；Apollo Triage |
| 货b | 1 | Hull B |
| 半人马星座 MK V | 3 | Constellation Mk V Centaurus；Constellation Mk IV Aquila；Constellation Mk IV Andromeda |
| 双鱼 C8X | 1 | C8X Pisces Expedition；C8 Pisces；C8R Pisces |
| 极光 MK I | 1 | Aurora Mk II；Aurora Mk I CL；Aurora Mk I ES |

特别注意：

- “野马”与“极光 MK I”存在多个变体；“白阿波罗”是颜色叫法，不能直接据此确定医疗型号。
- “货轮е”末字是西里尔字母 е，外观很像英文字母 e；程序只在候选检索时考虑该混淆，仍要求确认。
- “半人马星座 MK V”候选为 Constellation Mk V Centaurus，不会混作 Mk IV 仙女座。
- “锐伧”“缇伦”“阿波罗 医疔”等存在字形或写法差异，不能只凭相近字自动认定。
- “激光鲨”已通过中文社区资料核对为 Tiburon 的俗称，已加入有出处的搜索别名。

操作：进入成员页 → 导入 Excel 名单 → 确认工作表及列 → 逐一选择待确认名称 → 查看成员预览 → 选择追加或替换 → 确认导入 → 保存工程备份。
