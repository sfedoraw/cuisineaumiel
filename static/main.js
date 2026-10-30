// Filtres et recherche sur la page des recettes.
(function () {
  const grid = document.getElementById('all');
  if (!grid) return;
  const input = document.getElementById('filtre-q');
  const chips = document.querySelectorAll('.chip');
  const empty = document.querySelector('.empty');
  const cards = [...grid.querySelectorAll('.card')];
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let cat = '';
  const params = new URLSearchParams(location.search);
  if (params.get('q')) input.value = params.get('q');
  function apply() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const hay = norm(c.dataset.search);
      const ok = (!cat || c.dataset.cat === cat) && words.every((w) => hay.includes(w));
      c.hidden = !ok;
      if (ok) shown++;
    }
    empty.hidden = shown > 0;
  }
  input.addEventListener('input', apply);
  chips.forEach((b) => b.addEventListener('click', () => {
    chips.forEach((x) => x.classList.toggle('is-on', x === b));
    cat = b.dataset.filter;
    apply();
  }));
  apply();
})();

// Ajustement des quantités selon le nombre de portions.
(function () {
  const box = document.querySelector('.ingredients-box');
  if (!box) return;
  const base = +box.dataset.base;
  const out = box.querySelector('output');
  const spans = [...box.querySelectorAll('[data-qty]')];
  spans.forEach((s) => (s.dataset.orig = s.innerHTML));
  const FRAC = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3 };
  const parse = (t) => {
    if (FRAC[t]) return FRAC[t];
    if (t.includes('/')) { const [a, b] = t.split('/'); return a / b; }
    return parseFloat(t.replace(',', '.'));
  };
  const fmt = (n) => {
    if (n >= 10) return String(Math.round(n));
    const nice = [[.25, '¼'], [.5, '½'], [.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
    const whole = Math.floor(n), rest = n - whole;
    for (const [v, s] of nice) if (Math.abs(rest - v) < .04) return whole ? `${whole} ${s}` : s;
    const half = Math.max(.5, Math.round(n * 2) / 2);
    return half === Math.floor(half) ? String(half) : (Math.floor(half) ? `${Math.floor(half)} ½` : '½');
  };
  let n = base;
  function render() {
    out.textContent = n;
    const k = n / base;
    for (const s of spans) {
      s.innerHTML = k === 1 ? s.dataset.orig : s.dataset.orig.replace(/^(\d+(?:[.,]\d+)?|\d+\/\d+|[½¼¾⅓⅔])(?=[\s a-zA-Zéèà]|$)/, (m) => fmt(parse(m) * k));
    }
  }
  box.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    n = Math.max(1, Math.min(48, n + +b.dataset.step));
    render();
  }));
})();
