# 文档索引

更新：2026-11-10。当前以 [探索式知识库产品需求](product.md) 和 [当前路线](roadmap.md) 为准，历史行动助手方案保留为实现记录。

- [全量知识收录](knowledge-import.md)：293 份完整文档、772 条短知识、全部来源文件清单及逐项对账。
- [内容来源](content-sources.md)：许可、固定版本、改编范围及旧数据兼容。
- [部署与恢复](deployment.md)：直接 Node 部署、健康检查及备份恢复。
- [多场景设计](multi-scenario.md)：四个入口、39 项任务及旧数据兼容。
- [产品需求](product.md)：知识查找、探索、阅读与来源追溯，需求未获市场验证。
- [实施阶段](roadmap.md)：开发、上线准备、试用与商业验证分开。
- [架构设计](architecture.md)：公开阅读单体应用、数据库与可靠性。
- [ADR-001](adr/001-initial-architecture.md)：最初提议，部分被替代。
- [ADR-002](adr/002-database-and-auth.md)：历史数据库与认证决策；认证部分由 ADR-005 替代。
- [首轮验证](verification.md)：实际检查结果及生产限制。
- [实施计划](plans/2026-11-09-first-app.md)：本轮文件范围与验证步骤。

已确认：产品名称、数据库支持、完善文档并启动开发。
当前实施：无账号公开阅读，Next.js 与 PostgreSQL；早期场景与认证仅保留历史记录。
未验证：市场需求、收费、首发地区、专业审阅、运营主体及部署地区。访谈暂缓。

- [本地语义检索与运行说明](semantic-search.md)：pgvector、Ollama、索引、检索回退及模型变更要求。
- [语义检索实现计划](plans/2026-11-09-semantic-search.md)。
- [ADR-003](adr/003-local-semantic-search.md)：单库向量检索与本地嵌入决策。
- [知识卡片设计](plans/2026-11-10-knowledge-cards.md)：单列摘要、成本收益、详情与行动衔接。
- [生活工作台视觉方案](plans/2026-11-10-workbench-design.md)：首页、紧凑卡片和可访问阅读面板。
- [后台使用统计](usage-statistics.md)：匿名事件、汇总命令、口径及三十天清理。

- [退租问题处理台设计](plans/2026-11-10-rental-problem-workspace.md)：描述、确认、挑选与行动的连续交互。
- [ADR-004](adr/004-rental-problem-workspace.md)：独立样板与可选计划元数据的取舍。

- [探索式知识库设计](plans/2026-11-10-explorable-knowledge-design.md)：当前首页、筛选和连续阅读设计。

- [阅读优先设计](plans/2026-11-10-reading-first-design.md)：兴趣发现、完整阅读、跨分页和跨章顺序。

- [精简卡片与连续阅读](plans/2026-11-10-continuous-reading.md)：当前阅读方式，替代单条切换和预览弹层。

- [公开阅读设计](plans/2026-11-10-public-reading.md)：移除账号、停用旧接口与历史数据保留。
- [ADR-005](adr/005-public-reading-no-auth.md)：当前无认证决策。

- [阅读界面轻量精修](plans/2026-11-10-reading-visual-polish.md)：手机首屏、紧凑导航、正文宽度与入口可读性。

- [完整来源同步实施](plans/2026-11-10-complete-source-content.md)：长文、章节导读、档案、分段与验收。
- [来源完整性报告](reports/source-coverage.json)：逐文件摘要、排除原因、数据库及索引对账。
- [ADR-006](adr/006-complete-source-documents.md)：完整文档与短知识并存。
