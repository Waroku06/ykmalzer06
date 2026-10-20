(function () {
  'use strict';

  const Core = window.MahjongCore;
  const $ = (selector) => document.querySelector(selector);
  const handEl = $('#hand-tiles');
  const paletteEl = $('#tile-palette');
  const doraListEl = $('#dora-list');
  const doraPickerEl = $('#dora-picker');
  const meldListEl = $('#meld-list');
  const resultEl = $('#result-content');
  const stateEl = $('#result-state');
  const inputStatusEl = $('#input-status');
  const tileCountEl = $('#tile-count');
  const meldCountEl = $('#meld-count');
  const playerCountEl = $('#player-count');
  const yakumanModeEl = $('#yakuman-mode');
  const meldKindEl = $('#meld-kind');
  const meldTileEl = $('#meld-tile');
  const waitTypeEl = $('#wait-type');

  const state = {
    tiles: [],
    melds: [],
    doraCounts: Array(34).fill(0),
    kita: 0
  };

  const allIds = Array.from({ length: 34 }, (_, id) => id);
  const suitIds = [0, 1, 2].flatMap((suit) => Array.from({ length: 9 }, (_, i) => suit * 9 + i));
  const displayIds = [...suitIds, 27, 28, 29, 30, 31, 32, 33];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function tileImg(id, red, alt) {
    const image = document.createElement('img');
    image.src = Core.tileAsset(id, red);
    image.alt = alt || Core.tileLabel(id);
    image.loading = 'lazy';
    image.onerror = () => { image.style.display = 'none'; };
    return image;
  }

  function tileCount(id) {
    return state.tiles.filter((tile) => tile.id === id).length;
  }

  function fixedPhysicalCounts() {
    const counts = Array(34).fill(0);
    for (const tile of state.tiles) counts[tile.id]++;
    for (const meld of state.melds) for (const id of meld.tiles) counts[id]++;
    return counts;
  }

  function effectiveCount() {
    return state.tiles.length + state.melds.length * 3;
  }

  function sortedTiles() {
    return state.tiles.slice().sort((a, b) => a.id - b.id || Number(a.red) - Number(b.red));
  }

  function makeTileButton(tile, index, removable) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile-button';
    button.title = `移除 ${Core.tileLabel(tile.id)}`;
    button.appendChild(tileImg(tile.id, tile.red, Core.tileLabel(tile.id)));
    if (removable) {
      const remove = document.createElement('span');
      remove.className = 'tile-remove';
      remove.textContent = '×';
      button.appendChild(remove);
      button.addEventListener('click', () => {
        const actualIndex = state.tiles.indexOf(tile);
        if (actualIndex >= 0) state.tiles.splice(actualIndex, 1);
        renderAll();
      });
    }
    button.dataset.index = String(index);
    return button;
  }

  function renderHand() {
    handEl.innerHTML = '';
    const tiles = sortedTiles();
    for (const [index, tile] of tiles.entries()) handEl.appendChild(makeTileButton(tile, index, true));
    const slots = Math.max(0, 14 - state.tiles.length);
    for (let i = 0; i < Math.min(slots, 14); i++) {
      const slot = document.createElement('span');
      slot.className = 'tile-slot';
      slot.textContent = i + state.tiles.length < 14 ? '＋' : '';
      handEl.appendChild(slot);
    }
    const effective = effectiveCount();
    tileCountEl.textContent = `${state.tiles.length} + ${state.melds.length * 3} = ${effective} / 14 张`;
  }

  function renderPalette() {
    paletteEl.innerHTML = '';
    let previousSuit = null;
    for (const id of displayIds) {
      const suit = id < 27 ? Math.floor(id / 9) : 3;
      if (previousSuit !== null && suit !== previousSuit) {
        const separator = document.createElement('span');
        separator.className = 'palette-separator';
        paletteEl.appendChild(separator);
      }
      previousSuit = suit;
      appendPaletteButton(id, false);
      if (id < 27 && id % 9 === 4) appendPaletteButton(id, true);
    }
  }

  function appendPaletteButton(id, red) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-tile';
    button.title = red ? '赤五' : Core.tileLabel(id);
    button.appendChild(tileImg(id, red, button.title));
    button.disabled = !document.body.classList.contains('sanma') && false;
    button.addEventListener('click', () => addTile(id, red));
    paletteEl.appendChild(button);
  }

  function addTile(id, red) {
    if (state.tiles.length >= 14) return;
    const physical = fixedPhysicalCounts();
    if (physical[id] >= 4) return;
    if (Number(playerCountEl.value) === 3 && !Core.allowedTile(id, true)) return;
    state.tiles.push({ id, red: Boolean(red) });
    renderAll();
  }

  function renderMeldOptions() {
    const kind = meldKindEl.value;
    const selected = meldTileEl.value;
    meldTileEl.innerHTML = '';
    for (const id of displayIds) {
      if (kind === 'chi' && (id >= 27 || id % 9 > 6)) continue;
      if (Number(playerCountEl.value) === 3 && !Core.allowedTile(id, true)) continue;
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = Core.tileLabel(id);
      meldTileEl.appendChild(option);
    }
    if ([...meldTileEl.options].some((option) => option.value === selected)) meldTileEl.value = selected;
  }

  function meldTiles(kind, id) {
    if (kind === 'chi') return [id, id + 1, id + 2];
    return Array(kind === 'kan' || kind === 'ankan' ? 4 : 3).fill(id);
  }

  function addMeld() {
    if (state.melds.length >= 4) return;
    const kind = meldKindEl.value;
    const id = Number(meldTileEl.value);
    const tiles = meldTiles(kind, id);
    const physical = fixedPhysicalCounts();
    const additional = tiles.reduce((map, tileId) => { map[tileId] = (map[tileId] || 0) + 1; return map; }, {});
    if (Object.keys(additional).some((tileId) => physical[tileId] + additional[tileId] > 4)) return;
    if (kind === 'chi' && (id >= 27 || id % 9 > 6)) return;
    state.melds.push({ type: kind, tiles, start: id });
    renderAll();
  }

  function renderMelds() {
    meldListEl.innerHTML = '';
    meldCountEl.textContent = `${state.melds.length} 组`;
    state.melds.forEach((meld, index) => {
      const chip = document.createElement('div');
      chip.className = 'meld-chip';
      const label = meld.type === 'chi' ? '吃' : meld.type === 'pon' ? '碰' : meld.type === 'kan' ? '杠' : '暗杠';
      chip.innerHTML = `<span>${label}</span> ${meld.tiles.map((id) => escapeHtml(Core.tileLabel(id))).join(' ')} `;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '×'; remove.title = '移除副露';
      remove.addEventListener('click', () => { state.melds.splice(index, 1); renderAll(); });
      chip.appendChild(remove);
      meldListEl.appendChild(chip);
    });
  }

  function renderDora() {
    doraListEl.innerHTML = '';
    const selected = displayIds.filter((id) => state.doraCounts[id] > 0);
    if (!selected.length) {
      const empty = document.createElement('span'); empty.className = 'dora-empty'; empty.textContent = '未选择'; doraListEl.appendChild(empty);
    } else {
      for (const id of selected) {
        const count = document.createElement('span'); count.className = 'dora-count';
        count.innerHTML = `${escapeHtml(Core.tileLabel(id))}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = '移除宝牌';
        remove.addEventListener('click', () => { state.doraCounts[id] = 0; renderDora(); });
        count.appendChild(remove); doraListEl.appendChild(count);
      }
    }
    doraPickerEl.innerHTML = '';
    for (const id of displayIds) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = Core.tileLabel(id);
      button.className = state.doraCounts[id] ? 'selected' : '';
      button.disabled = Number(playerCountEl.value) === 3 && !Core.allowedTile(id, true);
      button.addEventListener('click', () => { state.doraCounts[id] = state.doraCounts[id] ? 0 : 1; renderDora(); });
      doraPickerEl.appendChild(button);
    }
  }

  function options() {
    const redCount = state.tiles.filter((tile) => tile.red).length;
    return {
      sanma: Number(playerCountEl.value) === 3,
      doraCounts: state.doraCounts.slice(),
      redCount,
      kita: state.kita,
      roundWind: Number($('#round-wind').value),
      seatWind: Number($('#seat-wind').value),
      waitType: waitTypeEl.value
    };
  }

  function updateStatus() {
    const opts = options();
    const validation = Core.validate(state.tiles, state.melds, opts);
    inputStatusEl.classList.toggle('invalid', !validation.valid && effectiveCount() > 0);
    if (!effectiveCount()) inputStatusEl.textContent = '选择手牌以开始分析';
    else if (!validation.valid) inputStatusEl.textContent = validation.errors[0];
    else inputStatusEl.textContent = `${effectiveCount()} 张牌已就绪 · 点击分析`;
    $('#analyze').disabled = !validation.valid;
  }

  function renderAll() {
    renderHand(); renderMeldOptions(); renderMelds(); renderDora(); updateStatus();
    $('#kita-count').textContent = String(state.kita);
    document.body.classList.toggle('sanma', Number(playerCountEl.value) === 3);
  }

  function scoreBox(label, scoreCase, showYaku) {
    const box = document.createElement('div'); box.className = 'score-box';
    const labelEl = document.createElement('span'); labelEl.textContent = label; box.appendChild(labelEl);
    const value = document.createElement('strong');
    if (!scoreCase || !scoreCase.score) { box.classList.add('unavailable'); value.textContent = '无役'; }
    else value.textContent = Core.formatScore(scoreCase.score);
    box.appendChild(value);
    if (scoreCase && scoreCase.score && scoreCase.score.limit) {
      const limit = document.createElement('small'); limit.className = 'result-meta'; limit.textContent = scoreCase.score.limit; box.appendChild(limit);
    }
    if (showYaku && scoreCase && (scoreCase.yaku.length || scoreCase.dora)) {
      const tags = document.createElement('div'); tags.className = 'hanfu-line';
      for (const yaku of scoreCase.yaku) { const tag = document.createElement('span'); tag.className = 'yaku-tag'; tag.textContent = `${yaku.name} ${yaku.han}番`; tags.appendChild(tag); }
      if (scoreCase.dora) { const tag = document.createElement('span'); tag.className = 'yaku-tag dora-tag'; tag.textContent = `宝牌 ${scoreCase.dora}番`; tags.appendChild(tag); }
      box.appendChild(tags);
    }
    return box;
  }

  function scoreGrid(cases, showYaku) {
    const grid = document.createElement('div'); grid.className = 'score-grid';
    grid.appendChild(scoreBox('立直 · 荣和', cases.riichiRon, showYaku));
    grid.appendChild(scoreBox('不立直 · 荣和', cases.damaRon, showYaku));
    grid.appendChild(scoreBox('立直 · 自摸', cases.riichiTsumo, showYaku));
    grid.appendChild(scoreBox('不立直 · 自摸', cases.damaTsumo, showYaku));
    return grid;
  }

  function resultCard(title, value, meta) {
    const card = document.createElement('div'); card.className = 'result-card';
    const line = document.createElement('div'); line.className = 'result-line';
    const titleEl = document.createElement('span'); titleEl.className = 'result-title'; titleEl.textContent = title; line.appendChild(titleEl);
    if (value !== undefined) { const valueEl = document.createElement('span'); valueEl.className = 'result-value'; valueEl.textContent = value; line.appendChild(valueEl); }
    card.appendChild(line);
    if (meta) { const metaEl = document.createElement('div'); metaEl.className = 'result-meta'; metaEl.innerHTML = meta; card.appendChild(metaEl); }
    return card;
  }

  function renderCompleteScore(analysis, yakumanMode) {
    resultEl.innerHTML = '';
    const best = analysis.cases.riichiRon || analysis.cases.damaRon;
    const card = resultCard(yakumanMode && best.yakuman.length ? '役满成立' : '和牌成立', `${best.yakuman.length ? best.yakuman.map((item) => item.name).join(' · ') : `${best.han} 番 · ${best.fu} 符`}`, best.yakuman.length ? '役满役种已识别，四种情形的点数如下。' : `已按雀魂常用规则计算，宝牌计入番数。`);
    if (best.yakuman.length) {
      const banner = document.createElement('div'); banner.className = 'yakuman-banner'; banner.textContent = best.yakuman.map((item) => `${item.name}${item.multiplier > 1 ? ` ×${item.multiplier}` : ''}`).join(' · '); card.appendChild(banner);
    } else {
      const tags = document.createElement('div'); tags.className = 'hanfu-line';
      for (const yaku of best.yaku) { const tag = document.createElement('span'); tag.className = 'yaku-tag'; tag.textContent = `${yaku.name} ${yaku.han}番`; tags.appendChild(tag); }
      if (best.dora) { const tag = document.createElement('span'); tag.className = 'yaku-tag dora-tag'; tag.textContent = `宝牌 ${best.dora}番`; tags.appendChild(tag); }
      card.appendChild(tags);
    }
    resultEl.appendChild(card);
    const scoreCard = resultCard('四种情形', undefined, '荣和 / 自摸、立直 / 不立直分别列出。');
    scoreCard.appendChild(scoreGrid(analysis.cases, false)); resultEl.appendChild(scoreCard);
    if (yakumanMode && !best.yakuman.length) {
      const counts = Core.countsFromTiles(state.tiles);
      const distance = Core.yakumanDistance(counts, state.melds, options().sanma, true);
      const discardNames = distance.discards.map((id) => Core.tileLabel(id)).join('、') || '无';
      resultEl.appendChild(resultCard('役满距离', `${Math.max(0, distance.shanten)} 向听`, `当前和牌不是役满，推荐打出：<strong>${escapeHtml(discardNames)}</strong>`));
    }
  }

  function renderDiscards(info, yakumanMode) {
    const card = resultCard('当前牌面', `${Math.max(0, info.shanten)} 向听`, `推荐打出以下牌，进张数优先：`);
    const list = document.createElement('div'); list.className = 'draw-list';
    for (const discard of info.discards.slice(0, 8)) {
      const item = document.createElement('div'); item.className = 'draw-item';
      item.appendChild(tileImg(discard.id, false, Core.tileLabel(discard.id)));
      const name = document.createElement('span'); name.textContent = `打 ${Core.tileLabel(discard.id)}`; item.appendChild(name);
      const ukeire = discard.ukeire.reduce((sum, draw) => sum + draw.remaining, 0);
      const count = document.createElement('em'); count.textContent = `进 ${ukeire} 张`; item.appendChild(count);
      list.appendChild(item);
    }
    card.appendChild(list); resultEl.innerHTML = ''; resultEl.appendChild(card);
    if (yakumanMode) {
      const distance = Core.yakumanDistance(Core.countsFromTiles(state.tiles), state.melds, options().sanma, true);
      const names = distance.discards.map((id) => Core.tileLabel(id)).join('、') || '无';
      resultEl.appendChild(resultCard('役满距离', `${Math.max(0, distance.shanten)} 向听`, `推荐打出：<strong>${escapeHtml(names)}</strong>。`));
    }
  }

  function waitTileCard(wait, yakumanMode) {
    const item = document.createElement('div'); item.className = 'wait-tile';
    item.appendChild(tileImg(wait.id, false, Core.tileLabel(wait.id)));
    const details = document.createElement('div'); details.className = 'wait-details';
    const physical = fixedPhysicalCounts();
    const remaining = Math.max(0, 4 - physical[wait.id]);
    const title = document.createElement('strong'); title.textContent = `${Core.tileLabel(wait.id)} · 还有 ${remaining} 张`; details.appendChild(title);
    const subtitle = document.createElement('small');
    if (wait.yakuman && wait.yakuman.length) subtitle.textContent = `役满：${wait.yakuman.map((item) => item.name).join('、')}`;
    else subtitle.textContent = `${wait.analysis.cases.riichiRon.han} 番 ${wait.analysis.cases.riichiRon.fu} 符 · 荣和 ${Core.formatScore(wait.analysis.cases.riichiRon.score)}`;
    details.appendChild(subtitle);
    if (wait.analysis) {
      const mini = document.createElement('div'); mini.className = 'score-grid';
      mini.appendChild(scoreBox('立直荣和', wait.analysis.cases.riichiRon, false)); mini.appendChild(scoreBox('不立直自摸', wait.analysis.cases.damaTsumo, false));
      details.appendChild(mini);
    }
    if (wait.yakuman && wait.yakuman.length) item.classList.add('yakuman-hit');
    item.appendChild(details); return item;
  }

  function findWaits(counts, opts) {
    const waits = [];
    for (let id = 0; id < 34; id++) {
      if (!Core.allowedTile(id, opts.sanma) || counts[id] + Core.fixedCounts(state.melds, false)[id] >= 4) continue;
      const next = Core.addGroup(counts, [id]);
      const analysis = Core.analyzeScore(next, state.melds, opts);
      if (!analysis.complete) continue;
      const yakuman = analysis.cases.riichiRon.yakuman;
      waits.push({ id, analysis, yakuman });
    }
    return waits;
  }

  function renderTenpai(counts, waits, opts, yakumanMode) {
    resultEl.innerHTML = '';
    const card = resultCard('听牌', `${waits.length} 种`, '可和牌的进张如下，点击役满模式后会高亮役满和法。');
    const list = document.createElement('div'); list.className = 'waits';
    const visible = yakumanMode ? waits.filter((wait) => wait.yakuman.length) : waits;
    const source = visible.length || !yakumanMode ? visible : waits;
    for (const wait of source) list.appendChild(waitTileCard(wait, yakumanMode));
    card.appendChild(list); resultEl.appendChild(card);
    if (yakumanMode && !waits.some((wait) => wait.yakuman.length)) {
      const distance = Core.yakumanDistance(counts, state.melds, opts.sanma, false);
      const ukeire = [];
      for (let id = 0; id < 34; id++) {
        if (!Core.allowedTile(id, opts.sanma) || counts[id] >= 4) continue;
        const next = Core.addGroup(counts, [id]);
        const d = Core.yakumanDistance(next, state.melds, opts.sanma, false);
        if (d.shanten < distance.shanten) ukeire.push({ id, remaining: 4 - fixedPhysicalCounts()[id] });
      }
      const need = resultCard('役满距离', `${Math.max(0, distance.shanten)} 向听`, '当前听牌没有役满和法，推荐进张：');
      const drawList = document.createElement('div'); drawList.className = 'draw-list';
      for (const draw of ukeire.slice(0, 12)) {
        const item = document.createElement('div'); item.className = 'draw-item'; item.appendChild(tileImg(draw.id, false, Core.tileLabel(draw.id))); const label = document.createElement('span'); label.textContent = `${Core.tileLabel(draw.id)} · ${draw.remaining}张`; item.appendChild(label); drawList.appendChild(item);
      }
      need.appendChild(drawList); resultEl.appendChild(need);
    }
  }

  function analyze() {
    const opts = options();
    const validation = Core.validate(state.tiles, state.melds, opts);
    if (!validation.valid) { resultEl.innerHTML = `<div class="error-banner">${validation.errors.map(escapeHtml).join('<br>')}</div>`; stateEl.textContent = '输入有误'; stateEl.classList.remove('ready'); return; }
    const counts = Core.countsFromTiles(state.tiles);
    const effective = effectiveCount();
    const yakumanMode = yakumanModeEl.checked;
    stateEl.textContent = '已分析'; stateEl.classList.add('ready');
    if (effective === 14) {
      const analysis = Core.analyzeScore(counts, state.melds, opts);
      if (analysis.complete && (!yakumanMode || analysis.cases.riichiRon.yakuman.length)) renderCompleteScore(analysis, yakumanMode);
      else if (analysis.complete) renderCompleteScore(analysis, yakumanMode);
      else renderDiscards(Core.bestDiscards(state.tiles, state.melds, opts.sanma), yakumanMode);
    } else {
      const waits = findWaits(counts, opts);
      if (waits.length) renderTenpai(counts, waits, opts, yakumanMode);
      else {
        const info = Core.bestDiscards(state.tiles, state.melds, opts.sanma);
        renderDiscards(info, yakumanMode);
      }
    }
  }

  function changePlayerCount() {
    const sanma = Number(playerCountEl.value) === 3;
    if (sanma) {
      state.tiles = state.tiles.filter((tile) => Core.allowedTile(tile.id, true));
      state.melds = state.melds.filter((meld) => meld.tiles.every((id) => Core.allowedTile(id, true)));
      for (let id = 0; id < 34; id++) if (!Core.allowedTile(id, true)) state.doraCounts[id] = 0;
    }
    document.body.classList.toggle('sanma', sanma); renderAll();
  }

  $('#analyze').addEventListener('click', analyze);
  $('#clear-hand').addEventListener('click', () => { state.tiles = []; state.melds = []; renderAll(); resultEl.innerHTML = '<div class="empty-result"><span class="empty-symbol">?</span><strong>等待牌姿</strong><p>输入 13 或 14 张有效牌后进行分析</p></div>'; stateEl.textContent = '待分析'; stateEl.classList.remove('ready'); });
  $('#add-meld').addEventListener('click', addMeld);
  meldKindEl.addEventListener('change', renderMeldOptions);
  playerCountEl.addEventListener('change', changePlayerCount);
  $('#kita-inc').addEventListener('click', () => { state.kita = Math.min(4, state.kita + 1); renderAll(); });
  $('#kita-dec').addEventListener('click', () => { state.kita = Math.max(0, state.kita - 1); renderAll(); });
  yakumanModeEl.addEventListener('change', () => { if (effectiveCount() === 13 || effectiveCount() === 14) analyze(); });
  $('#round-wind').addEventListener('change', updateStatus);
  $('#seat-wind').addEventListener('change', updateStatus);
  waitTypeEl.addEventListener('change', updateStatus);

  renderPalette(); renderAll();
})();
