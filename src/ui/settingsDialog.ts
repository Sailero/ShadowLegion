import type Phaser from 'phaser';
import packageInfo from '../../package.json' with { type: 'json' };
import { SettingsManager } from '../systems/SettingsManager';
import { SoundManager } from '../systems/SoundManager';
import { SaveBackupManager, MAX_BACKUP_BYTES, type BackupPreview } from '../systems/SaveBackupManager';

type PresentDialog = (scene: Phaser.Scene, dialog: HTMLDialogElement) => void;
const SAFE_RESTORE_SCENES = new Set(['MenuScene', 'WorkshopScene', 'CampaignScene', 'LoadoutScene', 'GameOverScene']);

export function canRestoreJourney(scene: Phaser.Scene): boolean {
  return SAFE_RESTORE_SCENES.has(scene.sys.settings.key) && !scene.game.scene.getScenes(false).some(item =>
    item.sys.settings.key === 'ArenaScene' && (item.scene.isActive() || item.scene.isPaused() || item.scene.isSleeping()));
}

/** Keep keyboard navigation inside this native modal, including newly shown preview controls. */
function trapFocus(dialog: HTMLDialogElement): void {
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
      .filter(control => control.tabIndex >= 0 && !control.hasAttribute('disabled') && control.getClientRects().length > 0 && !control.closest('[hidden]'));
    event.preventDefault();
    if (!controls.length) { dialog.focus(); return; }
    const index = controls.indexOf(document.activeElement as HTMLElement);
    const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus({ preventScroll: false });
  });
  dialog.addEventListener('keyup', event => event.stopPropagation());
}

