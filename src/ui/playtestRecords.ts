import type Phaser from 'phaser';
import { getChapter } from '../data/chapters';
import { SessionMetricsManager } from '../systems/SessionMetricsManager';
import { showDialog } from './theme';

const duration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒` : `${seconds} 秒`;
};

/** Export is an explicit local download. Records never leave the device automatically. */
export function openPlaytestRecords(scene: Phaser.Scene): void {
  if (document.querySelector('.settings-dialog')) return;
  const samples = SessionMetricsManager.getSamples();
  const summary = SessionMetricsManager.summary();
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-dialog metrics-dialog';
  dialog.setAttribute('aria-labelledby', 'metrics-title');
  dialog.innerHTML = `<form method="dialog"><div class="settings-eyebrow">本机试玩记录</div>
    <h2 id="metrics-title">每一波，都留下一个脚印。</h2>
    <p>仅保留最近 120 个完成的战役波次，记录保存在本机，不会自动上传。</p>
    <div id="metrics-content"></div>
    <div class="settings-note">这里记录完成的战役波次的模拟活跃战斗时间，不计暂停、选卡、无尽漫游与未完成波次。低帧率时，计时可能慢于现实时间，不能当作整章或整局时长。<br>P90 表示 90% 的记录用时不超过这个数值。单个设备的样本不代表整体玩家。</div>
    <div class="metrics-actions"><button id="export-metrics" type="button" class="settings-done metrics-export">导出 JSON 记录</button><button class="settings-done" autofocus>返回工坊</button></div></form>`;
  const content = dialog.querySelector<HTMLDivElement>('#metrics-content')!;
  if (!samples.length) {
    const empty = document.createElement('div');
    empty.className = 'metrics-empty';
    const title = document.createElement('strong');
    title.textContent = '还没有完成的战役波次记录';
    const description = document.createElement('p');
    description.textContent = '在战役中完成一波后，这里会出现模拟活跃战斗时间。';
    empty.append(title, description);
    content.append(empty);
  } else {
    const scroll = document.createElement('div');
    scroll.className = 'metrics-table-scroll';
    scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', '按章节查看完成的战役波次模拟活跃战斗时间');
    const table = document.createElement('table');
    table.className = 'metrics-table';
    const caption = document.createElement('caption');
    caption.textContent = `共 ${samples.length} 个完成的战役波次 · 按章节汇总`;
    table.append(caption);
    const head = document.createElement('thead');
    const headings = document.createElement('tr');
    for (const title of ['章节', '波次样本', '中位时长', 'P90 时长']) {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = title; headings.append(cell);
    }
    head.append(headings); table.append(head);
    const body = document.createElement('tbody');
    for (const row of summary) {
      const tr = document.createElement('tr');
      const values = [`${row.chapter} · ${getChapter(row.chapter, true).name}`, String(row.count), duration(row.medianMs), duration(row.p90Ms)];
      for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; tr.append(cell); }
      body.append(tr);
    }
    table.append(body); scroll.append(table); content.append(scroll);
  }
  const exportButton = dialog.querySelector<HTMLButtonElement>('#export-metrics')!;
  exportButton.disabled = samples.length === 0;
  exportButton.addEventListener('click', () => {
    const exportedAt = new Date().toISOString();
    const payload = { game: 'Sunlit Echoes', formatVersion: 1, exportedAt,
      measurement: 'completed_campaign_wave_simulated_active_time_ms', scope: 'this_device_only', summary, samples };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const download = document.createElement('a');
    download.href = url; download.download = `sunlit-echoes-playtest-${exportedAt.slice(0, 10)}.json`;
    document.body.append(download); download.click(); download.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  showDialog(scene, dialog);
}
