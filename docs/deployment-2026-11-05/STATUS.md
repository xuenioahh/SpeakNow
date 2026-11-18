# 2026-11-05 上线复核

当前正式域名：https://omniverse-ent208.vercel.app 。Vercel 查询仍指向 `dpl_2ogn8CoEFU7LwXEDGVF4nuFKTMrH`（2026-11-03）。

本轮最新源码从干净目录 `/private/tmp/speaknow-release-20261105` 上传，共 289 个源码/资产文件，保留三个摄像头模型；逐文件 SHA-256 见 `manifest.json`。未上传本机数据、环境文件、文档或测试。使用 `--prod --skip-domain`，未切换正式域名。

候选构建 `dpl_41Z42w1uXccSnTyersjfu2wY296f` 在生产存储预检失败：13 项中 9 项通过；`app_memberships`、`app_usage_ledgers` 返回 PGRST205，`speaknow_release_limit`、`speaknow_commit_usage` 返回 PGRST202。需要执行既有 `supabase/membership_20261029.sql` 后重新发布。现有生产密钥是不可下载的敏感变量，Vercel CLI 只返回占位符，未改写密钥。

本轮本地检查：179 项单元测试通过；lint、typecheck 和本地 build 通过。上述本地 build 不代表生产存储预检通过。正式网站的本机 HTTP 访问超时；未声称线上验收成功。

用户随后要求可用的本地版本。正常本地项目仍为 `/Users/zhangzhuoru/Desktop/master/speaknow-audit`，本地启动与实测结果见 [本地版说明](../local-2026-11-05/README.md)。本地运行模式不修复或替代生产数据库迁移。

## 再次发布尝试（2026-11-05 16:18 北京时间）

候选 `dpl_6xWNE2Ti8M4gio7fohLdiviHd6uw` 仍被生产存储预检拦截，缺失项仍为 app_memberships、app_usage_ledgers、speaknow_release_limit、speaknow_commit_usage；9 项通过、4 项失败。正式域名未切换。

本地 typecheck、lint 通过。新增 local-transcription 路由漏注册已补齐；全套测试复跑 178/179（一个 provider fixture 超时失败），对该项与路由的定向复查 7/7 通过。未宣称全套最终全绿或语音转写真人验收通过。本地 Whisper 模型仍未下载成功。

待完成：拥有生产 Supabase SQL 权限的管理连接执行 supabase/membership_20261029.sql；再重新完整构建和候选发布，验证后切换正式域名。
