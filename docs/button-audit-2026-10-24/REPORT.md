# SpeakNow 按钮审计与考试双阶段重构

审计日期：2026-10-25。完整逐控件映射见 [BUTTON_AUDIT.md](./BUTTON_AUDIT.md)，原始清单见 [controls.json](./controls.json)。清单覆盖 `App.jsx` 可达的 40 个含交互的源码模块、297 处交互定义：150 处普通按钮、49 处 Router 链接、10 处原生链接，以及图标按钮、表单、输入、下拉框、媒体和详情开关。列表控件按定义计一处；每条运行时记录复用该定义。

## A. 按钮审计结论

完整表格逐项列出页面、当前名称、点击前状态、源码调用、点击后结果、处置和测试状态。重点操作如下：

| 页面 | 控件 | 点击前 → 实际动作 → 点击后 | 处置 | 验证 |
|---|---|---|---|---|
| 考试选择 | IELTS One question / Full practice set | 选择部分 → `/exam/prepare` 携带题号或整套参数 → 对应介绍页 | 保留 | 考试与题库浏览器通过 |
| TOEFL 题库 | 题组 / 单题入口 | 题组可选 → 传入稳定题目 ID → 对应介绍页 | 保留 | 题库浏览器通过 |
| 考试介绍 | Start Practice | 无草稿或已有草稿 → 创建/恢复练习并保存阶段 → 正式考试第一题或续练题 | 保留 | 考试浏览器通过 |
| 正式考试 | Play sentence / Listen again | 跟读题可播放 → 播放真实浏览器语音 → 解锁录音 | 条件保留 | 考试浏览器通过 |
| 正式考试 | Record answer / Stop recording | 未录音 → 真实 MediaRecorder 录制 → 停止并保存音频、生成转录 | 保留 | 考试浏览器通过 |
| 正式考试 | Record another take | 已有音频 → 确认后录新音频 → 新录音保存后替换当前草稿 | 保留 | 取消及权限失败验证通过 |
| 正式考试 | Next Question | 当前音频与文本有效 → 保存本题 → 下一题，不重返介绍页 | 保留 | 三题浏览器通过 |
| 正式考试 | Finish and get feedback | 最后一题音频与文本有效 → 持久化练习并请求真实反馈 → 反馈页或准确错误与重试 | 保留 | 双击、失败、重试、刷新通过 |
| 正式考试 | Save and exit | 草稿存在 → 结束录制并等待保存 → 选择页；历史可续练 | 保留 | 浏览器通过 |
| 反馈 | Retry feedback / Practise this focus / Try the same task again | 已保存结果 → 重试 API 或创建关联重练 → 原结果保留 | 保留 | 反馈浏览器通过 |
| 反馈 | Delete practice | 结果存在 → 打开确认 → 取消保留或确认删除 | 保留 | 反馈浏览器通过 |
| 管理后台 | API Key Save | 无真实保存服务 → 曾显示伪成功 | 删除 | 源码核对 |
| 正式考试 | Ready to answer | 无实际状态变化 | 删除 | 考试浏览器确认不存在 |

空 `onClick`、仅 `console.log`、无目标 `href="#"` 的源码搜索未发现。静态字面量 Router 路径均能在 `App.jsx` 中找到对应路由。内页锚点 `#video-moment`、`#answer-*`、`#improvement-*` 有对应条件渲染的目标。控件表中标为“源码检查；浏览器未逐项验证”的项目尚未在所有账号、设备和数据组合下逐一点击；不能将这部分视为端到端通过。

## B. 页面结果

- `/exam/prepare` 是独立介绍页。IELTS Part 1 显示标题、熟悉话题说明、三条操作步骤、明确标注为产品练习限制的单题 60 秒，以及一个 Start Practice 主按钮。选择单题或整套属于真实参数选择。
- `/exam/practice` 是独立正式考试组件。只显示题目、进度、需要的准备/录音/回放控件、计时、转录、提交及简短错误。未生成的数据不渲染空播放器或空转录。仅真实需要题目语音的跟读/模拟考和有音频资源的题目显示播放入口。
- 已移除考试页的 Ready to answer、转录评分教学、保存和登录推广、重复规则说明。必要故障仍显示，例如麦克风不可用、空音频、播放失败、无转录及保存失败。
- 开始后保存 `stage=exam` 与 `session`；刷新、浏览器返回、历史续练按保存状态恢复。完成的 `session` 重访进入已保存反馈，不会再当作草稿提交。多题直接进入下一题。
- 反馈页只在有文本时发起真实反馈；失败保留已提交练习和音频，显示 Retry feedback。原始识别文本 `rawTranscript` 与用户编辑的提交文本 `text` 分开保存。

## C. 实施与验证

核心修改：`src/pages/ExamPreparation.jsx`、`ExamPractice.jsx`、`ExamSpeaking.jsx`、`LearningReview.jsx`、`LearningHistory.jsx`、`src/lib/examSelection.js`、`src/lib/voice/AudioTake.js`、`src/App.jsx`、`src/learning.css`、`shared/speakingTasks.js`。全站控件整理涉及首页、导航、日常对话、演讲、历史、报告、管理后台的页面和录制组件；各文件的逐项动作与行号见审计表。审计生成脚本：`scripts/audit-controls.mjs`、`scripts/build-button-audit.mjs`。

验证结果：

| 检查 | 结果 |
|---|---|
| `npm test` | 工作副本 78/78、同步后的原项目 81/81 通过 |
| `npm run lint` / `npm run typecheck` / `npm run build` | 工作副本和同步后的原项目均通过 |
| `tests/learning/exam-audit-browser.mjs` | 10/10 通过，含真实 Chrome MediaRecorder 与伪麦克风、权限拒绝、快点、保存/刷新/返回/重练 |
| `tests/learning/bank-browser.mjs` | 4/4 通过，含题库、单题及 11 题模拟考 |
| `tests/learning/review-browser.mjs` | 9/9 通过，含反馈、同步、删除确认、重练与音频 |
| `tests/learning/browser.mjs` | 16/16 通过，含首页、各考试、日常对话、摄像头及移动端 |
| `tests/learning/daily-immersive-browser.mjs` | 场景、摄像头、反馈、重练、移动端通过 |

浏览器测试使用 Chrome 的伪设备、受控 ASR/TTS 和隔离 AI 夹具。真实物理麦克风、不同移动浏览器及外部模型/识别质量未验证；全站 297 处控件没有逐一进行人工点击。测试证据在同目录 `exam-results.json`、`bank-results.json`，以及 `docs/product-2026-10-24/browser-results.json`、`docs/review-2026-10-24/`。

## D. 强制检查

- [x] 代码可达的交互均进入逐项审计表，空事件/假链接扫描无命中
- [x] 核心按钮前后状态、调用链及主要跳转经浏览器验证
- [x] 介绍页和正式考试页是独立路由/组件；开始后不再出现操作教学
- [x] 正式考试只呈现题目、必要状态、操作和真实错误
- [x] 录音、转录、提交、反馈、历史及重练核心链路通过回归
- [x] 刷新、返回、快点、权限拒绝和反馈失败的恢复路径通过回归
- [x] 删除、替换录音等数据损失操作保留确认
- [ ] 所有 297 处交互在全部账号、权限、设备组合下逐一动态验证（当前仅完成源码映射和主要浏览器路径）

