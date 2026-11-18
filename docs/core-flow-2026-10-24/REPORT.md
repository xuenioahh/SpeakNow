# SpeakNow 核心流程重构与验收（2026-10-24—25）

本次将首页、TOEFL 题型、题库、准备、练习、反馈分成独立职责。已接入真实来源中的全部可核实题目，不再使用固定首题作为选题结果。原有录音、原始/确认转录、不可变练习记录、云端同步、关联重练和删除确认继续使用。

## 1. 页面结构

| 页面 | 真实路由 | 核心内容 | 入口与出口 |
|---|---|---|---|
| 首页 | `/` | 两张大面积可点击卡片：Exam Practice、Daily Conversation；历史/账户为次要导航 | Exam → `/exam`；Daily → `/voice` |
| TOEFL 题型 | `/exam` | Listen and Repeat、Take an Interview 两张同层级卡片 | 分别进入 `/exam/bank/repeat` 和 `/exam/bank/interview` |
| 题库 | `/exam/bank/:taskType` | 真实题组、实际题数、已练进度、搜索、来源类别、完成状态；可展开单题 | 整组/单题 → 对应准备页；有未完成记录时直接恢复相应练习（含已开始但尚未回答的会话） |
| 考前准备 | `/exam/prepare?taskType=…&setId=…&scope=…` | 题型、所选题组/题号、一句操作说明、时间和生成语音来源、一个 Start Practice | 写入或恢复指定范围的草稿后进入正式练习 |
| 正式练习 | `/exam/practice?…&session=…` | 当前题目/题号、播放、真实录音、计时、确认转录、Next/Finish | Next 保留同组顺序；Finish 保存后进入反馈；Save and exit 回对应题库 |
| 反馈/重练 | `/practice/review?id=…` | 原题、录音、转录、跟读差异、具体反馈、最多三项改进 | 重练当前题、当前组、针对建议重练、返回对应题库、真实前后比较 |
| 历史 | `/practice/history` | 实际练习和未完成草稿，显示对应题组 | 打开原记录或正确的题组/单题恢复链接 |
| Daily 场景 | `/voice` | 真实场景列表和已有难度选择 | 所选场景 → `/voice/prepare?scenario=…&mode=…` |
| Daily 准备 | `/voice/prepare?scenario=…&mode=…` | 该场景的真实会话目标、一个 Start Conversation；场景预览和相机选项按需显示 | 携带 scenario、cue、mode、相机选择进入已有 `/voice/chat` |

银行题目的选择参数为 `taskType`、`setId`、`scope=set|question`，单题同时携带稳定 `questionId`。`session` 绑定实际 attempt UUID。重练携带原 attempt 的 `retry` 和实际 focus。非法题号、跨组 questionId、题型不匹配都显示不可用状态，不回退到首题。

旧 `task=…&question=…` 链接仍可恢复历史样例和旧练习，包括现有 IELTS 记录；TOEFL 选择页没有混入 IELTS 或默认样例快捷按钮。

## 2. 真实题库导入报告

| 实际找到的来源 | 读取方式与结果 |
|---|---|
| `../语言/repeat真题参考.pdf` | PDFKit 提取，17 页；保留逐页原文和 SHA-256。识别 49 个题组 |
| `/Users/zhangzhuoru/Downloads/粘贴的文本 (1)(20260821-105335) (1).txt` | 49 个题组、340 句；与 PDF 交叉核对，去除分句斜线和排版换行，保留原始文本 |
| `/Users/zhangzhuoru/Downloads/粘贴的文本 (1)(20260821-105335).txt` | 与上一 TXT 完全相同的哈希，作为重复文件跳过 |
| `../语言/TOEFL Interview Speaking Practice Bank—精简终审版.docx` | 解析 Word XML 中的原始段落：77 个题组、288 道英文问题、288 条对应参考答案 |

