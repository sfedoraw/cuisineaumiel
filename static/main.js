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
  // Unités métriques : nombres entiers arrondis, jamais de fractions.
  const metric = (v, unit) => {
    const dec = (x) => String(x).replace('.', ',');
    if (/^(kg|l)$/.test(unit)) return dec(Math.max(.1, Math.round(v * 10) / 10));
    if (/^(cl|dl)$/.test(unit)) return dec(v < 10 ? Math.max(.5, Math.round(v * 2) / 2) : Math.round(v));
    if (v < 10) return String(Math.max(1, Math.round(v)));
    if (v < 100) return String(Math.round(v));
    return String(Math.round(v / 5) * 5);
  };
  const step = base >= 12 ? Math.max(1, Math.round(base / 6)) : 1;
  let n = base;
  function render() {
    out.textContent = n;
    const k = n / base;
    for (const s of spans) {
      s.innerHTML = k === 1 ? s.dataset.orig : s.dataset.orig.replace(/^(\d+(?:[.,]\d+)?|\d+\/\d+|[½¼¾⅓⅔])(\s*)(kg|g|mg|cl|ml|dl|l)?(?=[\s a-zA-Zéèà']|$)/, (m, q, sp, unit) => (unit ? metric(parse(q) * k, unit) : fmt(parse(q) * k)) + sp + (unit || ''));
    }
  }
  box.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    n = Math.max(step, Math.min(Math.max(48, base * 3), n + Math.sign(+b.dataset.step) * step));
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
  const btns = document.querySelectorAll('[data-cook]');
  if (!btns.length) return;
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
  btns.forEach((b) => b.addEventListener('click', open));
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

// Quiz : quel miel est fait pour vous ?
(() => {
  const root = document.querySelector('[data-quiz]');
  if (!root) return;
  const H = JSON.parse(document.getElementById('quiz-honeys').textContent);
  const qs = [...root.querySelectorAll('.quiz-q')], res = root.querySelector('.quiz-res'), bar = root.querySelector('.quiz-progress span');
  let score = {}, i = 0;
  const show = () => { qs.forEach((q, k) => { q.hidden = k !== i; }); bar.style.width = (i / qs.length * 100) + '%'; };
  const finish = () => {
    qs.forEach((q) => { q.hidden = true; }); bar.style.width = '100%';
    const best = Object.entries(score).filter(([k]) => H[k]).sort((a, b) => b[1] - a[1]);
    const [k1] = best[0] || ['miel-toutes-fleurs'], h = H[k1], alt = best.slice(1, 3).map(([k]) => H[k]);
    const link = (u) => { const a = document.querySelector('a.logo'); const pre = a ? a.getAttribute('href').replace(/\/$/, '') : ''; return pre + u; };
    res.innerHTML = `<p class="kicker">Votre miel</p><h2>${h.nom}</h2>${h.photo ? `<img src="${h.photo}" alt="" loading="lazy">` : ''}<p class="quiz-gout">${h.gout}</p><p>${h.resume}</p><p class="quiz-btns"><a class="btn" href="${link(h.url)}">Découvrir ce miel</a> <button type="button" class="btn-outline" data-again>Recommencer</button></p>${alt.length ? `<p class="quiz-alt">Vous aimerez aussi : ${alt.map((x) => `<a href="${link(x.url)}">${x.nom}</a>`).join(' et ')}.</p>` : ''}`;
    res.hidden = false; res.querySelector('h2').setAttribute('tabindex', '-1'); res.querySelector('h2').focus();
    res.querySelector('[data-again]').addEventListener('click', () => { score = {}; i = 0; res.hidden = true; show(); });
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.quiz-a button');
    if (!b) return;
    Object.entries(JSON.parse(b.dataset.score)).forEach(([k, v]) => { score[k] = (score[k] || 0) + v; });
    i++; if (i < qs.length) { show(); qs[i].querySelector('button').focus(); } else finish();
  });
  show();
})();

// Menu de la semaine et liste de courses.
(() => {
  const root = document.querySelector('[data-menu]');
  if (!root) return;
  const D = JSON.parse(document.getElementById('menu-data').textContent);
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const pre = (() => { const a = document.querySelector('a.logo'); return a ? a.getAttribute('href').replace(/\/$/, '') : ''; })();
  const weight = (r) => (!r.s.length || r.s.includes(D.saison) ? 1 : 0.15);
  const draw = (pool, avoid) => {
    const c = pool.filter((r) => !avoid.includes(r));
    const tot = c.reduce((a, r) => a + weight(r), 0);
    let x = Math.random() * tot;
    for (const r of c) { x -= weight(r); if (x <= 0) return r; }
    return c[0];
  };
  const dessertBox = document.getElementById('m-dessert');
  let menu = [];
  const build = () => {
    const used = [], usedD = [];
    menu = JOURS.map(() => { const p = draw(D.plats, used); used.push(p); const d = draw(D.desserts, usedD); usedD.push(d); return { p, d }; });
  };
  const card = (r, k, kind) => `<a class="menu-r" href="${pre}${r.u}"><img src="${r.img}" alt="" loading="lazy"><span><b>${r.t}</b><small>${r.d}</small></span></a><button type="button" class="menu-swap" data-swap="${k}" data-kind="${kind}" aria-label="Changer ${kind === 'p' ? 'le plat' : 'le dessert'} du ${JOURS[k].toLowerCase()}">↻</button>`;
  const render = () => {
    const withD = dessertBox.checked;
    root.querySelector('.menu-days').innerHTML = menu.map((m, k) => `<li><p class="menu-day">${JOURS[k]}</p><div class="menu-slot">${card(m.p, k, 'p')}</div>${withD ? `<div class="menu-slot menu-d">${card(m.d, k, 'd')}</div>` : ''}</li>`).join('');
    const rs = menu.flatMap((m) => (withD ? [m.p, m.d] : [m.p]));
    root.querySelector('.menu-groups').innerHTML = rs.map((r) => `<div class="menu-g"><h3>${r.t} <small>(${r.p})</small></h3><ul>${r.i.map((x) => `<li><label><input type="checkbox"><span>${x}</span></label></li>`).join('')}</ul></div>`).join('');
  };
  root.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-swap]');
    if (sw) {
      const k = +sw.dataset.swap, kind = sw.dataset.kind;
      const pool = kind === 'p' ? D.plats : D.desserts;
      menu[k][kind] = draw(pool, menu.map((m) => m[kind]));
      render();
      root.querySelector(`[data-swap="${k}"][data-kind="${kind}"]`).focus();
    } else if (e.target.closest('[data-new]')) { build(); render(); }
    else if (e.target.closest('[data-print]')) window.print();
  });
  dessertBox.addEventListener('change', render);
  build(); render();
})();

