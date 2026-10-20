(function (root) {
  'use strict';

  const SUITS = ['m', 'p', 's'];
  const WIND_IDS = [27, 28, 29, 30];
  const DRAGON_IDS = [31, 32, 33];
  const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];
  const YAKUMAN_NAMES = {
    kokushi: '國士無雙', suuankou: '四暗刻', daisangen: '大三元',
    daisuushii: '大四喜', shousuushii: '小四喜', tsuuiisou: '字一色',
    chinroutou: '清老頭', ryuuiisou: '綠一色', chuuren: '九蓮寶燈',
    suukantsu: '四槓子'
  };

  function suitOf(id) { return Math.floor(id / 9); }
  function rankOf(id) { return id % 9 + 1; }
  function isHonor(id) { return id >= 27; }
  function isTerminal(id) { return id < 27 && (rankOf(id) === 1 || rankOf(id) === 9); }
  function isYaochu(id) { return isHonor(id) || isTerminal(id); }
  function tileLabel(id) {
    if (isHonor(id)) return HONOR_NAMES[id - 27];
    return `${rankOf(id)}${SUITS[suitOf(id)]}`;
  }
  function tileAsset(id, red) {
    if (red) return `assets/mahjong/0${SUITS[suitOf(id)]}.png`;
    if (isHonor(id)) return `assets/mahjong/${id - 26}z.png`;
    return `assets/mahjong/${rankOf(id)}${SUITS[suitOf(id)]}.png`;
  }
  function countsFromTiles(tiles) {
    const counts = Array(34).fill(0);
    for (const tile of tiles) counts[tile.id]++;
    return counts;
  }
  function copyCounts(counts) { return counts.slice(); }
  function total(counts) { return counts.reduce((sum, n) => sum + n, 0); }
  function allowedTile(id, sanma) { return !(sanma && id >= 1 && id <= 7); }
  function fixedCounts(melds, structural) {
    const counts = Array(34).fill(0);
    for (const meld of melds) {
      const limit = structural && meld.type === 'kan' ? 3 : meld.tiles.length;
      for (let i = 0; i < limit; i++) counts[meld.tiles[i]]++;
    }
    return counts;
  }
  function addCounts(a, b) { return a.map((n, i) => n + b[i]); }

  function isKokushi(counts, sanma) {
    const yaochu = [];
    for (let id = 0; id < 34; id++) if (allowedTile(id, sanma) && isYaochu(id)) yaochu.push(id);
    return total(counts) === 14 && yaochu.every(id => counts[id] >= 1) && yaochu.some(id => counts[id] >= 2) && yaochu.every(id => counts[id] <= 2);
  }

  function shanten(counts, meldCount, sanma) {
    let best = 8;
    const work = copyCounts(counts);
    function walk(index, melds, taatsu, pair) {
      while (index < 34 && work[index] === 0) index++;
      if (index >= 34) {
        const usable = Math.min(taatsu, 4 - meldCount - melds);
        best = Math.min(best, 8 - 2 * (meldCount + melds) - usable - pair);
        return;
      }
      const next = index + 1;
      if (work[index] >= 3) {
        work[index] -= 3; walk(index, melds + 1, taatsu, pair); work[index] += 3;
      }
      if (index < 27 && rankOf(index) <= 7 && work[index + 1] && work[index + 2]) {
        work[index]--; work[index + 1]--; work[index + 2]--;
        walk(index, melds + 1, taatsu, pair);
        work[index]++; work[index + 1]++; work[index + 2]++;
      }
      if (work[index] >= 2) {
        work[index] -= 2;
        if (!pair) walk(index, melds, taatsu, 1);
        else walk(index, melds, taatsu + 1, pair);
        work[index] += 2;
      }
      if (index < 27 && rankOf(index) <= 8 && work[index + 1]) {
        work[index]--; work[index + 1]--; walk(index, melds, taatsu + 1, pair); work[index]++; work[index + 1]++;
      }
      if (index < 27 && rankOf(index) <= 7 && work[index + 2]) {
        work[index]--; work[index + 2]--; walk(index, melds, taatsu + 1, pair); work[index]++; work[index + 2]++;
      }
      work[index]--; walk(next, melds, taatsu, pair); work[index]++;
    }
    walk(0, 0, 0, 0);

    if (meldCount === 0) {
      let pairs = 0;
      let distinct = 0;
      for (let id = 0; id < 34; id++) {
        if (!allowedTile(id, sanma) || !counts[id]) continue;
        distinct++;
        if (counts[id] >= 2) pairs++;
      }
      best = Math.min(best, 6 - pairs + Math.max(0, 7 - distinct));
      const yaochu = [];
      for (let id = 0; id < 34; id++) if (allowedTile(id, sanma) && isYaochu(id)) yaochu.push(id);
      const unique = yaochu.filter(id => counts[id] > 0).length;
      const hasPair = yaochu.some(id => counts[id] > 1);
      best = Math.min(best, yaochu.length - unique - (hasPair ? 1 : 0));
    }
    return best;
  }

  function standardDecompositions(counts, melds) {
    const fixed = melds.map(meld => ({
      type: meld.type === 'chi' ? 'sequence' : meld.type === 'pon' ? 'triplet' : 'kan',
      tiles: meld.type === 'chi' ? meld.tiles.slice() : [meld.tiles[0], meld.tiles[0], meld.tiles[0]],
      open: meld.type !== 'ankan', fixed: true
    }));
    const need = 4 - fixed.length;
    if (need < 0 || total(counts) !== need * 3 + 2) return [];
    const work = copyCounts(counts);
    const out = [];
    function walk(index, groups, pair) {
      while (index < 34 && work[index] === 0) index++;
      if (index >= 34) {
        if (pair !== null && groups.length === need) out.push({ type: 'standard', groups: fixed.concat(groups), pair });
        return;
      }
      if (pair === null && work[index] >= 2) {
        work[index] -= 2; walk(index, groups, index); work[index] += 2;
      }
      if (groups.length < need && work[index] >= 3) {
        work[index] -= 3; groups.push({ type: 'triplet', tiles: [index, index, index], open: false });
        walk(index, groups, pair); groups.pop(); work[index] += 3;
      }
      if (groups.length < need && index < 27 && rankOf(index) <= 7 && work[index + 1] && work[index + 2]) {
        work[index]--; work[index + 1]--; work[index + 2]--;
        groups.push({ type: 'sequence', tiles: [index, index + 1, index + 2], open: false });
        walk(index, groups, pair); groups.pop(); work[index]++; work[index + 1]++; work[index + 2]++;
      }
    }
    walk(0, [], null);
    return out;
  }

  function sevenPairs(counts, melds) {
    if (melds.length || total(counts) !== 14) return false;
    return counts.filter(n => n === 2).length === 7;
  }

  function allGroups(counts, melds) { return standardDecompositions(counts, melds); }

  function yakumanFor(counts, melds, decomps, options) {
    const all = addCounts(counts, fixedCounts(melds, true));
    const closed = melds.every(m => m.type === 'ankan');
    const names = [];
    const add = (name, multiplier) => names.push({ name: YAKUMAN_NAMES[name], multiplier: multiplier || 1 });

    if (melds.length === 0 && isKokushi(all, options.sanma)) add('kokushi', options.waitType === 'kokushi13' ? 2 : 1);
    if (all.every((n, id) => !n || isHonor(id))) add('tsuuiisou');
    if (all.every((n, id) => !n || isTerminal(id))) add('chinroutou');
    const green = new Set([19, 20, 21, 23, 25, 32]);
    if (all.every((n, id) => !n || green.has(id))) add('ryuuiisou');

    const winds = WIND_IDS.filter(id => all[id] >= 3);
    const dragons = DRAGON_IDS.filter(id => all[id] >= 3);
    if (dragons.length === 3) add('daisangen');
    if (winds.length === 4) add('daisuushii', 2);
    else if (winds.length === 3 && WIND_IDS.some(id => all[id] >= 2)) add('shousuushii');
    if (melds.filter(m => m.type === 'kan' || m.type === 'ankan').length === 4) add('suukantsu');

    if (closed && decomps.some(d => d.type === 'standard' && d.groups.filter(g => g.type === 'triplet' || g.type === 'kan').length === 4)) {
      const fourTriplets = decomps.some(d => d.type === 'standard' && d.groups.filter(g => g.type === 'triplet' || g.type === 'kan').length === 4);
      if (fourTriplets && (options.tsumo || options.waitType === 'tanki')) add('suuankou', options.waitType === 'tanki' ? 2 : 1);
    }
    if (closed && melds.length === 0 && total(all) === 14) {
      for (let suit = 0; suit < 3; suit++) {
        const ids = Array.from({ length: 9 }, (_, i) => suit * 9 + i);
        if (all.every((n, id) => !n || ids.includes(id))) {
          const base = Array(9).fill(1); base[0] = 3; base[8] = 3;
          if (ids.every((id, i) => all[id] >= base[i]) && ids.reduce((s, id) => s + all[id], 0) === 14) add('chuuren', options.waitType === 'chuuren13' ? 2 : 1);
        }
      }
    }
    return names;
  }

  function yakuFor(counts, melds, decomposition, context, options) {
    const closed = melds.every(m => m.type === 'ankan');
    const groups = decomposition.type === 'standard' ? decomposition.groups : [];
    const pair = decomposition.type === 'standard' ? decomposition.pair : null;
    const all = addCounts(counts, fixedCounts(melds, true));
    const yaku = [];
    const add = (name, han) => yaku.push({ name, han });
    const sequenceGroups = groups.filter(g => g.type === 'sequence');
    const tripletGroups = groups.filter(g => g.type === 'triplet' || g.type === 'kan');
    const hasOpen = melds.some(m => m.type !== 'ankan');

    if (context.riichi && closed) add('立直', 1);
    if (context.tsumo && closed) add('門前清自摸和', 1);
    if (decomposition.type === 'chiitoi') add('七對子', 2);
    const allSimple = all.every((n, id) => !n || (!isHonor(id) && !isTerminal(id)));
    if (allSimple) add('斷么九', 1);

    if (decomposition.type === 'standard') {
      const valuePair = pair !== null && (DRAGON_IDS.includes(pair) || pair === options.seatWind || pair === options.roundWind);
      const pinfu = closed && sequenceGroups.length === 4 && !valuePair && options.waitType === 'ryanmen';
      if (pinfu) add('平和', 1);
      if (closed) {
        const seqKeys = sequenceGroups.map(g => `${suitOf(g.tiles[0])}-${rankOf(g.tiles[0])}`);
        const duplicatePairs = seqKeys.length - new Set(seqKeys).size;
        if (duplicatePairs >= 2) add('二盃口', 3);
        else if (duplicatePairs === 1) add('一盃口', 1);
      }
      for (const group of tripletGroups) {
        const id = group.tiles[0];
        if (DRAGON_IDS.includes(id)) add(`役牌 ${tileLabel(id)}`, 1);
        if (id === options.seatWind) add(`役牌 ${tileLabel(id)}（自風）`, 1);
        if (id === options.roundWind) add(`役牌 ${tileLabel(id)}（場風）`, 1);
      }
      if (tripletGroups.length === 4) add('對對和', 2);
      const concealedTriplets = tripletGroups.filter(g => !g.open).length - (context.tsumo ? 0 : options.waitType === 'shanpon' ? 1 : 0);
      if (concealedTriplets >= 3) add('三暗刻', 2);
      if (groups.filter(g => g.type === 'kan').length === 3) add('三槓子', 2);
      const dragonTriplets = tripletGroups.filter(g => DRAGON_IDS.includes(g.tiles[0])).length;
      if (dragonTriplets === 2 && pair !== null && DRAGON_IDS.includes(pair)) add('小三元', 2);

      const allOutside = pair !== null && isYaochu(pair) && groups.every(g => g.tiles.some(isYaochu));
      const hasSequence = sequenceGroups.length > 0;
      const hasHonor = all.some((n, id) => n && isHonor(id));
      if (allOutside && hasSequence) {
        const terminalEverywhere = groups.every(g => g.tiles.some(isYaochu)) && isYaochu(pair);
        const pure = !hasHonor;
        if (terminalEverywhere && pure) add('純全帶么九', closed ? 3 : 2);
        else add('混全帶么九', closed ? 2 : 1);
      }
      const starts = new Set(sequenceGroups.map(g => g.tiles[0]));
      if ([0, 1, 2].some(s => starts.has(s * 9)) && [0, 1, 2].some(s => starts.has(s * 9 + 3)) && [0, 1, 2].some(s => starts.has(s * 9 + 6))) {
        for (let rank = 0; rank < 3; rank++) {
          if ([0, 1, 2].every(s => starts.has(s * 9 + rank * 3))) { add('一氣通貫', closed ? 2 : 1); break; }
        }
      }
      const sequenceRanks = new Map();
      for (const g of sequenceGroups) {
        const rank = rankOf(g.tiles[0]);
        sequenceRanks.set(rank, (sequenceRanks.get(rank) || new Set()).add(suitOf(g.tiles[0])));
      }
      if ([...sequenceRanks.values()].some(set => set.size === 3)) add('三色同順', closed ? 2 : 1);
      const tripletRanks = new Map();
      for (const g of tripletGroups) {
        const rank = rankOf(g.tiles[0]);
        tripletRanks.set(rank, (tripletRanks.get(rank) || new Set()).add(suitOf(g.tiles[0])));
      }
      if ([...tripletRanks.values()].some(set => set.size === 3)) add('三色同刻', 2);
    }

    if (all.every((n, id) => !n || (!isHonor(id) && !isTerminal(id)))) add('斷么九', 1);
    const suitSet = new Set(all.flatMap((n, id) => n && id < 27 ? [suitOf(id)] : []));
    const hasHonor = all.some((n, id) => n && isHonor(id));
    if (suitSet.size === 1) {
      if (hasHonor) add('混一色', closed ? 3 : 2);
      else add('清一色', closed ? 6 : 5);
    }
    const unique = yaku.filter(item => item.name === '斷么九');
    if (unique.length > 1) yaku.splice(yaku.findIndex(item => item.name === '斷么九'), 1);
    return yaku;
  }

  function fuFor(decomposition, melds, context, options, yaku) {
    if (decomposition.type === 'chiitoi') return 25;
    const groups = decomposition.groups;
    const pair = decomposition.pair;
    const pinfu = yaku.some(item => item.name === '平和');
    if (pinfu) return context.tsumo ? 20 : 30;
    let fu = 20;
    if (!context.tsumo && melds.every(m => m.type === 'ankan')) fu += 10;
    if (context.tsumo) fu += 2;
    if (DRAGON_IDS.includes(pair)) fu += 2;
    if (pair === options.seatWind) fu += 2;
    if (pair === options.roundWind) fu += 2;
    for (const group of groups) {
      if (group.type !== 'triplet' && group.type !== 'kan') continue;
      const id = group.tiles[0];
      const terminal = isYaochu(id);
      const isKan = group.type === 'kan';
      let open = group.open;
      if (!context.tsumo && !group.fixed && options.waitType === 'shanpon' && !open) open = true;
      let value = open ? 2 : 4;
      if (terminal) value *= 2;
      if (isKan) value *= 4;
      fu += value;
    }
    if (options.waitType === 'kanchan' || options.waitType === 'penchan' || options.waitType === 'tanki') fu += 2;
    if (fu === 20) fu = 30;
    return Math.ceil(fu / 10) * 10;
  }

  function round100(n) { return Math.ceil(n / 100) * 100; }
  function scoreFor(han, fu, yakumanCount, dealer, tsumo) {
    if (yakumanCount > 0) {
      const base = 8000 * yakumanCount;
      return scoreFromBase(base, dealer, tsumo, yakumanCount);
    }
    if (!han) return null;
    let base = fu * Math.pow(2, han + 2);
    let limit = '';
    if (han >= 13) { base = 8000; limit = '累計役満'; }
    else if (han >= 11) { base = 6000; limit = '三倍滿'; }
    else if (han >= 8) { base = 4000; limit = '倍滿'; }
    else if (han >= 6) { base = 3000; limit = '跳滿'; }
    else if (han >= 5 || base >= 2000) { base = 2000; limit = '滿貫'; }
    return scoreFromBase(base, dealer, tsumo, false, limit);
  }
  function scoreFromBase(base, dealer, tsumo, yakuman, limit) {
    if (!tsumo) {
      const points = round100(base * (dealer ? 6 : 4));
      return { total: points, ron: points, tsumo: null, limit: yakuman ? (yakuman > 1 ? `${yakuman}倍役满` : '役满') : limit || '' };
    }
    if (dealer) {
      const share = round100(base * 2);
      return { total: share * 3, ron: null, tsumo: { dealer: share, child: share }, limit: yakuman ? (yakuman > 1 ? `${yakuman}倍役满` : '役满') : limit || '' };
    }
    const dealerShare = round100(base * 2);
    const childShare = round100(base);
    return { total: dealerShare + childShare * 2, ron: null, tsumo: { dealer: dealerShare, child: childShare }, limit: yakuman ? (yakuman > 1 ? `${yakuman}倍役满` : '役满') : limit || '' };
  }
  function formatScore(score) {
    if (!score) return '無役';
    if (score.ron !== null) return `${score.ron.toLocaleString('zh-CN')} 點`;
    if (score.tsumo.dealer === score.tsumo.child) return `${score.tsumo.dealer.toLocaleString('zh-CN')} 點 × 3 家`;
    return `親 ${score.tsumo.dealer.toLocaleString('zh-CN')} / 子 ${score.tsumo.child.toLocaleString('zh-CN')}`;
  }

  function doraHan(counts, melds, options) {
    const physical = addCounts(counts, fixedCounts(melds, false));
    let han = options.kita || 0;
    for (let id = 0; id < 34; id++) han += physical[id] * (options.doraCounts[id] || 0);
    han += options.redCount || 0;
    return han;
  }

  function scoreDecomposition(counts, melds, decomposition, options, context) {
    const yakuman = yakumanFor(counts, melds, [decomposition], { ...options, ...context });
    if (yakuman.length) {
      const yakumanCount = yakuman.reduce((sum, item) => sum + item.multiplier, 0);
      const score = scoreFor(0, 0, yakumanCount, options.seatWind === 27, context.tsumo);
      return { yaku: [], han: 0, fu: 0, dora: 0, yakuman, score, yakumanCount };
    }
    const yaku = yakuFor(counts, melds, decomposition, context, options);
    const dora = doraHan(counts, melds, options);
    const han = yaku.reduce((sum, item) => sum + item.han, 0) + dora;
    const fu = fuFor(decomposition, melds, context, options, yaku);
    const score = scoreFor(yaku.length ? han : 0, fu, 0, options.seatWind === 27, context.tsumo);
    return { yaku, han, fu, dora, yakuman: [], score, yakumanCount: 0 };
  }

  function winningDecompositions(counts, melds, sanma) {
    if (total(counts) + melds.length * 3 !== 14) return [];
    const out = standardDecompositions(counts, melds);
    if (!melds.length && sevenPairs(counts, melds)) out.push({ type: 'chiitoi' });
    if (!melds.length && isKokushi(counts, sanma)) out.push({ type: 'kokushi' });
    return out;
  }

  function analyzeScore(counts, melds, options) {
    const decomps = winningDecompositions(counts, melds, options.sanma);
    if (!decomps.length) return { complete: false, cases: null };
    const contexts = [
      { key: 'riichiRon', riichi: true, tsumo: false },
      { key: 'damaRon', riichi: false, tsumo: false },
      { key: 'riichiTsumo', riichi: true, tsumo: true },
      { key: 'damaTsumo', riichi: false, tsumo: true }
    ];
    const cases = {};
    for (const context of contexts) {
      let best = null;
      for (const decomposition of decomps) {
        const scored = decomposition.type === 'kokushi'
          ? (() => {
              const yakuman = yakumanFor(counts, melds, [decomposition], { ...options, ...context });
              const count = yakuman.reduce((s, item) => s + item.multiplier, 0);
              const score = scoreFor(0, 0, count, options.seatWind === 27, context.tsumo);
              return { yaku: [], han: 0, fu: 0, dora: 0, yakuman, score, yakumanCount: count };
            })()
          : scoreDecomposition(counts, melds, decomposition, options, context);
        const totalPoints = scored.score ? scored.score.total : -1;
        if (!best || totalPoints > (best.score ? best.score.total : -1)) best = { ...scored, decomposition };
      }
      cases[context.key] = best;
    }
    return { complete: true, cases, decompositions: decomps };
  }

  function addGroup(counts, ids) {
    const out = copyCounts(counts);
    for (const id of ids) out[id]++;
    return out;
  }
  function isComplete(counts, melds, sanma) { return winningDecompositions(counts, melds, sanma).length > 0; }

  function regularUkeire(counts, melds, sanma, baseShanten) {
    const items = [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, sanma) || counts[id] >= 4) continue;
      const next = addGroup(counts, [id]);
      if (isComplete(next, melds, sanma) || shanten(next, melds.length, sanma) < baseShanten) items.push({ id, remaining: 4 - counts[id] });
    }
    return items;
  }
  function bestDiscards(tiles, melds, sanma) {
    const counts = countsFromTiles(tiles);
    let best = Infinity;
    const options = [];
    const seen = new Set();
    for (const tile of tiles) {
      if (seen.has(tile.id)) continue;
      seen.add(tile.id);
      const next = copyCounts(counts); next[tile.id]--;
      const value = shanten(next, melds.length, sanma);
      if (value < best) { best = value; options.length = 0; }
      if (value === best) options.push({ id: tile.id, shanten: value, ukeire: regularUkeire(next, melds, sanma, value) });
    }
    options.sort((a, b) => b.ukeire.reduce((s, x) => s + x.remaining, 0) - a.ukeire.reduce((s, x) => s + x.remaining, 0));
    return { shanten: best, discards: options };
  }

  function groupPatterns(ids) {
    const groups = [];
    for (const id of ids) groups.push([id, id, id]);
    for (const id of ids) {
      if (id < 27 && rankOf(id) <= 7 && ids.includes(id + 1) && ids.includes(id + 2)) groups.push([id, id + 1, id + 2]);
    }
    return groups;
  }
  function appendPattern(targets, groups, pairIds, base) {
    for (const group of groups) for (const pair of pairIds) {
      const target = base.slice();
      for (const id of group) target[id]++;
      target[pair] += 2;
      if (total(target) !== 14 || target.some(n => n > 4)) continue;
      targets.push(target);
    }
  }
  function makeYakumanTargets(sanma) {
    const active = Array.from({ length: 34 }, (_, id) => id).filter(id => allowedTile(id, sanma));
    const targets = [];
    const yaochu = active.filter(isYaochu);
    const kokushiBase = Array(34).fill(0);
    yaochu.forEach(id => kokushiBase[id] = 1);
    for (const id of yaochu) { const t = kokushiBase.slice(); t[id]++; targets.push(t); }

    const honorIds = active.filter(isHonor);
    const terminalIds = active.filter(isTerminal);
    const greenIds = [19, 20, 21, 23, 25, 32].filter(id => allowedTile(id, sanma));
    const allTripletTargets = (ids, base) => {
      function choose(start, picked) {
        if (picked.length === 4) {
          for (const pair of ids) {
            if (picked.includes(pair)) continue;
            const t = base.slice();
            picked.forEach(id => t[id] += 3); t[pair] += 2;
            if (total(t) === 14 && !t.some(n => n > 4)) targets.push(t);
          }
          return;
        }
        for (let i = start; i < ids.length; i++) choose(i + 1, picked.concat(ids[i]));
      }
      choose(0, []);
    };
    allTripletTargets(honorIds, Array(34).fill(0));
    allTripletTargets(terminalIds, Array(34).fill(0));

    const dragonsBase = Array(34).fill(0); DRAGON_IDS.forEach(id => dragonsBase[id] = 3);
    const generic = groupPatterns(active);
    appendPattern(targets, generic, active, dragonsBase);

    for (const pairWind of WIND_IDS) {
      const base = Array(34).fill(0);
      WIND_IDS.filter(id => id !== pairWind).forEach(id => base[id] = 3);
      base[pairWind] = 2;
      appendPattern(targets, generic, active, base);
    }
    const windsBase = Array(34).fill(0); WIND_IDS.forEach(id => windsBase[id] = 3);
    for (const pair of active.filter(id => !WIND_IDS.includes(id))) {
      const t = windsBase.slice(); t[pair] += 2;
      if (total(t) === 14 && !t.some(n => n > 4)) targets.push(t);
    }

    const greenGroups = groupPatterns(greenIds);
    const greenTargets = [];
    function walkGreen(start, picked, counts) {
      if (picked.length === 4) {
        for (const pair of greenIds) {
          if (counts[pair] + 2 > 4) continue;
          const target = counts.slice(); target[pair] += 2;
          if (total(target) === 14) greenTargets.push(target);
        }
        return;
      }
      for (let i = start; i < greenGroups.length; i++) {
        const next = counts.slice(); let valid = true;
        for (const id of greenGroups[i]) if (++next[id] > 4) valid = false;
        if (valid) walkGreen(i, picked + 1, next);
      }
    }
    walkGreen(0, 0, Array(34).fill(0));
    targets.push(...greenTargets);
    for (let suit = 0; suit < 3; suit++) {
      const base = Array(34).fill(0);
      base[suit * 9] = 3; base[suit * 9 + 8] = 3;
      for (let i = 1; i <= 7; i++) base[suit * 9 + i] = 1;
      for (let add = 0; add < 9; add++) { const t = base.slice(); t[suit * 9 + add]++; targets.push(t); }
    }
    return targets;
  }
  const yakumanTargetCache = new Map();
  function targetMissing(counts, targets) {
    let best = 14;
    for (const target of targets) {
      let shared = 0;
      for (let i = 0; i < 34; i++) shared += Math.min(counts[i], target[i]);
      const missing = 14 - shared;
      if (missing < best) best = missing;
      if (!best) break;
    }
    return best;
  }
  function yakumanDistance(counts, melds, sanma, discard) {
    if (!yakumanTargetCache.has(sanma)) yakumanTargetCache.set(sanma, makeYakumanTargets(sanma));
    const targets = yakumanTargetCache.get(sanma);
    const current = addCounts(counts, fixedCounts(melds, true));
    let bestMissing = 14;
    const bestDiscardIds = [];
    if (discard) {
      const seen = new Set();
      for (let id = 0; id < 34; id++) if (counts[id] > 0) {
        const next = copyCounts(current); next[id]--;
        const missing = targetMissing(next, targets);
        if (missing < bestMissing) { bestMissing = missing; bestDiscardIds.length = 0; }
        if (missing === bestMissing && !seen.has(id)) { bestDiscardIds.push(id); seen.add(id); }
      }
    } else bestMissing = targetMissing(current, targets);
    return { shanten: Math.max(-1, bestMissing - 1), missing: bestMissing, discards: bestDiscardIds };
  }

  function analyzeYakumanWaits(counts, melds, options) {
    const waits = [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, options.sanma) || counts[id] + fixedCounts(melds, false)[id] >= 4) continue;
      const next = addGroup(counts, [id]);
      const decomps = winningDecompositions(next, melds, options.sanma);
      if (!decomps.length) continue;
      const yakuman = yakumanFor(next, melds, decomps, { ...options, waitType: options.waitType, tsumo: false });
      if (yakuman.length) waits.push({ id, yakuman });
    }
    return waits;
  }

  function validate(tiles, melds, options) {
    const errors = [];
    const effective = tiles.length + melds.length * 3;
    if (effective !== 13 && effective !== 14) errors.push(`当前有效牌数为 ${effective}，请调整为 13 张或 14 张。`);
    const physical = countsFromTiles(tiles);
    for (const meld of melds) for (const id of meld.tiles) physical[id]++;
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, options.sanma) && physical[id]) errors.push(`三人麻将不使用 ${tileLabel(id)}。`);
      if (physical[id] > 4) errors.push(`${tileLabel(id)} 超过四张。`);
    }
    if (melds.length > 4) errors.push('副露组数不能超过四组。');
    return { valid: errors.length === 0, errors, effective };
  }

  root.MahjongCore = {
    SUITS, WIND_IDS, DRAGON_IDS, tileLabel, tileAsset, countsFromTiles, total,
    allowedTile, shanten, winningDecompositions, isComplete, analyzeScore,
    bestDiscards, regularUkeire, yakumanFor, yakumanDistance,
    analyzeYakumanWaits, doraHan, validate, addGroup, fixedCounts,
    scoreDecomposition, formatScore, isKokushi, YAKUMAN_NAMES
  };
})(window);
