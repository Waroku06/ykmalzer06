(function (root) {
  'use strict';

  const SUITS = ['m', 'p', 's'];
  const WIND_IDS = [27, 28, 29, 30];
  const DRAGON_IDS = [31, 32, 33];
  const HONOR_NAMES = ['东', '南', '西', '北', '白', '发', '中'];
  const YAKUMAN_NAMES = {
    kokushi: '国士无双', suuankou: '四暗刻', daisangen: '大三元',
    daisuushii: '大四喜', shousuushii: '小四喜', tsuuiisou: '字一色',
    chinroutou: '清老头', ryuuiisou: '绿一色', chuuren: '九莲宝灯',
    suukantsu: '四杠子'
  };

  const YAKUMAN_SPECIAL_LABELS = {
    kokushi: '国士无双十三面',
    suuankou: '四暗刻单骑',
    chuuren: '纯正九莲宝灯'
  };

  const YAKU_LABELS = {
    '門前清自摸和': '门前清自摸和',
    '七對子': '七对子',
    '斷么九': '断幺九',
    '二盃口': '二杯口',
    '一盃口': '一杯口',
    '對對和': '对对和',
    '三槓子': '三杠子',
    '純全帶么九': '纯全带幺九',
    '混全帶么九': '混全带幺九',
    '一氣通貫': '一气通贯',
    '三色同順': '三色同顺'
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
  function kitaPhysicalCount(id, sanma, kita) {
    return sanma && id === 30 ? Math.max(0, kita || 0) : 0;
  }
  function kitaDoraHan(options) {
    if (!options || !options.sanma) return 0;
    return Math.max(0, options.kita || 0) * ((options.doraCounts && options.doraCounts[30]) || 0);
  }
  function doraFromIndicator(id, sanma) {
    if (id < 27) {
      if (sanma && id < 9) return id === 0 ? 8 : 0;
      return id % 9 === 8 ? id - 8 : id + 1;
    }
    if (id < 31) return id === 30 ? 27 : id + 1;
    return id === 33 ? 31 : id + 1;
  }
  function indicatorForDora(id, sanma) {
    if (id < 27) {
      if (sanma && id < 9) return id === 0 ? 8 : 0;
      return id % 9 === 0 ? id + 8 : id - 1;
    }
    if (id < 31) return id === 27 ? 30 : id - 1;
    return id === 31 ? 33 : id - 1;
  }
  function fixedCounts(melds, structural) {
    const counts = Array(34).fill(0);
    for (const meld of melds) {
      const limit = structural && (meld.type === 'kan' || meld.type === 'ankan') ? 3 : meld.tiles.length;
      for (let i = 0; i < limit; i++) counts[meld.tiles[i]]++;
    }
    return counts;
  }
  function addCounts(a, b) { return a.map((n, i) => n + b[i]); }

  function sameCounts(a, b) { return a.every((n, id) => n === b[id]); }
  function decompositionCounts(decomposition) {
    const counts = Array(34).fill(0);
    if (decomposition.type === 'standard') {
      for (const group of decomposition.groups) {
        if (!group.fixed) for (const id of group.tiles) counts[id]++;
      }
      counts[decomposition.pair] += 2;
    } else if (decomposition.type === 'chiitoi' || decomposition.type === 'kokushi') {
      return null;
    }
    return counts;
  }
  function sequenceWaitType(group, winTile) {
    const position = group.tiles.indexOf(winTile);
    if (position === 1) return 'kanchan';
    const startRank = rankOf(group.tiles[0]);
    if ((position === 0 && startRank === 7) || (position === 2 && startRank === 1)) return 'penchan';
    return 'ryanmen';
  }
  function chuurenBase(suit) {
    const counts = Array(34).fill(0);
    counts[suit * 9] = 3;
    counts[suit * 9 + 8] = 3;
    for (let rank = 1; rank <= 7; rank++) counts[suit * 9 + rank] = 1;
    return counts;
  }
  function isChuuren13(counts, sanma) {
    if (total(counts) !== 13 || counts.slice(27).some(Boolean)) return false;
    for (let suit = 0; suit < 3; suit++) {
      if (sanma && suit === 0) continue;
      const base = chuurenBase(suit);
      if (counts.every((n, id) => n === base[id])) return true;
    }
    return false;
  }
  function inferredWaitTypes(preWinCounts, winTile, decomposition, sanma) {
    const result = new Set();
    if (isChuuren13(preWinCounts, sanma)) result.add('chuuren13');
    if (decomposition.type === 'kokushi') {
      const yaochu = Array.from({ length: 34 }, (_, id) => id).filter(id => allowedTile(id, sanma) && isYaochu(id));
      if (yaochu.every(id => preWinCounts[id] === 1)) result.add('kokushi13');
      else result.add('kokushi');
      return [...result];
    }
    if (decomposition.type === 'chiitoi') {
      const full = preWinCounts.slice();
      full[winTile]++;
      if (full[winTile] === 2 && full.filter(n => n === 2).length === 7) result.add('tanki');
      return [...result];
    }
    const represented = decompositionCounts(decomposition);
    if (!represented) return result.size ? [...result] : ['ryanmen'];
    for (const group of decomposition.groups) {
      if (group.fixed || !group.tiles.includes(winTile)) continue;
      const before = represented.slice();
      before[winTile]--;
      if (!sameCounts(before, preWinCounts)) continue;
      if (group.type === 'sequence') result.add(sequenceWaitType(group, winTile));
      else if (group.type === 'triplet' || group.type === 'kan') result.add('shanpon');
    }
    if (decomposition.pair === winTile) {
      const before = represented.slice();
      before[winTile]--;
      if (sameCounts(before, preWinCounts)) result.add('tanki');
    }
    return [...result];
  }

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
    const add = (name, multiplier) => {
      const value = multiplier || 1;
      const item = { key: name, name: YAKUMAN_NAMES[name], multiplier: value };
      if (value > 1 && YAKUMAN_SPECIAL_LABELS[name]) item.label = YAKUMAN_SPECIAL_LABELS[name];
      names.push(item);
    };

    if (melds.length === 0 && isKokushi(all, options.sanma)) add('kokushi', options.waitType === 'kokushi13' ? 2 : 1);
    if (all.every((n, id) => !n || isHonor(id))) add('tsuuiisou');
    if (all.every((n, id) => !n || isTerminal(id))) add('chinroutou');
    const green = new Set([19, 20, 21, 23, 25, 32]);
    if (all.every((n, id) => !n || green.has(id))) add('ryuuiisou');

    const winds = WIND_IDS.filter(id => all[id] >= 3);
    const dragons = DRAGON_IDS.filter(id => all[id] >= 3);
    if (dragons.length === 3) add('daisangen');
    if (winds.length === 4) add('daisuushii', 2);
    else {
      const pairWind = WIND_IDS.find((id) => !winds.includes(id) && all[id] >= 2);
      if (winds.length === 3 && pairWind !== undefined) add('shousuushii');
    }
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
    const add = (name, han) => yaku.push({ name: YAKU_LABELS[name] || name, han });
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
        const sequenceCounts = new Map();
        for (const key of seqKeys) sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
        const duplicatePairs = [...sequenceCounts.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
        const allSequencesPaired = sequenceCounts.size > 0 && [...sequenceCounts.values()].every((count) => count % 2 === 0);
        if (sequenceGroups.length === 4 && duplicatePairs >= 2 && allSequencesPaired) add('二盃口', 3);
        else if (duplicatePairs === 1) add('一盃口', 1);
      }
      for (const group of tripletGroups) {
        const id = group.tiles[0];
        if (DRAGON_IDS.includes(id)) add(`役牌 ${tileLabel(id)}`, 1);
        if (id === options.seatWind) add(`役牌 ${tileLabel(id)}（自风）`, 1);
        if (id === options.roundWind) add(`役牌 ${tileLabel(id)}（场风）`, 1);
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
      if ([0, 1, 2].some((suit) => [0, 3, 6].every((offset) => starts.has(suit * 9 + offset)))) {
        add('一氣通貫', closed ? 2 : 1);
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
    const hasTerminal = all.some((n, id) => n && isTerminal(id));
    if (all.every((n, id) => !n || isYaochu(id)) && hasHonor && hasTerminal) add('混老头', 2);
    if (suitSet.size === 1) {
      if (hasHonor) add('混一色', closed ? 3 : 2);
      else add('清一色', closed ? 6 : 5);
    }
    const unique = yaku.filter(item => item.name === '断幺九');
    if (unique.length > 1) yaku.splice(yaku.findIndex(item => item.name === '断幺九'), 1);
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
  function scoreFor(han, fu, yakumanCount, dealer, tsumo, sanma) {
    if (yakumanCount > 0) {
      const base = 8000 * yakumanCount;
      return scoreFromBase(base, dealer, tsumo, yakumanCount, '', sanma);
    }
    if (!han) return null;
    let base = fu * Math.pow(2, han + 2);
    let limit = '';
    if (han >= 13) { base = 8000; limit = '累計役満'; }
    else if (han >= 11) { base = 6000; limit = '三倍满'; }
    else if (han >= 8) { base = 4000; limit = '倍满'; }
    else if (han >= 6) { base = 3000; limit = '跳满'; }
    else if (han >= 5 || base >= 2000) { base = 2000; limit = '满贯'; }
    return scoreFromBase(base, dealer, tsumo, false, limit, sanma);
  }
  function yakumanLimitText(multiplier) {
    const names = { 2: '两', 3: '三', 4: '四', 5: '五', 6: '六' };
    return multiplier > 1 ? `${names[multiplier] || multiplier}倍役满` : '役满';
  }
  function scoreFromBase(base, dealer, tsumo, yakuman, limit, sanma) {
    if (!tsumo) {
      const points = round100(base * (dealer ? 6 : 4));
      return { total: points, ron: points, tsumo: null, limit: yakuman ? yakumanLimitText(yakuman) : limit || '' };
    }
    if (dealer) {
      const share = round100(base * 2);
      const players = sanma ? 2 : 3;
      return { total: share * players, ron: null, tsumo: { dealer: share, child: share, players }, limit: yakuman ? yakumanLimitText(yakuman) : limit || '' };
    }
    const dealerShare = round100(base * 2);
    const childShare = round100(base);
    const childPlayers = sanma ? 1 : 2;
    return { total: dealerShare + childShare * childPlayers, ron: null, tsumo: { dealer: dealerShare, child: childShare, players: 1 + childPlayers }, limit: yakuman ? yakumanLimitText(yakuman) : limit || '' };
  }
  function formatScore(score) {
    if (!score) return '无役';
    if (score.ron !== null) return `${score.ron.toLocaleString('zh-CN')} 点`;
    if (score.tsumo.dealer === score.tsumo.child) return `${score.tsumo.dealer.toLocaleString('zh-CN')} 点 × ${score.tsumo.players || 3} 家`;
    return `亲 ${score.tsumo.dealer.toLocaleString('zh-CN')} / 子 ${score.tsumo.child.toLocaleString('zh-CN')}`;
  }

  function doraHan(counts, melds, options) {
    const physical = addCounts(counts, fixedCounts(melds, false));
    let han = options.sanma ? (options.kita || 0) : 0;
    han += kitaDoraHan(options);
    for (let id = 0; id < 34; id++) han += physical[id] * (options.doraCounts[id] || 0);
    han += (options.redCount || 0) + melds.reduce((sum, meld) => sum + (meld.redCount || 0), 0);
    if (options.winningRed) han++;
    return han;
  }

  function scoreDecomposition(counts, melds, decomposition, options, context) {
    const dora = doraHan(counts, melds, options);
    const yakuman = yakumanFor(counts, melds, [decomposition], { ...options, ...context });
    if (yakuman.length) {
      const yakumanCount = yakuman.reduce((sum, item) => sum + item.multiplier, 0);
      const score = scoreFor(0, 0, yakumanCount, options.seatWind === 27, context.tsumo, options.sanma);
      return { yaku: [], han: dora, fu: 0, dora, yakuman, score, yakumanCount };
    }
    const yaku = yakuFor(counts, melds, decomposition, context, options);
    const han = yaku.reduce((sum, item) => sum + item.han, 0) + dora;
    const fu = fuFor(decomposition, melds, context, options, yaku);
    const countedYakuman = yaku.length && han >= 13 ? Math.floor(han / 13) : 0;
    const countedYakumanList = countedYakuman ? [{ name: '累计役满', multiplier: countedYakuman }] : [];
    const score = countedYakuman
      ? scoreFor(0, 0, countedYakuman, options.seatWind === 27, context.tsumo, options.sanma)
      : scoreFor(yaku.length ? han : 0, fu, 0, options.seatWind === 27, context.tsumo, options.sanma);
    return { yaku, han, fu, dora, yakuman: countedYakumanList, score, yakumanCount: countedYakuman };
  }

  function winningDecompositions(counts, melds, sanma) {
    if (total(counts) + melds.length * 3 !== 14) return [];
    const out = standardDecompositions(counts, melds);
    if (!melds.length && sevenPairs(counts, melds)) out.push({ type: 'chiitoi' });
    if (!melds.length && isKokushi(counts, sanma)) out.push({ type: 'kokushi' });
    return out;
  }

  function candidateYakumanCount(candidate) {
    return (candidate.yakuman || []).reduce((sum, item) => sum + (item.multiplier || 1), 0);
  }

  function compareScoringCandidate(a, b) {
    const points = (a.score ? a.score.total : -1) - (b.score ? b.score.total : -1);
    if (points) return points;
    const yakuman = candidateYakumanCount(a) - candidateYakumanCount(b);
    if (yakuman) return yakuman;
    if (a.han !== b.han) return a.han - b.han;
    return a.fu - b.fu;
  }

  function bestInterpretationsByWinningTile(candidates) {
    const bestByTile = new Map();
    for (const candidate of candidates) {
      const previous = bestByTile.get(candidate.winningTile);
      if (!previous || compareScoringCandidate(candidate, previous) > 0) bestByTile.set(candidate.winningTile, candidate);
    }
    return [...bestByTile.values()].sort((a, b) => a.winningTile - b.winningTile);
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
      const candidates = [];
      const winTiles = options.winningTile === undefined
        ? Array.from({ length: 34 }, (_, id) => id).filter(id => counts[id] > 0)
        : [options.winningTile];
      for (const decomposition of decomps) {
        for (const winTile of winTiles) {
          const preWinCounts = options.preWinCounts || (() => { const before = counts.slice(); before[winTile]--; return before; })();
          const waitTypes = inferredWaitTypes(preWinCounts, winTile, decomposition, options.sanma);
          for (const waitType of waitTypes) {
            const scoringOptions = { ...options, waitType };
            if (options.winningTileVariant !== 'red') {
              const scored = scoreDecomposition(counts, melds, decomposition, scoringOptions, context);
              candidates.push({ ...scored, decomposition, winningTile: winTile, winningRed: false, waitType });
            }
            const suit = winTile < 27 && winTile % 9 === 4 ? Math.floor(winTile / 9) : -1;
            const waitingForDraw = options.winningTile !== undefined && options.preWinCounts;
            if (waitingForDraw && options.winningTileVariant !== 'regular' && suit >= 0 && options.redFiveAvailable && options.redFiveAvailable[suit]) {
              const redScored = scoreDecomposition(counts, melds, decomposition, { ...scoringOptions, winningRed: true }, context);
              candidates.push({ ...redScored, decomposition, winningTile: winTile, winningRed: true, waitType });
            }
          }
        }
      }
      const selectedCandidates = bestInterpretationsByWinningTile(candidates);
      let best = null;
      const yakuPool = new Map();
      const yakumanPool = new Map();
      for (const candidate of selectedCandidates) {
        if (!best || compareScoringCandidate(candidate, best) > 0) best = candidate;
        for (const item of candidate.yaku || []) yakuPool.set(item.name, item);
        for (const item of candidate.yakuman || []) yakumanPool.set(item.name, item);
      }
      if (best) {
        best.allYaku = [...yakuPool.values()];
        best.allYakuman = [...yakumanPool.values()];
        best.commonYaku = commonYaku(selectedCandidates);
        best.variants = candidateVariants(selectedCandidates);
      }
      cases[context.key] = best;
    }
    return { complete: true, cases, decompositions: decomps };
  }

  function commonYaku(candidates) {
    if (!candidates.length) return [];
    const first = candidates[0].yaku || [];
    return first.filter((item) => candidates.every((candidate) => (candidate.yaku || []).some((other) => other.name === item.name)));
  }

  function candidateVariants(candidates) {
    const groups = new Map();
    for (const candidate of candidates) {
      const yakumanKey = (candidate.yakuman || []).map((item) => `${item.key || item.name}:${item.multiplier}`).sort().join('|');
      const yakuKey = (candidate.yaku || []).map((item) => `${item.name}:${item.han}`).sort().join('|');
      const scoreLimit = candidate.score ? candidate.score.limit || '' : '';
      const key = `${yakumanKey}::${yakuKey}::${candidate.han}::${candidate.fu}::${candidate.dora}::${scoreLimit}`;
      let variant = groups.get(key);
      if (!variant) {
        variant = { ...candidate, winningTiles: [], waitTypes: [] };
        delete variant.decomposition;
        groups.set(key, variant);
      }
      if (!variant.winningTiles.includes(candidate.winningTile)) variant.winningTiles.push(candidate.winningTile);
      if (candidate.waitType && !variant.waitTypes.includes(candidate.waitType)) variant.waitTypes.push(candidate.waitType);
    }
    return [...groups.values()].sort((a, b) => (b.score ? b.score.total : -1) - (a.score ? a.score.total : -1));
  }

  function addGroup(counts, ids) {
    const out = copyCounts(counts);
    for (const id of ids) out[id]++;
    return out;
  }
  function isComplete(counts, melds, sanma) { return winningDecompositions(counts, melds, sanma).length > 0; }

  function regularUkeire(counts, melds, sanma, baseShanten, visibleCounts = [], kita = 0) {
    const items = [];
    const fixed = fixedCounts(melds, false);
    for (let id = 0; id < 34; id++) {
      const visible = visibleCounts[id] || 0;
      const kitaCopies = kitaPhysicalCount(id, sanma, kita);
      if (!allowedTile(id, sanma) || counts[id] + fixed[id] + visible + kitaCopies >= 4) continue;
      const next = addGroup(counts, [id]);
      if (isComplete(next, melds, sanma) || shanten(next, melds.length, sanma) < baseShanten) {
        items.push({ id, remaining: 4 - counts[id] - fixed[id] - visible - kitaCopies });
      }
    }
    return items;
  }
  function effectiveShanten(counts, melds, sanma, visibleCounts = [], kita = 0) {
    const value = shanten(counts, melds.length, sanma);
    if (value !== 0 || total(counts) + melds.length * 3 !== 13) return value;
    const liveWait = regularUkeire(counts, melds, sanma, value, visibleCounts, kita)
      .some((draw) => isComplete(addGroup(counts, [draw.id]), melds, sanma));
    return liveWait ? value : 1;
  }
  function bestDiscards(tiles, melds, sanma, visibleCounts = [], kita = 0) {
    const counts = countsFromTiles(tiles);
    let best = Infinity;
    const options = [];
    const seen = new Set();
    for (const tile of tiles) {
      if (seen.has(tile.id)) continue;
      seen.add(tile.id);
      const next = copyCounts(counts); next[tile.id]--;
      const nextVisible = visibleCounts.slice();
      nextVisible[tile.id] = (nextVisible[tile.id] || 0) + 1;
      const value = effectiveShanten(next, melds, sanma, nextVisible, kita);
      if (value < best) { best = value; options.length = 0; }
      if (value === best) options.push({ id: tile.id, shanten: value, ukeire: regularUkeire(next, melds, sanma, value, nextVisible, kita) });
    }
    options.sort((a, b) => b.ukeire.reduce((s, x) => s + x.remaining, 0) - a.ukeire.reduce((s, x) => s + x.remaining, 0));
    return { shanten: best, discards: options };
  }

  function improvingDraws(counts, melds, sanma, visibleCounts = [], kita = 0) {
    const baseShanten = effectiveShanten(counts, melds, sanma, visibleCounts, kita);
    const fixed = fixedCounts(melds, false);
    const improvements = [];
    for (let drawId = 0; drawId < 34; drawId++) {
      const visible = visibleCounts[drawId] || 0;
      const kitaCopies = kitaPhysicalCount(drawId, sanma, kita);
      if (!allowedTile(drawId, sanma) || counts[drawId] + fixed[drawId] + visible + kitaCopies >= 4) continue;
      const drawn = addGroup(counts, [drawId]);
      const best = { shanten: Infinity, discards: [] };
      for (let discardId = 0; discardId < 34; discardId++) {
        if (!drawn[discardId]) continue;
        const afterDiscard = copyCounts(drawn);
        afterDiscard[discardId]--;
        const nextVisible = visibleCounts.slice();
        nextVisible[discardId] = (nextVisible[discardId] || 0) + 1;
        const nextShanten = effectiveShanten(afterDiscard, melds, sanma, nextVisible, kita);
        if (nextShanten < best.shanten) { best.shanten = nextShanten; best.discards.length = 0; }
        if (nextShanten === best.shanten && !best.discards.includes(discardId)) best.discards.push(discardId);
      }
      if (best.shanten < baseShanten) improvements.push({ id: drawId, remaining: 4 - counts[drawId] - fixed[drawId] - visible - kitaCopies, shanten: best.shanten, discards: best.discards });
    }
    improvements.sort((a, b) => b.remaining - a.remaining || a.shanten - b.shanten);
    return { shanten: baseShanten, improvements };
  }

  function groupPatterns(ids) {
    const groups = [];
    for (const id of ids) groups.push([id, id, id]);
    for (const id of ids) {
      if (id < 27 && rankOf(id) <= 7 && ids.includes(id + 1) && ids.includes(id + 2)) groups.push([id, id + 1, id + 2]);
    }
    return groups;
  }
  const yakumanOpportunityCache = new Map();
  const suuankouDistanceCache = new Map();
  const countedRouteCache = new Map();
  const directYakumanRouteCache = new Map();

  function routeTargetKey(target) {
    return target.join(',');
  }

  function pushYakumanRoute(routes, seen, name, target, metadata = {}) {
    const validTotal = total(target) === 14 || (name === '纯正九莲宝灯' && total(target) === 13);
    if (!validTotal || target.some((count) => count > 4 || count < 0)) return;
    const key = `${name}:${routeTargetKey(target)}`;
    if (seen.has(key)) return;
    seen.add(key);
    routes.push({ key, name, target, ...metadata });
  }

  function makeDirectYakumanRoutes(sanma, melds) {
    const active = Array.from({ length: 34 }, (_, id) => id).filter((id) => allowedTile(id, sanma));
    const routes = [];
    const seen = new Set();
    const groups = groupPatterns(active);
    const yaochu = active.filter(isYaochu);
    const kokushiBase = Array(34).fill(0);
    yaochu.forEach((id) => { kokushiBase[id] = 1; });
    for (const pair of yaochu) {
      const target = kokushiBase.slice(); target[pair]++;
      pushYakumanRoute(routes, seen, '国士无双', target);
    }

    const honorIds = active.filter(isHonor);
    const terminalIds = active.filter(isTerminal);
    const tripletRoutes = (ids, name) => {
      function choose(start, picked) {
        if (picked.length === 4) {
          for (const pair of ids) {
            if (picked.includes(pair)) continue;
            const target = Array(34).fill(0);
            picked.forEach((id) => { target[id] += 3; }); target[pair] += 2;
            pushYakumanRoute(routes, seen, name, target);
          }
          return;
        }
        for (let i = start; i < ids.length; i++) choose(i + 1, picked.concat(ids[i]));
      }
      choose(0, []);
    };
    tripletRoutes(honorIds, '字一色');
    tripletRoutes(terminalIds, '清老头');

    const dragonsBase = Array(34).fill(0); DRAGON_IDS.forEach((id) => { dragonsBase[id] = 3; });
    for (const group of groups) for (const pair of active) {
      const target = dragonsBase.slice(); group.forEach((id) => { target[id]++; }); target[pair] += 2;
      pushYakumanRoute(routes, seen, '大三元', target);
    }

    for (const missingWind of WIND_IDS) {
      const base = Array(34).fill(0);
      WIND_IDS.filter((id) => id !== missingWind).forEach((id) => { base[id] = 3; });
      base[missingWind] = 2;
      for (const group of groups) {
        if (group.every((id) => WIND_IDS.includes(id))) continue;
        const target = base.slice(); group.forEach((id) => { target[id]++; });
        if (WIND_IDS.filter((id) => target[id] >= 3).length !== 3 || target[missingWind] !== 2) continue;
        pushYakumanRoute(routes, seen, '小四喜', target);
      }
    }
    const bigWinds = Array(34).fill(0); WIND_IDS.forEach((id) => { bigWinds[id] = 3; });
    for (const pair of active) {
      const target = bigWinds.slice(); target[pair] += 2;
      pushYakumanRoute(routes, seen, '大四喜', target);
    }

    const greenIds = [19, 20, 21, 23, 25, 32].filter((id) => allowedTile(id, sanma));
    const greenGroups = groupPatterns(greenIds);
    function walkGreen(start, picked, counts) {
      if (picked === 4) {
        for (const pair of greenIds) {
          const target = counts.slice(); target[pair] += 2;
          pushYakumanRoute(routes, seen, '绿一色', target);
        }
        return;
      }
      for (let i = start; i < greenGroups.length; i++) {
        const next = counts.slice(); let valid = true;
        for (const id of greenGroups[i]) { next[id]++; if (next[id] > 4) valid = false; }
        if (valid) walkGreen(i, picked + 1, next);
      }
    }
    walkGreen(0, 0, Array(34).fill(0));

    for (let suit = 0; suit < 3; suit++) {
      if (sanma && suit === 0) continue;
      const target = Array(34).fill(0);
      target[suit * 9] = 3; target[suit * 9 + 8] = 3;
      for (let rank = 1; rank <= 7; rank++) target[suit * 9 + rank] = 1;
      if (!melds.length) pushYakumanRoute(routes, seen, '纯正九莲宝灯', target);
      for (let extra = 0; extra < 9; extra++) {
        const copy = target.slice(); copy[suit * 9 + extra]++;
        pushYakumanRoute(routes, seen, '九莲宝灯', copy);
      }
    }

    const kanCount = melds.filter((meld) => meld.type === 'kan' || meld.type === 'ankan').length;
    if (kanCount >= 2 && melds.length === kanCount) {
      const base = fixedCounts(melds, true);
      const neededKans = 4 - kanCount;
      const candidateIds = active.filter((id) => base[id] === 0);
      function chooseCandidates(start, picked) {
        if (picked.length < neededKans) {
          for (let i = start; i < candidateIds.length; i++) chooseCandidates(i + 1, picked.concat(candidateIds[i]));
          return;
        }
        const target = base.slice();
        for (const id of picked) target[id] += 3;
        if (target.some((count) => count > 4)) return;
        for (const pair of active) {
          if (target[pair] + 2 > 4) continue;
          const copy = target.slice(); copy[pair] += 2;
          pushYakumanRoute(routes, seen, '四杠子', copy, { kanCandidates: picked.slice() });
        }
      }
      chooseCandidates(0, []);
    }
    return routes;
  }

  function directYakumanRouteShanten(counts, melds, sanma, options, names) {
    const fixed = fixedCounts(melds, true);
    const fixedPhysical = fixedCounts(melds, false);
    const indicators = options.indicatorCounts || [];
    const current = addCounts(counts, fixed);
    const yaochu = Array.from({ length: 34 }, (_, id) => id)
      .filter((id) => allowedTile(id, sanma) && isYaochu(id));
    const result = new Map();
    const routeKey = `${sanma}|${melds.map((meld) => `${meld.type}:${meld.tiles.join('.')}`).join('|')}`;
    let directRoutes = directYakumanRouteCache.get(routeKey);
    if (!directRoutes) {
      directRoutes = makeDirectYakumanRoutes(sanma, melds);
      directYakumanRouteCache.set(routeKey, directRoutes);
      if (directYakumanRouteCache.size > 64) directYakumanRouteCache.delete(directYakumanRouteCache.keys().next().value);
    }
    for (const route of directRoutes) {
      if (!names.has(route.name) || (route.kanCandidates || []).length) continue;
      if (fixed.some((count, id) => count > route.target[id])) continue;
      if (route.target.some((count, id) =>
        fixedPhysical[id] + (indicators[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + count - fixed[id] > 4)) continue;
      let shared = 0;
      for (let id = 0; id < 34; id++) shared += Math.min(current[id], route.target[id]);
      const pureWaitRoute = route.name === '纯正九莲宝灯';
      const missing = (pureWaitRoute ? 13 : 14) - shared;
      const shanten = pureWaitRoute ? Math.max(0, missing) : Math.max(-1, missing - 1);
      let routeName = route.name;
      if (route.name === '国士无双' && yaochu.every((id) => current[id] === 1) && total(current) === 13) {
        routeName = '国士无双十三面';
      }
      const previous = result.get(routeName);
      if (previous === undefined || shanten < previous) result.set(routeName, shanten);
      if (routeName === '国士无双十三面' && (!result.has('国士无双') || shanten < result.get('国士无双'))) {
        result.set('国士无双', shanten);
      }
    }
    return result;
  }

  function routeDistance(counts, melds, sanma, discard, options = {}) {
    const routes = makeDirectYakumanRoutes(sanma, melds);
    const fixed = fixedCounts(melds, true);
    const fixedPhysical = fixedCounts(melds, false);
    const indicators = options.indicatorCounts || [];
    const current = addCounts(counts, fixed);
    const physical = addCounts(addCounts(counts, fixedPhysical), indicators);
    physical[30] += kitaPhysicalCount(30, sanma, options.kita);
    const effective = total(counts) + melds.length * 3;
    const activeCount = Array.from({ length: 34 }, (_, id) => id).filter((id) => allowedTile(id, sanma)).length;
    const kokushiTiles = Array.from({ length: 34 }, (_, id) => id).filter((id) => allowedTile(id, sanma) && isYaochu(id));
    const states = [];
    if (discard && effective === 14) {
      for (let id = 0; id < 34; id++) {
        if (!counts[id]) continue;
        const after = current.slice(); after[id]--;
        const available = physical.slice(); available[id]--;
        states.push({ after, available, discard: id, presentIds: after.flatMap((count, tileId) => count ? [tileId] : []) });
      }
    } else states.push({ after: current, available: physical, discard: null, presentIds: current.flatMap((count, id) => count ? [id] : []) });
    for (let id = 0; id < 34; id++) {
      if (counts[id] !== 4) continue;
      const after = current.slice(); after[id]--;
      states.push({
        after,
        available: physical.slice(),
        discard: null,
        kanAction: id,
        declaredKanCandidates: [id],
        presentIds: after.flatMap((count, tileId) => count ? [tileId] : [])
      });
    }
    function kanMissing(state, route) {
      return (route.kanCandidates || []).reduce((sum, id) => {
        if ((state.declaredKanCandidates || []).includes(id)) return sum;
        const structuralMissing = Math.max(0, route.target[id] - state.after[id]);
        const physicalMissing = Math.max(0, 4 - state.after[id]);
        return sum + Math.max(1, physicalMissing - structuralMissing);
      }, 0);
    }
    function filterImprovingDraws(state, route, draws, routeShanten) {
      if (effective !== 13 || routeShanten !== 1 || state.kanAction !== undefined || (route.kanCandidates || []).length) return draws;
      return draws.filter((draw) => {
        const drawn = state.after.slice(); drawn[draw.id]++;
        for (let discardId = 0; discardId < 34; discardId++) {
          if (!counts[discardId]) continue;
          const after = drawn.slice(); after[discardId]--;
          let shared = 0;
          for (let id = 0; id < 34; id++) shared += Math.min(after[id], route.target[id]);
          if (Math.max(-1, 13 - shared) < routeShanten) {
            if (route.name === '累计役满' && !hasYakumanWait(after, melds, { ...options, sanma }).length) continue;
            return true;
          }
        }
        return false;
      });
    }
    const candidates = new Map();
    for (const route of routes) {
      if (fixed.some((count, id) => count > route.target[id])) continue;
      if (route.target.some((count, id) => fixedPhysical[id] + (indicators[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + count - fixed[id] + ((route.kanCandidates || []).includes(id) ? 1 : 0) > 4)) continue;
      if (route.target.some((count, id) => count && !allowedTile(id, sanma))) continue;
      const pureWaitRoute = route.name === '纯正九莲宝灯';
      let best = null;
      let bestShanten = Infinity;
      const discardAlternatives = new Set();
      for (const state of states) {
        if (state.kanAction !== undefined && !(route.kanCandidates || []).includes(state.kanAction)) continue;
        const thirteenWaitRoute = route.name === '国士无双' &&
          kokushiTiles.every((id) => state.after[id] === 1) && total(state.after) === 13;
        const routeName = thirteenWaitRoute ? '国士无双十三面' : route.name;
        let shared = 0;
        for (let id = 0; id < 34; id++) shared += Math.min(state.after[id], route.target[id]);
        const routeKanMissing = kanMissing(state, route);
        const missing = (pureWaitRoute ? 13 : 14) - shared + routeKanMissing;
        const draws = [];
        for (let id = 0; id < 34; id++) {
          const required = (route.kanCandidates || []).includes(id) && !(state.declaredKanCandidates || []).includes(id)
            ? Math.max(4, route.target[id])
            : route.target[id];
          if (!allowedTile(id, sanma) || state.available[id] >= 4 || state.after[id] >= required) continue;
          draws.push({ id, remaining: 4 - state.available[id] });
        }
        let routeShanten = pureWaitRoute ? Math.max(0, missing) : Math.max(-1, missing - 1);
        const candidate = {
          ...route,
          name: routeName,
          missing,
          shanten: routeShanten,
          discard: state.discard,
          kanAction: state.kanAction,
          declaredKanCandidates: state.declaredKanCandidates,
          draws,
          ukeire: draws.reduce((sum, item) => sum + item.remaining, 0),
          anyDraw: draws.length >= Math.ceil(activeCount * 0.6)
        };
        if (!pureWaitRoute) candidate.draws = filterImprovingDraws(state, route, candidate.draws, candidate.shanten);
        candidate.ukeire = candidate.draws.reduce((sum, item) => sum + item.remaining, 0);
        candidate.anyDraw = candidate.draws.length >= Math.ceil(activeCount * 0.6);
        if (candidate.shanten > 6) continue;
        if (candidate.shanten < bestShanten) {
          bestShanten = candidate.shanten;
          discardAlternatives.clear();
        }
        if (candidate.shanten === bestShanten && state.discard !== null && state.discard !== undefined) discardAlternatives.add(state.discard);
        if (!best || compareRoute(candidate, best) < 0) best = candidate;
      }
      if (best) {
        best.discardAlternatives = [...discardAlternatives];
        if (!candidates.has(best.name)) candidates.set(best.name, []);
        candidates.get(best.name).push(best);
      }
    }
    const bestRoutes = [...candidates.values()].map((items) => mergeRouteAlternatives(items, sanma)).sort(compareRoute).slice(0, 3);
    if (!bestRoutes.length) return null;
    const best = bestRoutes[0];
    return {
      shanten: best.shanten,
      missing: best.missing,
      discards: [...new Set(bestRoutes.filter((route) => route.discard !== null && route.discard !== undefined && route.shanten === best.shanten).map((route) => route.discard))],
      improvements: bestRoutes.map((route) => ({
        id: route.draws[0] ? route.draws[0].id : null,
        remaining: route.ukeire,
        shanten: route.shanten,
        discards: route.discard === null || route.discard === undefined ? [] : [route.discard],
        route: route.name,
        routeKey: route.key,
        target: route.target,
        kanAction: route.kanAction,
        draws: route.draws,
        anyDraw: route.anyDraw
      })),
      kanActions: [...new Set(bestRoutes.filter((route) => route.shanten === best.shanten && route.kanAction !== undefined).map((route) => route.kanAction))],
      routes: bestRoutes
    };
  }

  function combineRouteDistances(...distances) {
    const candidates = new Map();
    for (const distance of distances) {
      for (const route of distance && distance.routes || []) {
        if (route.shanten > 6) continue;
        const key = `${route.name}|${route.kanAction === undefined ? '' : route.kanAction}`;
        if (!candidates.has(key)) candidates.set(key, []);
        candidates.get(key).push(route);
      }
    }
    const allRoutes = [...candidates.values()].map((items) => mergeRouteAlternatives(items)).sort(compareRoute);
    const routes = allRoutes.slice(0, 3);
    if (!routes.length) return null;
    const best = routes[0];
    return {
      shanten: best.shanten,
      missing: best.missing,
      discards: [...new Set(allRoutes
        .filter((route) => route.shanten === best.shanten)
        .flatMap((route) => route.discardAlternatives && route.discardAlternatives.length
          ? route.discardAlternatives
          : route.discard === null || route.discard === undefined ? [] : [route.discard]))],
      improvements: routes.map((route) => ({
        id: route.draws[0] ? route.draws[0].id : null,
        remaining: route.ukeire,
        shanten: route.shanten,
        discards: route.discard === null || route.discard === undefined ? [] : [route.discard],
        route: route.name,
        routeKey: route.key,
        target: route.target,
        kanAction: route.kanAction,
        draws: route.draws,
        anyDraw: route.anyDraw
      })),
      kanActions: [...new Set(routes.filter((route) => route.shanten === best.shanten && route.kanAction !== undefined).map((route) => route.kanAction))],
      routes
    };
  }

  function routeTarget(route) {
    const target = Array(34).fill(0);
    for (const id of route.triplets) target[id] += 3;
    target[route.pair] = 2;
    return target;
  }

  function labelSuuankouTanki(route, after) {
    if (route.shanten !== 0 || route.pair === null || route.pair === undefined ||
        !route.draws.length || route.draws.some((draw) => draw.id !== route.pair) ||
        after[route.pair] !== 1 || route.triplets.some((id) => after[id] < 3)) return route;
    return { ...route, name: '四暗刻单骑' };
  }

  function routeUkeire(route, after, sanma, physical = after) {
    const target = route.target || routeTarget(route);
    const draws = [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, sanma) || physical[id] >= 4 || after[id] >= target[id]) continue;
      draws.push({ id, remaining: 4 - physical[id] });
    }
    return draws;
  }

  function compareRoute(a, b) {
    const specialRank = (name) => /十三面|单骑|纯正/.test(name) ? 0 : 1;
    return a.shanten - b.shanten || specialRank(a.name) - specialRank(b.name) ||
      Number(a.kanAction === undefined) - Number(b.kanAction === undefined) ||
      b.ukeire - a.ukeire || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  }

  function compareRouteQuality(a, b) {
    return a.shanten - b.shanten || b.ukeire - a.ukeire;
  }

  function mergeRouteAlternatives(candidates, sanma) {
    const ordered = candidates.slice().sort(compareRoute);
    const best = ordered[0];
    const tied = ordered.filter((route) => route.shanten === best.shanten && route.discard === best.discard && route.kanAction === best.kanAction);
    const discardAlternatives = [...new Set(ordered
      .filter((route) => route.shanten === best.shanten)
      .flatMap((route) => route.discardAlternatives && route.discardAlternatives.length
        ? route.discardAlternatives
        : route.discard === null || route.discard === undefined ? [] : [route.discard]))];
    const drawsById = new Map();
    for (const route of tied) {
      for (const draw of route.draws || []) {
        const previous = drawsById.get(draw.id);
        if (!previous || draw.remaining > previous.remaining) drawsById.set(draw.id, draw);
      }
    }
    const draws = [...drawsById.values()].sort((a, b) => a.id - b.id);
    const activeCount = Array.from({ length: 34 }, (_, id) => id).filter((id) => allowedTile(id, sanma)).length;
    return {
      ...best,
      draws,
      discardAlternatives,
      ukeire: draws.reduce((sum, draw) => sum + draw.remaining, 0),
      anyDraw: Boolean(best.anyDraw) || draws.length >= Math.ceil(activeCount * 0.6)
    };
  }

  function routeDoraHan(target, melds, options, includeFutureRed = true) {
    const fixedStructural = fixedCounts(melds, true);
    const fixedPhysical = fixedCounts(melds, false);
    const concealed = target.map((count, id) => count - fixedStructural[id]);
    const physical = addCounts(concealed, fixedPhysical);
    let han = options.sanma ? (options.kita || 0) : 0;
    han += kitaDoraHan(options);
    for (let id = 0; id < 34; id++) han += physical[id] * (options.doraCounts[id] || 0);
    if (Array.isArray(options.redFiveCounts)) {
      for (let suit = 0; suit < 3; suit++) {
        const five = suit * 9 + 4;
        if (!allowedTile(five, options.sanma)) continue;
        const heldRed = Math.min(physical[five], options.redFiveCounts[suit] || 0);
        han += heldRed;
        if (includeFutureRed && physical[five] > heldRed && options.redFiveAvailable && options.redFiveAvailable[suit]) han++;
      }
    } else {
      const targetFives = [4, 13, 22].reduce((sum, id) => sum + physical[id], 0);
      const knownRed = (options.redCount || 0) + melds.reduce((sum, meld) => sum + (meld.redCount || 0), 0);
      han += Math.min(targetFives, knownRed);
      if (includeFutureRed && options.redFiveAvailable) {
        for (let suit = 0; suit < 3; suit++) {
          const five = suit * 9 + 4;
          if (allowedTile(five, options.sanma) && physical[five] > 0 && options.redFiveAvailable[suit]) han++;
        }
      }
    }
    return han;
  }

  function countedTargetIsYakuman(target, melds, sanma, options, bonusHan, winningTileIds = null) {
    const closed = melds.every((meld) => meld.type === 'ankan');
    const fixed = fixedCounts(melds, true);
    const concealed = target.map((count, id) => count - fixed[id]);
    const decompositions = winningDecompositions(concealed, melds, sanma);
    const bestContext = closed
      ? { riichi: true, tsumo: true }
      : { riichi: false, tsumo: true };
    const fallbackContext = closed
      ? { riichi: true, tsumo: false }
      : { riichi: false, tsumo: false };
    const possibleWinningTiles = winningTileIds || Array.from({ length: 34 }, (_, id) => id);
    for (const decomposition of decompositions) {
      for (const winTile of possibleWinningTiles) {
        if (!concealed[winTile]) continue;
        const before = concealed.slice(); before[winTile]--;
        const waitTypes = inferredWaitTypes(before, winTile, decomposition, sanma);
        const suit = winTile < 27 && winTile % 9 === 4 ? Math.floor(winTile / 9) : -1;
        const redWinHan = winningTileIds && suit >= 0 && options.redFiveAvailable && options.redFiveAvailable[suit] ? 1 : 0;
        for (const waitType of waitTypes) {
          const scoreOptions = { ...options, waitType };
          const bestYaku = yakuFor(concealed, melds, decomposition, bestContext, scoreOptions);
          const bestHan = bestYaku.reduce((sum, item) => sum + item.han, 0) + bonusHan + redWinHan;
          if (!bestYaku.length || bestHan < 13) continue;
          const bestYakuman = yakumanFor(concealed, melds, [decomposition], {
            ...scoreOptions, ...bestContext
          }).length > 0;
          if (!bestYakuman) return true;

          // The higher scoring context is sufficient unless it is a direct yakuman.
          // In that case, ron may still qualify as a counted yakuman.
          if (bestYakuman) {
            const fallbackYaku = yakuFor(concealed, melds, decomposition, fallbackContext, scoreOptions);
            const fallbackHan = fallbackYaku.reduce((sum, item) => sum + item.han, 0) + bonusHan + redWinHan;
            if (fallbackYaku.length && fallbackHan >= 13 &&
                !yakumanFor(concealed, melds, [decomposition], {
                  ...scoreOptions, ...fallbackContext
                }).length) return true;
          }
        }
      }
    }
    return false;
  }

  function countedYakumanDistance(counts, melds, sanma, discard, options, maxShanten = Infinity) {
    const cacheKey = `${counts.join(',')}|${melds.map((meld) => `${meld.type}:${meld.tiles.join('.')} :${meld.redCount || 0}`).join('|')}|${sanma}|${discard}|${yakumanOptionKey(options)}`;
    if (countedRouteCache.has(cacheKey)) return countedRouteCache.get(cacheKey);

    const fixedStructural = fixedCounts(melds, true);
    const fixedPhysical = fixedCounts(melds, false);
    const visibleCounts = options.indicatorCounts || [];
    const closed = melds.every((meld) => meld.type === 'ankan');
    const active = Array.from({ length: 34 }, (_, id) => id).filter((id) => allowedTile(id, sanma));
    const hasBonusSource = (options.kita || 0) > 0 || (options.redCount || 0) > 0 ||
      melds.some((meld) => (meld.redCount || 0) > 0) || options.doraCounts.some((han) => han > 0);
    if (closed && active.every((id) => (options.doraCounts[id] || 0) > 0)) {
      const effective = total(counts) + melds.length * 3;
      const states = [];
      if (discard && effective === 14) {
        for (let id = 0; id < 34; id++) {
          if (!counts[id]) continue;
          const after = counts.slice(); after[id]--;
          const value = shanten(after, melds.length, sanma);
          const draws = regularUkeire(after, melds, sanma, value, visibleCounts, options.kita);
          states.push({ id, shanten: value, draws });
        }
      } else {
        const value = shanten(counts, melds.length, sanma);
        states.push({ id: null, shanten: value, draws: regularUkeire(counts, melds, sanma, value, visibleCounts, options.kita) });
      }
      states.sort((a, b) => a.shanten - b.shanten || b.draws.reduce((sum, item) => sum + item.remaining, 0) - a.draws.reduce((sum, item) => sum + item.remaining, 0));
      const best = states[0];
      const route = {
        key: 'counted-standard',
        name: '累计役满',
        missing: Math.max(0, best.shanten + 1),
        shanten: best.shanten,
        discard: best.id,
        discardAlternatives: states.filter((state) => state.shanten === best.shanten && state.id !== null).map((state) => state.id),
        target: null,
        draws: best.draws,
        ukeire: best.draws.reduce((sum, item) => sum + item.remaining, 0)
      };
      const result = combineRouteDistances({ routes: [route] });
      countedRouteCache.set(cacheKey, result);
      if (countedRouteCache.size > 128) countedRouteCache.delete(countedRouteCache.keys().next().value);
      return result;
    }
    const concealedSlots = 14 - total(fixedStructural);
    let fixedDora = sanma ? (options.kita || 0) : 0;
    fixedDora += kitaDoraHan(options);
    for (let id = 0; id < 34; id++) fixedDora += fixedPhysical[id] * (options.doraCounts[id] || 0);
    const doraValues = [];
    const maxDoraValue = Math.max(0, ...options.doraCounts);
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, sanma)) continue;
      for (let copy = fixedPhysical[id] + (visibleCounts[id] || 0) + kitaPhysicalCount(id, sanma, options.kita); copy < 4; copy++) doraValues.push(options.doraCounts[id] || 0);
    }
    doraValues.sort((a, b) => b - a);
    const maximumDora = fixedDora + doraValues.slice(0, concealedSlots).reduce((sum, han) => sum + han, 0) + 3;
    if (maximumDora < 1) {
      countedRouteCache.set(cacheKey, null);
      if (countedRouteCache.size > 128) countedRouteCache.delete(countedRouteCache.keys().next().value);
      return null;
    }

    const effective = total(counts) + melds.length * 3;
    const current = addCounts(counts, fixedStructural);
    const physical = addCounts(addCounts(counts, fixedPhysical), visibleCounts);
    physical[30] += kitaPhysicalCount(30, sanma, options.kita);
    const states = [];
    if (discard && effective === 14) {
      for (let id = 0; id < 34; id++) {
        if (!counts[id]) continue;
        const after = current.slice(); after[id]--;
        const available = physical.slice(); available[id]--;
        states.push({ after, available, discard: id, presentIds: after.flatMap((count, tileId) => count ? [tileId] : []) });
      }
    } else states.push({ after: current, available: physical, discard: null, presentIds: current.flatMap((count, id) => count ? [id] : []) });

    function filterImprovingDraws(state, route, draws, routeShanten) {
      if (effective !== 13 || routeShanten !== 1) return draws;
      return draws.filter((draw) => {
        const drawn = state.after.slice(); drawn[draw.id]++;
        for (let discardId = 0; discardId < 34; discardId++) {
          if (!counts[discardId]) continue;
          const after = drawn.slice(); after[discardId]--;
          let shared = 0;
          for (let id = 0; id < 34; id++) shared += Math.min(after[id], route.target[id]);
          if (Math.max(-1, 13 - shared) < routeShanten) {
            if (route.name === '累计役满' && !hasYakumanWait(after, melds, { ...options, sanma }).length) continue;
            return true;
          }
        }
        return false;
      });
    }
    let best = null;
    let bestDraws = new Map();
    let bestDistance = Infinity;
    const discardAlternatives = new Set();
    const seen = new Set();
    const target = fixedStructural.slice();
    const doraCapacities = Array(maxDoraValue + 1).fill(0);
    for (let id = 0; id < 34; id++) {
      if (allowedTile(id, sanma)) {
        doraCapacities[options.doraCounts[id] || 0] += Math.max(
          0,
          4 - fixedPhysical[id] - (visibleCounts[id] || 0) - kitaPhysicalCount(id, sanma, options.kita)
        );
      }
    }
    let targetDora = fixedDora;
    const distanceMetrics = states.map((state) => {
      let shared = 0;
      let futureMatches = 0;
      for (const id of state.presentIds) {
        const count = target[id];
        const have = state.after[id];
        shared += Math.min(have, count);
        futureMatches += Math.min(Math.max(0, have - count), Math.max(0, 4 - count));
      }
      return { state, shared, futureMatches };
    });
    function changeTarget(id, delta) {
      const before = target[id];
      const after = before + delta;
      const dora = options.doraCounts[id] || 0;
      target[id] = after;
      targetDora += delta * dora;
      doraCapacities[dora] -= delta;
      for (const metric of distanceMetrics) {
        const have = metric.state.after[id];
        metric.shared += Math.min(have, after) - Math.min(have, before);
        metric.futureMatches += Math.min(Math.max(0, have - after), Math.max(0, 4 - after)) -
          Math.min(Math.max(0, have - before), Math.max(0, 4 - before));
      }
    }
    let groups = [];
    const sortGroups = (items) => items.sort((a, b) => {
      const weight = (group) => group.reduce((sum, id) => sum + Math.min(counts[id], 3) * 2 + (options.doraCounts[id] || 0), 0);
      return weight(b) - weight(a);
    });
    const neededGroups = 4 - melds.length;

    function bestCandidate(route) {
      let routeBest = null;
      let routeBestState = null;
      let bestShanten = Infinity;
      const discardAlternatives = new Set();
      const targetIds = route.target.flatMap((count, id) => count ? [id] : []);
      for (const state of states) {
        let shared = 0;
        for (const id of targetIds) shared += Math.min(state.after[id], route.target[id]);
        const missing = 14 - shared;
        const draws = [];
        for (const id of targetIds) {
          if (!allowedTile(id, sanma) || state.available[id] >= 4 || state.after[id] >= route.target[id]) continue;
          draws.push({ id, remaining: 4 - state.available[id] });
        }
        const candidate = {
          ...route,
          missing,
          shanten: Math.max(-1, missing - 1),
          discard: state.discard,
          draws,
          ukeire: draws.reduce((sum, item) => sum + item.remaining, 0),
          anyDraw: draws.length >= Math.ceil(active.length * 0.6)
        };
        if (candidate.shanten < bestShanten) {
          bestShanten = candidate.shanten;
          discardAlternatives.clear();
        }
        if (candidate.shanten === bestShanten && state.discard !== null && state.discard !== undefined) discardAlternatives.add(state.discard);
        if (!routeBest || compareRoute(candidate, routeBest) < 0) {
          routeBest = candidate;
          routeBestState = state;
        }
      }
      if (routeBest) routeBest.discardAlternatives = [...discardAlternatives];
      return routeBest ? { candidate: routeBest, state: routeBestState } : null;
    }

    function doraUpperBound(remainingSlots) {
      let upper = targetDora;
      let slots = remainingSlots;
      for (let value = maxDoraValue; value > 0 && slots; value--) {
        const copies = Math.min(slots, doraCapacities[value]);
        upper += copies * value;
        slots -= copies;
      }
      return upper + 3;
    }

    function distanceLowerBound(remainingSlots) {
      let best = Infinity;
      for (const metric of distanceMetrics) {
        const maxShared = metric.shared + Math.min(remainingSlots, metric.futureMatches);
        const missing = 14 - maxShared;
        const value = Math.max(-1, missing - 1);
        best = Math.min(best, value);
      }
      return best;
    }

    function pairDistanceLowerBound(remainingPairs) {
      let best = Infinity;
      for (const metric of distanceMetrics) {
        const gains = [];
        for (const id of active) {
          if (target[id] || fixedPhysical[id] + (visibleCounts[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + 2 > 4) continue;
          gains.push(Math.min(2, metric.state.after[id]));
        }
        gains.sort((a, b) => b - a);
        const shared = metric.shared + gains.slice(0, remainingPairs).reduce((sum, value) => sum + value, 0);
        const missing = 14 - shared;
        const value = Math.max(-1, missing - 1);
        best = Math.min(best, value);
      }
      return best;
    }

    function considerTarget() {
      const key = routeTargetKey(target);
      if (seen.has(key)) return;
      seen.add(key);
      const route = { key, name: '累计役满', target: target.slice() };
      const match = bestCandidate(route);
      if (!match) return;
      const candidate = match.candidate;
      if (candidate.shanten > maxShanten) return;
      if (best && candidate.shanten > best.shanten) return;
      const sameRecommendation = best && candidate.shanten === best.shanten && candidate.discard === best.discard;
      const addsDraw = sameRecommendation && candidate.draws.some((draw) => !bestDraws.has(draw.id));
      const addsDiscard = best && candidate.shanten === best.shanten &&
        candidate.discardAlternatives.some((id) => !discardAlternatives.has(id));
      if (best && compareRouteQuality(candidate, best) >= 0 && !addsDraw && !addsDiscard) return;
      const bonusHan = routeDoraHan(target, melds, { ...options, sanma }, candidate.shanten !== 0);
      const winningTileIds = candidate.shanten === 0 ? candidate.draws.map((draw) => draw.id) : null;
      if (!countedTargetIsYakuman(target, melds, sanma, options, bonusHan, winningTileIds)) return;
      candidate.draws = filterImprovingDraws(match.state, route, candidate.draws, candidate.shanten);
      candidate.ukeire = candidate.draws.reduce((sum, item) => sum + item.remaining, 0);
      candidate.anyDraw = candidate.draws.length >= Math.ceil(active.length * 0.6);
      if (candidate.shanten < bestDistance) {
        bestDistance = candidate.shanten;
        discardAlternatives.clear();
      }
      if (candidate.shanten === bestDistance) {
        candidate.discardAlternatives.forEach((id) => discardAlternatives.add(id));
      }
      if (!best || candidate.shanten < best.shanten) {
        best = candidate;
        bestDraws = new Map(candidate.draws.map((draw) => [draw.id, draw]));
      } else if (candidate.shanten === best.shanten && candidate.discard === best.discard) {
        for (const draw of candidate.draws) {
          const previous = bestDraws.get(draw.id);
          if (!previous || draw.remaining > previous.remaining) bestDraws.set(draw.id, draw);
        }
        if (candidate.ukeire > best.ukeire) best = candidate;
      }
    }

    function chooseGroups(start, remaining) {
      const remainingSlots = remaining * 3 + 2;
      if (doraUpperBound(remainingSlots) < 1 || distanceLowerBound(remainingSlots) > Math.min(maxShanten, best ? best.shanten : Infinity)) return;
      if (remaining === 0) {
        for (let pair = 0; pair < 34; pair++) {
          if (!allowedTile(pair, sanma) || target[pair] + 2 > 4 || fixedPhysical[pair] + (visibleCounts[pair] || 0) + kitaPhysicalCount(pair, sanma, options.kita) + target[pair] - fixedStructural[pair] + 2 > 4) continue;
          changeTarget(pair, 2);
          considerTarget();
          changeTarget(pair, -2);
        }
        return;
      }
      for (let index = start; index < groups.length; index++) {
        const group = groups[index];
        const groupCounts = Array(34).fill(0);
        for (const id of group) groupCounts[id]++;
        if (groupCounts.some((amount, id) => amount > 0 && (
          target[id] + amount > 4 ||
          fixedPhysical[id] + (visibleCounts[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + target[id] - fixedStructural[id] + amount > 4
        ))) continue;
        for (const id of group) changeTarget(id, 1);
        chooseGroups(index, remaining - 1);
        for (const id of group) changeTarget(id, -1);
      }
    }

    const fixedIds = fixedStructural.flatMap((count, id) => count ? [id] : []);
    const searchScopes = hasBonusSource
      ? [active]
      : closed
        ? [0, 1, 2].map((suit) => active.filter((id) => id >= 27 || Math.floor(id / 9) === suit))
        : [];
    for (const searchActive of searchScopes) {
      if (fixedIds.some((id) => !searchActive.includes(id))) continue;
      groups = sortGroups(groupPatterns(searchActive));
      chooseGroups(0, neededGroups);
      if (melds.length !== 0) continue;
      function choosePairs(start, remaining) {
        const remainingSlots = remaining * 2;
        if (doraUpperBound(remainingSlots) < 1 || pairDistanceLowerBound(remaining) > Math.min(maxShanten, best ? best.shanten : Infinity)) return;
        if (remaining === 0) { considerTarget(); return; }
        for (let index = start; index < searchActive.length; index++) {
          const id = searchActive[index];
          if (target[id] + 2 > 4 || fixedPhysical[id] + (visibleCounts[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + target[id] - fixedStructural[id] + 2 > 4) continue;
          changeTarget(id, 2);
          choosePairs(index + 1, remaining - 1);
          changeTarget(id, -2);
        }
      }
      choosePairs(0, 7);
    }
    if (best) {
      best = {
        ...best,
        discardAlternatives: [...discardAlternatives],
        draws: [...bestDraws.values()].sort((a, b) => a.id - b.id),
        ukeire: [...bestDraws.values()].reduce((sum, draw) => sum + draw.remaining, 0)
      };
      const result = combineRouteDistances({ routes: [best] });
      countedRouteCache.set(cacheKey, result);
      if (countedRouteCache.size > 128) countedRouteCache.delete(countedRouteCache.keys().next().value);
      return result;
    }
    countedRouteCache.set(cacheKey, null);
    if (countedRouteCache.size > 128) countedRouteCache.delete(countedRouteCache.keys().next().value);
    return null;
  }

  function suuankouDistance(counts, melds, sanma, discard, options = {}) {
    if (melds.some((meld) => meld.type !== 'ankan')) return null;
    const fixedAnkanIds = melds.filter((meld) => meld.type === 'ankan').map((meld) => meld.tiles[0]);
    const fixedSet = new Set(fixedAnkanIds);
    const needTriplets = 4 - fixedAnkanIds.length;
    const active = Array.from({ length: 34 }, (_, id) => id).filter((id) => allowedTile(id, sanma) && !fixedSet.has(id));
    const structural = addCounts(counts, fixedCounts(melds, true));
    const fixedPhysical = fixedCounts(melds, false);
    const indicators = options.indicatorCounts || [];
    const physical = addCounts(addCounts(counts, fixedPhysical), indicators);
    physical[30] += kitaPhysicalCount(30, sanma, options.kita);
    const effective = total(counts) + melds.length * 3;
    const states = [];
    if (discard && effective === 14) {
      for (let id = 0; id < 34; id++) {
        if (!counts[id]) continue;
        const after = structural.slice();
        after[id]--;
        const available = physical.slice(); available[id]--;
        states.push({ after, available, discard: id });
      }
    } else {
      states.push({ after: structural, available: physical, discard: null });
    }

    if (fixedAnkanIds.length === 3) {
      const fixedTarget = fixedCounts(melds, true);
      let bestRoute = null;
      let bestRouteShanten = Infinity;
      const discardAlternatives = new Set();
      for (const state of states) {
        const candidates = [];
        for (const triplet of active) {
          for (const pair of active) {
            if (triplet === pair) continue;
            const target = fixedTarget.slice();
            target[triplet] += 3;
            target[pair] += 2;
            if (target.some((count, id) => fixedPhysical[id] + (indicators[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + count - fixedTarget[id] > 4)) continue;
            let shared = 0;
            for (let id = 0; id < 34; id++) shared += Math.min(state.after[id], target[id]);
            const draws = [];
            for (let id = 0; id < 34; id++) {
              if (!allowedTile(id, sanma) || state.available[id] >= 4 || state.after[id] >= target[id]) continue;
              draws.push({ id, remaining: 4 - state.available[id] });
            }
            const route = {
              key: `${fixedAnkanIds.concat(triplet).sort((a, b) => a - b).join(',')}|${pair}`,
              name: '四暗刻',
              triplets: fixedAnkanIds.concat(triplet).sort((a, b) => a - b),
              pair,
              target,
              missing: 14 - shared,
              shanten: Math.max(-1, total(state.after) - shared),
              discard: state.discard,
              draws,
              ukeire: draws.reduce((sum, item) => sum + item.remaining, 0)
            };
            route.anyDraw = draws.length >= Math.ceil(active.length * 0.6);
            candidates.push(route);
          }
        }
        if (!candidates.length) continue;
        const stateBestShanten = Math.min(...candidates.map((route) => route.shanten));
        const tied = candidates.filter((route) => route.shanten === stateBestShanten);
        const drawsById = new Map();
        for (const route of tied) {
          for (const draw of route.draws) {
            const previous = drawsById.get(draw.id);
            if (!previous || draw.remaining > previous.remaining) drawsById.set(draw.id, draw);
          }
        }
        const draws = [...drawsById.values()].sort((a, b) => a.id - b.id);
        const stateBest = labelSuuankouTanki({
          ...tied.sort(compareRoute)[0],
          draws,
          ukeire: draws.reduce((sum, item) => sum + item.remaining, 0),
          anyDraw: draws.length >= Math.ceil(active.length * 0.6)
        }, state.after);
        if (stateBest.shanten < bestRouteShanten) {
          bestRouteShanten = stateBest.shanten;
          discardAlternatives.clear();
        }
        if (stateBest.shanten === bestRouteShanten && state.discard !== null && state.discard !== undefined) discardAlternatives.add(state.discard);
        if (!bestRoute || compareRoute(stateBest, bestRoute) < 0) bestRoute = stateBest;
      }
      if (!bestRoute) return null;
      return {
        shanten: bestRoute.shanten,
        missing: bestRoute.missing,
        discards: [...discardAlternatives],
        improvements: [{
          id: bestRoute.draws[0] ? bestRoute.draws[0].id : null,
          remaining: bestRoute.ukeire,
          shanten: bestRoute.shanten,
          discards: bestRoute.discard === null || bestRoute.discard === undefined ? [] : [bestRoute.discard],
          route: bestRoute.name,
          routeKey: bestRoute.key,
          target: bestRoute.target,
          draws: bestRoute.draws,
          anyDraw: bestRoute.anyDraw,
          triplets: bestRoute.triplets,
          pair: bestRoute.pair
        }],
        routes: [bestRoute]
      };
    }
    const hasEstablishedTriplets = fixedAnkanIds.length +
      counts.filter((count, id) => !fixedSet.has(id) && count >= 3).length >= 3;
    const matchCount = (state, id, size, triplet = false) => {
      if (triplet && hasEstablishedTriplets) return state.after[id] >= size ? size : 0;
      return Math.min(state.after[id], size);
    };
    const drawCount = (state, id, size) => state.available[id] >= 4 || state.after[id] >= size
      ? 0
      : 4 - state.available[id];
    const fixedShared = fixedAnkanIds.length * 3;
    function bestTripletSet(state, excluded, size) {
      const choices = active.filter((id) => !excluded.has(id) && fixedPhysical[id] + (indicators[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) + 3 <= 4).map((id) => ({
        id,
        shared: matchCount(state, id, 3, true),
        draws: drawCount(state, id, 3)
      }));
      choices.sort((a, b) => b.shared - a.shared || b.draws - a.draws || a.id - b.id);
      const picked = choices.slice(0, size);
      return {
        ids: picked.map((choice) => choice.id),
        shared: picked.reduce((sum, choice) => sum + choice.shared, 0),
        draws: picked.reduce((sum, choice) => sum + choice.draws, 0)
      };
    }
    let bestRoute = null;
    let bestRouteShanten = Infinity;
    const discardAlternatives = new Set();
    for (const state of states) {
      let stateBestShared = -1;
      let stateBestDraws = -1;
      let stateBest = null;
      const tiedPairs = [];
      for (const pair of active) {
        if (fixedPhysical[pair] + (indicators[pair] || 0) + kitaPhysicalCount(pair, sanma, options.kita) + 2 > 4) continue;
        const chosen = bestTripletSet(state, new Set([pair]), needTriplets);
        if (chosen.ids.length !== needTriplets) continue;
        const pairShared = matchCount(state, pair, 2);
        const pairDraws = drawCount(state, pair, 2);
        const shared = fixedShared + pairShared + chosen.shared;
        const drawTotal = pairDraws + chosen.draws;
        const triplets = fixedAnkanIds.concat(chosen.ids).sort((a, b) => a - b);
        const route = {
          key: `${triplets.join(',')}|${pair}`,
          name: '四暗刻',
          triplets,
          pair,
          target: null,
          missing: 14 - shared,
          shanten: Math.max(-1, total(state.after) - shared),
          discard: state.discard,
          draws: [],
          ukeire: drawTotal
        };
        route.target = routeTarget(route);
        if (!stateBest || shared > stateBestShared) {
          stateBestShared = shared;
          stateBestDraws = drawTotal;
          stateBest = route;
          tiedPairs.length = 0;
          tiedPairs.push({ pair, chosen });
        } else if (shared === stateBestShared) {
          tiedPairs.push({ pair, chosen });
          if (drawTotal > stateBestDraws || (drawTotal === stateBestDraws && compareRoute(route, stateBest) < 0)) {
            stateBestDraws = drawTotal;
            stateBest = route;
          }
        }
      }
      if (!stateBest) continue;
      const drawsById = new Map();
      for (const { pair } of tiedPairs) {
        const pairCopies = drawCount(state, pair, 2);
        if (pairCopies) drawsById.set(pair, { id: pair, remaining: pairCopies });
        for (const id of needTriplets ? active : []) {
          if (id === pair) continue;
          const copies = drawCount(state, id, 3);
          if (!copies) continue;
          const rest = bestTripletSet(state, new Set([pair, id]), Math.max(0, needTriplets - 1));
          const shared = fixedShared + matchCount(state, pair, 2) + matchCount(state, id, 3, true) + rest.shared;
          if (shared === stateBestShared) {
            drawsById.set(id, { id, remaining: copies });
          }
        }
      }
      const draws = [...drawsById.values()].sort((a, b) => a.id - b.id);
      stateBest = labelSuuankouTanki({
        ...stateBest,
        draws,
        ukeire: draws.reduce((sum, item) => sum + item.remaining, 0),
        anyDraw: draws.length >= Math.ceil(active.length * 0.6)
      }, state.after);
      if (stateBest.shanten < bestRouteShanten) {
        bestRouteShanten = stateBest.shanten;
        discardAlternatives.clear();
      }
      if (stateBest.shanten === bestRouteShanten && state.discard !== null && state.discard !== undefined) discardAlternatives.add(state.discard);
      if (!bestRoute || compareRoute(stateBest, bestRoute) < 0) bestRoute = stateBest;
    }
    if (!bestRoute) return null;
    return {
      shanten: bestRoute.shanten,
      missing: bestRoute.missing,
      discards: [...discardAlternatives],
      improvements: [{
        id: bestRoute.draws[0] ? bestRoute.draws[0].id : null,
        remaining: bestRoute.ukeire,
        shanten: bestRoute.shanten,
        discards: bestRoute.discard === null || bestRoute.discard === undefined ? [] : [bestRoute.discard],
        route: bestRoute.name,
        routeKey: bestRoute.key,
        target: bestRoute.target,
        draws: bestRoute.draws,
        anyDraw: bestRoute.anyDraw,
        triplets: bestRoute.triplets,
        pair: bestRoute.pair
      }],
      routes: [bestRoute]
    };
  }
  function yakumanOptionKey(options) {
    if (!options) return '';
    return JSON.stringify({
      sanma: options.sanma,
      doraCounts: options.doraCounts || [],
      indicatorCounts: options.indicatorCounts || [],
      redCount: options.redCount || 0,
      redFiveCounts: options.redFiveCounts || [],
      redFiveAvailable: options.redFiveAvailable || [],
      kita: options.kita || 0,
      roundWind: options.roundWind,
      seatWind: options.seatWind
    });
  }
  function yakumanCase(result) {
    return Boolean(result && ((result.allYakuman || []).length || (result.yakuman || []).length));
  }

  function normalizeYakumanImprovements(improvements) {
    const groups = new Map();
    for (const route of improvements || []) {
      const draws = route.draws && route.draws.length
        ? route.draws
        : Number.isInteger(route.id) ? [{ id: route.id, remaining: route.remaining || 0 }] : [];
      const drawMap = new Map();
      for (const draw of draws) {
        const previous = drawMap.get(draw.id);
        if (!previous || draw.remaining > previous.remaining) drawMap.set(draw.id, { ...draw });
      }
      const normalizedDraws = [...drawMap.values()].sort((a, b) => a.id - b.id);
      const key = JSON.stringify([route.route || '', route.shanten, route.kanAction, Boolean(route.anyDraw), normalizedDraws]);
      const group = groups.get(key);
      if (!group) {
        groups.set(key, { ...route, draws: normalizedDraws, discards: [...new Set(route.discards || [])] });
        continue;
      }
      group.discards = [...new Set([...group.discards, ...(route.discards || [])])].sort((a, b) => a - b);
      group.remaining = normalizedDraws.reduce((sum, draw) => sum + (draw.remaining || 0), 0);
      group.id = normalizedDraws[0] ? normalizedDraws[0].id : null;
    }
    const rows = [...groups.values()];
    rows.sort((a, b) => a.shanten - b.shanten ||
      Number(a.route === '累计役满') - Number(b.route === '累计役满') ||
      (b.remaining || 0) - (a.remaining || 0) ||
      String(a.route || '').localeCompare(String(b.route || '')));
    const pureNineGates = new Set(rows.filter((route) => route.route === '纯正九莲宝灯').map((route) => {
      const discards = [...(route.discards || [])].sort((a, b) => a - b);
      return JSON.stringify([route.shanten, discards, Boolean(route.anyDraw), route.draws]);
    }));
    return rows.filter((route) => {
      if (route.route !== '九莲宝灯') return true;
      const discards = [...(route.discards || [])].sort((a, b) => a - b);
      return !pureNineGates.has(JSON.stringify([route.shanten, discards, Boolean(route.anyDraw), route.draws]));
    });
  }

  function yakumanNamesInWaits(waits) {
    const names = new Set();
    for (const wait of waits) {
      const waitNames = new Set();
      for (const result of Object.values(wait.analysis.cases || {})) {
        for (const item of result ? [...(result.allYakuman || []), ...(result.yakuman || [])] : []) waitNames.add(item.label || item.name);
      }
      if (waitNames.has('国士无双十三面')) waitNames.delete('国士无双');
      if (waitNames.has('纯正九莲宝灯')) waitNames.delete('九莲宝灯');
      waitNames.forEach((name) => names.add(name));
    }
    return [...names];
  }
  function yakumanOpportunityRows(entries, melds) {
    const fixed = fixedCounts(melds, false);
    const grouped = new Map();
    for (const entry of entries) {
      for (const wait of entry.waits) {
        const names = [...new Set(yakumanNamesInWaits([wait]).filter(Boolean))].sort();
        if (!names.length) continue;
        const route = names.join('、');
        const key = JSON.stringify([route, entry.discardId]);
        if (!grouped.has(key)) grouped.set(key, { route, discards: entry.discardId === null ? [] : [entry.discardId], draws: [] });
        const remaining = Math.max(0, 4 - entry.counts[wait.id] - fixed[wait.id] - (entry.indicators[wait.id] || 0));
        if (remaining) grouped.get(key).draws.push({ id: wait.id, remaining });
      }
    }
    return [...grouped.values()].map((row) => ({
      ...row,
      id: row.draws[0] ? row.draws[0].id : null,
      shanten: 0,
      remaining: row.draws.reduce((sum, draw) => sum + draw.remaining, 0)
    })).filter((row) => row.remaining > 0);
  }
  function hasYakumanWait(counts, melds, options) {
    const fixed = fixedCounts(melds, false);
    const key = `${counts.join(',')}|${melds.map((meld) => `${meld.type}:${meld.tiles.join('.')}:${meld.redCount || 0}`).join('|')}|${yakumanOptionKey(options)}`;
    if (yakumanOpportunityCache.has(key)) return yakumanOpportunityCache.get(key);
    const waits = [];
    const indicators = options.indicatorCounts || [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, options.sanma) || counts[id] + fixed[id] + (indicators[id] || 0) + kitaPhysicalCount(id, options.sanma, options.kita) >= 4) continue;
      const next = addGroup(counts, [id]);
      const analysis = analyzeScore(next, melds, { ...options, preWinCounts: counts, winningTile: id });
      if (!analysis.complete) continue;
      const cases = Object.values(analysis.cases).filter(Boolean);
      if (cases.some(yakumanCase)) waits.push({ id, analysis });
    }
    yakumanOpportunityCache.set(key, waits);
    return waits;
  }
  function yakumanDistance(counts, melds, sanma, discard, options) {
    const distance = yakumanDistanceInternal(counts, melds, sanma, discard, options);
    if (!distance || !distance.improvements) return distance;
    const improvements = normalizeYakumanImprovements(distance.improvements);
    const liveImprovements = improvements.filter((route) => {
      const remaining = Number.isFinite(route.remaining)
        ? route.remaining
        : (route.draws || []).reduce((sum, draw) => sum + (draw.remaining || 0), 0);
      return route.shanten < 0 || remaining > 0;
    });
    const bestLiveShanten = liveImprovements.length
      ? Math.min(...liveImprovements.map((route) => route.shanten))
      : null;
    const shanten = Number.isFinite(distance.shanten) && bestLiveShanten !== null &&
      distance.shanten < bestLiveShanten && !distance.yakumanOpportunity
      ? bestLiveShanten
      : distance.shanten;
    return { ...distance, shanten, improvements };
  }

  function countedYakumanKanDistance(counts, melds, sanma, options, maxShanten) {
    if (!options.doraCounts.some((han) => han > 0)) return null;
    const fixed = fixedCounts(melds, false);
    const indicators = options.indicatorCounts || [];
    const existingKans = melds.filter((meld) => meld.type === 'kan' || meld.type === 'ankan').length;
    if (existingKans >= 3) return null;
    const routes = [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, sanma)) continue;
      const heldKan = counts[id] === 4 && fixed[id] === 0 && !(indicators[id] || 0) && !kitaPhysicalCount(id, sanma, options.kita);
      const drawKan = counts[id] === 3 && counts[id] + fixed[id] + (indicators[id] || 0) + kitaPhysicalCount(id, sanma, options.kita) < 4;
      if (!heldKan && !drawKan) continue;
      if (existingKans < 2 && !options.doraCounts[id]) continue;
      const actionShanten = drawKan ? 1 : 0;
      const nextCounts = counts.slice(); nextCounts[id] -= heldKan ? 4 : 3;
      const nextMelds = melds.concat({ type: 'ankan', tiles: [id, id, id, id] });
      const afterKan = countedYakumanDistance(nextCounts, nextMelds, sanma, false, options, Math.max(0, maxShanten - actionShanten));
      if (!afterKan) continue;
      const remaining = 4 - counts[id] - fixed[id] - (indicators[id] || 0) - kitaPhysicalCount(id, sanma, options.kita);
      for (const route of afterKan.routes || []) {
        if (route.name !== '累计役满' || route.shanten + actionShanten > maxShanten) continue;
        routes.push({
          ...route,
          key: `${route.key}:ankan:${id}`,
          shanten: route.shanten + actionShanten,
          missing: route.missing + actionShanten,
          discard: null,
          discardAlternatives: [],
          kanAction: id,
          draws: drawKan ? [{ id, remaining }] : route.draws,
          ukeire: drawKan ? remaining : route.ukeire,
          anyDraw: false,
          followupDraws: drawKan ? route.draws || [] : []
        });
      }
    }
    return routes.length ? combineRouteDistances({ routes }) : null;
  }

  function yakumanDistanceInternal(counts, melds, sanma, discard, options) {
    const effective = total(counts) + melds.length * 3;
    const baseOptions = { sanma, doraCounts: Array(34).fill(0), indicatorCounts: Array(34).fill(0), redCount: 0, kita: 0, roundWind: 27, seatWind: 27, ...options };
    const routeKey = `${counts.join(',')}|${melds.map((meld) => `${meld.type}:${meld.tiles.join('.')}`).join('|')}|${sanma}|${discard}|${(baseOptions.indicatorCounts || []).join(',')}|${baseOptions.kita || 0}`;
    let suuankou = suuankouDistanceCache.get(routeKey);
    if (suuankou === undefined) {
      suuankou = suuankouDistance(counts, melds, sanma, discard, baseOptions);
      suuankouDistanceCache.set(routeKey, suuankou || null);
    }

    let currentWaits = [];
    let currentDiscardWaits = [];
    if (effective === 13) {
      currentWaits = hasYakumanWait(counts, melds, baseOptions);
    } else if (effective === 14 && discard) {
      for (let discardId = 0; discardId < 34; discardId++) {
        if (!counts[discardId]) continue;
        const afterDiscard = copyCounts(counts);
        afterDiscard[discardId]--;
        const visible = baseOptions.indicatorCounts.slice();
        visible[discardId] = (visible[discardId] || 0) + 1;
        const waits = hasYakumanWait(afterDiscard, melds, { ...baseOptions, indicatorCounts: visible });
        if (waits.length) currentDiscardWaits.push({ discardId, waits, counts: afterDiscard, indicators: visible });
      }
    }

    const direct = routeDistance(counts, melds, sanma, discard, baseOptions);
    const directRoutes = combineRouteDistances(suuankou, direct);
    const counted = countedYakumanDistance(
      counts,
      melds,
      sanma,
      discard,
      baseOptions,
      Math.min(6, directRoutes && directRoutes.routes.length >= 3 ? directRoutes.routes[2].shanten : 6)
    );
    const countedKan = countedYakumanKanDistance(
      counts,
      melds,
      sanma,
      baseOptions,
      Math.min(6, directRoutes && directRoutes.routes.length >= 3 ? directRoutes.routes[2].shanten : 6)
    );
    let combined = combineRouteDistances(suuankou, direct, counted, countedKan);
    if (!combined && !currentWaits.length && !currentDiscardWaits.length) {
      return { shanten: null, missing: null, discards: [], improvements: [], routes: [], impossible: true };
    }
    if (currentWaits.length || currentDiscardWaits.length) {
      if (!combined) combined = { shanten: 0, missing: 1, discards: [], improvements: [], routes: [] };
      combined.shanten = 0;
      combined.yakumanOpportunity = true;
      if (currentWaits.length) combined.waits = currentWaits;
      if (currentDiscardWaits.length) combined.discards = currentDiscardWaits.map((item) => item.discardId);
      const directEntries = [
        ...(currentWaits.length ? [{ discardId: null, waits: currentWaits, counts, indicators: baseOptions.indicatorCounts }] : []),
        ...currentDiscardWaits
      ];
      const directRows = yakumanOpportunityRows(directEntries, melds);
      if (directRows.length) {
        const directRoutes = new Set(directRows.map((row) => row.route));
        combined.improvements = [
          ...directRows,
          ...combined.improvements.filter((row) => !directRoutes.has(row.route))
        ];
      }
    }
    if (effective === 14 && discard && combined && !combined.kanActions?.length) {
      const indicators = baseOptions.indicatorCounts || [];
      const regularCandidates = counts.flatMap((count, id) => {
        if (!count) return [];
        const afterDiscard = copyCounts(counts);
        afterDiscard[id]--;
        const regularShanten = shanten(afterDiscard, melds.length, sanma);
        const ukeire = regularUkeire(afterDiscard, melds, sanma, regularShanten, indicators, baseOptions.kita)
          .reduce((sum, draw) => sum + draw.remaining, 0);
        return { id, regularShanten, ukeire };
      });
      const routeNames = new Set((combined.routes || []).map((route) => route.name));
      const needsSuuankou = routeNames.has('四暗刻') || routeNames.has('四暗刻单骑');
      const hasCountedBonus = (baseOptions.kita || 0) > 0 || (baseOptions.redCount || 0) > 0 ||
        (baseOptions.doraCounts || []).some((han) => han > 0) ||
        melds.some((meld) => (meld.redCount || 0) > 0);
      const needsCounted = routeNames.has('累计役满') && hasCountedBonus;
      const fixedStructural = fixedCounts(melds, true);
      const routeMetricsById = new Map();
      for (const item of regularCandidates) {
        const afterDiscard = copyCounts(counts);
        afterDiscard[item.id]--;
        const metrics = directYakumanRouteShanten(afterDiscard, melds, sanma, baseOptions, routeNames);
        if (needsSuuankou) {
          const suuankou = suuankouDistance(afterDiscard, melds, sanma, false, baseOptions);
          for (const route of suuankou && suuankou.routes || []) {
            const previous = metrics.get(route.name);
            if (previous === undefined || route.shanten < previous) metrics.set(route.name, route.shanten);
          }
        }
        if (needsCounted) {
          const counted = countedYakumanDistance(afterDiscard, melds, sanma, false, baseOptions, 6);
          for (const route of counted && counted.routes || []) {
            const previous = metrics.get(route.name);
            if (previous === undefined || route.shanten < previous) metrics.set(route.name, route.shanten);
          }
        }
        routeMetricsById.set(item.id, { after: afterDiscard, metrics });
      }
      const routeCandidateSets = [];
      for (const route of combined.routes || []) {
        const candidates = [];
        for (const item of regularCandidates) {
          const state = routeMetricsById.get(item.id);
          const metrics = state && state.metrics;
          let routeShanten = metrics && metrics.get(route.name);
          if (route.name === '四暗刻' && metrics && metrics.has('四暗刻单骑')) {
            routeShanten = Math.min(routeShanten === undefined ? Infinity : routeShanten, metrics.get('四暗刻单骑'));
          }
          if (route.name === '国士无双' && metrics && metrics.has('国士无双十三面')) {
            routeShanten = Math.min(routeShanten === undefined ? Infinity : routeShanten, metrics.get('国士无双十三面'));
          }
          if (routeShanten === undefined && route.name === '累计役满' && state) {
            if (Array.isArray(route.target)) {
              const structuralAfter = addCounts(state.after, fixedStructural);
              let shared = 0;
              for (let id = 0; id < 34; id++) shared += Math.min(structuralAfter[id], route.target[id]);
              const missing = 14 - shared;
              routeShanten = Math.max(-1, missing - 1);
            } else {
              routeShanten = item.regularShanten;
            }
          }
          if (routeShanten === undefined || routeShanten > route.shanten) continue;
          candidates.push({ ...item, routeShanten });
        }
        if (candidates.length) {
          routeCandidateSets.push({
            shanten: route.shanten,
            candidates: new Set(candidates.map((item) => item.id))
          });
        }
      }
      if (routeCandidateSets.length) {
        // Preserve the shortest route prefix first.  Some routes genuinely
        // conflict, so requiring every route at once would leave no legal
        // recommendation and would accidentally fall back to ordinary
        // shanten efficiency across a yakuman route boundary.
        let safeIds = new Set(routeCandidateSets[0].candidates);
        for (let index = 1; index < routeCandidateSets.length; index++) {
          const next = new Set([...safeIds].filter((id) => routeCandidateSets[index].candidates.has(id)));
          if (!next.size) break;
          safeIds = next;
        }
        const safe = regularCandidates.filter((item) => safeIds.has(item.id));
        if (safe.length) {
          const bestRegularShanten = Math.min(...safe.map((item) => item.regularShanten));
          const regularPreserving = safe.filter((item) => item.regularShanten === bestRegularShanten);
          const bestUkeire = Math.max(...regularPreserving.map((item) => item.ukeire));
          combined.discards = regularPreserving
            .filter((item) => item.ukeire === bestUkeire)
            .map((item) => item.id)
            .sort((a, b) => a - b);
        } else {
          // If no discard preserves every route, retain the shortest-route
          // recommendation and do not let ordinary ukeire pick a conflicting tile.
          combined.discards = [...new Set(combined.discards || [])].sort((a, b) => a - b);
        }
      } else {
        const candidates = (combined.discards || []).map((id) => regularCandidates.find((item) => item.id === id)).filter(Boolean);
        if (candidates.length) {
          const bestRegularShanten = Math.min(...candidates.map((item) => item.regularShanten));
          const regularPreserving = candidates.filter((item) => item.regularShanten === bestRegularShanten);
          const bestUkeire = Math.max(...regularPreserving.map((item) => item.ukeire));
          combined.discards = regularPreserving
            .filter((item) => item.ukeire === bestUkeire)
            .map((item) => item.id);
        }
      }
    }
    const hasTwoShantenSuuankou = combined &&
      (combined.routes || []).some((route) => route.name === '四暗刻' && route.shanten === 2);
    if (effective === 14 && discard && combined && !currentDiscardWaits.length && hasTwoShantenSuuankou) {
      const candidates = [];
      const indicators = baseOptions.indicatorCounts || [];
      for (let discardId = 0; discardId < 34; discardId++) {
        if (!counts[discardId]) continue;
        const afterDiscard = copyCounts(counts);
        afterDiscard[discardId]--;
        const nextIndicators = indicators.slice();
        nextIndicators[discardId] = (nextIndicators[discardId] || 0) + 1;
        const nextOptions = { ...baseOptions, indicatorCounts: nextIndicators };
        const nextDistance = yakumanDistance(afterDiscard, melds, sanma, false, nextOptions);
        const tankiImprovements = (nextDistance.improvements || []).filter((route) => route.route === '四暗刻单骑');
        if (nextDistance.shanten >= combined.shanten && !tankiImprovements.length) continue;
        const regularShanten = shanten(afterDiscard, melds.length, sanma);
        const ukeire = regularUkeire(afterDiscard, melds, sanma, regularShanten, nextIndicators, baseOptions.kita)
          .reduce((sum, draw) => sum + draw.remaining, 0);
        candidates.push({ discardId, distance: nextDistance, regularShanten, ukeire, tankiImprovements });
      }
      if (candidates.length) {
        if (combined.shanten <= 1) {
          const tankiRows = candidates.flatMap((item) => item.tankiImprovements.map((route) => ({
            ...route,
            discards: [...new Set([...(route.discards || []), item.discardId])]
          })));
          if (tankiRows.length) combined.improvements = [...combined.improvements, ...tankiRows];
        } else {
          const bestShanten = Math.min(...candidates.map((item) => item.distance.shanten));
          const bestRegularShanten = Math.min(...candidates
            .filter((item) => item.distance.shanten === bestShanten)
            .map((item) => item.regularShanten));
          const regularCandidates = candidates.filter((item) =>
            item.distance.shanten === bestShanten && item.regularShanten === bestRegularShanten);
          const bestUkeire = Math.max(...regularCandidates.map((item) => item.ukeire));
          const bestCandidates = regularCandidates.filter((item) => item.ukeire === bestUkeire);
          combined.shanten = bestShanten;
          combined.missing = bestShanten + 1;
          combined.discards = bestCandidates.map((item) => item.discardId);
          combined.improvements = bestCandidates.flatMap((item) => item.distance.improvements
            .filter((route) => route.shanten === bestShanten));
        }
      }
    }
    const oneDrawTankiCandidate = combined && combined.shanten === 2 &&
      (combined.routes || []).some((route) => route.name === '四暗刻' && route.shanten === 2);
    if (effective === 13 && !currentWaits.length && !currentDiscardWaits.length && combined &&
        (combined.shanten <= 1 || oneDrawTankiCandidate)) {
      const fixed = fixedCounts(melds, false);
      const indicators = baseOptions.indicatorCounts || [];
      const improvementsById = new Map();
      for (let drawId = 0; drawId < 34; drawId++) {
        if (!allowedTile(drawId, sanma) || counts[drawId] + fixed[drawId] + (indicators[drawId] || 0) >= 4) continue;
        const drawn = addGroup(counts, [drawId]);
        const discards = [];
        const routeNames = new Set();
        for (let discardId = 0; discardId < 34; discardId++) {
          if (!drawn[discardId]) continue;
          const afterDiscard = copyCounts(drawn);
          afterDiscard[discardId]--;
          const nextIndicators = indicators.slice();
          nextIndicators[discardId] = (nextIndicators[discardId] || 0) + 1;
          const waits = hasYakumanWait(afterDiscard, melds, { ...baseOptions, indicatorCounts: nextIndicators });
          if (waits.length) {
            const names = yakumanNamesInWaits(waits);
            if (oneDrawTankiCandidate && !names.includes('四暗刻单骑')) continue;
            discards.push(discardId);
            names.forEach((name) => routeNames.add(name));
          }
        }
        if (discards.length) improvementsById.set(drawId, {
          id: drawId,
          remaining: 4 - counts[drawId] - fixed[drawId] - (indicators[drawId] || 0),
          draws: [{ id: drawId, remaining: 4 - counts[drawId] - fixed[drawId] - (indicators[drawId] || 0) }],
          discards,
          shanten: oneDrawTankiCandidate ? 1 : combined.shanten,
          route: [...routeNames].join('、') || '累计役满'
        });
      }
      if (improvementsById.size) {
        if (combined.shanten === 1 || oneDrawTankiCandidate) {
          const family = (name) => String(name).replace(/十三面$/, '').replace(/单骑$/, '').replace(/^纯正/, '');
          const progressingFamilies = new Set([...improvementsById.values()]
            .flatMap((item) => item.route.split('、').map(family)));
          const baseImprovements = combined.improvements.filter((item) =>
            !(item.discards || []).length && !item.route.split('、').some((name) => progressingFamilies.has(family(name)))
          );
          return {
            ...combined,
            shanten: oneDrawTankiCandidate ? 1 : combined.shanten,
            missing: 2,
            improvements: [...baseImprovements, ...improvementsById.values()]
          };
        }
        const merged = new Map(combined.improvements.map((item) => [item.id, { ...item }]));
        for (const [id, item] of improvementsById) {
          const previous = merged.get(id);
          if (!previous) merged.set(id, item);
          else {
            previous.discards = [...new Set([...(previous.discards || []), ...item.discards])];
            previous.route = [...new Set([...(previous.route || '').split('、'), ...item.route.split('、')].filter(Boolean))].join('、');
          }
        }
        return { ...combined, improvements: [...merged.values()] };
      }
    }
    return combined || { shanten: null, missing: null, discards: [], improvements: [], routes: [], impossible: true };
  }

  function findWaits(counts, melds, options) {
    const waits = [];
    const fixed = fixedCounts(melds, false);
    const indicators = options.indicatorCounts || [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, options.sanma) || counts[id] + fixed[id] + (indicators[id] || 0) + kitaPhysicalCount(id, options.sanma, options.kita) >= 4) continue;
      const next = addGroup(counts, [id]);
      const suit = id < 27 && id % 9 === 4 ? Math.floor(id / 9) : -1;
      const redAvailable = suit >= 0 && options.redFiveAvailable && options.redFiveAvailable[suit];
      const totalRemaining = 4 - counts[id] - fixed[id] - (indicators[id] || 0);
      const variants = redAvailable
        ? [{ red: false, remaining: totalRemaining - 1, winningTileVariant: 'regular' }, { red: true, remaining: 1, winningTileVariant: 'red' }]
        : [{ red: false, remaining: totalRemaining, winningTileVariant: 'regular' }];
      for (const variant of variants) {
        if (variant.remaining <= 0) continue;
        const analysis = analyzeScore(next, melds, {
          ...options,
          preWinCounts: counts,
          winningTile: id,
          winningTileVariant: variant.winningTileVariant
        });
        if (!analysis.complete) continue;
        const caseYakuman = Object.fromEntries(Object.entries(analysis.cases).map(([key, result]) => [
          key,
          Boolean(result && ((result.allYakuman || []).length || (result.yakuman || []).length))
        ]));
        const yakuman = [...new Map(Object.values(analysis.cases).filter(Boolean)
          .flatMap((result) => [...(result.allYakuman || []), ...(result.yakuman || [])])
          .map((item) => [`${item.name}:${item.label || ''}:${item.multiplier || 1}`, item])).values()];
        waits.push({ id, red: variant.red, remaining: variant.remaining, analysis, yakuman, caseYakuman });
      }
    }
    return waits;
  }

  function analyzeYakumanWaits(counts, melds, options) {
    const waits = [];
    const fixed = fixedCounts(melds, false);
    const indicators = options.indicatorCounts || [];
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, options.sanma) || counts[id] + fixed[id] + (indicators[id] || 0) + kitaPhysicalCount(id, options.sanma, options.kita) >= 4) continue;
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
    if (options.sanma && melds.some((meld) => meld.type === 'chi')) errors.push('三人麻将不允许吃。');
    if ((options.kita || 0) < 0 || (options.kita || 0) > 4) errors.push('拔北数量不能超过四张。');
    const physical = countsFromTiles(tiles);
    for (const meld of melds) for (const id of meld.tiles) physical[id]++;
    if (options.sanma) physical[30] += options.kita || 0;
    const indicators = options.indicatorCounts || [];
    const doraCounts = options.doraCounts || [];
    const doraTotal = doraCounts.reduce((sum, count) => sum + (count || 0), 0);
    if (doraTotal > 10) errors.push('宝牌总数不能超过十张。');
    for (let id = 0; id < 34; id++) if ((doraCounts[id] || 0) > 4) errors.push(`${tileLabel(id)} 宝牌不能超过四张。`);
    const indicatorTotal = indicators.reduce((sum, count) => sum + (count || 0), 0);
    if (indicatorTotal > 10) errors.push('宝牌指示牌总数不能超过十张。');
    for (let id = 0; id < 34; id++) {
      if ((indicators[id] || 0) > 4) errors.push(`${tileLabel(id)} 指示牌不能超过四张。`);
      if ((indicators[id] || 0) && !allowedTile(id, options.sanma)) errors.push(`三人麻将不使用 ${tileLabel(id)} 作为宝牌指示牌。`);
      physical[id] += indicators[id] || 0;
    }
    for (let id = 0; id < 34; id++) if ((doraCounts[id] || 0) && !allowedTile(id, options.sanma)) errors.push(`三人麻将不使用 ${tileLabel(id)} 作为宝牌。`);
    for (let id = 0; id < 34; id++) {
      if (!allowedTile(id, options.sanma) && physical[id]) errors.push(`三人麻将不使用 ${tileLabel(id)}。`);
      if (physical[id] > 4) errors.push(`${tileLabel(id)} 超过四张。`);
    }
    if (melds.length > 4) errors.push('副露组数不能超过四组。');
    return { valid: errors.length === 0, errors, effective };
  }

  root.MahjongCore = {
    SUITS, WIND_IDS, DRAGON_IDS, tileLabel, tileAsset, doraFromIndicator, indicatorForDora, countsFromTiles, total,
    allowedTile, shanten, winningDecompositions, isComplete, analyzeScore,
    bestDiscards, improvingDraws, regularUkeire, yakumanFor, yakumanDistance,
    analyzeYakumanWaits, findWaits, doraHan, validate, addGroup, fixedCounts,
    scoreDecomposition, formatScore, isKokushi, YAKUMAN_NAMES
  };
})(typeof window === 'undefined' ? self : window);