// Partager une recette.
document.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
  const data = { title: document.title, url: location.href };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(location.href);
    const t = b.querySelector('span'); const old = t.textContent; t.textContent = 'Lien copié !'; setTimeout(() => { t.textContent = old; }, 2000);
  } catch (e) {}
}));

// Liens e-mail assemblés au clic (limite le spam).
document.querySelectorAll('a[data-mail]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  location.href = `mailto:${a.dataset.mail}@${a.dataset.domain}?subject=${a.dataset.subject || ''}&body=${a.dataset.body || ''}`;
}));

// Fiche imprimée : reprend les quantités ajustées.
(() => {
  const ps = document.querySelector('.ps');
  if (!ps) return;
  document.body.classList.add('has-ps');
  addEventListener('beforeprint', () => {
    const src = [...document.querySelectorAll('.ingredients-box [data-qty]')], dst = [...ps.querySelectorAll('[data-qty]')];
    dst.forEach((d, i) => { if (src[i]) d.innerHTML = src[i].innerHTML; });
    const o = document.querySelector('.ingredients-box output'), pp = ps.querySelector('[data-ps-portions]');
    if (o && pp) pp.textContent = o.textContent;
  });
})();

// Annuaire : carte des départements.
(() => {
  const dataEl = document.getElementById('dep-data');
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const out = document.getElementById('dep-out');
  const sel = document.getElementById('dep-select');
  const paths = document.querySelectorAll('.dep-map .dep');
  const show = (code) => {
    const d = data[code];
    if (!d) return;
    paths.forEach((p) => p.classList.toggle('on', p.dataset.dep === code));
    sel.value = code;
    out.innerHTML = d.html
      ? `<p class="kicker">${code}</p><h3>${d.nom}</h3><div class="pt-grid">${d.html}</div>`
      : `<p class="kicker">${code}</p><h3>${d.nom}</h3><p>Pas encore d'apiculteur partenaire dans ce département. Nous sélectionnons nos premiers partenaires un par un : revenez bientôt.</p><p class="dep-note">Vous êtes apiculteur dans ce département ? <a href="#liste-attente" data-wl="${code}">Inscrivez-vous sur la liste d'attente</a>.</p>`;
    const wl = out.querySelector('[data-wl]');
    if (wl) wl.addEventListener('click', () => { const s = document.querySelector('#wl-form select[name=departement]'); if (s) s.value = code; });
  };
  paths.forEach((p) => {
    p.addEventListener('click', () => show(p.dataset.dep));
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(p.dataset.dep); } });
  });
  sel.addEventListener('change', () => show(sel.value));
})();

