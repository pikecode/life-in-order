# 生活有序 · Life in Order

从感兴趣的主题读起，顺着生活知识继续阅读。

公开的浏览阅读产品，不提供注册、登录或账号服务。固定版本收录 eternity4719《高性价比人生指南》34 个完整章节、772 条短知识、9 篇专题长文、244 份核实档案及 6 份参考文件，支持七主题目录、每组 8 条连续阅读、按需查看依据与原文，以及辅助关键词/语义检索。

## 本地运行

要求 Node.js 22、PostgreSQL 17。技术栈为 Next.js / React / TypeScript / PostgreSQL / Zod；不需要 SMTP、认证密钥或 Docker。

```sh
npm ci
cp .env.example .env
# 设置数据库连接 DATABASE_URL，应用地址 APP_URL
npm run db:migrate
npm run dev
```

打开 http://localhost:3000 直接浏览。已有 `.env` 无需覆盖，旧 BETTER_AUTH/SMTP 配置不再使用。

可选 Docker 开发数据库：

```sh
POSTGRES_PASSWORD=自行设置本地密码 docker compose up -d database
```

连接为 `postgresql://life_in_order:你的密码@localhost:5433/life_in_order_dev`，密码特殊字符须 URL 编码；已有本机 PostgreSQL 时直接使用即可。

## 检查与构建

```sh
npm run typecheck
npm test
npm run test:recovery
npm run build
npm start
```

测试只能连接已迁移的专用开发/测试数据库。恢复测试创建并清理独立演练库，需要建库权限和 PostgreSQL 客户端。CI 模板位于 `.github/workflows/checks.yml`，本目录尚未初始化 Git，未触发远程 CI。

## 数据与结构

- `src/app/`：首页、知识目录、连续阅读、来源、说明、健康与匿名统计接口。
- `src/lib/`：内容读取、输入校验、检索、嵌入与匿名统计。
- `content/`：固定来源快照、许可与历史内容版本；知识由数据库读取。
- `scripts/`：迁移、导入、向量索引、统计和备份恢复。
- `tests/`：内容、检索、阅读分组、接口停用、匿名统计和恢复检查。
- `docs/`：[产品、规划、架构与决策](docs/README.md)。

完整专题位于 `/library`；例如 `/library/docs/结婚划不划算.md`。每个专题保留全文、标题目录、列表、表格和站内引用。核实档案单独展示，不当作当前建议。

核对同步完整性：`npm run content:audit -- --upstream --report`（需先配置并建好语义索引）。上游 337 个文件中 293 份正文及参考文件逐一核对，44 个程序/配置/导出等明确排除；详见 [导入范围](docs/knowledge-import.md) 与 [逐文件对账](docs/reports/source-coverage.json)。

`source_documents` 保存完整 Markdown、导读与摘要，`document_chunks` / `document_embeddings` 保存可重建文档索引。`source_versions` 保存作者、许可与固定提交；`knowledge_entries` 保存正文及依据；历史 `content_releases`/`action_tasks` 保留不可覆盖的内容谱系。`usage_events` 保存短期匿名统计。当前迁移不再创建账号或计划表，也不删除现有历史表。

账号、验证码、计划保存与账号导出接口已停用，返回 410；旧登录、账号和计划页面转到公开目录。历史用户和计划记录留在数据库中，公开页面或接口不提供访问；运维备份仍包含历史表。

## 可选语义检索

默认支持关键词。可在本机安装 pgvector 和 Ollama，下载固定摘要的嵌入模型，再执行 `npm run db:semantic`、`npm run content:embed`。未就绪时回退关键词，阅读不依赖模型。详见 [语义检索说明](docs/semantic-search.md)。

## 匿名统计与备份

前台不显示阅读次数。只记录结果数量、实际进入视口及可见聚焦停留等最小匿名事件，不保存查询原文、邮箱、账号或完整 IP。`npm run usage:report` 汇总，`npm run usage:prune` 清理三十天到期记录；生产需配置每日调度。见 [统计说明](docs/usage-statistics.md)。

`npm run db:backup -- backups/唯一文件名.dump` 生成私有备份；`npm run db:restore -- backups/唯一文件名.dump` 仅允许恢复到独立空库。历史数据不做自动清除。详见 [部署与恢复](docs/deployment.md)。

## 来源与上线边界

参考项目：[HowToLiveBetter（高性价比人生指南）](https://github.com/eternity4719/HowToLiveBetter)，作者 eternity4719。正文按 CC BY 4.0 复用，保留署名与固定版本；未复用其代码，未获合作背书。见 [第三方声明](licenses/NOTICE.md)、[来源记录](docs/content-sources.md) 与应用 `/sources`。

未部署公网，交互与产品价值尚未经过真实用户验证。上线仍需运营主体、联系方式、内容审阅、HTTPS、部署地区、最小数据库权限及备份调度；本地检查不代替生产验收。
