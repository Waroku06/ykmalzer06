(function () {
  'use strict';

  const Core = window.MahjongCore;
  const $ = (selector) => document.querySelector(selector);
  const handEl = $('#hand-tiles');
  const paletteEl = $('#tile-palette');
  const meldPickerEl = $('#meld-picker');
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

  const state = {
    tiles: [],
    melds: [],
    doraCounts: Array(34).fill(0),
    kita: 0
  };

  const suitIds = [0, 1, 2].flatMap((suit) => Array.from({ length: 9 }, (_, i) => suit * 9 + i));
  const displayIds = [...suitIds, 27, 28, 29, 30, 31, 32, 33];
  const honorRows = [[27, 28], [29, 30], [31, 32, 33]];
  let analysisRevision = 0;
  let analysisWorker = null;
  let distanceWorker = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function yakumanText(item) {
    return item && (item.label || item.name) || '';
  }

  function tileImg(id, red, alt) {
    const image = document.createElement('img');
    image.src = Core.tileAsset(id, red);
    image.alt = alt || Core.tileLabel(id);
    image.loading = 'lazy';
    image.onerror = () => { image.style.display = 'none'; };
    return image;
  }

  function tileTooltipLabel(id, red = false) {
    if (id >= 27) return Core.tileLabel(id);
    const suitNames = ['万', '筒', '索'];
    const rankNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const rank = red ? '赤五' : rankNames[id % 9];
    return `${rank}${suitNames[Math.floor(id / 9)]}`;
  }

  function anyTileImg(asset = 'any.png', alt = '任意牌') {
    const image = document.createElement('img');
    image.src = `assets/mahjong/${asset}`;
    image.alt = alt;
    image.loading = 'lazy';
    image.onerror = () => { image.style.display = 'none'; };
    return image;
  }

  function tileCount(id) {
    return state.tiles.filter((tile) => tile.id === id).length;
  }

  function hasOpenMeld() {
    return state.melds.some((meld) => meld.type !== 'ankan');
  }

  function fixedPhysicalCounts() {
    const counts = Array(34).fill(0);
    for (const tile of state.tiles) counts[tile.id]++;
    for (const meld of state.melds) for (const id of meld.tiles) counts[id]++;
    const indicators = indicatorCountsFromDora(Number(playerCountEl.value) === 3);
    for (let id = 0; id < 34; id++) counts[id] += indicators[id];
    return counts;
  }

  function kitaNorthCount(id) {
    return Number(playerCountEl.value) === 3 && id === 30 ? state.kita : 0;
  }

  function doraTotal() {
    return state.doraCounts.reduce((sum, count) => sum + count, 0);
  }

  function indicatorCountsFromDora(sanma) {
    const counts = Array(34).fill(0);
    for (let id = 0; id < 34; id++) {
      const count = state.doraCounts[id];
      if (count) counts[Core.indicatorForDora(id, sanma)] += count;
    }
    return counts;
  }

  function effectiveCount() {
    return state.tiles.length + state.melds.length * 3;
  }

  function sortedTiles() {
    return state.tiles.slice().sort((a, b) => {
      if (a.id !== b.id) return a.id - b.id;
      if (a.red === b.red) return 0;
      return a.red ? -1 : 1;
    });
  }

  function makeTileButton(tile, index, removable) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile-button';
    button.title = `移除 ${tileTooltipLabel(tile.id, tile.red)}`;
    button.appendChild(tileImg(tile.id, tile.red, tileTooltipLabel(tile.id, tile.red)));
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
    handEl.style.setProperty('--hand-slots', String(Math.max(1, 14 - state.melds.length * 3)));
    const tiles = sortedTiles();
    for (const [index, tile] of tiles.entries()) handEl.appendChild(makeTileButton(tile, index, true));
    const slots = Math.max(0, 14 - effectiveCount());
    for (let i = 0; i < Math.min(slots, 14); i++) {
      const slot = document.createElement('span');
      slot.className = 'tile-slot';
      slot.textContent = i + effectiveCount() < 14 ? '＋' : '';
      handEl.appendChild(slot);
    }
    const effective = effectiveCount();
    tileCountEl.textContent = `${state.tiles.length} + ${state.melds.length * 3} = ${effective} / 14 张`;
  }

  function renderPalette() {
    paletteEl.innerHTML = '';
    for (let suit = 0; suit < 3; suit++) {
      const row = createPaletteRow(paletteEl);
      for (let rank = 0; rank < 9; rank++) {
        const id = suit * 9 + rank;
        appendRankButtons(row, id, 'hand', rank === 4);
      }
      appendHonorButtons(row, 'hand', honorRows[suit]);
    }
  }

  function createPaletteRow(parent) {
    const row = document.createElement('div');
    row.className = 'palette-row';
    parent.appendChild(row);
    return row;
  }

  function appendHonorButtons(row, purpose, ids) {
    const separator = document.createElement('span');
    separator.className = 'palette-separator';
    row.appendChild(separator);
    for (const id of ids) appendPaletteButton(row, id, false, purpose);
  }

  function appendRankButtons(row, id, purpose, hasRedVariant) {
    if (hasRedVariant) appendPaletteButton(row, id, true, purpose);
    appendPaletteButton(row, id, false, purpose);
  }

  function appendPaletteButton(parent, id, red, purpose) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-tile';
    button.title = tileTooltipLabel(id, red);
    button.appendChild(tileImg(id, red, button.title));
    const redUsed = red && (state.tiles.some((tile) => tile.red && tile.id === id) || state.melds.some((meld) => meld.redTileId === id));
    if (purpose === 'hand') {
      const physical = fixedPhysicalCounts();
      button.disabled = effectiveCount() >= 14 || physical[id] + kitaNorthCount(id) >= 4 || redUsed || (Number(playerCountEl.value) === 3 && !Core.allowedTile(id, true));
      button.addEventListener('click', () => addTile(id, red));
    } else if (purpose === 'dora') {
      const sanma = Number(playerCountEl.value) === 3;
      const count = state.doraCounts[id];
      const physical = fixedPhysicalCounts();
      const indicatorId = Core.indicatorForDora(id, sanma);
      button.classList.toggle('selected', count > 0);
      button.title = `${tileTooltipLabel(id)} 宝牌，${tileTooltipLabel(indicatorId)} 指示牌`;
      if (count) {
        const badge = document.createElement('output');
        badge.textContent = String(count);
        button.appendChild(badge);
      }
      button.disabled = (sanma && !Core.allowedTile(id, true)) || count >= 4 || doraTotal() >= 10 || physical[indicatorId] >= 4;
      button.addEventListener('click', () => {
        if (state.doraCounts[id] >= 4 || doraTotal() >= 10) return;
        state.doraCounts[id]++;
        renderAll();
      });
    } else {
      const tiles = meldTiles(meldKindEl.value, id);
      const physical = fixedPhysicalCounts();
      const additions = tiles.reduce((map, tileId) => { map[tileId] = (map[tileId] || 0) + 1; return map; }, {});
      const exceedsCopies = Object.keys(additions).some((tileId) => physical[tileId] + additions[tileId] > 4);
      button.disabled = state.melds.length >= 4 || effectiveCount() + 3 > 14 || exceedsCopies || redUsed ||
        (Number(playerCountEl.value) === 3 && !Core.allowedTile(id, true));
      button.addEventListener('click', () => addMeld(id, red));
    }
    parent.appendChild(button);
  }

  function addTile(id, red) {
    if (effectiveCount() >= 14) return;
    const physical = fixedPhysicalCounts();
    if (physical[id] + kitaNorthCount(id) >= 4) return;
    if (Number(playerCountEl.value) === 3 && !Core.allowedTile(id, true)) return;
    if (red && (state.tiles.some((tile) => tile.red && tile.id === id) || state.melds.some((meld) => meld.redTileId === id))) return;
    state.tiles.push({ id, red: Boolean(red) });
    renderAll();
  }

  function renderMeldPicker() {
    meldPickerEl.innerHTML = '';
    const kind = meldKindEl.value;
    for (let suit = 0; suit < 3; suit++) {
      const row = createPaletteRow(meldPickerEl);
      const lastRank = kind === 'chi' ? 6 : 8;
      for (let rank = 0; rank <= lastRank; rank++) {
        const id = suit * 9 + rank;
        const redFiveInSequence = kind === 'chi' && rank <= 6 && suit * 9 + 4 >= id && suit * 9 + 4 <= id + 2;
        const redChoice = (kind === 'pon' && rank === 4) || redFiveInSequence;
        appendRankButtons(row, id, 'meld', redChoice);
      }
      if (kind !== 'chi') appendHonorButtons(row, 'meld', honorRows[suit]);
    }
  }

  function syncRuleControls() {
    const sanma = Number(playerCountEl.value) === 3;
    const chiOption = meldKindEl.querySelector('option[value="chi"]');
    if (chiOption) {
      chiOption.hidden = sanma;
      chiOption.disabled = sanma;
      if (sanma && meldKindEl.value === 'chi') meldKindEl.value = 'pon';
    }
    const seatWind = $('#seat-wind');
    const north = seatWind.querySelector('option[value="30"]');
    if (north) {
      north.hidden = sanma;
      north.disabled = sanma;
    }
    if (sanma && seatWind.value === '30') seatWind.value = '27';
  }

  function meldTiles(kind, id) {
    if (kind === 'chi') return [id, id + 1, id + 2];
    return Array(kind === 'kan' || kind === 'ankan' ? 4 : 3).fill(id);
  }

  function addMeld(id, red) {
    if (state.melds.length >= 4) return;
    const kind = meldKindEl.value;
    if (Number(playerCountEl.value) === 3 && kind === 'chi') return;
    const tiles = meldTiles(kind, id);
    const physical = fixedPhysicalCounts();
    const additional = tiles.reduce((map, tileId) => { map[tileId] = (map[tileId] || 0) + 1; return map; }, {});
    if (Object.keys(additional).some((tileId) => physical[tileId] + additional[tileId] > 4)) return;
    if (kind === 'chi' && (id >= 27 || id % 9 > 6)) return;
    const automaticRedKan = (kind === 'kan' || kind === 'ankan') && id < 27 && id % 9 === 4;
    const redTileId = red ? (kind === 'chi' ? Math.floor(id / 9) * 9 + 4 : id) : automaticRedKan ? id : null;
    if (redTileId !== null && (!tiles.includes(redTileId) || state.melds.some((meld) => meld.redTileId === redTileId) || state.tiles.some((tile) => tile.red && tile.id === redTileId))) return;
    state.melds.push({ type: kind, tiles, start: id, redTileId, redCount: redTileId === null ? 0 : 1 });
    renderAll();
  }

  function renderMelds() {
    meldListEl.innerHTML = '';
    meldCountEl.textContent = `${state.melds.length} 组`;
    state.melds.forEach((meld, index) => {
      const chip = document.createElement('div');
      chip.className = 'meld-chip';
      const label = meld.type === 'chi' ? '吃' : meld.type === 'pon' ? '碰' : meld.type === 'kan' ? '明杠' : '暗杠';
      const type = document.createElement('span'); type.textContent = label; chip.appendChild(type);
      let renderedRed = false;
      for (const id of meld.tiles) {
        const red = !renderedRed && meld.redTileId === id;
        if (red) renderedRed = true;
        chip.appendChild(tileImg(id, red, tileTooltipLabel(id, red)));
      }
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
        count.appendChild(tileImg(id, false, Core.tileLabel(id)));
        const amount = document.createElement('output'); amount.textContent = String(state.doraCounts[id]); count.appendChild(amount);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = '移除宝牌';
        remove.addEventListener('click', () => { state.doraCounts[id] = Math.max(0, state.doraCounts[id] - 1); renderAll(); });
        count.appendChild(remove); doraListEl.appendChild(count);
      }
    }
    doraPickerEl.innerHTML = '';
    for (let suit = 0; suit < 3; suit++) {
      const row = createPaletteRow(doraPickerEl);
      for (let rank = 0; rank < 9; rank++) appendPaletteButton(row, suit * 9 + rank, false, 'dora');
      appendHonorButtons(row, 'dora', honorRows[suit]);
    }
  }

  function options() {
    const redCount = state.tiles.filter((tile) => tile.red).length;
    const sanma = Number(playerCountEl.value) === 3;
    const physical = fixedPhysicalCounts();
    const redFiveCounts = [0, 1, 2].map((suit) => {
      const id = suit * 9 + 4;
      const handRed = state.tiles.some((tile) => tile.red && tile.id === id) ? 1 : 0;
      const meldRed = state.melds.some((meld) => meld.redTileId === id) ? 1 : 0;
      return handRed + meldRed;
    });
    const redFiveAvailable = [0, 1, 2].map((suit) => {
      const id = suit * 9 + 4;
      return Core.allowedTile(id, sanma) && redFiveCounts[suit] === 0 && physical[id] < 4;
    });
    return {
      sanma,
      doraCounts: state.doraCounts.slice(),
      indicatorCounts: indicatorCountsFromDora(sanma),
      redCount,
      redFiveCounts,
      redFiveAvailable,
      kita: state.kita,
      roundWind: Number($('#round-wind').value),
      seatWind: Number($('#seat-wind').value)
    };
  }

  function updateStatus() {
    const opts = options();
    const validation = Core.validate(state.tiles, state.melds, opts);
    const effective = effectiveCount();
    inputStatusEl.classList.toggle('invalid', !validation.valid && effective >= 13);
    if (!effective) inputStatusEl.textContent = '选择手牌以开始分析';
    else if (effective < 13) inputStatusEl.textContent = `已输入 ${effective} 张 · 还需 ${13 - effective} 张`;
    else if (!validation.valid) inputStatusEl.textContent = validation.errors[0];
    else inputStatusEl.textContent = `${effective} 张牌 · 实时分析`;
  }

  function renderAll() {
    syncRuleControls();
    renderHand(); renderPalette(); renderMeldPicker(); renderMelds(); renderDora(); updateStatus();
    $('#kita-count').textContent = String(state.kita);
    $('#kita-dec').disabled = state.kita <= 0;
    $('#kita-inc').disabled = state.kita >= 4;
    document.body.classList.toggle('sanma', Number(playerCountEl.value) === 3);
    refreshAnalysis();
  }

  function tileNotation(tiles) {
    const parts = [];
    for (let suit = 0; suit < 3; suit++) {
      const suitTiles = tiles.filter((tile) => tile.id >= suit * 9 && tile.id < (suit + 1) * 9);
      if (suitTiles.length) parts.push(`${suitTiles.map((tile) => tile.red ? '0' : String(tile.id % 9 + 1)).join('')}${['m', 'p', 's'][suit]}`);
    }
    const honors = tiles.filter((tile) => tile.id >= 27);
    if (honors.length) parts.push(`${honors.map((tile) => String(tile.id - 26)).join('')}z`);
    return parts.join('') || '无';
  }

  function copyPayload() {
    const hand = tileNotation(sortedTiles());
    const melds = state.melds.map((meld) => {
      const kind = meld.type === 'chi' ? '吃' : meld.type === 'pon' ? '碰' : meld.type === 'kan' ? '明杠' : '暗杠';
      let redWritten = false;
      const tiles = meld.tiles.map((id) => {
        const red = meld.redTileId === id && !redWritten;
        if (red) redWritten = true;
        return { id, red };
      });
      return `${kind}(${tileNotation(tiles)})`;
    });
    const dora = [];
    for (let id = 0; id < 34; id++) {
      if (state.doraCounts[id]) dora.push(`${Core.tileLabel(id)}×${state.doraCounts[id]}`);
    }
    const payload = [`手牌：${hand}`];
    if (melds.length) payload.push(`副露：${melds.join('、')}`);
    if (dora.length) payload.push(`宝牌：${dora.join('、')}`);
    payload.push(`场风：${Core.tileLabel(Number($('#round-wind').value))}`, `自风：${Core.tileLabel(Number($('#seat-wind').value))}`);
    if (Number(playerCountEl.value) === 3 && state.kita) payload.push(`拔北：${state.kita}`);
    return payload.join('；');
  }

  async function copyState() {
    const button = $('#copy-state');
    const originalTitle = '复制手牌、副露与宝牌信息';
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyPayload());
        copied = true;
      }
    } catch (error) {}
    if (!copied) {
      const field = document.createElement('textarea');
      field.value = copyPayload();
      field.setAttribute('readonly', '');
      field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.appendChild(field); field.select();
      try { copied = document.execCommand('copy'); } catch (error) {}
      field.remove();
    }
    button.title = copied ? '已复制' : '复制失败';
    button.setAttribute('aria-label', button.title);
    window.setTimeout(() => { button.title = originalTitle; button.setAttribute('aria-label', originalTitle); }, 1600);
  }

  function appendScoreCaseContents(box, scoreCase, showYaku, yakumanCertain) {
    const variants = scoreCase && scoreCase.variants || [];
    if (scoreCase && scoreCase.score && scoreCase.yakuman && scoreCase.yakuman.length && !variants.length) {
      const detail = document.createElement('small');
      if (scoreCase.yakuman.some((item) => item.name === '累计役满')) {
        detail.textContent = `${scoreCase.han}番${scoreCase.fu}符 · 累计役满`;
      } else {
        detail.textContent = scoreCase.score.limit || (scoreCase.yakuman.reduce((sum, item) => sum + item.multiplier, 0) > 1 ? '多倍役满' : '役满');
      }
      box.appendChild(detail);
    } else if (scoreCase && scoreCase.score && !variants.length) {
      const detail = document.createElement('small');
      detail.textContent = `${scoreCase.han}番 ${scoreCase.fu}符${scoreCase.score.limit ? ` · ${scoreCase.score.limit}` : ''}`;
      box.appendChild(detail);
    }
    const rows = groupedScoreVariantRows(variants);
    const sameForEveryWinningTile = oneGroupCoversEveryWinningTile(variants, rows);
    for (const row of rows) {
      const outcome = document.createElement('div');
      outcome.className = `score-outcome${row.yakuman && !yakumanCertain ? ' yakuman-opportunity' : ''}`;
      const alternate = document.createElement('small'); alternate.className = 'score-variant';
      if (!sameForEveryWinningTile) {
        const winning = row.ids.map((id) => Core.tileLabel(id)).join('、');
        alternate.appendChild(document.createTextNode(`和 ${winning}：`));
      }
      alternate.appendChild(document.createTextNode(row.outcome));
      if (row.pointText) {
        alternate.appendChild(document.createTextNode(' · '));
        const points = document.createElement('b'); points.className = 'score-points';
        points.textContent = row.pointText;
        alternate.appendChild(points);
      }
      outcome.appendChild(alternate);
      if (showYaku && row.items.length) {
        const yakuLine = document.createElement('div'); yakuLine.className = 'hanfu-line score-yaku-line';
        for (const item of row.items) {
          const tag = document.createElement('span'); tag.className = `yaku-tag${item.yakuman ? ' yakuman-tag' : ''}`;
          tag.textContent = item.text;
          yakuLine.appendChild(tag);
        }
        outcome.appendChild(yakuLine);
      }
      box.appendChild(outcome);
    }
  }

  function scoreVariantsHaveDifferentPoints(variants) {
    const points = new Set((variants || []).map((variant) => JSON.stringify(variant.score || null)));
    return points.size > 1;
  }

  function scoreCaseYakumanState(scoreCase) {
    const variants = scoreCase && scoreCase.variants || [];
    const hasYakuman = variants.length
      ? variants.some((variant) => (variant.yakuman || []).length > 0)
      : Boolean(scoreCase && ((scoreCase.allYakuman || []).length || (scoreCase.yakuman || []).length));
    const certain = variants.length
      ? variants.every((variant) => (variant.yakuman || []).length > 0)
      : hasYakuman;
    return { hasYakuman, certain };
  }

  function scoreCaseYakuSignature(scoreCase) {
    const byTile = new Map();
    for (const variant of scoreCase && scoreCase.variants || []) {
      const items = yakuItemsForVariant(variant, true).map((item) => item.text);
      for (const id of variant.winningTiles || []) {
        if (!byTile.has(id)) byTile.set(id, new Set());
        for (const item of items) byTile.get(id).add(item);
      }
    }
    return JSON.stringify([...byTile.entries()]
      .sort(([a], [b]) => a - b)
      .map(([id, items]) => [id, [...items].sort()]));
  }

  function scoreBox(label, scoreCase, showYaku) {
    const box = document.createElement('div'); box.className = 'score-box';
    const caseYakumanState = scoreCaseYakumanState(scoreCase);
    if (caseYakumanState.certain) box.classList.add('yakuman-certain');
    const labelEl = document.createElement('span'); labelEl.textContent = label; box.appendChild(labelEl);
    const value = document.createElement('strong');
    if (!scoreCase || !scoreCase.score) { box.classList.add('unavailable'); value.textContent = '无役'; }
    else value.textContent = Core.formatScore(scoreCase.score);
    if (scoreVariantsHaveDifferentPoints(scoreCase && scoreCase.variants)) value.hidden = true;
    box.appendChild(value);
    appendScoreCaseContents(box, scoreCase, showYaku, caseYakumanState.certain);
    return box;
  }

  function scoreMethodRow(label, scoreCase, showYaku) {
    const row = document.createElement('div'); row.className = 'score-method';
    const caseYakumanState = scoreCaseYakumanState(scoreCase);
    if (caseYakumanState.certain) row.classList.add('yakuman-certain');
    const heading = document.createElement('div'); heading.className = 'score-method-heading';
    const name = document.createElement('span'); name.textContent = label; heading.appendChild(name);
    const value = document.createElement('strong');
    if (!scoreCase || !scoreCase.score) { row.classList.add('unavailable'); value.textContent = '无役'; }
    else value.textContent = Core.formatScore(scoreCase.score);
    if (scoreVariantsHaveDifferentPoints(scoreCase && scoreCase.variants)) value.hidden = true;
    heading.appendChild(value); row.appendChild(heading);
    appendScoreCaseContents(row, scoreCase, showYaku, caseYakumanState.certain);
    return row;
  }

  function openMeldScoreBox(cases, showYaku, yakumanCertain) {
    const box = document.createElement('div'); box.className = 'score-box';
    if (yakumanCertain) box.classList.add('yakuman-certain');
    const sameYaku = scoreCaseYakuSignature(cases.damaRon) === scoreCaseYakuSignature(cases.damaTsumo);
    const ronRow = scoreMethodRow('荣和', cases.damaRon, showYaku && !sameYaku);
    const tsumoRow = scoreMethodRow('自摸', cases.damaTsumo, showYaku && !sameYaku);
    box.appendChild(ronRow);
    box.appendChild(tsumoRow);
    if (showYaku && sameYaku) {
      appendVariantYakuRows(box, cases.damaRon && cases.damaRon.variants || [], 'hanfu-line score-yaku-line', true);
    }
    return box;
  }

  function scoreGrid(cases, showYaku, yakumanCertain) {
    const grid = document.createElement('div'); grid.className = `score-grid${hasOpenMeld() ? ' score-grid-open' : ''}`;
    if (hasOpenMeld()) {
      grid.appendChild(openMeldScoreBox(cases, showYaku, yakumanCertain));
      return grid;
    }
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

  function groupedScoreVariantRows(variants) {
    const differentScores = scoreVariantsHaveDifferentPoints(variants);
    const byTile = new Map();
    for (const variant of variants || []) {
      if (!variant.winningTiles || !variant.winningTiles.length) continue;
      const yakuman = Boolean(variant.yakuman && variant.yakuman.length);
      let outcome;
      if (!variant.score) outcome = '无役';
      else if (yakuman) {
        outcome = variant.yakuman.some((item) => item.name === '累计役满')
          ? `${variant.han}番${variant.fu}符 · 累计役满`
          : variant.score.limit || '役满';
      } else outcome = `${variant.han}番${variant.fu}符`;
      const pointText = differentScores && variant.score ? Core.formatScore(variant.score) : '';
      const items = yakuItemsForVariant(variant, false);
      const key = JSON.stringify([outcome, pointText, yakuman, items.map((item) => item.text)]);
      for (const id of variant.winningTiles) {
        if (!byTile.has(id)) byTile.set(id, { key, outcome, pointText, items, yakuman });
      }
    }
    const rows = new Map();
    for (const [id, item] of byTile) {
      if (!rows.has(item.key)) rows.set(item.key, {
        ids: [], outcome: item.outcome, pointText: item.pointText, items: item.items, yakuman: item.yakuman
      });
      rows.get(item.key).ids.push(id);
    }
    return [...rows.values()].sort((a, b) => a.ids[0] - b.ids[0]);
  }

  function oneGroupCoversEveryWinningTile(variants, groups) {
    if (groups.length !== 1) return false;
    const winningIds = new Set((variants || []).flatMap((variant) => variant.winningTiles || []));
    return winningIds.size > 0 && winningIds.size === groups[0].ids.length &&
      [...winningIds].every((id) => groups[0].ids.includes(id));
  }

  function yakuItemsForVariant(variant, excludeContextYaku) {
    const items = [];
    const namedYakuman = (variant && variant.yakuman || []).filter((item) => item.name !== '累计役满');
    for (const yaku of variant && variant.yaku || []) {
      if (yaku.name === '累计役满') continue;
      if (excludeContextYaku && (yaku.name === '立直' || yaku.name === '门前清自摸和')) continue;
      items.push({ text: `${yaku.name} ${yaku.han}番` });
    }
    for (const yakuman of namedYakuman) {
      items.push({ text: yakumanText(yakuman), yakuman: true });
    }
    if (!namedYakuman.length && variant && variant.score && variant.dora) items.push({ text: `宝牌 ${variant.dora}番` });
    return items;
  }

  function groupedVariantYakuRows(variants, excludeContextYaku) {
    const outcomesByTile = new Map();
    for (const variant of variants || []) {
      const items = yakuItemsForVariant(variant, excludeContextYaku);
      if (!items.length) continue;
      const key = items.map((item) => item.text).join('\u0000');
      for (const id of variant.winningTiles || []) {
        if (!outcomesByTile.has(id)) outcomesByTile.set(id, new Map());
        const byKey = outcomesByTile.get(id);
        if (!byKey.has(key)) byKey.set(key, items);
      }
    }
    const rowsByKey = new Map();
    for (const [id, outcomes] of outcomesByTile) {
      const key = [...outcomes.keys()].join('\u0001');
      if (!rowsByKey.has(key)) rowsByKey.set(key, { ids: [], items: [...outcomes.values()][0] });
      rowsByKey.get(key).ids.push(id);
    }
    return [...rowsByKey.values()].sort((a, b) => a.ids[0] - b.ids[0]);
  }

  function appendVariantYakuRows(parent, variants, className, excludeContextYaku) {
    const rows = groupedVariantYakuRows(variants, excludeContextYaku);
    if (!rows.length) return;
    const winningIds = new Set((variants || []).flatMap((variant) => variant.winningTiles || []));
    appendGroupedYakuRows(parent, rows, winningIds, className);
  }

  function appendGroupedYakuRows(parent, rows, winningIds, className) {
    if (!rows.length) return;
    const sameForEveryWinningTile = rows.length === 1 && winningIds.size > 0 &&
      rows[0].ids.length === winningIds.size && rows[0].ids.every((id) => winningIds.has(id));
    for (const row of rows) {
      const line = document.createElement('div'); line.className = className || 'hanfu-line';
      if (!sameForEveryWinningTile) {
        const winning = document.createElement('span');
        winning.className = 'yaku-winning-context';
        winning.textContent = `和 ${row.ids.map((id) => Core.tileLabel(id)).join('、')}：`;
        line.appendChild(winning);
      }
      for (const item of row.items) {
        const tag = document.createElement('span'); tag.className = `yaku-tag${item.yakuman ? ' yakuman-tag' : ''}`;
        tag.textContent = item.text;
        line.appendChild(tag);
      }
      parent.appendChild(line);
    }
  }

  function appendDistanceRoutes(card, distance) {
    const rawRoutes = distance && distance.improvements && distance.improvements.length
      ? distance.improvements.filter((route) => {
        const remaining = Number.isFinite(route.remaining)
          ? route.remaining
          : (route.draws || []).reduce((sum, draw) => sum + (draw.remaining || 0), 0);
        return route.shanten < 0 || remaining > 0;
      })
      : [];
    const groupedRoutes = new Map();
    for (const route of rawRoutes) {
      const discards = [...new Set(route.discards || [])].sort((a, b) => a - b);
      const key = JSON.stringify([route.route || '', route.shanten, discards, route.kanAction, Boolean(route.anyDraw)]);
      let group = groupedRoutes.get(key);
      if (!group) {
        group = { ...route, discards, draws: [], remaining: 0 };
        groupedRoutes.set(key, group);
      }
      const draws = route.draws && route.draws.length
        ? route.draws
        : Number.isInteger(route.id) ? [{ id: route.id, remaining: route.remaining || 0 }] : [];
      const byId = new Map(group.draws.map((draw) => [draw.id, draw]));
      for (const draw of draws) {
        if (!byId.has(draw.id)) byId.set(draw.id, { ...draw });
        else byId.get(draw.id).remaining = Math.max(byId.get(draw.id).remaining || 0, draw.remaining || 0);
      }
      group.draws = [...byId.values()].sort((a, b) => a.id - b.id);
      group.remaining = group.draws.reduce((sum, draw) => sum + (draw.remaining || 0), 0);
    }
    const routes = [...groupedRoutes.values()];
    if (!routes.length) {
      return;
    }
    const list = document.createElement('div'); list.className = 'distance-route-list';
    for (const route of routes.slice(0, 3)) {
      const item = document.createElement('div'); item.className = 'distance-route';
      const discards = route.discards && route.discards.length ? `；打 ${route.discards.map((id) => Core.tileLabel(id)).join('、')}` : '';
      const kanAction = Number.isInteger(route.kanAction) ? `；暗杠${Core.tileLabel(route.kanAction)}` : '';
      const distance = Number.isFinite(route.shanten) ? ` · ${shantenText(route.shanten)}` : '';
      const ukeire = Number.isFinite(route.remaining) ? ` · ${route.remaining}张进张` : '';
      const label = document.createElement('div'); label.className = 'distance-route-summary';
      label.textContent = `${route.route || '役满路线'}${distance}${ukeire}${kanAction}${discards}`;
      item.appendChild(label);
      const draws = route.draws || [];
      if (draws.length) {
        const tiles = document.createElement('div'); tiles.className = 'distance-route-tiles';
        if (route.anyDraw) {
          const any = document.createElement('span'); any.className = 'distance-route-tile distance-route-any';
          any.appendChild(anyTileImg());
          const anyLabel = document.createElement('small'); anyLabel.textContent = '任意'; any.appendChild(anyLabel);
          tiles.appendChild(any);
        } else {
          for (const draw of draws) {
            const tile = document.createElement('span'); tile.className = 'distance-route-tile';
            tile.title = `${Core.tileLabel(draw.id)}，剩余 ${draw.remaining} 张`;
            tile.appendChild(tileImg(draw.id, false, Core.tileLabel(draw.id)));
            const count = document.createElement('small'); count.textContent = String(draw.remaining); tile.appendChild(count);
            tiles.appendChild(tile);
          }
        }
        item.appendChild(tiles);
      } else {
        const empty = document.createElement('div'); empty.className = 'distance-route-summary'; empty.textContent = '等待进张';
        item.appendChild(empty);
      }
      list.appendChild(item);
    }
    card.appendChild(list);
  }

  function distanceMeta(distance, view) {
    if (distance && distance.impossible) return '当前副露与牌型限制下不存在向听数≤6的役满路线。';
    if (distance && distance.yakumanOpportunity) return '当前牌型存在役满机会，以下列出可达路线：';
    if (distance && distance.kanActions && distance.kanActions.length) {
      const actions = distance.kanActions.map((id) => Core.tileLabel(id)).join('、');
      return `推荐暗杠<strong class="distance-discard">${escapeHtml(actions)}</strong>进入役满路线。`;
    }
    if (view === 'complete' || view === 'discard') {
      const names = [...new Set(distance.discards || [])].map((id) => Core.tileLabel(id)).join('、') || '无';
      return view === 'complete'
        ? `当前和牌不是役满，推荐打出：<strong class="distance-discard">${escapeHtml(names)}</strong>`
        : `推荐打出：<strong class="distance-discard">${escapeHtml(names)}</strong>。`;
    }
    if (view === 'tenpai') return '当前听牌没有役满和法，推荐进张：';
    return distance.improvements && distance.improvements.length ? '最佳役满路线：' : '按役满与累计役满和法计算。';
  }

  function addYakumanDistance(counts, discard, opts, view) {
    const card = resultCard('役满距离', '计算中', '不会超过15秒，请耐心等待。');
    resultEl.appendChild(card);
    const revision = analysisRevision;
    const showDistance = (distance) => {
      if (revision !== analysisRevision || !card.isConnected) return;
      distanceWorker = null;
      const rendered = resultCard('役满距离', yakumanDistanceValue(distance), distanceMeta(distance, view));
      appendDistanceRoutes(rendered, distance);
      card.replaceWith(rendered);
    };
    const calculateLocally = () => {
      if (revision !== analysisRevision || !card.isConnected) return;
      try {
        showDistance(Core.yakumanDistance(counts, state.melds, opts.sanma, discard, opts));
      } catch (error) {
        if (revision === analysisRevision && card.isConnected) card.replaceWith(resultCard('役满距离', '计算失败', '无法完成役满路线计算。'));
      }
    };
    if (window.location.protocol === 'file:' || typeof Worker === 'undefined') {
      window.setTimeout(calculateLocally, 0);
      return card;
    }
    try {
      const worker = new Worker('./yakuman-worker.js');
      distanceWorker = worker;
      worker.onmessage = (event) => {
        if (revision !== analysisRevision || !card.isConnected) return;
        worker.terminate();
        if (!event.data || !event.data.distance) calculateLocally();
        else showDistance(event.data.distance);
      };
      worker.onerror = () => {
        if (revision !== analysisRevision || !card.isConnected) return;
        distanceWorker = null;
        worker.terminate();
        window.setTimeout(calculateLocally, 0);
      };
      worker.postMessage({ revision, counts, melds: state.melds, sanma: opts.sanma, discard, options: opts });
    } catch (error) {
      window.setTimeout(calculateLocally, 0);
    }
    return card;
  }

  function yakumanDistanceValue(distance) {
    return distance && distance.impossible ? '无可行路线' : shantenText(distance && Number.isFinite(distance.shanten) ? distance.shanten : 0);
  }

  function shantenText(value) {
    const shanten = Math.max(0, Number.isFinite(value) ? value : 0);
    return shanten === 0 ? '听牌' : `${shanten} 向听`;
  }

  function renderCompleteScore(analysis, yakumanMode, opts) {
    resultEl.innerHTML = '';
    const cases = Object.values(analysis.cases).filter(Boolean);
    if (!cases.length) {
      resultEl.innerHTML = '<div class="error-banner">无法确定和牌分解。</div>';
      return;
    }
    const yakumanCases = cases.filter((item) => (item.allYakuman || item.yakuman || []).length);
    const hasYakuman = yakumanCases.length > 0;
    const caseKeys = hasOpenMeld() ? ['damaRon', 'damaTsumo'] : ['riichiRon', 'damaRon', 'riichiTsumo', 'damaTsumo'];
    const yakumanCertain = hasYakuman && caseKeys.every((key) => {
      const item = analysis.cases[key];
      return scoreCaseYakumanState(item).certain;
    });
    const title = yakumanMode && hasYakuman ? (yakumanCertain ? '役满确定' : '役满机会') : '和牌成立';
    const card = resultCard(title);
    if (yakumanMode && hasYakuman) card.querySelector('.result-title').classList.add(yakumanCertain ? 'yakuman-certain' : 'yakuman-opportunity-title');
    resultEl.appendChild(card);
    const grid = scoreGrid(analysis.cases, true, yakumanCertain);
    if (hasOpenMeld()) resultEl.appendChild(grid);
    else {
      const scoreCard = resultCard('四种情形', undefined, '荣和 / 自摸、立直 / 不立直分别列出。');
      scoreCard.appendChild(grid); resultEl.appendChild(scoreCard);
    }
    if (yakumanMode && !yakumanCertain) {
      addYakumanDistance(Core.countsFromTiles(state.tiles), true, opts, 'complete');
    }
  }

  function renderImprovementDraws(info, yakumanMode, opts) {
    const card = resultCard('当前牌面', shantenText(info.shanten), '以下进张能在摸入后打出对应牌，减少普通向听数：');
    const list = document.createElement('div'); list.className = 'draw-improvements';
    const groups = new Map();
    for (const draw of info.improvements || []) {
      const discards = draw.discards.slice().sort((a, b) => a - b);
      const key = `${draw.shanten}|${discards.join(',')}`;
      if (!groups.has(key)) groups.set(key, { shanten: draw.shanten, discards, draws: [] });
      const group = groups.get(key);
      group.draws.push(draw);
    }
    const activeCount = Array.from({ length: 34 }, (_, id) => id).filter((id) => Core.allowedTile(id, opts.sanma)).length;
    for (const group of groups.values()) {
      const row = document.createElement('div'); row.className = 'improvement-row';
      const anyDraw = group.draws.length >= Math.ceil(activeCount * 0.6);
      const tiles = document.createElement('div'); tiles.className = 'improvement-tiles';
      if (anyDraw) { const any = anyTileImg(); any.classList.add('any-tile'); tiles.appendChild(any); }
      else for (const draw of group.draws) tiles.appendChild(tileImg(draw.id, false, Core.tileLabel(draw.id)));
      row.appendChild(tiles);
      const detail = document.createElement('div'); detail.className = 'improvement-detail';
      const remaining = group.draws.reduce((sum, draw) => sum + draw.remaining, 0);
      const title = document.createElement('strong');
      title.textContent = `进 ${anyDraw ? '任意牌' : group.draws.map((draw) => Core.tileLabel(draw.id)).join('、')} · 还有 ${remaining} 张`;
      detail.appendChild(title);
      const discards = document.createElement('span');
      discards.textContent = `打 ${group.discards.map((id) => Core.tileLabel(id)).join('、')} → ${shantenText(group.shanten)}`;
      detail.appendChild(discards); row.appendChild(detail); list.appendChild(row);
    }
    if (!info.improvements || !info.improvements.length) {
      const empty = document.createElement('div'); empty.className = 'result-meta'; empty.textContent = '没有能直接降低向听数的进张。'; list.appendChild(empty);
    }
    card.appendChild(list); resultEl.innerHTML = ''; resultEl.appendChild(card);
    if (yakumanMode) {
      addYakumanDistance(Core.countsFromTiles(state.tiles), false, opts, 'improvement');
    }
  }

  function renderDiscards(info, yakumanMode, opts) {
    const card = resultCard('当前牌面', shantenText(info.shanten), '打出以下任一牌后可进入当前最低向听数，按有效进张数排序：');
    const list = document.createElement('div'); list.className = 'draw-list';
    const counts = Core.countsFromTiles(state.tiles);
    const scoringWaitCache = new Map();
    const hasScoringWait = (discard) => {
      if (discard.shanten !== 0) return true;
      if (scoringWaitCache.has(discard.id)) return scoringWaitCache.get(discard.id);
      const afterDiscard = counts.slice();
      afterDiscard[discard.id]--;
      const waits = Core.findWaits(afterDiscard, state.melds, opts);
      const result = waits.some((wait) => Object.values(wait.analysis && wait.analysis.cases || {})
        .some((scoreCase) => scoreCase && scoreCase.score));
      scoringWaitCache.set(discard.id, result);
      return result;
    };
    const discards = info.discards.slice().sort((a, b) => {
      const aNoYaku = a.shanten === 0 && !hasScoringWait(a);
      const bNoYaku = b.shanten === 0 && !hasScoringWait(b);
      return Number(aNoYaku) - Number(bNoYaku);
    });
    for (const discard of discards.slice(0, 12)) {
      const item = document.createElement('div'); item.className = 'draw-item';
      item.appendChild(tileImg(discard.id, false, Core.tileLabel(discard.id)));
      const name = document.createElement('span'); name.textContent = `打 ${Core.tileLabel(discard.id)}`; item.appendChild(name);
      const ukeire = discard.ukeire.reduce((sum, draw) => sum + draw.remaining, 0);
      const count = document.createElement('em'); count.textContent = `进 ${ukeire} 张`; item.appendChild(count);
      list.appendChild(item);
    }
    card.appendChild(list); resultEl.innerHTML = ''; resultEl.appendChild(card);
    if (yakumanMode) {
      addYakumanDistance(Core.countsFromTiles(state.tiles), true, opts, 'discard');
    }
  }

  function waitTileCard(wait, yakumanMode, showOpportunity) {
    const item = document.createElement('div'); item.className = 'wait-tile';
    const groupedWaits = wait.groupWaits || [wait];
    if (wait.anyWait) item.appendChild(anyTileImg(wait.anyAsset || 'any.png', wait.anyLabel || '任意牌'));
    else item.appendChild(tileImg(wait.id, Boolean(wait.red), wait.red ? `0${Core.SUITS[Math.floor(wait.id / 9)]}` : Core.tileLabel(wait.id)));
    const details = document.createElement('div'); details.className = 'wait-details';
    const physical = fixedPhysicalCounts();
    const remaining = groupedWaits.reduce((sum, item) => sum + (Number.isFinite(item.remaining) ? item.remaining : Math.max(0, 4 - physical[item.id])), 0);
    const title = document.createElement('strong');
    title.textContent = wait.anyWait
      ? `${wait.anyLabel || '任意牌'} · ${groupedWaits.length}种 · 还有 ${remaining} 张`
      : `${wait.red ? `0${Core.SUITS[Math.floor(wait.id / 9)]}` : Core.tileLabel(wait.id)} · 还有 ${remaining} 张`;
    details.appendChild(title);
    const cases = [
      ['riichiRon', '立直 · 荣和', wait.analysis.cases.riichiRon],
      ['damaRon', '不立直 · 荣和', wait.analysis.cases.damaRon],
      ['riichiTsumo', '立直 · 自摸', wait.analysis.cases.riichiTsumo],
      ['damaTsumo', '不立直 · 自摸', wait.analysis.cases.damaTsumo]
    ];
    const caseGrid = document.createElement('div'); caseGrid.className = `wait-case-grid${hasOpenMeld() ? ' wait-case-grid-open' : ''}`;
    if (hasOpenMeld()) {
      const box = document.createElement('div'); box.className = 'wait-case wait-open-case';
      const openCases = [
        ['damaRon', '荣和', wait.analysis.cases.damaRon],
        ['damaTsumo', '自摸', wait.analysis.cases.damaTsumo]
      ];
      const openYakuman = openCases.some(([, , scoreCase]) => scoreCaseYakumanState(scoreCase).hasYakuman);
      if (yakumanMode && openYakuman) box.classList.add('yakuman-certain');
      const sameYaku = scoreCaseYakuSignature(openCases[0][2]) === scoreCaseYakuSignature(openCases[1][2]);
      for (const [key, label, scoreCase] of openCases) {
        const method = document.createElement('div');
        method.className = `wait-method${yakumanMode && openYakuman ? ' yakuman-certain' : ''}`;
        const heading = document.createElement('div'); heading.className = 'wait-method-heading';
        const methodName = document.createElement('span'); methodName.textContent = label; heading.appendChild(methodName);
        const value = document.createElement('strong');
        value.textContent = scoreCase && scoreCase.score ? Core.formatScore(scoreCase.score) : '无役';
        heading.appendChild(value); method.appendChild(heading);
        if (scoreCase && scoreCase.score) {
          const detail = document.createElement('small');
          if (scoreCase.yakuman && scoreCase.yakuman.length) {
            detail.textContent = scoreCase.yakuman.some((item) => item.name === '累计役满') ? `${scoreCase.han}番${scoreCase.fu}符 · 累计役满` : (scoreCase.score.limit || '役满');
          } else detail.textContent = `${scoreCase.han}番 ${scoreCase.fu}符`;
          method.appendChild(detail);
        } else method.classList.add('unavailable');
        if (yakumanMode && openYakuman && showOpportunity) {
          const marker = document.createElement('small'); marker.className = 'yakuman-opportunity-label'; marker.textContent = '役满机会'; method.appendChild(marker);
        }
        if (!sameYaku && scoreCase) {
          appendVariantYakuRows(method, scoreCase.variants || [], 'wait-yaku', true);
        }
        box.appendChild(method);
      }
      if (sameYaku) {
        appendVariantYakuRows(box, openCases[0][2] && openCases[0][2].variants || [], 'wait-yaku', true);
      }
      caseGrid.appendChild(box);
    } else for (const [key, label, scoreCase] of cases) {
      const box = document.createElement('div'); box.className = 'wait-case';
      const name = document.createElement('span'); name.textContent = label; box.appendChild(name);
      const value = document.createElement('strong'); value.textContent = scoreCase && scoreCase.score ? Core.formatScore(scoreCase.score) : '无役'; box.appendChild(value);
      if (scoreCase && scoreCase.score) {
        const detail = document.createElement('small');
        if (scoreCase.yakuman && scoreCase.yakuman.length) {
          detail.textContent = scoreCase.yakuman.some((item) => item.name === '累计役满') ? `${scoreCase.han}番${scoreCase.fu}符 · 累计役满` : (scoreCase.score.limit || '役满');
        } else detail.textContent = `${scoreCase.han}番 ${scoreCase.fu}符`;
        box.appendChild(detail);
      }
      else box.classList.add('unavailable');
      if (scoreCase) appendVariantYakuRows(box, scoreCase.variants || [], 'wait-yaku', true);
      const yakumanState = scoreCaseYakumanState(scoreCase);
      if (yakumanMode && yakumanState.hasYakuman) {
        box.classList.add(yakumanState.certain ? 'yakuman-certain' : 'yakuman-opportunity');
        if (showOpportunity) {
          const marker = document.createElement('small'); marker.className = 'yakuman-opportunity-label'; marker.textContent = '役满机会'; box.appendChild(marker);
        }
      }
      caseGrid.appendChild(box);
    }
    details.appendChild(caseGrid);
    if (yakumanMode && ((wait.yakuman && wait.yakuman.length) || Object.values(wait.caseYakuman || {}).some(Boolean))) item.classList.add('yakuman-hit');
    item.appendChild(details); return item;
  }

  function waitOutcomeKey(wait) {
    const yakumanKey = (items) => (items || []).map((item) => [item.name, item.label, item.multiplier]).sort();
    const yakuKey = (items) => (items || []).map((item) => [item.name, item.han]).sort();
    const visibleBonusStats = (items) => {
      const named = (items || []).some((item) => item.name !== '累计役满');
      const counted = (items || []).some((item) => item.name === '累计役满');
      return !named || counted;
    };
    const cases = Object.entries(wait.analysis.cases || {}).map(([key, scoreCase]) => {
      if (!scoreCase) return [key, null];
      const yakuman = [...new Map([...(scoreCase.allYakuman || []), ...(scoreCase.yakuman || [])].map((item) => [item.name, item])).values()];
      const includeBonus = visibleBonusStats(yakuman);
      const variants = (scoreCase.variants || []).map((item) => {
        const itemYakuman = item.yakuman || [];
        const includeVariantBonus = visibleBonusStats(itemYakuman);
        return [
          item.score && [item.score.total, item.score.limit],
          includeVariantBonus ? item.han : null,
          includeVariantBonus ? item.fu : null,
          includeVariantBonus && !itemYakuman.some((entry) => entry.name !== '累计役满') ? item.dora : null,
          yakuKey(item.yaku), yakumanKey(itemYakuman)
        ];
      }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return [key, {
        han: includeBonus ? scoreCase.han : null,
        fu: includeBonus ? scoreCase.fu : null,
        dora: includeBonus && !yakuman.some((item) => item.name !== '累计役满') ? scoreCase.dora : null,
        score: scoreCase.score && [scoreCase.score.total, scoreCase.score.limit],
        yaku: yakuKey(scoreCase.allYaku || scoreCase.yaku),
        yakuman: yakumanKey(yakuman),
        variants
      }];
    });
    return JSON.stringify(cases);
  }

  function mergeEquivalentRedFives(waits) {
    const byId = new Map();
    for (const wait of waits) {
      if (!byId.has(wait.id)) byId.set(wait.id, []);
      byId.get(wait.id).push(wait);
    }
    const merged = [];
    for (const [id, sameTileWaits] of byId) {
      const regular = sameTileWaits.find((wait) => !wait.red);
      const red = sameTileWaits.find((wait) => wait.red);
      if (id < 27 && id % 9 === 4 && regular && red && waitOutcomeKey(regular) === waitOutcomeKey(red)) {
        merged.push({ ...regular, remaining: regular.remaining + red.remaining, groupWaits: [regular, red] });
        merged.push(...sameTileWaits.filter((wait) => wait !== regular && wait !== red));
      } else merged.push(...sameTileWaits);
    }
    return merged.sort((a, b) => a.id - b.id || Number(b.red) - Number(a.red));
  }

  function yakumanHasLabel(wait, label) {
    return (wait.yakuman || []).some((item) => (item.label || item.name) === label);
  }

  function specialWaitGroups(waits) {
    const groups = [];
    const used = new Set();
    const kokushi = waits.filter((wait) => yakumanHasLabel(wait, '国士无双十三面') &&
      (wait.id >= 27 || wait.id % 9 === 0 || wait.id % 9 === 8));
    if (kokushi.length) {
      groups.push({ ...kokushi[0], anyWait: true, anyAsset: '19_.png', anyLabel: '幺九牌', groupWaits: kokushi });
      kokushi.forEach((wait) => used.add(wait));
    }
    for (let suit = 0; suit < 3; suit++) {
      const chuuren = waits.filter((wait) => wait.id >= suit * 9 && wait.id < suit * 9 + 9 && yakumanHasLabel(wait, '纯正九莲宝灯'));
      if (!chuuren.length) continue;
      groups.push({ ...chuuren[0], anyWait: true, anyAsset: `any${Core.SUITS[suit]}.png`, anyLabel: `任意${['万子', '筒子', '索子'][suit]}`, groupWaits: chuuren });
      chuuren.forEach((wait) => used.add(wait));
    }
    return { groups, remaining: waits.filter((wait) => !used.has(wait)) };
  }

  function renderTenpai(counts, waits, opts, yakumanMode) {
    resultEl.innerHTML = '';
    const caseKeys = hasOpenMeld() ? ['damaRon', 'damaTsumo'] : ['riichiRon', 'damaRon', 'riichiTsumo', 'damaTsumo'];
    const yakumanCertain = yakumanMode && waits.length > 0 && waits.every((wait) => caseKeys.every((key) =>
      scoreCaseYakumanState(wait.analysis.cases[key]).certain));
    const physical = fixedPhysicalCounts();
    const displayWaits = mergeEquivalentRedFives(waits);
    const remaining = waits.reduce((sum, wait) => sum + (Number.isFinite(wait.remaining) ? wait.remaining : Math.max(0, 4 - physical[wait.id])), 0);
    const card = resultCard(yakumanCertain ? '听牌 · 役满确定' : '听牌', `${displayWaits.length}种${remaining}张`, hasOpenMeld()
      ? '每种和牌分别列出役种、荣和与自摸计分及剩余张数。'
      : '每种和牌分别列出役种、四种计分情形与剩余张数。');
    if (yakumanCertain) card.querySelector('.result-title').classList.add('yakuman-certain');
    const list = document.createElement('div'); list.className = 'waits';
    const special = specialWaitGroups(displayWaits);
    for (const wait of special.groups) list.appendChild(waitTileCard(wait, yakumanMode, yakumanMode && !yakumanCertain));
    const grouped = new Map();
    for (const wait of special.remaining) {
      const key = waitOutcomeKey(wait);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(wait);
    }
    const availableKinds = Array.from({ length: 34 }, (_, id) => id).filter((id) => Core.allowedTile(id, opts.sanma) && physical[id] < 4).length;
    for (const group of grouped.values()) {
      if (group.length >= Math.ceil(availableKinds * 0.35)) {
        list.appendChild(waitTileCard({ ...group[0], anyWait: true, groupWaits: group }, yakumanMode, yakumanMode && !yakumanCertain));
      } else for (const wait of group) list.appendChild(waitTileCard(wait, yakumanMode, yakumanMode && !yakumanCertain));
    }
    card.appendChild(list); resultEl.appendChild(card);
    if (yakumanMode && !yakumanCertain) {
      addYakumanDistance(counts, false, opts, 'tenpai');
    }
  }

  function renderAnalysisResult(result, opts, yakumanMode) {
    if (!result.valid) {
      resultEl.innerHTML = `<div class="error-banner">${result.errors.map(escapeHtml).join('<br>')}</div>`;
      stateEl.textContent = '输入有误'; stateEl.classList.remove('ready'); return;
    }
    stateEl.textContent = '已分析'; stateEl.classList.add('ready');
    if (result.kind === 'complete') renderCompleteScore(result.analysis, yakumanMode, opts);
    else if (result.kind === 'discard') renderDiscards(result.info, yakumanMode, opts);
    else if (result.kind === 'tenpai') renderTenpai(result.counts, result.waits, opts, yakumanMode);
    else renderImprovementDraws(result.info, yakumanMode, opts);
  }

  function analyze() {
    const opts = options();
    const validation = Core.validate(state.tiles, state.melds, opts);
    if (!validation.valid) {
      renderAnalysisResult({ valid: false, errors: validation.errors }, opts, yakumanModeEl.checked);
      return;
    }
    const counts = Core.countsFromTiles(state.tiles);
    const yakumanMode = yakumanModeEl.checked;
    if (validation.effective === 14) {
      const analysis = Core.analyzeScore(counts, state.melds, opts);
      if (analysis.complete) renderAnalysisResult({ valid: true, kind: 'complete', analysis }, opts, yakumanMode);
      else renderAnalysisResult({ valid: true, kind: 'discard', info: Core.bestDiscards(state.tiles, state.melds, opts.sanma, opts.indicatorCounts) }, opts, yakumanMode);
      return;
    }
    const waits = Core.findWaits(counts, state.melds, opts);
    if (waits.length) renderAnalysisResult({ valid: true, kind: 'tenpai', counts, waits }, opts, yakumanMode);
    else renderAnalysisResult({ valid: true, kind: 'improvement', info: Core.improvingDraws(counts, state.melds, opts.sanma, opts.indicatorCounts) }, opts, yakumanMode);
  }

  function refreshAnalysis() {
    analysisRevision++;
    if (analysisWorker) {
      analysisWorker.terminate();
      analysisWorker = null;
    }
    if (distanceWorker) {
      distanceWorker.terminate();
      distanceWorker = null;
    }
    const effective = effectiveCount();
    if (effective !== 13 && effective !== 14) {
      stateEl.textContent = '输入中'; stateEl.classList.remove('ready');
      if (!effective) {
        resultEl.innerHTML = '<div class="empty-result"><span class="empty-symbol">?</span><strong>等待牌姿</strong><p>输入 13 或 14 张有效牌后自动分析</p></div>';
      } else {
        resultEl.innerHTML = '<div class="empty-result"><span class="empty-symbol">…</span><strong>牌数未齐</strong><p>补足至 13 张后会自动分析</p></div>';
      }
      return;
    }
    const revision = analysisRevision;
    const opts = options();
    const yakumanMode = yakumanModeEl.checked;
    resultEl.innerHTML = '<div class="empty-result"><span class="empty-symbol">…</span><strong>分析中</strong><p>正在计算牌姿结果</p></div>';
    if (window.location.protocol === 'file:' || typeof Worker === 'undefined') {
      window.setTimeout(() => { if (revision === analysisRevision) analyze(); }, 0);
      return;
    }
    try {
      const worker = new Worker('./analysis-worker.js');
      analysisWorker = worker;
      worker.onmessage = (event) => {
        if (revision !== analysisRevision) return;
        worker.terminate();
        analysisWorker = null;
        if (event.data && !event.data.error) renderAnalysisResult(event.data, opts, yakumanMode);
        else window.setTimeout(() => { if (revision === analysisRevision) analyze(); }, 0);
      };
      worker.onerror = () => {
        if (revision !== analysisRevision) return;
        worker.terminate();
        analysisWorker = null;
        window.setTimeout(() => { if (revision === analysisRevision) analyze(); }, 0);
      };
      worker.postMessage({ revision, tiles: state.tiles, melds: state.melds, options: opts });
    } catch (error) {
      window.setTimeout(() => { if (revision === analysisRevision) analyze(); }, 0);
    }
  }

  function changePlayerCount() {
    const sanma = Number(playerCountEl.value) === 3;
    if (sanma) {
      state.tiles = state.tiles.filter((tile) => Core.allowedTile(tile.id, true));
      state.melds = state.melds.filter((meld) => meld.type !== 'chi' && meld.tiles.every((id) => Core.allowedTile(id, true)));
      for (let id = 0; id < 34; id++) if (!Core.allowedTile(id, true)) state.doraCounts[id] = 0;
    }
    document.body.classList.toggle('sanma', sanma); renderAll();
  }

  $('#clear-hand').addEventListener('click', () => {
    state.tiles = [];
    state.melds = [];
    state.doraCounts.fill(0);
    state.kita = 0;
    renderAll();
  });
  $('#copy-state').addEventListener('click', copyState);
  meldKindEl.addEventListener('change', renderMeldPicker);
  playerCountEl.addEventListener('change', changePlayerCount);
  $('#kita-inc').addEventListener('click', () => {
    if (state.kita >= 4) return;
    state.kita++;
    renderAll();
  });
  $('#kita-dec').addEventListener('click', () => {
    if (state.kita <= 0) return;
    state.kita--;
    renderAll();
  });
  yakumanModeEl.addEventListener('change', refreshAnalysis);
  $('#round-wind').addEventListener('change', () => { updateStatus(); refreshAnalysis(); });
  $('#seat-wind').addEventListener('change', () => { updateStatus(); refreshAnalysis(); });

  renderAll();
})();
