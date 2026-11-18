# SpeakNow 雅思题库接入 · 2026-10-29

本地已完成。首页 Exam Practice → IELTS，或直接打开 `/exam/ielts`。正常开发预览为 http://localhost:5173/exam/ielts 。本次未部署到线上。

## 内容和入口

| 部分 | 话题组 | 题目 / 提示卡 | 地址 |
| --- | ---: | ---: | --- |
| Part 1 | 47 | 362 | `/exam/bank/ielts-part1` |
| Part 2 | 36 | 39 | `/exam/bank/ielts-part2` |
| Part 3 | 28 | 134 | `/exam/bank/ielts-part3` |

共 535 道题。沿用托福的搜索、分类、练习状态、整组/单题、录音回放、原始和确认转录、草稿恢复、反馈、历史及关联重练。话题名称提供中英检索。Part 2 显示当前选中的提示卡，提供准备笔记、60 秒准备和 120 秒作答；有来源讨论题的话题提供 Part 2/3 双向链接。来源参考答案及其他范例只在完成作答后显示。

Part 1、Part 3 分别使用 60/90 秒的单题练习上限。官方各部分按整体计时；本功能是题库练习。Part 2 的一分钟准备和最多两分钟作答依据 [IELTS 官方考试说明](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking)。反馈继续沿用现有转录文本分析，不新增官方分数或声学发音判断。

## 来源核对

- `2026 9-12 Part 1 新题+老题.pdf`，9 页。
- `9-12月雅思口语题库更新_20260907174139.pdf`，69 页。
- 保留页文本、OCR 和按位置提取的审计快照；每道题保存来源文件标识及页码。保留原资料的措辞和拼写。只合并规范化后相同的重复项，131 次；措辞或提示卡不同的版本继续可选。
- 修复高亮区域导致的提取漏字。资料中两个 `TBC` 占位项不导入。
- 完整版第 12 页礼貌题混入鞋子题及答案，已排除错配条目，没有补写答案。
- 第 44 页手工题的括号在原 PDF 中已截断，练习显示完整主句；原始文本保留用于追溯。
- 原文只有中文的 12 道讨论题保留中文提示，提示用英文回答；没有替它们虚构英文题目或播放英文朗读。
- 两份资料对新题/保留题分类不一致的同一话题保留多个分类，均可筛选。

导入结果见 `shared/question-bank/ielts-catalogue.json`，导入报告见 `shared/question-bank/ielts-import-report.json`。运行 `python3 scripts/import-ielts-bank.py` 可从保存的页文本复现，内容哈希一致。

## 实现与验证

雅思通过现有 bank selection、任务校验、录音存储、反馈接口和重练路由接入。托福的 126 组 / 628 道题保持可用，旧雅思样例链接继续支持。另修正单题朗读应使用所选题号，以及 Part 2 完成准备时必须先保存、再允许录音。`profileRecords.js` 的可选 `userId` 参数补上 `undefined` 默认值，消除原有类型检查错误，运行行为不变。

最终检查：

- `npm test`：115 项通过，0 失败。
- `npm run build`、`npm run lint`、`npm run typecheck`：全部通过。
- 雅思浏览器检查：6 组通过，覆盖非首题选题、筛选、真实 MediaRecorder 录制、保存恢复、准备笔记、准备/作答计时到期、参考答案、关联重练、Part 3 整组、非法跨组选题、中文原题和 320/390px 页面。
- 原有托福浏览器回归：4 组通过，覆盖双题型、题库、录音、反馈、重练与 11 题自动模拟。
- 导入可复现检查通过；结果见 `reproducibility.json`。

浏览器使用 Chrome 的模拟麦克风、受控语音识别/朗读及隔离后端模型数据，验证功能和真实录音容器；未验证实体麦克风、外部语音识别或在线模型质量。测试后已关闭隔离服务，并通过 `npm run dev` 启动正常本地服务。

结果保存在 `browser-results.json`、`tests.log`、`build.log`、`lint.log`、`typecheck.log` 和页面截图中。初次发现的准备状态刷新问题截图保留为 `initial-preparation-refresh-failure.png`，最终复测已通过。既有文件差异见 `implementation.patch`；修改前文件保存在 `../.speaknow-backups/ielts-20261029`。
