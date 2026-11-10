import "dotenv/config";
import { db } from "../src/lib/db";
import { pruneUsage } from "../src/lib/usage";
try { console.log(`已清理 ${await pruneUsage(db)} 条超过 30 天的使用统计`); }
finally { await db.end(); }