// Annuaire : liste d'attente (ouvre la messagerie avec l'inscription rédigée).
(() => {
  const f = document.getElementById('wl-form');
  if (!f) return;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (n) => (f.elements[n].value || '').trim();
    const err = f.querySelector('.wl-err');
    const ok = v('nom') && v('exploitation') && v('departement') && /.+@.+\..+/.test(v('email'));
    err.hidden = ok;
    if (!ok) return;
    const dep = f.elements.departement.selectedOptions[0].textContent;
    const body = `Bonjour,\n\nJe souhaite être inscrit(e) sur la liste d'attente de l'annuaire des apiculteurs partenaires de Cuisine au miel.\n\nNom et prénom : ${v('nom')}\nExploitation : ${v('exploitation')}\nDépartement : ${dep}\nCommune : ${v('commune')}\nE-mail : ${v('email')}\nTéléphone : ${v('tel')}\nMiels : ${v('miels')}\nSite ou réseaux : ${v('site')}\n\nMerci !`;
    location.href = `mailto:${f.dataset.mail}@${f.dataset.domain}?subject=${encodeURIComponent("Liste d'attente annuaire : " + v('exploitation'))}&body=${encodeURIComponent(body)}`;
  });
})();

// ---------- Mon carnet, préférences, recette au hasard, frigo, proposer une recette ----------
// Tout est gardé dans le navigateur du visiteur (aucun compte). Chaque accès au stockage est protégé.
const CAM = (() => {
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let idx = null;
  const index = () => idx || (idx = fetch('/recettes.json').then((r) => r.json()).catch(() => []));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return {
    carnet: () => get('cam-carnet', []), setCarnet: (l) => set('cam-carnet', [...new Set(l)]),
    prefs: () => get('cam-prefs', []), setPrefs: (l) => set('cam-prefs', l),
    frigo: () => get('cam-frigo', []), setFrigo: (l) => set('cam-frigo', l),
    index, esc,
    excluded: (x) => { const p = get('cam-prefs', []); return !!x && p.some((k) => String(x).split(' ').includes(k)); },
  };
})();
const heart = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/></svg>';
const miniCard = (r) => `<article class="card" data-slug="${r.s}" data-x="${r.x.join(' ')}"><button type="button" class="save" data-save="${r.s}" aria-pressed="false" aria-label="Ajouter « ${CAM.esc(r.t)} » à mon carnet">${heart}<span class="save-txt">Mon carnet</span></button><a href="${r.u}"><div class="card-media"><img src="${r.i}" alt="${CAM.esc(r.t)}" loading="lazy" style="aspect-ratio:3 / 4"><span class="card-honey">🍯 ${CAM.esc(r.m)}</span></div><span class="card-cat">${CAM.esc(r.c)}</span><h3>${CAM.esc(r.t)}</h3><div class="card-meta"><span class="time">⏱ ${r.d}</span></div></a></article>`;

