import "dotenv/config";
import { restoreDatabase } from "./database-tools";
try {
  if (
    !process.env.DATABASE_URL ||
    !process.env.RESTORE_DATABASE_URL ||
    !process.argv[2]
  )
    throw new Error(
      "用法：配置源 DATABASE_URL、独立空库 RESTORE_DATABASE_URL，执行 npm run db:restore -- 备份文件",
    );
  await restoreDatabase(
    process.env.DATABASE_URL,
    process.env.RESTORE_DATABASE_URL,
    process.argv[2],
  );
  console.log("恢复完成，请验证数据后再切换应用连接。");
} catch (error) {
  console.error(error instanceof Error ? error.message : "恢复失败");
  process.exitCode = 1;
}