| 统计 | Repeat | Interview | 合计 |
|---|---:|---:|---:|
| 有效题组 | 49 | 77 | 126 |
| 可练习题目 | 340 | 288 | 628 |
| 有参考答案 | 0 | 288 | 288 |
| 有来源原始音频 | 0 | 0 | 0 |
| 缺少来源原始音频 | 340 | 288 | 628 |

去重：跳过 1 个完全相同的 TXT 副本；合并 PDF/TXT 中 46 个完全相同题组、319 条重复句子。三个 PDF 提取错序题组另行记录并排除其 21 条错误提取条目，使用逐页核对后的配套 TXT；没有将错误提取当成新增题目。

异常与保留规则：

- Repeat 有 46 个七句组、3 个六句组，未补成统一七句。
- Interview 有 60 个四题组、11 个三题组、2 个两题组、3 个单题组、1 个八题组，保留原文件的日期、主题和题组关系。
- 一个问题带有嵌入的 `4-` 编号，展示时移除该编号，保留原始文本和异常记录；没有改写问题本身。
- Repeat 的 Amusement Park 来源日期确为 `2025-03-02`，保留原值；Interview 仅标月日，未自行补年份。
- `repeat真题参考(1).pdf` 未找到，无法核对该缺失副本是否含额外内容；没有声称导入了它。
- 所有题目都标为用户提供的第三方回忆练习材料，参考答案标为练习示例，没有宣传为 ETS 官方题目/答案。

详细数据见 `shared/question-bank/catalogue.json`、`import-report.json` 和 `sources/`。问题保留稳定 ID、题型、题组、类别、日期、组内顺序、原文、展示文本、参考答案、来源页/行、音频与可用状态。原始教学框架留在核对原文，不进入正式练习界面。

导入器为 `scripts/import-question-bank.py`，PDF 提取器为相邻 Swift 文件。成功发布前核对来源数量，使用原子文件替换；导入失败只写失败报告，保留已有可用题库。重复运行的目录和报告哈希一致，全部来源页/行定位已校验。

## 3. 按钮及导航审计

| 点击前状态 | 操作 | 点击后实际结果 | 验证 |
|---|---|---|---|
| 首页 | Exam 卡片任意位置/键盘 Enter | TOEFL 双题型页 | 核心浏览器 A |
| 首页 | Daily 卡片 | 场景列表 | 核心浏览器 A/E |
| TOEFL 类型页 | 两种类型卡片 | 各自真实题库；不播放、不录音 | 核心浏览器 A |
| 题库未选择 | 点题组主区域 | 正确 setId、整组 scope 的准备页 | Painting 整组、Health 整组 |
| 题组收起 | 展开并选具体题目 | 正确 questionId 的单题准备页 | Campus 第五句、Health 第二题 |
| 已有未完成记录 | Continue set / 单题 Continue | 保留 session、题号、已保存录音 | Campus 刷新/退出恢复、Interview 第二题恢复 |
| 大题库 | 搜索、类别、完成状态筛选 | 依据真实文本、类别和已提交题目过滤 | 核心浏览器 C |
| 准备页 | Start Practice，含双击 | 创建/恢复一个实际草稿，进入选定范围 | 核心浏览器 B/D |
| 跟读题未播放 | Play sentence | 播放所选原句的浏览器生成语音；成功后允许录音 | 两个不同真实题组、原生语音检查 |
| 播放失败 | 重试播放 | 准确错误；不把失败当成已听完 | 核心浏览器 D 异常 |
| 允许录音 | Record / Stop | 实际 MediaRecorder 音频、原始转录与确认文本保存 | 真实 Blob、可解码播放、独立 recordingId |
| 录音/转录异常 | 拒绝权限或无识别文字 | 相关错误、录音保留、可手动确认转录；不假完成 | 核心浏览器 D 异常 |
| 组内尚有下一题 | Next Question | 原组下一题；未到最后不显示 Finish | Painting 七句、Health 四题 |
| 最后一题/单题 | Finish | 保存正确 attempt，进入对应反馈；AI 失败仍保留回答/录音 | 核心浏览器 B/D、E |
| AI 生成中 | 重复点击 | 单次请求、按钮禁用、可访问状态通知 | 核心浏览器 D、Review 回归 |
| 反馈失败 | Retry feedback | 对当前原记录重试，成功显示有引用的反馈 | 核心浏览器 D |
| 反馈建议/指定回答 | 针对性重练 | 原 questionId、focus、parent attempt 均保留 | 选择绑定单元测试、Review 回归、第三句真实重练 |
| 单题反馈 | Practise the whole set | 原 setId、整组 scope、新关联 attempt | 核心浏览器 E |
| 反馈页 | Back to Bank | 返回原类型题库 | 核心浏览器 E |
| 已登录本地记录 | Sync / Retry sync | 先确认实际保存；失败不显示成功；云端重载真实音频 | 核心浏览器 E、Review 回归 |
| 删除入口 | Cancel / Confirm | 明确确认、保留关联依赖、实际删除当前记录 | 核心浏览器 E、Review 回归 |
| 已登录 | Sign out | 真正退出后，账户记录不向匿名用户展示，其他匿名练习仍在 | 核心浏览器 E |
| Daily 场景/准备 | 选 Hotel、难度、目标，Start | 携带真实 scenario、cue、mode 进入对话，不回到默认 Café | 核心浏览器 A/E |
| 浏览器导航 | Back / Forward / Reload | 正确选择、范围、录音和进度保持 | 核心浏览器 E |

