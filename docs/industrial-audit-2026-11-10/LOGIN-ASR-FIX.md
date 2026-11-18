# 2026-11-12 登录与语音识别补充修复

## 后续定位：用户确认 Daily 正常，考试口语仍失败

先前仅验证了 Daily，不能覆盖考试入口。`ExamPractice.jsx` 原先直接创建 VoiceCapture 并调用 start，从未调用 Daily 使用的本地转写准备逻辑；因此即使模型安装成功，IELTS/TOEFL仍进入浏览器SpeechRecognition并可能触发原来的结束超时。这是明确的集成遗漏。

修复：从现有 dailyTranscription.js 提取 prepareRecordedTranscription(capture, audioTake)，由 Daily 与 ExamPractice 共用真实录音转写逻辑。考试开始录音前查询能力、绑定当前题目/当前generation的AudioTake，再启动录音；异步准备期间离开页面不会启动旧录音。每次录音重新查询能力，避免长驻页面永久保留首次browser选择。没有改变题库、考试计时、评分或通过增大浏览器结束超时掩盖故障。

验证：`academic-asr-browser.json` 的IELTS、TOEFL两项实际浏览器录音/本地模型转写均PASS，零pageerror；测试将SpeechRecognition构造器设置为抛错，防止测试悄悄退回浏览器识别。输入为循环合成音频，TOEFL较长录音中的重复句来自该音频循环，不宣称真人识别准确率。IELTS推理1195ms，TOEFL5013ms。初次测试因TOEFL题库筛选值错误只完成IELTS，保留academic-asr-initial-selector.json，修正测试筛选后两项通过。

回归：198/198测试通过；lint、typecheck、build退出码均0。改动前没有将考试入口称为真实ASR已验收的依据；此前口头声称“整个口语链路修复”范围过大，本补充明确更正。

本记录更新 REPORT.md 中“本地ASR缺模型”的状态，不将本机修复等同生产上线。

## 登录

仅重置 speaknow-test@local.example 普通本机测试账号的密码，并撤销该账号旧session，保留用户、VIP和练习数据。随机新密码保存在权限0600的 data/testing-account.local；不复制到审计报告。

`node tests/learning/local-login-browser.mjs`：真实Chrome填写账号密码、提交表单、进入Membership、刷新后保持登录、显示本机无限测试权限，PASS。原有保存凭据此前也能返回HTTP200，因此没有证据将用户失败归咎于线上站点或已确定的密码迁移缺陷。重置是账号恢复措施，不是伪造一个已定位的登录代码根因。

## ASR根因及修复

1. `.local-asr/model/model.bin` 缺失，voice-capabilities 返回 browser。Daily退回浏览器SpeechRecognition；其stop之后未收到结束事件时，3秒watchdog触发用户报告的错误。不能仅凭此推断是权限、Google网络还是浏览器内部失败。
2. 下载已有worker指定的 faster-whisper-base.en 模型。官方站连接被重置，通过获准的hf-mirror固定revision `3d3d5dee26484f91867d81cb899cfcf72b96be6c` 获取4个模型文件，约138MiB模型权重。未执行模型仓库代码，未新增Python依赖。
3. 补齐模型后真实转写仍503；直接复现解码异常：faster-whisper 1.2.1 的 decode_audio 传入 metadata_errors，而已安装av 19.0.2的open不接受该参数。
4. `scripts/local-transcription-worker.py` 使用现有PyAV执行实际解码与单声道16kHz float32重采样，保留解码过程中130秒长度限制、输入大小限制、VAD及真实Whisper推理。不修改site-packages，不返回静态转写，不通过放宽超时隐藏问题。
5. 重启本机正常预览。voice-capabilities实际返回 transcription=local；已有Daily prepareCapture选择recording-only+本地转写，不再依赖浏览器SpeechRecognition结束回调。已打开的旧页面需完整刷新，以清除已缓存的browser能力选择。

## 证据

| 测试 | 实际结果 | 限制 |
| --- | --- | --- |
| local-asr-real.mjs | HTTP200；4.667秒音频，正确识别tea/sugar/train/coast；首次推理2834ms，整体4323ms | macOS合成语音，不是真人 |
| local-asr-browser.mjs | 真实Chrome MediaRecorder→本地ASR→真实DeepSeek全部通过；5.76秒音频，推理1280ms，模型回复关联茶和海边火车行程；零pageerror | Chrome文件麦克风、关闭TTS；不宣称物理麦克风/TTS验收 |
| 真实模型回执 | 本次对话330输入/39输出token，128缓存命中、202未命中 | 单次调用，不是生产性能保证 |
| Python语法 | py_compile通过 | 不替代真实推理测试 |

测试音频5.76秒包含文件麦克风开始循环后的第二个短句，转写保留该实际输入，而非测试脚本写死输出。证据分别为 local-asr-real.json、local-asr-browser.json。JS回归见asr-regression.log。

新增账号恢复脚本 scripts/reset-local-test-password.mjs 严格限定本机预期learner及local-testing entitlement，不重置其他用户。测试脚本不会上传私人录音。合成音频只提交localhost。

## 尚未完成

- 真人麦克风、环境噪声、不同设备、可听TTS与持续多轮真实语音仍需设备验收。
- 这是本机local-only Python worker；Vercel生产不能直接复用本机进程和模型路径。未部署，没有声称线上识别已修复。生产需要独立受鉴权的ASR服务及配置。
- 原生浏览器SpeechRecognition路径的结束事件超时仍保留，防止永久加载；本次解决本机识别依赖缺失和解码不兼容，不假称修复所有浏览器供应商故障。
- 长会话413、真实Supabase、支付商户和其他发布门禁仍见REPORT.md。
