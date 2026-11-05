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

// Onglets et pastilles : chaque bouton affiche le panneau dont l'id est dans data-panel.
document.querySelectorAll('[role="tablist"]').forEach((list) => {
  const btns = [...list.querySelectorAll('[data-panel]')];
  btns.forEach((b) => b.addEventListener('click', () => {
    for (const x of btns) {
      const on = x === b;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-selected', on);
      document.getElementById(x.dataset.panel).hidden = !on;
    }
    const track = document.getElementById(b.dataset.panel).querySelector('.car-track');
    if (track) track.dispatchEvent(new Event('scroll'));
  }));
});

// Carrousels : flèches qui font défiler d'un écran.
document.querySelectorAll('.carousel').forEach((c) => {
  const track = c.querySelector('.car-track');
  const prev = c.querySelector('.car-prev'), next = c.querySelector('.car-next');
  const update = () => {
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' }));
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
});

// Calendrier des miellées : surligne le mois en cours.
(() => {
  const m = new Date().getMonth() + 1;
  document.querySelectorAll(`.gantt [data-m="${m}"]`).forEach((el) => el.classList.add('now'));
})();

// Atlas : filtres des tableaux et liens entre carte et liste.
(function () {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  document.querySelectorAll('.filters').forEach((box) => {
    const table = document.getElementById(box.dataset.target);
    if (!table) return;
    const rows = [...table.tBodies[0].rows];
    const out = box.querySelector('.f-count');
    const ctl = [...box.querySelectorAll('[data-f]')];
    function apply() {
      const v = Object.fromEntries(ctl.map((c) => [c.dataset.f, c.value]));
      const words = norm(v.q || '').split(/\s+/).filter(Boolean);
      let n = 0;
      for (const r of rows) {
        const ok = words.every((w) => norm(r.textContent).includes(w))
          && (!v.pays || r.dataset.pays.split(' ').includes(v.pays))
          && (!v.statut || r.dataset.statut === v.statut)
          && (!v.type || r.dataset.type === v.type);
        r.hidden = !ok; if (ok) n++;
      }
      out.textContent = `${n} miel${n > 1 ? 's' : ''}`;
    }
    ctl.forEach((c) => c.addEventListener('input', apply));
    apply();
  });
  // Survol d'un point : met en avant la ligne ou la carte correspondante, et inversement.
  const hl = (id, on) => document.querySelectorAll(`[data-id="${id}"], #${id}`).forEach((e) => e.classList.toggle('is-hl', on));
  document.querySelectorAll('.atlas-map .dot, .ap-list li[data-id]').forEach((d) => {
    d.addEventListener('mouseenter', () => hl(d.dataset.id, true));
    d.addEventListener('mouseleave', () => hl(d.dataset.id, false));
  });
})();