export function openSettingsDialog(scene: Phaser.Scene, presentDialog: PresentDialog): void {
  if (document.querySelector('.settings-dialog')) return;
  const settings = SettingsManager.get();
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.tabIndex = -1;
  dialog.innerHTML = `<form method="dialog"><div class="settings-eyebrow">让旅途更合心意 · v${packageInfo.version}</div>
    <h2 id="settings-title">旅途设置</h2><p>随时调整，本设备会记住你的选择。</p>
    <label class="setting-volume" for="sound-volume">声音音量 <output id="sound-value"></output></label>
    <input id="sound-volume" type="range" min="0" max="100" step="5" aria-label="声音音量" autofocus>
    <label class="setting-toggle"><span><strong>自动开火</strong><small>持续射击，仍由鼠标控制瞄准方向。</small></span><input id="auto-fire" type="checkbox"></label>
    <label class="setting-toggle"><span><strong>减少动态效果</strong><small>减轻镜头晃动、闪光和界面动效。</small></span><input id="reduce-motion" type="checkbox"></label>
    <section class="backup-section" aria-labelledby="backup-title">
      <h3 id="backup-title">把旅途收好</h3>
      <p>将本机保存的进度、成长、设置与续玩记录下载成文件。文件留在你的设备上，不会上传。</p>
      <div class="backup-actions"><button type="button" id="backup-download">备份旅途</button><button type="button" id="backup-upload">恢复旅途</button></div>
      <input type="file" id="backup-file" accept="application/json,.json" hidden aria-label="选择旅途备份文件">
      <p id="backup-restriction" class="backup-restriction" hidden>请先回到营地，再恢复旅途，避免覆盖正在进行的这一局。</p>
      <p id="backup-status" class="backup-status" role="status" aria-live="polite"></p>
      <section id="backup-preview" class="backup-preview" aria-labelledby="backup-preview-title" hidden>
        <h3 id="backup-preview-title">先看看这份旅途</h3>
        <p id="backup-date"></p>
        <dl class="backup-summary"><div><dt>已通关</dt><dd id="backup-clears"></dd></div><div><dt>星章</dt><dd id="backup-stars"></dd></div><div><dt>暖晶</dt><dd id="backup-cores"></dd></div></dl>
        <p id="backup-details"></p><p id="backup-preserved"></p><p id="backup-cleared"></p>
        <p class="backup-confirm-note">确认后会替换文件中包含的本机记录，完成后重新打开营地。建议先备份现在的旅途。</p>
        <div class="backup-actions"><button type="button" id="backup-confirm">确认恢复并回营地</button><button type="button" id="backup-cancel">取消恢复</button></div>
      </section>
    </section>
    <div class="settings-note">WASD 移动 · 鼠标瞄准 · SHIFT 闪避<br>SPACE 技能 · Q 切换技能 · E 安排影伴 · ESC 暂停</div>
    <button class="settings-done">完成设置</button></form>`;
  const get = <T extends HTMLElement>(selector: string): T => dialog.querySelector<T>(selector)!;
  const volume = get<HTMLInputElement>('#sound-volume');
  const value = get<HTMLOutputElement>('#sound-value');
  const auto = get<HTMLInputElement>('#auto-fire');
  const motion = get<HTMLInputElement>('#reduce-motion');
  volume.value = String(Math.round(settings.volume * 100));
  value.value = `${volume.value}%`;
  auto.checked = settings.autoFire;
  motion.checked = settings.reducedMotion;
  volume.addEventListener('input', () => {
    const nextVolume = Number(volume.value) / 100;
    value.value = `${volume.value}%`;
    SettingsManager.update({ volume: nextVolume });
    SoundManager.get().setVolume(nextVolume);
  });
  auto.addEventListener('change', () => SettingsManager.update({ autoFire: auto.checked }));
  motion.addEventListener('change', () => SettingsManager.update({ reducedMotion: motion.checked }));

  const download = get<HTMLButtonElement>('#backup-download');
  const upload = get<HTMLButtonElement>('#backup-upload');
  const file = get<HTMLInputElement>('#backup-file');
  const preview = get<HTMLElement>('#backup-preview');
  const status = get<HTMLElement>('#backup-status');
  const confirm = get<HTMLButtonElement>('#backup-confirm');
  let pendingText: string | null = null;
  let generation = 0;
  const setStatus = (message: string, error = false) => {
    status.textContent = message;
    status.classList.toggle('backup-error', error);
  };
  const cancelPreview = () => {
    pendingText = null;
    preview.hidden = true;
    file.value = '';
  };
  const renderPreview = (info: BackupPreview) => {
    get<HTMLElement>('#backup-date').textContent = `备份时间：${new Date(info.createdAt).toLocaleString('zh-CN')}`;
    get<HTMLElement>('#backup-clears').textContent = `${info.clearedStages} / 50`;
    get<HTMLElement>('#backup-stars').textContent = `${info.stars} / 150`;
    get<HTMLElement>('#backup-cores').textContent = info.shadowCores.toLocaleString('zh-CN');
    get<HTMLElement>('#backup-details').textContent = `${info.operativeCount} 位已解锁旅人。${info.hasCheckpoint ? '包含起点续玩。' : ''}${info.routeRebuilt ? '路线将按备份中的成长记录重建。' : ''}`;
    get<HTMLElement>('#backup-preserved').textContent = info.preserved.length ? `文件未包含，保留本机：${info.preserved.join('、')}。` : '备份包含全部数据项目。';
    get<HTMLElement>('#backup-cleared').textContent = info.cleared.length ? `备份中为空，将清空本机对应记录：${info.cleared.join('、')}。` : '';
    preview.hidden = false;
    confirm.focus();
  };
  upload.disabled = !canRestoreJourney(scene);
  get<HTMLElement>('#backup-restriction').hidden = !upload.disabled;
  download.addEventListener('click', () => {
    const result = SaveBackupManager.exportBackup();
    if (!result.ok) { setStatus(result.message, true); return; }
    try {
      const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = result.filename; link.hidden = true;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('备份文件已交给浏览器下载，请妥善保存；本机旅途未改变。');
    } catch { setStatus('浏览器没有完成备份下载，请检查下载权限后重试。', true); }
  });
  upload.addEventListener('click', () => {
    if (!canRestoreJourney(scene)) { setStatus('请先回到营地，再恢复旅途。', true); return; }
    file.value = ''; file.click();
  });
  file.addEventListener('change', async () => {
    const selection = file.files?.[0];
    if (!selection) return;
    const request = ++generation;
    cancelPreview();
    if (!canRestoreJourney(scene)) { setStatus('请先回到营地，再恢复旅途。', true); return; }
    if (selection.size > MAX_BACKUP_BYTES) { setStatus('备份不能超过 1 MB，请选择本游戏导出的文件。', true); return; }
    setStatus('正在检查备份，还没有修改本机旅途。');
    try {
      const text = await selection.text();
      if (!dialog.isConnected || request !== generation) return;
      const result = SaveBackupManager.previewBackup(text);
      if (!result.ok) { setStatus(result.message, true); return; }
      pendingText = text;
      setStatus('备份检查完成。请核对下面的旅途，再决定是否恢复。');
      renderPreview(result.preview);
    } catch { if (dialog.isConnected) setStatus('这份文件没有读完，请重新选择备份。', true); }
  });
  get<HTMLButtonElement>('#backup-cancel').addEventListener('click', () => {
    generation++; cancelPreview(); setStatus('已取消恢复，本机旅途没有改变。'); upload.focus();
  });
  confirm.addEventListener('click', () => {
    if (pendingText === null) return;
    if (!canRestoreJourney(scene)) { cancelPreview(); setStatus('旅途已经开始，请回营地后再恢复。', true); return; }
    confirm.disabled = true;
    const result = SaveBackupManager.restoreBackup(pendingText);
    setStatus(result.message, !result.ok);
    if (result.ok) {
      pendingText = null;
      dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
      // Reload clears SettingsManager/scene caches and always boots the menu.
      window.location.reload();
    } else confirm.disabled = false;
  });
  trapFocus(dialog);
  dialog.addEventListener('close', () => {
    generation++; pendingText = null;
    requestAnimationFrame(() => {
      if (!scene.sys.isActive()) return;
      const canvas = scene.game.canvas;
      canvas.tabIndex = 0;
      canvas.focus({ preventScroll: true });
    });
  }, { once: true });
  presentDialog(scene, dialog);
  dialog.scrollTop = 0;
  volume.focus({ preventScroll: true });
}
