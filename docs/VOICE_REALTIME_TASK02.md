# SpeakNow Task 02 — 实时语音交互

本轮只修改口语输入、请求、播放、字幕、状态和恢复流程。没有修改 AI 模型服务、评分算法、练习场景、数据库或历史记录结构。真实浏览器和麦克风验收尚未完成，下面区分已执行测试与未验证项目。

## 1. 原始链路审计

实际工程为 React 18 / Vite 6，使用现有 Three.js 和 Framer Motion。

原流程：点击录音 → 浏览器 SpeechRecognition（临时/最终转写） → transcript 字符串 → `/api/voice-chat` 完整 JSON POST → 服务器结构化模型响应/本地回退 → 文本消息 → 浏览器 SpeechSynthesis。开场白自动尝试播放，之后回复原先需要点击重播。

- 不是按住说话，也不是自动双向流式对话。
- 没有 MediaRecorder 文件上传；AI 接收文字，不接收原始录音。
- AI 音频不是服务端音频接口返回的文件，而是操作系统/浏览器语音合成。
- ASR 有真实 interimResults；AI API 返回完整 JSON，没有 SSE 或流式音频。
- 原自动发送依据转写事件的 420ms（final）/850ms（interim）计时，不是声学端点；自然停顿和临时词可能触发过早发送。
- 原 stopRecording 会立即移除结果回调，可能丢失 stop 后的最终识别结果。
- 请求只有文本/时间去重，没有 AbortSignal 和完整轮次身份；失败恢复、退出后的迟到回复和播放队列存在风险。
- 播放含每段固定 30ms 等待和段间 10ms 等待，取消依赖浏览器回调才能结束部分 promise。

## 2. 修改文件与实现

| 文件 | 改动 |
| --- | --- |
| `src/lib/voice/VoiceInteraction.js`（新增） | 单一外部状态存储、轮次锁、取消/重试、消息关联、自动播放、T1–T5、草稿保护、会话清理 |
| `src/lib/voice/VoiceCapture.js`（新增） | 权限、共享音轨、真实启动、最终结果回收、手动停止、原生重启、设备/超时错误和释放 |
| `src/lib/voice/endpointDetector.js`（新增） | 基于真实 RMS 的噪声估计、滞回、短噪声过滤和可选停顿端点 |
| `src/pages/VoiceChat.jsx` | useSyncExternalStore 读取统一状态；保留现有场景、消息、反馈、统计、结束/报告入口；按真实事件显示状态和测量 |
| `src/components/voice/RecordingControls.jsx` | 展示状态并委托操作；不再自己维护一套录音状态；固定字幕区域、临时/最终词、可选端点、取消和重试 |
| `src/components/voice/ChatMessage.jsx` | 当前页播放由会话管理；真实 Playing/Stop；等待期间限制冲突操作；兼容原独立播放调用 |
| `src/lib/audioManager.js` | 保留 SpeechSynthesis 及旧回调接口；新增事件订阅；立即取消并结算 promise；启动/播放 watchdog；去掉人为段等待和自动重复失败片段 |
| `src/lib/audioEnergy.js` | 从同一分析器提供原始 RMS；保留 Orb 平滑能量读取 |
| `src/lib/voiceOrbState.js` | 将统一交互状态单向映射到现有 Orb |
| `src/api/localClient.js` | 仅让既有 voice-chat fetch 接收可选 AbortSignal，POST 路径及 JSON 不变 |
| `src/types/globals.d.ts` | 原生 audiostart/audioend/abort 的相关类型 |
| `src/voice-room.css` | 字幕固定高度、输入选项、恢复操作及折叠的真实耗时信息；全部限定练习页 |
| `scripts/check-voice-interaction.mjs`（新增） | 实际控制器/采集类的连续轮次、竞态、端点、释放测试 |
| `scripts/check-voice-recording.mjs` | 旧组件内状态测试迁移；新增实际 React 控件和实际 localApi 取消传递验证 |
| `scripts/check-spatial-audio.mjs` | 适配立即取消与显式音频重试的更准确生命周期 |
| `scripts/measure-voice-latency.mjs`（新增） | 可复跑的修改前后前端等待对比 |
| `scripts/check-voice-realtime-browser.cjs`（新增） | DOM/WebGL/语音及网络模拟的五轮交互套件，未能执行 |
| `docs/VOICE_REALTIME_TASK02.md`、`docs/VOICE_REALTIME_LATENCY.json` | 实施、验收、原始测量记录 |

首页、学习/口语/演讲报告、Profile、历史页、场景定义、原始评分/存储函数和后端 voice-chat/模型代码与本轮开始时保持一致。未新增依赖。

## 3. 状态来源及 Orb 映射

只有 VoiceInteraction snapshot 是界面状态源；RecordingControls/ChatMessage/Orb 不控制语音业务。VoiceCapture 保存实际资源所有权，其事件驱动这个存储。