// Cœurs « Mon carnet » : état, compteur dans l'en-tête, petite animation.
const syncHearts = () => {
  const c = CAM.carnet();
  document.querySelectorAll('[data-save]').forEach((b) => {
    const on = c.includes(b.dataset.save);
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on);
    const t = b.querySelector('.save-txt'); if (t && b.classList.contains('rf-btn')) t.textContent = on ? 'Dans mon carnet' : 'Mon carnet';
  });
  document.querySelectorAll('.carnet-count').forEach((n) => { n.textContent = c.length; n.hidden = !c.length; });
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-save]');
  if (!b) return;
  e.preventDefault();
  const c = CAM.carnet(), k = b.dataset.save, on = !c.includes(k);
  CAM.setCarnet(on ? [k, ...c] : c.filter((x) => x !== k));
  b.classList.remove('pop'); void b.offsetWidth; if (on) b.classList.add('pop');
  syncHearts();
  document.dispatchEvent(new CustomEvent('cam:carnet'));
});
syncHearts();

// Préférences « Je ne mange pas de… » : masque les recettes concernées dans les listes.
const applyPrefs = () => {
  const p = CAM.prefs();
  document.querySelectorAll('[data-prefs]').forEach((d) => {
    d.querySelectorAll('input').forEach((i) => { i.checked = p.includes(i.value); });
    const n = d.querySelector('.prefs-count'); n.textContent = p.length; n.hidden = !p.length;
  });
  let hidden = 0;
  document.querySelectorAll('.cards .card[data-x]').forEach((c) => {
    const ex = CAM.excluded(c.dataset.x);
    c.classList.toggle('pref-off', ex);
    if (ex && !c.closest('#carnet-grid')) hidden++;
  });
  document.querySelectorAll('.hidden-note').forEach((n) => {
    n.hidden = !hidden;
    n.innerHTML = `${hidden} recette${hidden > 1 ? 's' : ''} masquée${hidden > 1 ? 's' : ''} selon vos préférences. <button type="button" class="linklike" data-prefs-open>Modifier</button>`;
  });
  const w = document.querySelector('.diet-warn');
  if (w) {
    const D = { viande: 'de la viande', porc: 'du porc', poisson: 'du poisson ou des fruits de mer', lait: 'des produits laitiers', gluten: 'du gluten', oeuf: 'des œufs', coque: 'des fruits à coque', alcool: 'de l\'alcool' };
    const hit = p.filter((k) => w.dataset.x.split(' ').includes(k));
    w.hidden = !hit.length;
    w.textContent = hit.length ? `Attention : d'après ses ingrédients, cette recette contient ${hit.map((k) => D[k]).join(', ')}, que vous avez choisi d'éviter.` : '';
  }
  document.dispatchEvent(new CustomEvent('cam:prefs'));
};
document.addEventListener('change', (e) => {
  const box = e.target.closest('[data-prefs]');
  if (!box) return;
  CAM.setPrefs([...box.querySelectorAll('input:checked')].map((i) => i.value));
  applyPrefs();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-prefs-open]')) return;
  const d = document.querySelector('[data-prefs]'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
applyPrefs();

// Une recette au hasard (en respectant les préférences).
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-random]');
  if (!a) return;
  e.preventDefault();
  const all = await CAM.index();
  const pool = all.filter((r) => !CAM.excluded(r.x.join(' ')) && r.u !== location.pathname);
  const r = pool[Math.floor(Math.random() * pool.length)];
  if (r) location.href = r.u;
});

