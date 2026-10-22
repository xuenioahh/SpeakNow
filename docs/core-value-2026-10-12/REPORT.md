# SpeakNow 核心价值验证与闭环修复报告

后续工程修复与最新验证见 [2026-10-13 进度报告](../repair-progress-2026-10-13/REPORT.md)。本页关于真人效果与商业证据不足的结论仍然成立。

2026-10-12。本机当前工作区，尚未部署到生产环境。结论：**工程闭环已修复并验证；真实学习效果与商业价值尚未验证。Next Investment Decision：Not Ready。**

## 1. Core Loop Status

| 环节 | 状态 | 实际依据 |
| --- | --- | --- |
| Setup → Start Practice | PASS engineering | 新账户能以主题、核心观点、结果和听众开始；不要求 PDF |
| Recording | PASS engineering | 实际 Chrome MediaRecorder，生成音频与受控 ASR；不等于真人语音识别准确性验证 |
| 中途退出 / 重新进入 | PASS engineering | 录音中退出释放音轨；用户/尝试隔离的本机草稿恢复文字和录音 |
| 保存网络失败 | PASS engineering | 保存已被服务端接收但响应丢失后，刷新、重试保持同一个尝试 |
| 录音上传网络失败 | PASS engineering | 响应丢失后重复上传同一录音 ID 不新增副本，不覆盖原始内容 |
| 有附件 | PASS engineering | 实际有效 PDF 解析/预览，录音、保存、反馈；没有用模拟 PDF 解析器替代 |
| 附件失效 | PASS engineering | 无法加载的 PDF 可直接继续无幻灯片录音，不阻断练习 |
| Analysis → Feedback | PASS engineering | 实际认证/所有权/接口/校验/存储，受控合成 provider 输出用于工程路径；真实模型语义质量 NOT VERIFIED |
| Feedback → Retry → Comparison | PASS engineering | 不带附件的定向重练、刷新恢复目标、保留原始录音、建立独立尝试和比较 |
| 比较任务一致性 | PASS engineering | 服务端要求核心观点、目标、听众类型与听众描述保持一致；其他听众视角不能伪装成同一任务的进步 |
| Improvement | NOT VERIFIED | AI Improved 已明确标成模型比较，不是独立学习效果或能力提升证明 |

用户可完成约 5 分钟的纯口头演讲任务，定向重练目标约 30–60 秒。测试为短录音以验证工程，不声称完成了真人 5 分钟教学试验。没有新增市场、AI 角色、动画或公开产品页面。

### 实际测试

- 39 项 Impact 证据、独立评测流程、缺失评分与安全/所有权测试通过，0 失败：[单测日志](artifacts/unit-results.log)。
- 八项完整浏览器检查通过，0 未捕获错误：[浏览器记录](artifacts/browser-results.json)。
- 无模型密钥的实际接口，在桌面/手机两种视口返回 503，同时保留保存、回放、历史和重新进入：[无模型结果](artifacts/no-model-browser-results.json)。没有用 mock 成功代替不可用状态。
- ESLint、TypeScript、生产构建通过；既有录音状态/取消/重试回归与考试尺度参考检查通过。
- 浏览器核心流程与真实模型不可用路径使用隔离测试账户/目录；未修改真实用户库，未产生付费模型调用。

首次执行中的失败已纠正：测试服务器绑定权限、PDF 网络拦截过宽、有效 PDF 并发加载竞态，以及新增上传测试误排在破坏存储的故障测试之后。没有把失败运行记成通过。PDF 文本提取和预览现在共用加载承诺；并发调用不会把“脚本已存在”误认为“脚本已加载”。

## 2. Evidence of Value

### 已确认的工程事实

- 准备、录音、保存与恢复无需附件。
- 上下文、尝试、录音属于同一用户，并保留前后关系。
- 无可支持优先级时明确显示 **No strong improvement priority identified**，不补造问题。
- 原句引文、解释、目标、听众影响和可改善程度进入提示与展示；优先级本身仍是模型建议。
- 新的口语报告不再从字数/问句数输出 Pronunciation、acoustic Fluency 或总考试分数；缺失分数不会再转换为零。
- 旧的随机 Live Score 面板替换为测量边界说明；旧演讲 API 的数值输出被隔离，准备与反思输出也明确标注建议来源。
- 历史原始记录保留。非 measured 来源不会作为个人能力进步曲线依据。

| 输出 | 本轮处理 |
| --- | --- |
| 录音、保存时间、浏览器计时 | 显示来源；计时不当作表达效果评分 |
| 转写 | 标记为识别/提供的文字，提示对照录音检查；不宣称转写绝对准确 |
| 原句摘录 | 校验来自提供的原文，不把引用存在当成诊断正确 |
| 主问题、听众适配、比较结果 | AI Coaching Suggestion / AI comparison |
| Pronunciation、声学流利度、肢体/眼神、能力提升数值 | 没有声学/行为依据时不生成新的能力评分 |
| 模型不可用 | 明确失败与恢复入口，不生成假成功报告 |

### 尚未获得的价值证据

当前研究目录中没有已授权真人样本、独立教练评分、真实拒绝/购买或成熟 D7 队列。这里的零条记录表示**本轮未采集到研究证据**，不表示整个产品没有用户。

