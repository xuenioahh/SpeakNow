# SpeakNow 本地版 · 2026-11-05

访问 **http://localhost:5173**。下次使用时双击桌面的 `启动 SpeakNow.command`，会启动前后端并打开 Chrome；已经启动时会复用服务。

项目目录：`/Users/zhangzhuoru/Desktop/master/speaknow-audit`。启动实现为 `scripts/start-local.mjs`，桌面入口仅调用此脚本。使用当前整合版本，没有以旧副本覆盖源码。

启动器将数据存储固定为项目内 `data/`，复用已有数据。服务仅绑定本机，前端 5173、后端 8787。固定使用真实 DeepSeek 和浏览器语音，不启用工程 Mock 或会员测试模式。密钥由既有 `.env.local` 读取，没有写入启动器或日志。

AI 对话和 AI 反馈需要网络及有效 API 额度。浏览器语音识别也可能需要网络；首次录音需允许麦克风，摄像头为可选。没有录音权限时仍可输入文字完成对话。不要把本地版理解成离线大模型。

在同一个 Chrome 浏览器中使用 `http://localhost:5173`；练习和录音包含浏览器 IndexedDB 数据，不要清除此地址的网站数据。本地账户和历史不等同于线上 Supabase 账户与历史。

实际浏览器验证结果见 `verification.json`：2026-11-05 10:41（北京时间）通过首页、考试、进度和 Speaking 页面，Daily Start 的真实本地额度请求、两轮真实 DeepSeek 回复、真实 AI 反馈、刷新后记录保留，以及 320/390/1280 宽度检查；页面运行错误和 API 5xx 均为 0。播放事件为受控测试，物理麦克风、实际 ASR 和摄像头识别未由本轮自动化验收。重复运行启动器也已确认复用服务并打开 Chrome。

若无法打开，重新双击启动入口；错误日志位于 `.cache/local-launcher/server.log`。请保留项目目录和现有 node_modules。关机后服务会停止，下次双击即可重新启动。