// Filtres rapides de la page des recettes : moins de 30 min, petit budget, végétarien.
(() => {
  const grid = document.getElementById('all');
  const btns = [...document.querySelectorAll('[data-quick]')];
  if (!grid || !btns.length) return;
  const empty = document.querySelector('.empty');
  const test = { rapide: (c) => +c.dataset.min <= 30, budget: (c) => c.dataset.budget === '1', veggie: (c) => !/\b(viande|poisson)\b/.test(c.dataset.x || '') };
  const apply = () => {
    const on = btns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.quick);
    let shown = 0;
    grid.querySelectorAll('.card').forEach((c) => {
      const ok = on.every((k) => test[k](c));
      c.classList.toggle('quick-off', !ok);
      if (ok && !c.hidden && !c.classList.contains('pref-off')) shown++;
    });
    if (empty) empty.hidden = shown > 0;
  };
  btns.forEach((b) => b.addEventListener('click', () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); apply(); }));
  const q = new URLSearchParams(location.search).get('filtre');
  if (q) btns.filter((b) => q.split(',').includes(b.dataset.quick)).forEach((b) => b.setAttribute('aria-pressed', 'true'));
  document.getElementById('filtre-q')?.addEventListener('input', () => setTimeout(apply));
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => setTimeout(apply)));
  document.addEventListener('cam:prefs', apply);
  apply();
})();

// Page « Mon carnet ».
(() => {
  const root = document.querySelector('[data-carnet]');
  if (!root) return;
  const grid = root.querySelector('#carnet-grid'), bar = root.querySelector('.carnet-bar'), empty = root.querySelector('.carnet-empty'), list = root.querySelector('.carnet-list');
  // Lien partagé : /carnet/?r=slug1,slug2 propose d'ajouter les recettes.
  const shared = (new URLSearchParams(location.search).get('r') || '').split(',').filter(Boolean);
  const render = async () => {
    const all = await CAM.index();
    const by = Object.fromEntries(all.map((r) => [r.s, r]));
    const c = CAM.carnet().filter((k) => by[k]);
    grid.innerHTML = c.map((k) => miniCard(by[k])).join('');
    bar.hidden = !c.length; empty.hidden = !!c.length;
    root.querySelector('.carnet-n').textContent = `${c.length} recette${c.length > 1 ? 's' : ''} dans votre carnet`;
    if (!c.length) list.hidden = true;
    const imp = shared.filter((k) => by[k] && !c.includes(k));
    let box = root.querySelector('.carnet-import');
    if (imp.length && !box) {
      box = document.createElement('div'); box.className = 'carnet-import';
      box.innerHTML = `<p>On vous a envoyé ${imp.length} recette${imp.length > 1 ? 's' : ''} : ${imp.map((k) => `<a href="${by[k].u}">${CAM.esc(by[k].t)}</a>`).join(', ')}.</p><button type="button" class="btn">Ajouter à mon carnet</button>`;
      box.querySelector('button').addEventListener('click', () => { CAM.setCarnet([...imp, ...CAM.carnet()]); box.remove(); history.replaceState(null, '', '/carnet/'); render(); });
      root.prepend(box);
    }
    syncHearts(); applyPrefs();
    if (!list.hidden) drawList(c.map((k) => by[k]));
  };
  const drawList = (rs) => {
    root.querySelector('.carnet-groups').innerHTML = rs.map((r) => `<div class="menu-g"><h3>${CAM.esc(r.t)} <small>(${CAM.esc(r.p)})</small></h3><ul>${r.g.map((x) => `<li><label><input type="checkbox"><span>${CAM.esc(x)}</span></label></li>`).join('')}</ul></div>`).join('');
  };
  root.querySelector('[data-carnet-list]').addEventListener('click', async () => {
    list.hidden = !list.hidden;
    if (!list.hidden) { await render(); list.scrollIntoView({ behavior: 'smooth' }); }
  });
  root.querySelector('[data-carnet-share]').addEventListener('click', async (e) => {
    const url = `${location.origin}/carnet/?r=${CAM.carnet().join(',')}`;
    const b = e.currentTarget;
    try {
      if (navigator.share) { await navigator.share({ title: 'Mon carnet de recettes au miel', url }); return; }
      await navigator.clipboard.writeText(url); const old = b.textContent; b.textContent = 'Lien copié !'; setTimeout(() => { b.textContent = old; }, 2000);
    } catch (err) {}
  });
  const clear = root.querySelector('[data-carnet-clear]');
  clear.addEventListener('click', () => {
    if (clear.dataset.sure) { CAM.setCarnet([]); delete clear.dataset.sure; clear.textContent = 'Tout retirer'; render(); return; }
    clear.dataset.sure = '1'; clear.textContent = 'Confirmer : tout retirer ?';
    setTimeout(() => { delete clear.dataset.sure; clear.textContent = 'Tout retirer'; }, 4000);
  });
  document.addEventListener('cam:carnet', () => setTimeout(render, 250));
  render();
})();

