import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {z} from 'zod';
export const adminConfigSchema=z.object({username:z.string().regex(/^[a-zA-Z0-9_-]{3,40}$/),salt:z.string().regex(/^[a-f0-9]{32}$/),passwordHash:z.string().regex(/^[a-f0-9]{128}$/)}).strict();
export type AdminConfig=z.infer<typeof adminConfigSchema>;
export function createAdminConfig(username:string,password:string):AdminConfig {
 if(password.length<16||password.length>256)throw new Error('管理员密码须为 16—256 个字符');
 const salt=randomBytes(16).toString('hex');
 return adminConfigSchema.parse({username,salt,passwordHash:scryptSync(password,salt,64).toString('hex')});
}
export function validPassword(config:AdminConfig,username:string,password:string){
 if(password.length>256||username.length>40)return false;
 const actual=scryptSync(password,config.salt,64),expected=Buffer.from(config.passwordHash,'hex');
 return timingSafeEqual(actual,expected)&&username===config.username;
}
export function equalToken(a:string,b:string){return /^[a-f0-9]{64}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export type AdminSession={csrf:string;expires:number};
export class AdminSessions {
 private sessions=new Map<string,AdminSession>();
 create(now=Date.now()){
  for(const [key,value] of this.sessions)if(value.expires<=now)this.sessions.delete(key);
  if(this.sessions.size>=32)this.sessions.delete(this.sessions.keys().next().value!);
  const token=randomBytes(32).toString('hex'),session={csrf:randomBytes(32).toString('hex'),expires:now+8*60*60*1000};
  this.sessions.set(token,session);return {token,session};
 }
 get(token:string,now=Date.now()){const session=this.sessions.get(token);if(!session||session.expires<=now){this.sessions.delete(token);return null;}return session;}
 delete(token:string){this.sessions.delete(token);}
}
export class LoginLimiter {
 constructor(private readonly limit=5){}
 private attempts=new Map<string,{count:number;expires:number}>();
 allow(ip:string,now=Date.now()){
  for(const [key,value] of this.attempts)if(value.expires<=now)this.attempts.delete(key);
  if(this.attempts.size>1000)return false;
  const bucket=this.attempts.get(ip)??{count:0,expires:now+15*60*1000};bucket.count++;this.attempts.set(ip,bucket);return bucket.count<=this.limit;
 }
}
export function sameOrigin(req:Pick<IncomingMessage,'headers'>,origin:string){return req.headers.origin===origin&&req.headers.host===new URL(origin).host;}
