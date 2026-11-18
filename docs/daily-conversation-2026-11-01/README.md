# Daily Conversation 实现与验收记录

初次验收：2026-11-02；界面、账本与发布状态续更：2026-11-03。项目：`/Users/zhangzhuoru/Desktop/master/speaknow-audit`。
正常预览：[http://localhost:5173](http://localhost:5173)。正常前后端已重启，未替换其他工作副本。上一版已发布到现有 Vercel 生产项目；本次续更的发布状态、三步反馈和成本统计见 [续更报告](../product-refinement-2026-11-03/REPORT.md)。

**审计结论与机械对话问题**

当前活动入口是 `VoiceChat.jsx`；`DailyImmersiveGuidance.jsx` 只是复用入口。已有 DeepSeek SSE、语音状态机、录音、TTS、历史和本机 MediaPipe Worker，本次继续复用。

当前活动的在线对话路径本来就不是固定问题数组：固定文字主要用于场景开场。没有删除正常开场，也没有将备用模块的固定句子误报成当前线上对话的根因。当前系统已具备连续会话的基础；本次实际发现并修复的问题包括：

- 旧记忆算法按整条旧消息入选，长回答可能超过摘要预算而完全被跳过；重复句子还会占用摘要预算。现在按原话片段检索、去重，优先保留相关偏好、人物和更正，同时保留至少最近八条原始消息。完整历史仍在原来的 messages/turns 和草稿中保存。
- 原模型输入检查只允许 12000 字符，可能与保留近期长回答冲突；现在有受控的 36000 字符上限。结束反馈也使用带原始答案索引的有界证据抽样，避免长会话在反馈阶段直接超限。反馈仍只评价实际送入的原文。
- 场景任务容易影响反馈的评价方向。现在明确允许话题延伸，重练 focus 会送入对话上下文；反馈特别要求区分用户与 AI 的贡献，避免把 AI 记住细节误写成用户的表现。
- 之前的视觉链条只有 Face/Pose 代理和零散事件，缺少 Hand Landmarker、七维可用性、完整时间窗口，以及可供反馈严格引用的事件标识。
- 用户暂停时摄像头此前仍可能保持运行；现在暂停会释放摄像头和麦克风，恢复时按已选设置重新启动。
- 旧额度逻辑会在已开始的 Daily 会话中途拒绝请求，结算还把时长截在预留的 300 秒内。现在在新会话前检查准入，允许已准入会话正常收尾及生成反馈，按服务端时间结算实际时长。现有服务级预算、安全限制和两小时 reservation 生命周期仍然存在；这里没有承诺无限服务容量。

**修改的主要文件**

| 文件 | 实际改动 |
|---|---|
| `shared/conversationMemory.js` | 长历史原文检索、去重、近期上下文、可保存的 session/topic/context 字段；长会话反馈抽样 |
| `src/api/conversationStream.js` | 复用 SSE，并随结果保留 conversationContext |
| `api/voice-chat.js`、`api/_llm.js` | 角色、记忆更正、自然话题延伸、重练 focus、受控输入与回复长度 |
| `src/lib/voice/VoiceCapture.js` | 未完成短语的停顿宽限、ASR 网络重连、真实语音活动终点时间 |
| `src/lib/voice/VoiceInteraction.js` | 打断时保留已生成回复，分别记录 ASR/LLM/TTS/总体响应时间 |
| `src/lib/expressionVision.worker.js`、`expressionLandmarks.js` | 实际 Face/Pose/Hand 推理、可见动作与图像特征、阈值和缺失数据处理 |
| `src/lib/visionTimeline.js` | 每特征时间记录、持续事件、10秒统计窗口、七维可用性、恢复与推理性能记录 |
| `src/lib/dailyLiveMetrics.js` | 基于麦克风 RMS 的停顿和讲话间隔、含停顿的语速估计、转写中的重复词/重述标记 |
| `shared/dailyEvidence.js`、`shared/speakingTasks.js` | 根据 session/turn/时间关联证据，校验引用与原句，过滤不存在的事件及心理状态建议 |
| `api/speaking-feedback.js` | 真实语言反馈；可根据已有事件 ID 给出独立 delivery 建议；观察名称由已验证事件决定 |
| `src/pages/VoiceChat.jsx` | 暂停媒体释放、打断入口、额度提醒、上下文/视觉/证据保存，重练 focus |
| `src/pages/LearningReview.jsx` | Top 3、七维可用性、音视频时间重叠、原话、延迟详情和针对性重练 |
| `src/components/spatial/VoiceOrb.jsx`、Daily/learning CSS | 保留原 WebGL Orb，以小尺寸放在控制区，支持 Thinking 状态，不覆盖场景；检查短屏手机布局 |
| `api/_membership.js` | 复用现有 ledger，修复准入后中断与时长少计问题 |

新增了 `daily-multimodal.test.mjs`、`daily-evidence-browser.mjs` 和真实模型验收脚本；更新了连续语音、视觉和会员测试。没有新建第二套录音、TTS、LLM、会员或记录系统。

**视觉模型与七个维度**

使用现有 `@mediapipe/tasks-vision`，Classic Worker 中进行 VIDEO 推理。新增的 Hand Landmarker 官方模型约 7.5 MiB；Face/Pose/Hand、WASM 和 Worker 均由本机资源提供。模型来源与文件哈希见 [verification.json](verification.json)。

Worker 在后台处理真实帧；帧泵保留 busy 锁、超时、销毁和自适应采样间隔。Face/Hand 的检测、presence 和 tracking 阈值设为 0.65。SDK 没有暴露可校准的逐帧 Face/Hand 置信度，因此保存为 null，并记录阈值依据，不能把 0.65 冒充实测置信度。Pose 使用可见肩部的最小 visibility 作为可用信息。

| 维度 | 已实现的数据依据 | 本次真实摄像头采样 |
|---|---|---|
| Eye contact & gaze direction | 虹膜相对位置与头部朝向；仅大致方向估计 | 有有效样本；未验证精确眼神接触 |
| Head movement | 相对头部水平/垂直方向、倾斜、时间变化 | 有有效样本；未逐项配合动作验收 |
| Posture | 肩部对齐、可见躯干倾斜、头肩相对位置 | 有有效样本；遮挡/裁切特征分别处理 |
| Hand gestures | Hand Landmarker 的手腕轨迹，Pose 手腕作为有限备用 | 模型加载成功，实际采样未检测到手；Not assessed |
| Facial activity | 可观察的嘴部、眉部动作及变化范围 | 有有效样本；不推断情绪、性格或心理状态 |
| Camera presentation | 人脸位置、相对尺度、边界、亮度、对比度、边缘信息 | 有有效样本；没有物理距离或专业清晰度评分 |
| Visual consistency | 连续时间窗口中的头部、肩部、视线与手势变化 | 本次短采样不足两个有效窗口；Not assessed；连续窗口逻辑通过受控测试 |

每个数值记录 sessionId、timestamp、featureType、featureValue、confidence、availability 和关联 turn。短暂噪声需持续约 1.25 秒且至少4个样本才生成事件。全程10秒统计窗口保留，原始特征记录只保留最近6000条，防止无界内存增长；原始特征存 IndexedDB，localStorage 草稿只保存紧凑摘要。

本次实际摄像头读数例子（相对几何代理，无专业评分含义）：

| 会话时间 | 头部水平代理 | 头部垂直代理 | 肩部对齐代理 | 亮度 |
|---|---:|---:|---:|---:|
| 5.918 s | -0.0483 | 0.6763 | -0.0192 | 0.5284 |
| 13.915 s | -0.0387 | 0.6242 | 0.0041 | 0.5310 |

该采样没有产生持续动作事件，所以没有编造“用户低头”或“手势增加”。原始检测结果和窗口可在 [physical-camera.json](physical-camera.json) 中核对。

**音视频关联与反馈**

各类数据沿用同一 sessionId、turnId 与会话相对时间。停顿来自麦克风活动，视觉来自 Worker，文字来自确认的转写。只有确实重叠的时间段才标为 co-occurring；没有因果判断。

发送给反馈模型的是经白名单和原句校验的事件摘要，不是原始视频或人脸关键点。反馈引用的事件必须存在，原句必须匹配答案，输出的观察名称由系统重新取自记录，模型不能创建新的行为。发音、语调、清晰度没有通过文字猜测。本次未配置或验收 Azure 发音/语调服务，沿用已有声学评估入口，并明确显示未评估。

原始视频默认不录制、不上传、不永久保存。已有“保存本机视频片段”开关仍需用户主动开启。视觉原始特征与详细时间线保存在本机；只有经过校验的事件摘要随练习/反馈请求同步。

**真实模型测试**

[real-model.json](real-model.json)：直接使用生产 handler 和真实 DeepSeek，没有替换 fetch，也没有导入 mock。

- `deepseek-flash` 完成24轮，跨越饮品、旅行、素描、烹饪与日常习惯。
- 第20轮记住 Maya 和 Fridays；第21轮使用更正后的 Hangzhou；第22轮记住 mint tea 和咖啡使其清醒；第23轮记住每人800元预算。
- 启用了长历史摘要；完成开场交易后继续交谈；19/24条回复未以问号结束；指定的机械开场句计数为0。
- 首 Token：中位数638 ms，P95 921 ms。回复完成：中位数1259 ms，P95 1558 ms。这是模型文本链路时间，不能当成真实人声到 TTS 的总体延迟。
- `deepseek-v4-pro` 真实反馈返回200；针对用户与AI贡献混淆的问题更新了反馈指令并重新核查反馈。最终反馈以实际话题和用户原话为依据。
- 自然程度仍需要人工体验评价；上述检查不能代替主观听感。

**自动化与浏览器验收**

- 完整 `npm test`：168项通过，0失败。TypeScript、ESLint、生产构建均通过。
- [continuous-browser.json](continuous-browser.json)：连续3轮自动进入 Listening → ASR → LLM → TTS → Listening，保存真实生成的 MediaRecorder 媒体，暂停后媒体轨道释放，验证没有同时识别 TTS。ASR、TTS 回调、LLM 回复是受控 fixture；WebAudio、VAD、MediaRecorder、SSE、IndexedDB 为实际实现。这不是用户真人语音验收。
- [physical-camera.json](physical-camera.json)：实际物理摄像头12帧进入三个真实模型；人脸12个、上半身12个有效样本，手部0个。关闭摄像头后采样停止；没有视频片段上传或保存。
- 物理摄像头推理累计2007 ms/12帧，首次最慢728.4 ms；同时浏览器 RAF 帧间隔中位数/P95 均为16.7 ms，初始化后观测窗口没有主线程长任务。结果来自本机桌面Chrome，不能外推到所有手机。
- [evidence-browser.json](evidence-browser.json)：受控事件+生成的媒体 fixture，验证七维可用性、实际引用校验、音视频重叠展示、未测量延迟保持未评估、重练关系与 focus、320/390布局；页面运行错误为0。
- 手机截图：[320短屏](orb-controls-320.png)、[390屏幕](orb-controls-390.png)。反馈截图：[桌面](evidence-review-desktop.png)、[320](evidence-review-320.png)。

**仍未完成或不能宣称验证的部分**

- 没有完成真人对着物理麦克风说话的连续多轮 ASR/TTS 闭环，也没有真实人声总体延迟数据。现有自动语音循环已通过受控测试。
- 支持点击麦克风立即打断 TTS 并开始回答；没有实现在扬声器播放期间仅凭用户声音自动打断的可靠双工识别。
- 没有完成左右转头、低头抬头、身体倾斜、手势、离开/回到画面的逐动作人工验收；没有动作准确率数字。
- 没有完成同一次真人音视频回答的综合AI反馈验收。模型文本反馈是真实调用，跨模态关联和显示通过受控数据验证，不能混称完整真人验收。
- 视线、姿态、面部活动是有限视觉代理；没有情绪、心理、自信度、绝对眼神接触或专业相机距离评分。
- 发音和语调仍需真实语音评测服务配置与验收。没有用文字生成替代分数。
- 生产发布、后续测试数量和网络验证限制见续更报告；保留原来的考试、登录和历史流程。

**后续界面修正**

已移除答题页的隐藏句子说明、语音来源标签，以及聊天中的模型名和原始 fallback 原因。动态 Orb 已从场景中央移回控制区，移除场景上的渐变遮罩；桌面32px、320短屏26px，保留真实状态与音频响应。布局核查见 [orb-layout-fix.json](orb-layout-fix.json)。
