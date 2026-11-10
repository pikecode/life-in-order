export function retiredFeature() {
  return Response.json({error:"本站已改为公开阅读，账号与计划服务已停用。"},
    {status:410,headers:{"Cache-Control":"no-store"}});
}
