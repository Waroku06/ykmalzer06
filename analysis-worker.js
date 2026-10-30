importScripts('./core.js');

self.onmessage = (event) => {
  const { revision, tiles, melds, options } = event.data;
  try {
    const validation = MahjongCore.validate(tiles, melds, options);
    if (!validation.valid) {
      self.postMessage({ revision, valid: false, errors: validation.errors });
      return;
    }
    const counts = MahjongCore.countsFromTiles(tiles);
    if (validation.effective === 14) {
      const analysis = MahjongCore.analyzeScore(counts, melds, options);
      if (analysis.complete) {
        self.postMessage({ revision, valid: true, kind: 'complete', analysis });
      } else {
        const info = MahjongCore.bestDiscards(tiles, melds, options.sanma, options.indicatorCounts, options.kita);
        self.postMessage({ revision, valid: true, kind: 'discard', info });
      }
      return;
    }
    const waits = MahjongCore.findWaits(counts, melds, options);
    if (waits.length) {
      self.postMessage({ revision, valid: true, kind: 'tenpai', counts, waits });
    } else {
      const info = MahjongCore.improvingDraws(counts, melds, options.sanma, options.indicatorCounts, options.kita);
      self.postMessage({ revision, valid: true, kind: 'improvement', info });
    }
  } catch (error) {
    self.postMessage({ revision, error: error && error.message || String(error) });
  }
};