// Outil « Que cuisiner avec ce que j'ai ? ».
(() => {
  const root = document.querySelector('[data-frigo]');
  if (!root) return;
  const boxes = [...root.querySelectorAll('.frigo-opts input')], out = root.querySelector('.frigo-res'), n = root.querySelector('.frigo-n'), reset = root.querySelector('[data-frigo-reset]');
  const labels = Object.fromEntries(boxes.map((b) => [b.value, b.nextElementSibling.textContent]));
  boxes.forEach((b) => { b.checked = CAM.frigo().includes(b.value); });
  const run = async () => {
    const have = boxes.filter((b) => b.checked).map((b) => b.value);
    CAM.setFrigo(have); reset.hidden = !have.length;
    if (!have.length) { out.innerHTML = ''; n.textContent = 'Cochez au moins un ingrédient pour voir les idées.'; return; }
    const all = await CAM.index();
    const res = all.filter((r) => !CAM.excluded(r.x.join(' ')))
      .map((r) => { const ok = r.f.filter((k) => have.includes(k)); return { r, ok, miss: r.f.filter((k) => !have.includes(k)) }; })
      .filter((x) => x.ok.length)
      .sort((a, b) => (b.ok.length * 2 - b.miss.length) - (a.ok.length * 2 - a.miss.length) || (a.miss.length - b.miss.length) || (a.r.n - b.r.n));
    const ready = res.filter((x) => !x.miss.length).length;
    n.innerHTML = res.length ? `<b>${res.length} idée${res.length > 1 ? 's' : ''}</b>${ready ? `, dont <b>${ready}</b> à faire tout de suite` : ''}.` : 'Aucune recette avec ces ingrédients. Cochez-en un ou deux autres.';
    out.innerHTML = res.slice(0, 24).map(({ r, ok, miss }) => `<li class="fr"><a href="${r.u}"><img src="${r.i}" alt="" loading="lazy"><span class="fr-t"><b>${CAM.esc(r.t)}</b><small>${CAM.esc(r.c)} · ${r.d}</small>
      <span class="fr-ok">${ok.length} de vos ingrédients : ${ok.map((k) => CAM.esc(labels[k] || k)).join(', ')}</span>
      ${miss.length ? `<span class="fr-miss">Il vous manque : ${miss.map((k) => CAM.esc(labels[k] || k)).join(', ')}</span>` : '<span class="fr-all">Vous avez tout !</span>'}</span></a></li>`).join('');
  };
  root.addEventListener('change', (e) => { if (e.target.closest('.frigo-opts')) run(); });
  document.addEventListener('cam:prefs', run);
  reset.addEventListener('click', () => { boxes.forEach((b) => { b.checked = false; }); run(); });
  run();
})();