| 状态 | 真实触发条件 | Orb |
| --- | --- | --- |
| idle | 没有录音、请求或实际播放 | Idle |
| requesting_permission | getUserMedia 权限请求 | Idle |
| starting（内部） | 等待原生输入启动/重新连接 | Idle |
| listening | 原生 audiostart；共享路径也可由 onstart + 已实际存活的 owner 音轨确认 | Listening，使用真实能量 |
| stopping（内部） | 已调用 stop，尚未收到结束确认 | Processing，界面说明正在停止 |
| finalizing（内部） | 输入已结束，仍在等待识别结束和最终文字 | Processing，界面说明正在确认文字 |
| submitting | 采集已结束，确认文字进入本轮提交 | Processing |
| processing | 现有 fetch 等待完整响应 | Processing |
| speaking | 实际 utterance onstart/onresume | Speaking，无虚构音量 |
| completed | 用户结束当前练习，资源已清理 | 一次完成反馈 |
| error | 权限/设备/ASR/网络/超时/播放失败 | Error，停止不必要动画 |

语音结束/合法中断退出 Speaking。音频排队时只显示准备播放提示，不假装已经发声。AI 回复文本完成不等于 Completed。没有用计时器模拟 AI 处理进度；计时器只用于端点采样、真实等待的 watchdog 和现有计时显示。

## 4. 输入、字幕和语音结束

- 保留点击录音、点击停止/发送、重录和文字输入。
- 默认手动结束，不再通过转写事件的短计时自动发送。
- 自动结束为可选项，仅在已有共享音轨能提供真实 RMS 时可用；没有第二路为动画/VAD单独开启的麦克风。
- 噪声底自适应；开始阈值与退出阈值分开；150ms attack、至少350ms有效活动；多个短噪声不会累计成有效语音。
- 停顿默认2.5秒，可选择1.8/3.5秒。只据音频活动请求 stop；仍必须等待原生结束/最终结果，不能把 VAD 当成 ASR 已完成。
- 临时词不自动提升为最终词。若结束时仍未确认，会保留并填入可编辑文字，要求用户检查后显式发送。
- 原生识别重启复用音轨并拼接确认词；不丢掉未确认片段，不重复 getUserMedia；在重启间隙手动停止也会取消下一次启动。
- 字幕固定112px并内部滚动，最终词/临时词有明确材质和文字区别，避免每个 interim 结果改变控件位置。
- 最长录音默认120秒，达到后停止并保留文字待检查；原生启动 watchdog10秒；最终结果等待 watchdog3秒。都是可配置技术保护，不是虚假完成事件。
- Safari/mobile/不支持共享轨道输入的实现继续使用原生转写，但没有 RMS 自动端点和音量形变。保留 Task 01 的真实降级。

## 5. 轮次、取消、恢复和资源

- 用户消息、请求对象和播放 ID 对应同一轮次；反馈通过用户消息 ID 关联，不再查找“最后一条用户消息”。
- 同步锁防止按 Enter/快速点击重复发送；pending 请求锁防止并行轮次。未解决的权限提示也有独立锁，取消/快速重试不产生第二个麦克风请求，迟到音轨立即释放。
- AbortController 通过 localApi 到达真实 fetch；AbortSignal 与本地请求身份共同隔离迟到响应，即使 transport 没有及时取消也不会添入旧回复。
- 取消保留原用户消息；重试同一请求不新增第二条用户消息或重复统计。
- 默认45秒请求 watchdog（可配置）；网络 offline、HTTP/解析错误和超时均可重试，无刷新恢复。
- 后端返回现有 fallback 时保留本地指导，明确可恢复异常；重试可替换该轮本地回复。
- 播放统一管理；录音主动中断旧播放；播放失败不会移除文本，可显式重播或继续下一轮。
- 去掉每段30ms及段间10ms人为等待。失败片段不自动重复播放，避免已读部分被重复朗读。
- 权限拒绝、没有 live 音轨、输入设备改变、设备断开、ASR中断保留可编辑文字，并给出设置/重连/录音/输入恢复操作。
- 页面退出/卸载/pagehide 取消请求和合成，停止轨道，释放分析器，清理定时器及监听器；拒绝迟到回调。pagehide 后返回缓存页面可重新录音，未依靠刷新。
- 未发送/失败/待取消文字暂存在当前标签页的 sessionStorage，按当前练习配置隔离；它不是长期学习记忆，也不保存录音文件。成功提交并收到回复后清除草稿。存储实际不可用时界面明确提示复制文字，而不是假称已保存。
- 浏览器取消 fetch 不保证现有后端/provider 立刻终止计算；后端仍使用自己的超时，本轮没有改写它。

## 6. 延迟记录

T1来自实际采集结束确认；T2来自最终识别结束；T3是完整JSON返回的首个可用回复；T4/T5来自实际合成播放事件。文字输入没有T1/T2，关闭朗读/播放失败没有T4/T5，缺失值不填0。

当前页面的折叠 Response timing 显示实际事件的最终识别、请求响应、启动播放和播放时长。时间只保留在当前会话内，不写入评分报告。

执行了同条件的暖语音列表 SpeechSynthesis 模拟环境，每组5次，测量前端 T3→T4：