- 真人 Before/After：未采集。
- 专家独立优先级选择与盲评：未采集。
- AI 与 Human 的实际一致率：未知。
- 真人口头表达改善：未知。
- 用户反馈、激活率、D7、真实付费率：未知；空分母输出 null，不造比例。

[当前人工结果](evaluation/current-human-report.json)、[当前指标](evaluation/current-metrics.json)明确保留 Not Ready / 无分母，而非写成已验证。

### 已建立的可执行评测

[完整研究协议](EVALUATION_PROTOCOL.md)和 `scripts/core-value/` 支持：

1. 仅导出已授权用户的实际前后录音，私有文件和假名 ID，不扫描无关账户。
2. 原始演讲优先级盲包包含有建议与无建议案例；不强制真人填问题。
3. 前后比较随机 A/B 顺序，隐藏 AI 判断；至少两个独立评价者评清晰度、听众适配、说服力与可行动性。
4. 先锁定人工比较/优先级，再揭示模型；发现数据、顺序、评分事后变更时拒绝。
5. 输出人工偏好、四维变化、分歧、AI Improved 的人工支持情况和优先类别一致情况；不把类别相同误当作正确诊断。
6. 独立读取真实完成、重练、成熟 D7 和三档价格的购买/拒绝记录；模拟付款与购买意愿不能计入实际购买。

协议、模板和空数据流程已执行；没有声称已完成招募、发送邀请、教练评价或收款。实测仍需要参与者/评价者安排、服务端模型配置和真实支付渠道。

## 3. Remaining Risks

- **模型语义质量：** 新提示和运行时约束没有经过真实模型/独立教练校准。句子引用真实仍可能有错误优先级。
- **真人语音与设备：** 真实口音、噪声、Safari/iOS、长录音识别准确性未完成验收。
- **效果归因：** 一次前后改善也可能来自重复练习；更强的归因需要预注册、相同时间/次数的对照与新任务迁移。
- **样本偏差：** 主要效果数据暂排除纯文字和未独立校对的混合文本；需保留排除原因，避免只评价转写效果好的用户。
- **数据保护：** 未提交录音暂存本机，按用户/尝试隔离但不是加密保险箱；研究音频/文字不因换成假名就自动匿名，分享需要明确授权。
- **附件依赖：** PDF 仍使用既有 CDN。预览不可用时有口头继续路径，不能宣称 PDF 在所有网络均可预览。
- **商业验证：** 当前没有实际试点报价、渠道交易、拒绝原因或可用留存队列。仅有记录和核查流程。

## 4. Next Investment Decision

**Not Ready。** 工程原型的闭环能够执行，但尚未证实“SpeakNow 帮助目标用户改善一次重要表达任务”。不选择 Prototype Validated 或 Early Product Market Fit。

### 三方复评：51 → 55 / 100（暂定）

这仍是基于本机证据的模拟产品评审，不是用户能力分或学习效能测量。使用上一轮相同权重；仅因为实际修复和验证调整可用性/工程风险，真人效果、需求、市场与数据壁垒不加分。

| 视角 | 之前 | 本轮 | 修改理由 / 仍缺什么 |
| --- | --- | --- | --- |
| User Value | 47 | 52 | 完成路径与退出/失败恢复更可靠；长期使用与支付仍未知 |
| Expert 总评 | 52 | 56 | Engineering 5→6、UX 6→7；AI 5、创新 6、竞争 4 不变 |
| Technical Excellence | 53 | 60 | 沿用 AI/Engineering/UX 等权；真实服务与设备仍需验证 |
| Market Potential | 60 | 60 | 收敛国际大学生与 5 分钟任务，没有新的市场数据 |
| Investment Attractiveness | 45 | 46 | 风险项 2→3，仅反映已修核心阻断；实际付费、留存与团队数据仍未知 |
| Final | 51 | 55 | User 30%、Technical 30%、Market 20%、Investment 20%，使用未取整数值 |

用户四 Persona 的可比评分只把 Learning Experience 与 Ease of Use 各提高 2 分，表示流程可完成，不表示学习质量已提高；其余分数不变。四 Persona 对比只为沿用旧量尺，本轮产品仅聚焦国际大学生。

要升级到 Prototype Validated，下一步必须完成真实模型连接、已授权目标用户任务和独立专家盲评；要讨论早期 PMF，还需要实际重复使用和购买/续用。

## 主要代码

- Presentation / PresentationPractice / PresentationCapture：无附件主路径、可选预览、草稿恢复、同尝试保存。
- presentation-media / storage：重复上传可恢复且不替换已保存录音。
- presentation-practice / ImpactReport：固定目标和听众，原记录/重练/模型比较边界。
- pdfText / DocumentViewer：共用 PDF 加载，失败不阻断口头训练。
- MainLanding / AuthPage / ImpactSetup / Profile：目标用户和 5 分钟任务文案。
- feedbackEvidence / localReports / VoiceReport / LiveScorePanel / 旧演讲输出：删除/隔离无依据的能力数值。
- scripts/core-value：真实授权导出、独立盲评、锁定、使用/购买记录处理。

本轮未部署、未迁移或删除真实用户历史，未引入新模型、AI 角色、动画、公开页面或新的支付功能。
