import "dotenv/config";
import { backupDatabase } from "./database-tools";
try {
  if (!process.env.DATABASE_URL || !process.argv[2])
    throw new Error(
      "用法：npm run db:backup -- backups/唯一文件名.dump，并配置 DATABASE_URL",
    );
  console.log(
    "备份完成：",
    await backupDatabase(process.env.DATABASE_URL, process.argv[2]),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "备份失败");
  process.exitCode = 1;
}
