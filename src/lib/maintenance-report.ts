import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
export const commitSchema=z.string().regex(/^[a-f0-9]{40}$/);
export const reportSchema=z.object({base:commitSchema,target:commitSchema,createdAt:z.string().max(100),files:z.array(z.object({
 path:z.string().min(1).max(512),change:z.enum(['新增','修改','删除']),beforeHash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),afterHash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),before:z.string().max(10*1024*1024).nullable(),after:z.string().max(10*1024*1024).nullable(),
}).strict()).max(5000),counts:z.object({documents:z.number().int().nonnegative(),entries:z.number().int().nonnegative()}).strict(),blockers:z.array(z.string().max(2000)).max(5000)}).strict();
export type MaintenanceReport=z.infer<typeof reportSchema>;
export function readMaintenanceReport(root:string,target:string){
 commitSchema.parse(target);
 const text=readFileSync(join(root,target,'review.json'),'utf8');
 if(Buffer.byteLength(text)>25*1024*1024)throw new Error('审核报告超过大小上限');
 const report=reportSchema.parse(JSON.parse(text));
 if(report.target!==target||new Set(report.files.map(f=>f.path)).size!==report.files.length)throw new Error('审核报告目标或文件清单无效');
 return {report,hash:createHash('sha256').update(text).digest('hex')};
}
