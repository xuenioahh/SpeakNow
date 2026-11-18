# SpeakNow Daily Conversation 交付报告

审计开始于 2026-10-25，后续实现与验证延续至 2026-10-26。核心场景内对话链路已落地；原创风格化人物、基础动作与空间交互已完成。写实人物资源、真实外部 AI/语音服务及真人音视频的质量验收仍有明确缺口，不能把本报告理解为所有视觉和真人体验标准已经通过。

本轮完整浏览器验收基准保留在 `/Users/zhangzhuoru/Desktop/master/.speaknow-work/daily-world`，其 18 个核心文件哈希见 `final-source-manifest.json`。3D 改动已合并到主目录。最后复核发现主目录的 `src/lib/voice/VoiceInteraction.js`、`src/pages/VoiceChat.jsx`、`src/daily-immersive.css`、`src/api/conversationStream.js`、`api/voice-chat.js` 又加入了新的并行语音重构；这些后续变动没有纳入本轮完整浏览器矩阵，不应视为已通过同等验收。具体差异见 `main-workspace-status.json`，主目录静态检查与构建日志另列。

完整映射见 [逐场审计](AUDIT.md)、[36 个空间锚点原始数据](scene-audit.json)，画面对比见 [同镜头对比](comparison.html)。

## 场景与人物

全部 12 个现有场景、36 个原有任务均接入共用机制：Airport、Bank、Hotel、Restaurant、Shopping、Hospital、University、Office、Phone、Car Rental、Museum、Café。保留原任务目标和房间道具。

原人物不是照片 Plane，而是缺少肢体、关节与细节的简单实体；Restaurant、Museum、Car Rental、Phone 原先没有交谈人物。现在每个房间有三个固定、独立的角色实例。选择会话不移动角色、不显隐替换角色，也不搬动家具。

人物为原创程序化网格，17 根骨骼、按材质合并的 SkinnedMesh、完整四肢和鞋、立体头发、鼻耳眼睑与衣领。皮肤、头发、布料使用不同粗糙度；布料沿用程序化纹理。呼吸、眨眼、倾听、请求期间的思考姿态、真实播放期间的克制手势和结束回应由统一控制器驱动。Café 的朋友有实际椅子、桌子和旁边的侧窗，坐姿经过腿部落地调整。修复了下巴和上衣重叠导致的表面闪烁，并调整 Office 的闲置椅子，避免与站立角色重叠。

阴影随人物更新；保留环境照明、接触阴影、sRGB、ACES、设备像素比限制。增加右侧朝内墙面与踢脚线，补齐交谈视角的室内背景，俯视预览保留建筑剖面方式。

没有引入外部人物包，模型和动画无外部授权依赖。没有专业人物网格、表情 Blend Shapes 或音素资产；不能宣称达到写实人物质量。

## 镜头、字幕与实时对话

每个现有任务均有稳定 `sceneAnchorId`、站点、角色、姿态、位置、朝向、镜头位置与目标、前侧通行路径和交谈距离。镜头沿开放前侧移动；旋转和缩放限制在前侧，Home 在练习中复位到当前人物。响应式调整视场角，减少动态效果设置使用直接定位与按需渲染。

对话开始只修改同一路径的查询状态，原 Canvas、房间和人物实例持续存在。`/voice/chat` 不再按查询参数强制重建。摄像头与对话 UI 的状态更新也不重建场景。

字幕以世界坐标投影到当前角色附近；视锥和房间几何射线检测处理不可见与遮挡。提供人物旁、底部、隐藏三种模式。用户临时识别结果保留“unconfirmed”标识。移动端指标栏与字幕有不相交断言。

复用真实麦克风、录音、ASR、VAD、SSE、TTS 和会话历史。服务端角色提示包含当前任务、站点和具体情境；任务 ID 在重试中保持。保留等待回复时再次录音会取消旧请求的并行改进。语言分析独立返回，回复和语音无需等待分析完成；延迟反馈只补入对应用户回合，保持录音关联与说话状态。修复本地 Node 响应适配器缺少 SSE 写入与连接事件的问题。

浏览器 SpeechSynthesis：实际 utterance start/end 驱动说话状态，分段 start 文本驱动字幕；不提供虚构的声音能量或音素口型。

动态/已保存音频：实际 HTMLAudioElement 解码后接入 Web Audio Analyser 与 PannerNode。真实 RMS 只驱动当前角色的有限嘴部开合；相机位置、方向和人物位置更新声源与听者。结束、打断或退出时释放输出图。该机制是能量驱动的近似动作，不是音素级口型。动态 TTS 未提供逐词时间戳时显示整段短台词。

