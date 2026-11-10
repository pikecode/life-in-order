import { db } from "../src/lib/db";
import { importContent } from "../src/lib/content-import";
try {
  console.log("内容导入完成", await importContent(db));
} finally {
  await db.end();
}
