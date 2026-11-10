import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as authGet,POST as authPost } from "../src/app/api/auth/[...all]/route";
import { GET as plansGet,POST as plansPost } from "../src/app/api/plans/route";
import { PUT as planPut,DELETE as planDelete } from "../src/app/api/plans/[id]/route";
import { GET as accountExport } from "../src/app/api/account/export/route";
test("已停用的账号与计划接口统一返回 410，不读取或暴露个人数据",async()=>{
  for(const handler of [authGet,authPost,plansGet,plansPost,planPut,planDelete,accountExport]) {
    const response=handler();
    assert.equal(response.status,410);
    assert.equal(response.headers.get("Cache-Control"),"no-store");
    assert.deepEqual(await response.json(),{error:"本站已改为公开阅读，账号与计划服务已停用。"});
  }
});
