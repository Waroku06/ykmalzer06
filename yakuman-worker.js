importScripts('./core.js');

self.onmessage = (event) => {
  const { revision, counts, melds, sanma, discard, options } = event.data;
  const distance = self.MahjongCore.yakumanDistance(counts, melds, sanma, discard, options);
  self.postMessage({ revision, distance });
};
