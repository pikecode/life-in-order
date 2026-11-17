import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createAdminConfig} from '../src/lib/admin-security';
// 只写新文件，避免无意重置已有账号；明文交付文件须由管理员私下保管。
const [configFile,accessFile,username='admin']=process.argv.slice(2);
if(!configFile||!accessFile)throw new Error('用法：admin-password.ts <私有配置新文件> <初始凭据新文件> [用户名]');
const password=randomBytes(24).toString('base64url');
writeFileSync(configFile,JSON.stringify(createAdminConfig(username,password))+'\n',{mode:0o600,flag:'wx'});
writeFileSync(accessFile,`生活有序管理页：https://ompeak.com/admin/\n用户名：${username}\n初始密码：${password}\n\n请私下保存，不要提交 Git 或转发。修改配置后需重启管理服务使旧会话失效。\n`,{mode:0o600,flag:'wx'});
console.log('已生成私有管理员配置与初始凭据文件，密码未输出到日志。');