| 版本 | 平均 | 样本，ms |
| --- | --- | --- |
| 修改前 | 31.354ms | 31.825, 31.096, 31.413, 31.145, 31.293 |
| 修改后 | 0.299ms | 1.116, 0.051, 0.071, 0.218, 0.041 |

这是实际执行的受控 JavaScript/合成事件测试，只说明移除了前端人为等待，**不包含网络、云端ASR、真实系统TTS**。不能将0.299ms当作真实用户语音响应延迟。真实全链路前后数据未能采集，不能承诺固定网络延迟。

复跑（修改前文件快照需存在）：

```sh
SPEAKNOW_AUDIO_BASELINE=/tmp/speaknow-task02-before/src/lib/audioManager.js node scripts/measure-voice-latency.mjs
```

## 7. 实际验证

| 检查 | 结果及边界 |
| --- | --- |
| npm run build | 通过 |
| npm run lint | 通过 |
| npm run typecheck | 未通过；修改前36条、修改后35条既有错误，无新增。补充abort类型消除1条旧错误 |
| check-voice-interaction.mjs | 通过：执行实际控制器/采集代码，至少5轮、去重、播放事件、反馈身份、取消/重试/超时、迟到响应、最终ASR、音轨释放、噪声和VAD整合、时限、存储异常 |
| check-voice-recording.mjs | 通过：上述生命周期、实际React控件状态/动作/字幕渲染、取消传递到实际localApi fetch |
| check-spatial-audio.mjs | 通过：RMS、平滑/静音回落、兼容、初始化/释放、真实事件模拟的合成生命周期 |
| check-exam-standards.mjs | 通过，评分算法未改变 |
| check-expression-context.mjs / check-expression-practice.mjs | 通过，原表达练习回归 |
| check-spatial-render.mjs | 通过，原报告/时间轴数据渲染回归 |
| 新浏览器套件语法检查 | 通过 |
| Vite监听127.0.0.1:5173 | 被环境拒绝，EPERM |
| Chrome / 新浏览器套件执行 | 浏览器启动后SIGABRT，进程控制EPERM；没有执行浏览器断言 |

所有“真实麦克风、系统播放、实际浏览器DOM/WebGL/手机、真实后端连续5轮”的验收均未验证。五轮通过是控制器执行 + 网络/浏览器API模拟，不是物理麦克风录音。

### 可复现的人工验收（均未实际执行）

在允许监听端口和启动浏览器的机器运行 `npm run dev`，进入既有场景的练习页面。

1. 首次点击录音，拒绝权限。确认可读设置提示，文字输入仍可用。允许权限后重试，只有真实输入启动后显示Listening。
2. 默认手动模式说完整句子，中途停顿至少3秒。确认不会因临时文字或自然停顿自动发送；临时词逐渐转为确认词，字幕框不推动按钮。
3. 点击停止。确认先停止输入、回收最终词，再仅提交一次；请求期间显示Processing，允许取消。
4. 收到回复后，观察音频实际开始才显示Speaking，实际结束回到Idle。关闭朗读确认只出现文本；浏览器阻止音频时点击Play audio重试。
5. 连续至少5轮，检查每次用户/AI/反馈对应、无重复回复、各轮录音和播放都已结束。
6. 快速重复点击录音/发送/Enter；确认只有一个输入实例和请求。播放时开始录音，确认旧语音停止。
7. 在支持共享轨道的桌面Chrome开启自动结束。说话后短停顿、继续、长停顿；确认只在配置的语音停顿后请求停止，并等待ASR确认。制造短点击噪声，不应自动提交。
8. 请求期间断网、取消、恢复后重试；确认旧响应不出现，用户文字不重复、不丢失。
9. 录音时拔下/切换设备，确认资源关闭、文字可检查和重发。按120秒上限测试时限保护。
10. 等待/录音/播放时退出或导航；确认无残留声音/麦克风。返回同一练习配置，检查未发送草稿恢复。禁用存储，确认有复制提示。
11. 在390px/320px或真实手机验证输入、录音、取消和重试按钮完整可操作。
12. 结束练习，使用原报告保存及历史入口确认既有记录行为。查看Response timing，记录真实T1–T5可用阶段，不把缺失值当零。

自动化浏览器模拟套件（不会写真实用户数据）：

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-voice-realtime-browser.cjs
```

## 后端能力仍有的限制

- 不支持双向流式语音或流式AI文本；T3只能测完整响应。
- ASR依赖浏览器实现/其识别服务及网络，不保证所有浏览器实时返回确认词。
- Safari/mobile没有可共享的分析轨道时，保持手动结束及非振幅Orb反馈。
- SpeechSynthesis没有可分析的PCM输出；Speaking准确，但AI振幅同步仍不可实现且不伪造。
- 取消前端请求不等于取消服务端全部模型计算。
- 自适应RMS端点不是语义VAD，不能可靠区分所有背景人声/音乐；默认手动模式是兜底。
- 35条既有类型问题及真实设备/浏览器验收仍待解决。

未开发逐句纠错、长期学习记忆、新场景或额外3D内容。