保留并行开发加入的固定语音库、动态 TTS、语音来源标识及语言分析；固定语音以文本哈希匹配，当前可访问清单包含 0 个已生成条目。不会把预录开场当作连续实时 AI 回答。

## 操作与导航核对

| 点击前状态 / 入口 | 动作 | 结果 | 验证 |
|---|---|---|---|
| `/voice` 场景列表 | 选择场景 | `/voice/prepare?scenario=…` | 保留现有入口，12 场景实际加载 |
| 场景内热点、可访问选择框 | 选择现有任务 | 同一房间移动镜头，正确角色与目标 | 36 个位置逐一测试；当前 NPC 面部无遮挡；重复选择不会卡在移动状态 |
| 准备完成 | Start Conversation | 同一路径增加 `stage=conversation` 与真实 cue | Canvas/房间 UUID 不变 |
| 正式对话 | Record / Stop | 真实媒体采集，保存本轮录音并提交确认文本 | Chromium 媒体 API 和可播放录音 |
| 等待或播放中 | 键盘、Record、Replay | 镜头可操作；Record 停止 AI 后采集；Replay 可停止播放 | 场景与录音测试 |
| 服务错误 | Retry this request | 保留原回复和任务上下文，重新请求 | 503 后重试测试 |
| 完成回答 | Finish & review | 保存音频、转录、反馈上下文，进入 `/practice/review?id=…` | 实际保存与音频播放 |
| 反馈 | Retry this conversation | 返回原场景与 cue，携带 parent attempt | 重练 URL、站位、第二次已保存记录及 parentId 测试 |
| 摄像头启用 | 关闭摄像头或 Exit | 停止采集、释放媒体，退出至 `/voice` | 视频轨道结束断言 |
| 低动态偏好 | 选题与移动镜头 | 直接定位、场景按需渲染 | 浏览器偏好测试 |

实时指标默认收起，仅有实际数据才默认显示对应行。摄像头预览、运动分析、本地短视频保存仍分别授权。保留原反馈、音频、视频证据筛选与保存机制，没有增加虚构评分。

## 修改文件

| 文件 | 主要修改 |
|---|---|
| `src/lib/conversationAnchors.js`、`immersiveScenarios.js`、`dailyTasks.js` | 全部任务空间配置、角色与情境，非法任务不回退到第一项 |
| `src/components/scene/createHumanoid.js` | 原创立体骨骼人物、材质、基础动作、真实能量嘴部动作 |
| `src/components/scene/buildRoom.js` | 三位固定角色、真实坐姿、室内背景、动态阴影与角色状态 |
| `src/components/scene/createScene.js` | 连续镜头、遮挡检测、字幕投影、空间声音位置、诊断与资源清理 |
| `src/components/ScenarioStage.jsx` | 持续场景生命周期、世界字幕、可访问热点与键盘复位 |
| `src/pages/VoiceChat.jsx`、`src/daily-immersive.css` | 场景内会话 UI、精简 Overlay、字幕模式、移动端遮挡修复 |
| `src/lib/audioManager.js`、`src/lib/voice/speechOutput.js`、`VoiceInteraction.js` | 原生播放事件、真实输出能量、声源图、动态及固定音频兼容 |
| `src/App.jsx` | 移除语音页面查询参数导致的强制重建 |
| `src/api/conversationStream.js`、`api/voice-chat.js` | 保留 SSE 与语言分析、情境身份及取消处理 |
| `src/lib/expressionLandmarks.js`、`expressionVision.worker.js`（主目录后续修复） | 区分缺少视频证据与真实处理帧未检测到人脸，避免没有视频时生成否定指标；新增边界测试 |
| `backend/server.js` | 转发 SSE 写入、flush、连接事件 |
| `vite.config.js`、`eslint.config.js`、`.gitignore` | 隔离 Vite 缓存，避免共享软链接依赖产生重复 React，排除生成缓存 |
| `tests/learning/conversation-anchors.test.mjs`、`conversation-feedback.test.mjs`、`daily-world-*` | 空间数据、全场景、媒体、重练、原生 TTS、性能与真实波形测试 |

## 验证结果与边界

主项目：99 项测试通过，类型检查、Lint、生产构建通过。完整日志在本目录。测试服务使用明确标注的上下文响应；录音、视频轨道、IndexedDB、账户保存和 SSE 走实际应用链路。测试专用预算独立设置，产品限流规则未修改。