// Proposer une recette : ouvre la messagerie avec la recette rédigée.
(() => {
  const f = document.getElementById('propose-form');
  if (!f) return;
  const v = (k) => (f.elements[k].value || '').trim();
  const text = () => `Bonjour,\n\nVoici ma recette pour Cuisine au miel.\n\nRECETTE : ${v('titre')}\nCatégorie : ${v('categorie')}\nPour : ${v('portions')}\nPréparation : ${v('prep')} · Cuisson : ${v('cuisson')}\nMiel : ${v('miel')}\n\nINGRÉDIENTS\n${v('ingredients')}\n\nPRÉPARATION\n${v('etapes')}\n\nASTUCE / HISTOIRE\n${v('astuce')}\n\nPrénom : ${v('prenom')}\nVille : ${v('ville')}\nE-mail : ${v('email')}\n\nJe suis l'auteur de cette recette (ou elle vient de ma famille) et j'accepte qu'elle soit publiée sur cuisineaumiel.fr, adaptée si besoin, avec mon prénom.`;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = v('prenom') && /.+@.+\..+/.test(v('email')) && v('titre') && v('ingredients') && v('etapes') && f.elements.accord.checked;
    f.querySelector('.wl-err').hidden = !!ok;
    if (!ok) return;
    location.href = `mailto:${f.dataset.mail}@${f.dataset.domain}?subject=${encodeURIComponent('Ma recette : ' + v('titre'))}&body=${encodeURIComponent(text())}`;
  });
  f.querySelector('[data-propose-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text()); f.querySelector('.propose-copied').hidden = false; } catch (e) {}
  });
})();

// Avis des lecteurs (service Cloudflare, voir avis/LISEZMOI.md).
(() => {
  const root = document.querySelector('[data-avis]');
  if (!root) return;
  const api = root.dataset.avis, slug = root.dataset.slug;
  const f = root.querySelector('.avis-form'), msg = root.querySelector('.avis-msg'), list = root.querySelector('.avis-list');
  const star = (on) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"/></svg>`;
  const load = async () => {
    try {
      const d = await (await fetch(`${api}/avis/${slug}`)).json();
      if (d.n) {
        root.querySelector('.avis-moy').textContent = String(d.moy).replace('.', ',');
        root.querySelector('.avis-n').textContent = `${d.n} note${d.n > 1 ? 's' : ''}`;
        root.querySelector('.avis-stars').innerHTML = [1, 2, 3, 4, 5].map((i) => star(d.moy >= i - 0.25)).join('');
      }
      list.innerHTML = (d.commentaires || []).map((c) => `<li><p class="avis-who"><b>${CAM.esc(c.prenom)}</b><span class="avis-stars">${[1, 2, 3, 4, 5].map((i) => star(i <= c.note)).join('')}</span><time>${new Date(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</time></p><p>${CAM.esc(c.texte)}</p></li>`).join('');
    } catch (e) {}
  };
  let done = false;
  try { done = JSON.parse(localStorage.getItem('cam-avis') || '[]').includes(slug); } catch (e) {}
  const say = (t, ok) => { msg.hidden = false; msg.textContent = t; msg.classList.toggle('ok', !!ok); };
  if (done) { f.querySelector('.avis-rate').disabled = true; say('Merci, vous avez déjà noté cette recette.', true); }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = f.querySelector('input[name=note]:checked');
    if (!note) return say('Choisissez une note de 1 à 5 étoiles.');
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      const r = await fetch(`${api}/avis/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: +note.value, prenom: f.elements.prenom.value, texte: f.elements.texte.value, site: f.elements.site.value }) });
      const d = await r.json();
      if (r.ok) {
        try { const l = JSON.parse(localStorage.getItem('cam-avis') || '[]'); l.push(slug); localStorage.setItem('cam-avis', JSON.stringify(l)); } catch (err) {}
        say(d.moderation ? 'Merci ! Votre note est comptée, et votre commentaire apparaîtra après relecture.' : 'Merci, votre note est comptée !', true);
        f.reset(); load();
      } else say(d.erreur === 'deja' ? 'Vous avez déjà noté cette recette. Merci !' : 'Oups, l\'envoi n\'a pas marché. Réessayez dans un instant.');
    } catch (err) { say('Oups, l\'envoi n\'a pas marché. Réessayez dans un instant.'); }
    btn.disabled = false;
  });
  load();
})();
