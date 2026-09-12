import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = resolve('release', `${pkg.name}-web-${pkg.version}-${timestamp}`);
mkdirSync(destination, { recursive: true });
cpSync('dist', destination, { recursive: true });
const deployNotes = `# PC 浏览器发布包\n\n构建版本：${pkg.version}\n生成时间：${new Date().toISOString()}\n\n上传本目录内容到静态站点；首页为 index.html。资产使用相对地址，可部署到子目录。请用 HTTP(S) 访问，直接双击 HTML 不是受支持的运行方式。\n\n推荐 HTTPS；index.html 设置 Cache-Control: no-cache，assets 中带内容哈希的文件设置 Cache-Control: public, max-age=31536000, immutable。JavaScript MIME 必须为 text/javascript 或 application/javascript。开启 gzip/Brotli 压缩。请勿用 Vite dev/preview 当作正式服务器。\n\n存档仅保存在浏览器本机，与 origin（协议、主机、端口）绑定；切换域名或协议前需要用户导出备份。无账号、无联网排行榜。不要将旧版 Windows 便携包当作本次浏览器构建。\n\n发布验证仍以源码仓库 docs/release-readiness.md 的真实证据为准。自动检查通过不等于外部盲测或所有硬件均通过。\n`;
writeFileSync(resolve(destination, 'DEPLOY.md'), deployNotes);
const phaser = JSON.parse(readFileSync('node_modules/phaser/package.json', 'utf8'));
const eventEmitter = JSON.parse(readFileSync('node_modules/eventemitter3/package.json', 'utf8'));
const notices = [
  `Phaser ${phaser.version} — ${phaser.license}\n\n${readFileSync('node_modules/phaser/LICENSE.md', 'utf8')}`,
  `EventEmitter3 ${eventEmitter.version} — ${eventEmitter.license}\n\n${readFileSync('node_modules/eventemitter3/LICENSE', 'utf8')}`,
].join('\n\n---\n\n');
writeFileSync(resolve(destination, 'THIRD-PARTY-NOTICES.txt'), notices);
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
}
const manifest = {
  version: pkg.version, createdAt: new Date().toISOString(), node: process.version,
  files: files(destination).map(path => {
    const bytes = readFileSync(path);
    return { path: relative(destination, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }),
};
writeFileSync(resolve(destination, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared static release: ${destination}`);
console.log(`Includes ${manifest.files.length} hashed files, deployment notes and dependency license notices. No upload performed.`);
