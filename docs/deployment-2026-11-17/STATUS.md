# 2026-11-17 上线续查

整合目录及正常本地预览来源：`/Users/zhangzhuoru/Desktop/master/speaknow-audit`。本轮未修改应用源码。

## 已完成

- 本地测试 201/201 通过，详见 tests.log。
- `npm run lint`、`npm run typecheck`、`npm run build` 均退出 0，dist/index.html 已重建。
- Vercel CLI 实时复核：正式域名 https://omniverse-ent208.vercel.app 仍指向 2026-11-03 的 `dpl_2ogn8CoEFU7LwXEDGVF4nuFKTMrH`，状态 Ready。
- Supabase 插件发现结果：可用但未安装/连接。本地项目未配置数据库管理连接，生产环境下载文件中的 Supabase 值仍是 `[SENSITIVE]` 占位符。

## 尚未完成

最新版尚未上线。11 月 15 日候选构建的缺失项为 app_memberships、app_usage_ledgers、speaknow_release_limit、speaknow_commit_usage；本轮没有数据库权限，未重新查询生产表结构，也未将旧检查当作本轮实测。

所需迁移：[membership_20261029.sql](../../supabase/membership_20261029.sql)。需要连接 Supabase 插件并授予目标项目访问，或由用户在目标项目 SQL Editor 执行该文件。无需在聊天中发送密钥。

数据库迁移完成后，重新发布生产候选（保留 --skip-domain），通过生产存储预检和线上验证后再提升到正式域名。本轮未重复已知受阻的发布，未绕过存储门禁，未切换正式域名。未进行本轮线上登录/录音/反馈功能验收。

本地 5173、5174 检查时无监听服务。本地构建成功不代表生产存储已就绪。

## 用户进一步授权后的登录检查

用户授权直接处理数据库迁移与上线。已通过浏览器检查 Supabase 控制台，未发现可用的已登录会话。页面标注上次使用 GitHub；尝试该正式登录入口后仍停留在 GitHub 登录页。未提交或变更凭据。

用户当前看到的邮箱验证码页面位于 auth.openai.com/email-verification，是 ChatGPT 账号验证；当前连接的 Gmail 与该 Foxmail 收件地址不同，查询未找到相应验证邮件。需要用户完成该账号验证或登录拥有生产项目的 Supabase/GitHub 账号，才能继续数据库迁移。数据库与正式部署均未变更。