## 4. 修改文件及重要逻辑

| 文件 | 修改 |
|---|---|
| `README.md` | 更新实际主流程、题库导入方式、音频来源和未部署状态 |
| `src/App.jsx` | 新增题库、考试准备、Daily 准备路由；练习组件身份包含真实选题范围 |
| `src/pages/MainLanding.jsx` | 首页双大入口；保留低优先级历史、账户和其他现有功能 |
| `src/pages/ExamSpeaking.jsx` | TOEFL 仅两种题型，不混入具体题目或默认首题快捷链接 |
| `src/pages/QuestionBank.jsx` | 整组/单题、真实数量、搜索/类别/状态、草稿恢复、账户与本地进度 |
| `src/pages/ExamPreparation.jsx` | 独立准备页、写入确认后开练、选择与原重练记录校验 |
| `src/pages/ExamPractice.jsx` | 动态 bank 选择、正确总题数、真实 questionId、指定范围恢复和返回、单主操作 |
| `src/pages/LearningReview.jsx` | 正确题目/整组重练、返回题库、提交后参考答案、原始转录、隐藏空能力模块 |
| `src/pages/LearningHistory.jsx` | 恢复链接包含准确选择、scope/session 和原题组名称 |
| `src/pages/Home.jsx` | Daily 真实场景列表；选择后携带场景和难度 |
| `src/pages/VoiceChat.jsx`、`src/voice-room.css` | 练习中按需预览场景，移除空白最小高度，使移动端录音操作在首屏可见；保留真实会话、场景与相机 |
| `src/pages/DailyPreparation.jsx` | 保留已有目标、场景与相机能力，将辅助预览/选项按需显示 |
| `src/core-flow.css` | 双大入口、题型、题库、准备、场景的响应式层级；提高作用域，防止通用标题样式覆盖 |
| `src/lib/examSelection.js` | 共用选题解析及草稿键，不默认回退首题 |
| `shared/questionBank.js` | 统一题库读取、题目绑定、路由生成、真实进度计算 |
| `shared/speakingTasks.js` | 新题库任务接入；set/question ID 验证；范围/完成状态；保留旧任务；跟读 Unicode 撇号处理 |
| `shared/question-bank/` | 可维护题库、来源原文、哈希、定位、重复/异常及音频状态 |
| `scripts/import-question-bank.py`、`extract-bank-pdf.swift` | 可重跑解析、验证、去重及原子发布，失败保护已有题库 |
| `tests/learning/question-bank.test.mjs` | 完整数量、真实内容、题组异常、选题防错、来源定位、进度、旧数据兼容 |
| `tests/learning/repeat-differences.test.mjs` | 跨位置增删、替换、词序、重复词、大小写、Unicode/撇号 |
| `tests/learning/core-flow-browser.mjs` | 核心 A–F 真实浏览器链路、异常、同步、删除、退出与响应式；原生语音模式 |
| `tests/learning/browser.mjs`、`review-browser.mjs` | 适配新入口与自动反馈；保留旧流程及 Review 行为回归 |

