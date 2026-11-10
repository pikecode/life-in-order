import { readdir, rm, cp, access } from "node:fs/promises";
import { resolve, join } from "node:path";
const target = resolve(".next/standalone");
for (const file of await readdir(target))
  if (file.startsWith(".env")) await rm(join(target, file), { force: true });
await cp(resolve(".next/static"), join(target, ".next/static"), {
  recursive: true,
});
try {
  await access("public");
  await cp(resolve("public"), join(target, "public"), { recursive: true });
} catch (error) {
  if (!(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  ))
    throw error;
}
console.log(
  "独立运行包已准备：静态资源已复制，构建目录中的环境文件副本已移除。",
);
