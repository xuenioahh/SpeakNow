# 2026-11-15 最新版发布记录

用户已授权上线。本轮从整合目录 `/Users/zhangzhuoru/Desktop/master/speaknow-audit` 执行 `vercel deploy --prod --skip-domain --yes`。

候选：https://omniverse-ent208-a5ti5c368-weifiabscxdgib.vercel.app
部署 ID：dpl_CVoYjMjkKibqrfzNozWE6xXP4Ze2

结果：生产构建失败，未切换正式域名。生产存储门禁 13 项中 9 项通过：app_memberships、app_usage_ledgers 返回 404/PGRST205；speaknow_release_limit、speaknow_commit_usage 返回 404/PGRST202。

所需迁移：[membership_20261029.sql](../../supabase/membership_20261029.sql)。现有生产配置仅含 Supabase URL 和应用 service-role 密钥，没有数据库管理连接。下载的环境变量为 [SENSITIVE] 占位符，不能作为 SQL 管理凭据。Supabase 插件尚未连接。本轮没有绕过门禁，也没有修改生产密钥或数据。

本地验证：201/201 测试通过；lint、typecheck、build 均退出 0，dist/index.html 已重建。本地检查不代表生产验收通过。源码散列见 manifest.json。

正常本地预览应使用上述整合目录；本轮检查时 5173/5174 没有监听服务。

下一步：取得已授权的 Supabase 管理连接，执行现有迁移，重新发布候选，完成线上检查后再提升到正式域名。

正式域名复核：Vercel inspect 确认 https://omniverse-ent208.vercel.app 仍指向 2026-11-03 的 dpl_2ogn8CoEFU7LwXEDGVF4nuFKTMrH，状态 Ready。未声称完成线上功能验收。
