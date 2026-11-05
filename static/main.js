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

// Sommaire latéral : section active et progression de lecture.
(() => {
  const nav = document.querySelector('.side-toc');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a')];
  const heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  const bar = nav.querySelector('.st-bar span');
  const main = document.querySelector('.long-main');
  let ticking = false;
  const update = () => {
    ticking = false;
    let cur = 0;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) cur = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === cur));
    if (main && bar) {
      const r = main.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.4 - r.top) / r.height));
      bar.style.width = (p * 100).toFixed(1) + '%';
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
})();

// Mode cuisine : une étape à la fois, en grand, écran maintenu allumé.
(() => {
  const btn = document.querySelector('[data-cook]');
  if (!btn) return;
  const steps = [...document.querySelectorAll('.steps li')].map((li) => li.innerHTML);
  const title = document.querySelector('.recipe-head h1')?.textContent || '';
  const el = document.createElement('div');
  el.className = 'cook'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Mode cuisine');
  el.innerHTML = `<div class="cook-top"><div><b></b><small class="cook-wake"></small></div><div class="cook-actions"><button type="button" class="cook-tab">Ingrédients</button><button type="button" class="cook-x" aria-label="Quitter le mode cuisine">Quitter</button></div></div>
  <div class="cook-body" aria-live="polite"></div>
  <div class="cook-foot"><button type="button" class="cook-prev">← Précédent</button><div class="cook-dots"></div><button type="button" class="cook-next">Suivant →</button></div>`;
  document.body.appendChild(el);
  el.querySelector('.cook-top b').textContent = title;
  const body = el.querySelector('.cook-body'), prev = el.querySelector('.cook-prev'), next = el.querySelector('.cook-next');
  const dots = el.querySelector('.cook-dots');
  let i = -1, lock = null, last = null;
  const ingredients = () => [...document.querySelectorAll('.ingredients-box li')].map((li) => `<li><label><input type="checkbox"><span>${li.querySelector('[data-qty]')?.innerHTML || li.textContent}</span></label></li>`).join('');
  const render = () => {
    if (i < 0) body.innerHTML = `<p class="cook-n">Avant de commencer</p><ul class="cook-ing">${ingredients()}</ul>`;
    else body.innerHTML = `<p class="cook-n">Étape ${i + 1} sur ${steps.length}</p><p class="cook-step">${steps[i]}</p>`;
    prev.disabled = i < 0;
    next.textContent = i < 0 ? 'Commencer →' : i === steps.length - 1 ? 'Bon appétit !' : 'Suivant →';
    dots.innerHTML = steps.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('');
    body.scrollTop = 0;
  };
  const wake = async () => {
    try { lock = await navigator.wakeLock.request('screen'); el.querySelector('.cook-wake').textContent = 'L\'écran reste allumé'; } catch (e) { el.querySelector('.cook-wake').textContent = ''; }
  };
  const open = () => { last = document.activeElement; i = -1; render(); el.hidden = false; document.body.style.overflow = 'hidden'; next.focus(); wake(); };
  const close = () => { el.hidden = true; document.body.style.overflow = ''; try { lock && lock.release(); } catch (e) {} lock = null; last && last.focus(); };
  btn.addEventListener('click', open);
  el.querySelector('.cook-x').addEventListener('click', close);
  el.querySelector('.cook-tab').addEventListener('click', () => { i = -1; render(); });
  prev.addEventListener('click', () => { if (i > -1) { i--; render(); } });
  next.addEventListener('click', () => { if (i < steps.length - 1) { i++; render(); } else close(); });
  document.addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next.click();
    else if (e.key === 'ArrowLeft') prev.click();
  });
  document.addEventListener('visibilitychange', () => { if (!el.hidden && document.visibilityState === 'visible') wake(); });
})();

// Calculateur sucre vers miel.
(() => {
  const s = document.getElementById('t-sugar');
  if (!s) return;
  const parts = [...document.querySelectorAll('input[name="t-part"]')], bake = document.getElementById('t-bake');
  const $ = (id) => document.getElementById(id);
  const r5 = (x) => Math.round(x / 5) * 5;
  const calc = () => {
    const sugar = Math.max(0, parseFloat(s.value) || 0), p = parseInt((parts.find((x) => x.checked) || { value: 50 }).value, 10) / 100;
    const replaced = sugar * p, honey = replaced * 0.85;
    $('t-explain').innerHTML = p >= 1 ? `Vous remplacez les <b>${r5(sugar)} g</b> de sucre par <b>${r5(honey)} g</b> de miel.` : `Sur ${r5(sugar)} g de sucre, vous gardez <b>${r5(sugar - replaced)} g de sucre</b> et vous remplacez les ${r5(replaced)} g restants par <b>${r5(honey)} g de miel</b>.`;
    $('t-warn').hidden = p <= 0.5;
    $('o-honey').textContent = r5(honey) + ' g';
    const cs = honey / 21;
    $('o-spoons').textContent = honey < 10 ? 'soit moins d\'une cuillère à soupe' : `soit environ ${Math.round(cs)} cuillère${Math.round(cs) > 1 ? 's' : ''} à soupe`;
    $('o-sugar').textContent = r5(sugar - replaced) + ' g';
    $('o-liquid').textContent = Math.round(honey * 0.18) + ' ml';
    const soda = honey * 0.008;
    $('o-soda').textContent = soda < 0.6 ? '1 petite pincée' : soda < 1.5 ? '1 pincée (environ 1 g)' : `environ ${soda.toFixed(1).replace('.', ',')} g`;
    document.querySelectorAll('.o-bake').forEach((li) => { li.hidden = !bake.checked; });
  };
  [s, bake, ...parts].forEach((el) => el.addEventListener('input', calc));
  calc();
})();