题库静态内容与用户 attempts/recordings/drafts 分离；没有用题库覆盖用户数据，也没有更换数据库或关闭 API 限流。

## 5. 实际验证与边界

以下检查均已在合并后的实际项目重新执行。已运行检查无遗留功能失败项：

- 单元/API：82/82 通过，见 `tests.log`。
- 类型检查、Lint、生产构建通过：`typecheck.log`、`lint.log`、`build.log`。
- 核心浏览器：`browser-results.json`，13/13 组通过。
- Review 回归：`review-browser-results.json`，9/9 组通过。
- 既有学习流程：`legacy-browser-results.json`，16/16 组通过。高速执行触发真实的每分钟 AI 限流时，保留保护规则、等待窗口恢复后通过页面重试。
- 原生语音：`native-speech-results.json`。真实 Chrome 语音引擎分别成功播放 Painting Class 和 Campus Tour Guide 的第一句，均收到开始/结束事件。
- 数据：`import-reproducibility.json`、`import-failure-check.json`。重复导入一致；缺少必需来源时不会发布部分题库覆盖旧数据。
- 截图：1440×1000 桌面、390×844 与 320×844 手机；包括首页、题型、两种题库、准备、正式练习、录音和反馈。实际核对了标题大小、主操作、键盘焦点、控件和横向溢出。

测试隔离账户与本地媒体 API；实际 MediaRecorder/音频解码使用 Chrome 假麦克风，ASR 和 AI 返回受控。字体网络请求在自动化中隔离，验证系统字体回退也可正常布局。原生语音另行使用实际浏览器引擎检查。

未验证或来源限制：

1. 缺失的 `repeat真题参考(1).pdf` 内容无法核对；只声明已导入可访问来源的全部内容。
2. 没有 ETS 原始题目音频，全部 628 道均准确标记为缺少来源音频，采用浏览器生成语音。
3. 没有人工试听评价所有生成语音、真人麦克风识别质量或生产 AI 教学质量；没有将文本对照说成发音/语调/停顿分析，也没有官方分数。
4. 保留原资料的不完整和八题组合，不自行补全、拆分或包装为官方题组。
5. 未部署线上或向真实账户写入练习数据。

工作区期间有并行修改反复改变同一页面。本次在 `.speaknow-work/core-flow` 中稳定验证，已按本任务要求合并回 `speaknow-audit`，并在全新隔离后端 8811 / 实际前端 5211 完成回验；未覆盖与本次流程无关的其他文件。最终文件哈希清单 `merged-files.json` 用于核对合并结果。

## 复现检查

普通检查：`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。浏览器脚本支持 `--origin` 或 `SPEAKNOW_TEST_ORIGIN`，避免使用其他会话的旧服务器。

工程测试后端（受控模型，仅供测试）：

```sh
BACKEND_PORT=8811 SPEAKNOW_ORIGIN=http://127.0.0.1:5211 node tests/learning/server.mjs
BACKEND_PORT=8811 npm run dev:frontend -- --host 127.0.0.1 --port 5211 --strictPort
node tests/learning/core-flow-browser.mjs --origin http://127.0.0.1:5211
node tests/learning/review-browser.mjs --origin http://127.0.0.1:5211
node tests/learning/browser.mjs --origin http://127.0.0.1:5211
node tests/learning/core-flow-browser.mjs --origin http://127.0.0.1:5211 --native-speech
```

以上测试服务器不作为生产 AI 服务；正常开发继续使用项目已有的真实后端配置。