- 全场景：三个固定人物、三个不同镜头、房间与 Canvas 身份保持、36 个任务各自读取；逐项检查当前人物面部无遮挡与重复选择后按钮可用。
- 对话：连续三轮、服务失败重试、保存与真实音频播放、反馈、第二次关联重练；模拟延迟的语言分析不会阻塞 NPC 回复，结果稍后补入正确回合。
- 移动端：390×844 布局、操作可达、无横向溢出、字幕与指标不重叠。
- 无障碍：字幕模式、键盘镜头操作、减少动态效果与按需渲染。
- 回放：显式停止和回放按钮已检查，并由归档基准的会话浏览器测试覆盖。
- 原生 TTS：真实浏览器原生语音的 start、boundary、end 事件通过；并非仅模拟回调。
- 音频输出：真实解码 PCM 测试波形通过 HTMLAudioElement、Analyser 和 PannerNode，仅驱动当前 NPC，结束后清空能量与音频图。验证的是输出机制，不代表外部 TTS 声音质量已通过。

具体结果见 `browser-results.json`、`session-results.json`、`audio-results.json`、`render-results.json`。已启用摄像头时直接退出的轨道清理也已验证。同视角图、原始修改前页面截图、36 个交谈点截图均保留，未用视觉演示代替开发。

## 未完成或未验证

1. 专业人物网格、细致面部表情、音素/Viseme 资产缺失。当前为统一风格的原创人物；没有完成写实角色验收。
2. 已登录账户保存使用隔离本地后端，未验证真实云服务。本轮没有用真实外部 AI/ElevenLabs 完成人类多轮语音评测。测试模型明确标注为 fixture；真实 ASR 准确性、外部模型质量及服务延迟仍需真人和已配置服务验证。
3. 语音采用逐轮录音/停止提交，可按 Record 打断播放；不是全双工、免按键的持续通话。
4. 摄像头预览与清理经过真实浏览器媒体 API 验证；运动分析保留原实现与测试。真人手势、姿态、典型视频片段，以及长期音视频分析与 3D 同时运行的质量没有本轮真人验收。
5. 动态音频的能量与空间音频节点用真实解码测试波形验证；外部服务 MP3 流、耳机感知位置、Safari/Android/iOS、弱设备帧率和长时间通话尚未验证。
6. 30 秒渲染稳定性与几何/纹理数量不增长只能说明本轮窗口内稳定，不等于长期内存泄漏已经全面排除。

7. 主目录仍有后续并行语音重构。浏览器验收基准是上述隔离目录，后续变更需单独完成集成验收。

## 性能测量

环境：Chrome 155.0.8059.86，1440×900，DPR 1，ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)。场景渲染循环以约 30 FPS 为上限。以下为本地开发诊断 Canvas 的采样，不是生产性能保证，也不包含真实模型服务延迟与长时间视频分析负载。不同场景分次测量，Shopping 的新视角与 Café 侧窗已补测。

| Scene | 修改前 FPS | 修改后 FPS | 修改后 JS 渲染更新 P95 ms | Draw calls | 三角形数 | JS 堆 MiB |
|---|---:|---:|---:|---:|---:|---:|
| cafe | 27.8 | 28.4 | 5.1 | 159 | 77118 | 13.8 |
| airport | 27.8 | 26.7 | 4.9 | 104 | 69430 | 22.9 |
| bank | 29.4 | 28.7 | 3.7 | 89 | 67448 | 17.5 |
| hotel | 28.7 | 28.3 | 3.6 | 126 | 77328 | 19.6 |
| restaurant | 28.9 | 28.4 | 4.2 | 92 | 71282 | 17.1 |
| shopping | 29.2 | 28.6 | 4.8 | 135 | 80104 | 20.7 |
| hospital | 28.9 | 27.4 | 8.9 | 84 | 70910 | 14.7 |
| university | 27.5 | 28.6 | 4.1 | 112 | 76690 | 19.0 |
| office | 29.2 | 28.6 | 4.3 | 122 | 76978 | 17.7 |
| phone | 29.0 | 28.6 | 3.9 | 125 | 78060 | 19.9 |
| car_rental | 29.0 | 28.7 | 3.3 | 79 | 68294 | 15.4 |
| museum | 29.3 | 28.8 | 3.7 | 84 | 66588 | 17.9 |

修改前静态场景在原实现中可能停止渲染；为比较渲染成本，诊断副本让双方保持相同的帧循环。JS 耗时是主线程更新与提交时间，不等于完整 GPU 帧耗时。JS 堆受垃圾回收影响；几何/纹理字段是资源数量，不是显存字节。

30 秒稳定性窗口中，房间实例保持不变，几何和纹理数量未增长：{"geometries": 142, "textures": 12}。原生 TTS 实际 start/end 通过。语言分析延迟不阻塞回复已用受控延迟验证，但没有真实外部 AI 的往返延迟数据。

本地自动检查与外部服务、真人验收的边界详见上一节。
