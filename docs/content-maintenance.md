# 内容更新维护

现已提供 https://ompeak.com/admin/ 网页管理入口，登录、原文对照、审阅、发布和回退见 [管理页说明](admin-review.md)。下文维护命令继续可用；网页复用同一流程，不对普通读者开放维护权限。每日任务只检查和生成报告，不准备或发布内容。

## 服务器上如何使用

通过 SSH 登录服务器后，以有权读取迁移凭据的管理员操作：

```sh
cd /opt/life-in-order/source
# 以下命令读取服务器私有文件，不要打印该文件内容或复制到 Git
node --env-file=/etc/life-in-order-migrate.env --import tsx scripts/content-maintenance.ts status
node --env-file=/etc/life-in-order-migrate.env --import tsx scripts/content-maintenance.ts check
```

本地开发环境可用 `npm run content:manage -- <操作>`，读取本地 `.env`。需要先执行 `npm run db:migrate` 创建发布表，不能对未迁移数据库运行新版页面。

`check` 从固定官方仓库读取 main 的完整提交和 Git 对象，不执行上游代码或指令。保存全部文件清单、纳入/排除原因、原始快照与 Git blob/SHA-256。网络失败、条号不连续、字段缺失、章节数量/分类变化或未知专题无法解析时停止；不会把失败说成“没有更新”。许可文本或 README 许可段落变化时生成阻断项，不能准备发布，需先人工核实并调整规则。

结果目录：`content/updates/<完整提交>/`，主要文件：

- `review.md`：新增、修改、删除的已纳入文档列表、数量、阻断项和报告 SHA-256。
- `review.json`：同一报告的完整数据，包含每个变更文件的 before / after 原文，人工只需审阅本次变化。
- `inventory.json`：仓库全部文件及纳入/排除原因。
- `manifest.json`：本次快照文件摘要。

目录不作为网页静态资源，也不自动提交 Git。报告对应固定目标和基准，不随重跑覆盖；若线上基准已变，需先将旧审核目录移到其他私有运维位置，再重新检查生成新基准报告，禁止沿用旧审核摘要。快照目录应随运维文件另行备份；数据库备份保留正文、清单、候选报告和发布记录，回退旧版也需要对应快照目录。

## 准备和发布

先审阅报告，检查内容、来源、地区/时效及许可。无自动阻断项仅说明结构检查通过，不代表内容正确。

```sh
# 占位值须替换为报告中的完整值
npm run content:manage -- prepare <目标提交>
npm run content:manage -- publish <目标提交> --expected <当前线上提交> --approve-report <review.json的SHA256> --note "已核对本次改动与许可"
```

在服务器执行时，将 `npm run content:manage --` 换成上文 `node --env-file=... --import tsx scripts/content-maintenance.ts` 前缀。

准备会在数据库追加目标提交的正文、短知识及分段；幂等且不覆盖原文，失败事务回滚。候选记录保存审核报告摘要，候选不会被公开阅读页读取。旧行动任务发布版不复制到新内容，避免将旧条号套到新版。

发布必须满足：完整提交、正确报告摘要、人工备注、预期线上版本、数据库完整正文/短知识/分段校验。先生成 `backups/before-publish-<时间>.dump`，备份失败不发布；随后在事务锁内重新核对并切换线上指针，同时记录前后提交、操作、备注、报告摘要和备份文件。别人已切换版本时拒绝覆盖，需重新检查。重复发布当前目标也拒绝。

首页、目录、搜索、来源页实时读取线上指针，不需要重新构建应用。阅读与原文内部链接携带 `?source=<提交>`，已发布旧版可继续读；原有无 source 的阅读链接继续读取最初固定提交。新的内容若包含未支持的章节/专题结构，需要先更新解析规则并发布应用代码。

## 回退

```sh
npm run content:manage -- rollback <历史提交> --expected <当前线上提交> --confirm <历史提交> --note "说明回退原因"
```

只能回退到初始版或实际发布过的版本；仍需校验目标内容和切换前备份。只切换内容指针，不删除新版、不恢复覆盖数据库、不重算旧统计。程序发布本身的回退是另一项运维操作，不能将两者混用。

## 定期检查与边界

`deploy/life-in-order-content-check.service` / `.timer` 每日约 04:30（服务器时区，随机延迟最多 20 分钟）运行 check，限制内存、CPU 和执行时长。结果和失败可通过以下命令查看：

```sh
systemctl status life-in-order-content-check.timer
journalctl -u life-in-order-content-check.service -n 80 --no-pager
```

当前不发送邮件或即时消息，不自动批准、准备、发布或重新构建语义索引。线上为关键词模式。未来恢复语义能力，需为目标来源另建两类完整索引，未完成时页面回退关键词。

当前 `content:audit` 仍针对仓库初始固定快照，不能拿它的成功代表新版本已通过；新版准备与发布会针对对应快照执行逐文档、短知识和分段完整校验。

KISS/YAGNI 先提供维护命令，不建账号后台；DRY 复用现有导入、备份和阅读组件；SOLID 将快照解析、发布状态和页面分开。人工审核仍是必需步骤，不把源文件哈希或 AI 判读当作专业内容审核。
