// Notes et commentaires des lecteurs de cuisineaumiel.fr — Cloudflare Worker + KV (offre gratuite).
// Liaisons à créer dans Cloudflare : un espace KV nommé AVIS, et un secret ADMIN_KEY (mot de passe de modération).
// Les notes comptent tout de suite ; les commentaires et les photos « Je l'ai fait ! » n'apparaissent qu'après validation sur /admin.

const ORIGINS = ['https://cuisineaumiel.fr', 'https://www.cuisineaumiel.fr', 'http://localhost:8765'];
const cors = (origin) => ({ 'access-control-allow-origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' });
const json = (data, status = 200, origin = '') => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin), 'cache-control': 'no-store' },
});
const SLUG = /^[a-z0-9-]{2,100}$/;
const clean = (t, max) => String(t || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 24); }
const getRec = async (env, slug) => (await env.AVIS.get(`r:${slug}`, 'json')) || { sum: 0, n: 0, c: [] };
// Photo envoyée par le site : JPEG déjà réduit par le navigateur (1080 px max), 600 Ko au plus.
function photoBytes(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[1].length > 800000) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out[0] === 0xff && out[1] === 0xd8 ? out : null; // signature JPEG
}
const jpeg = (body, cache) => new Response(body, { headers: { 'content-type': 'image/jpeg', 'cache-control': cache, 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const parts = url.pathname.split('/').filter(Boolean);

    // Toutes les notes (lu au moment de la construction du site, pour les étoiles dans Google).
    if (req.method === 'GET' && parts[0] === 'notes') {
      const out = {};
      let cursor;
      do {
        const l = await env.AVIS.list({ prefix: 'r:', cursor });
        for (const k of l.keys) { const r = await env.AVIS.get(k.name, 'json'); if (r && r.n) out[k.name.slice(2)] = { n: r.n, moy: Math.round((r.sum / r.n) * 10) / 10, avis: r.c.length }; }
        cursor = l.list_complete ? null : l.cursor;
      } while (cursor);
      return json(out, 200, origin);
    }

    // Photo publiée (après validation).
    if (req.method === 'GET' && parts[0] === 'photo' && /^[a-z0-9]{6,30}$/.test(parts[1] || '')) {
      const img = await env.AVIS.get(`f:${parts[1]}`, 'arrayBuffer');
      return img ? jpeg(img, 'public, max-age=31536000, immutable') : json({ erreur: 'introuvable' }, 404, origin);
    }

    // Avis d'une recette.
    if (parts[0] === 'avis' && SLUG.test(parts[1] || '')) {
      const slug = parts[1];
      if (req.method === 'GET') {
        const r = await getRec(env, slug);
        return json({ n: r.n, moy: r.n ? Math.round((r.sum / r.n) * 10) / 10 : 0, commentaires: r.c.slice(0, 50) }, 200, origin);
      }
      if (req.method === 'POST') {
        if (!ORIGINS.includes(origin)) return json({ erreur: 'origine' }, 403, origin);
        let b; try { b = await req.json(); } catch (e) { return json({ erreur: 'format' }, 400, origin); }
        if (b.site) return json({ ok: true }, 200, origin); // champ piège anti-robots
        const note = Math.round(+b.note);
        if (!(note >= 1 && note <= 5)) return json({ erreur: 'note' }, 400, origin);
        // Une note par personne et par recette pendant 30 jours.
        const who = await sha(`${req.headers.get('cf-connecting-ip') || ''}|${slug}|${env.ADMIN_KEY}`);
        if (await env.AVIS.get(`v:${who}`)) return json({ erreur: 'deja' }, 429, origin);
        await env.AVIS.put(`v:${who}`, '1', { expirationTtl: 60 * 60 * 24 * 30 });
        const r = await getRec(env, slug);
        r.sum += note; r.n += 1;
        await env.AVIS.put(`r:${slug}`, JSON.stringify(r));
        const texte = clean(b.texte, 1200), prenom = clean(b.prenom, 40) || 'Un lecteur';
        const photo = b.photo ? photoBytes(b.photo) : null;
        if (b.photo && !photo) return json({ erreur: 'photo' }, 400, origin);
        if (texte.length >= 3 || photo) {
          const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          if (photo) await env.AVIS.put(`q:${id}`, photo, { expirationTtl: 60 * 60 * 24 * 60 }); // photo en attente (60 jours)
          await env.AVIS.put(`p:${id}`, JSON.stringify({ slug, prenom, note, texte, photo: !!photo, date: new Date().toISOString().slice(0, 10) }));
        }
        return json({ ok: true, moderation: texte.length >= 3 || !!photo }, 200, origin);
      }
    }

    // Modération : https://<worker>/admin?cle=ADMIN_KEY
    if (parts[0] === 'admin') {
      const key = url.searchParams.get('cle') || '';
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return new Response('Accès refusé', { status: 403 });
      if (parts[1] === 'photo' && /^[a-z0-9]{6,30}$/.test(parts[2] || '')) {
        const img = await env.AVIS.get(`q:${parts[2]}`, 'arrayBuffer');
        return img ? jpeg(img, 'no-store') : new Response('Photo introuvable', { status: 404 });
      }
      if (req.method === 'POST') {
        const f = await req.formData();
        const id = String(f.get('id') || ''), action = f.get('action');
        const p = await env.AVIS.get(`p:${id}`, 'json');
        if (p && (action === 'publier' || action === 'texte')) {
          const r = await getRec(env, p.slug);
          let photo = '';
          if (p.photo && action === 'publier') { const img = await env.AVIS.get(`q:${id}`, 'arrayBuffer'); if (img) { await env.AVIS.put(`f:${id}`, img); photo = id; } }
          if (p.texte || photo) { r.c.unshift({ prenom: p.prenom, note: p.note, texte: p.texte, date: p.date, ...(photo ? { photo } : {}) }); await env.AVIS.put(`r:${p.slug}`, JSON.stringify(r)); }
        }
        if (p) { await env.AVIS.delete(`p:${id}`); await env.AVIS.delete(`q:${id}`); }
        return Response.redirect(`${url.origin}/admin?cle=${encodeURIComponent(key)}`, 303);
      }
      const l = await env.AVIS.list({ prefix: 'p:' });
      const items = (await Promise.all(l.keys.map(async (k) => ({ id: k.name.slice(2), ...(await env.AVIS.get(k.name, 'json')) })))).filter((x) => x.slug);
      const form = (id, action, label, cls) => `<form method="post"><input type="hidden" name="id" value="${esc(id)}"><button name="action" value="${action}" class="${cls}">${label}</button></form>`;
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avis à valider</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1C1917}h1{font-size:1.5rem}.a{border:1px solid #E7E5E4;border-radius:14px;padding:16px;margin:12px 0}.a p{margin:6px 0}.a img{display:block;max-width:100%;max-height:420px;border-radius:10px;margin:8px 0}.s{color:#F2A516}.b{display:flex;gap:8px}button{font:600 .95rem system-ui;padding:10px 18px;border-radius:999px;border:0;cursor:pointer}.ok{background:#B45309;color:#fff}.no{background:#F4F2EF}a{color:#B45309}</style>
<h1>Avis à valider (${items.length})</h1>${items.length ? '' : '<p>Rien à valider pour le moment.</p>'}
${items.map((x) => `<div class="a"><p><b>${esc(x.prenom)}</b> · <span class="s">${'★'.repeat(x.note)}${'☆'.repeat(5 - x.note)}</span> · ${esc(x.date)} · <a href="https://cuisineaumiel.fr/recettes/${esc(x.slug)}/" target="_blank">${esc(x.slug)}</a></p>${x.texte ? `<p>${esc(x.texte)}</p>` : ''}${x.photo ? `<img src="/admin/photo/${esc(x.id)}?cle=${encodeURIComponent(key)}" alt="Photo envoyée">` : ''}<div class="b">${form(x.id, 'publier', x.photo ? 'Publier avec la photo' : 'Publier', 'ok')}${x.photo && x.texte ? form(x.id, 'texte', 'Publier sans la photo', 'no') : ''}${form(x.id, 'supprimer', 'Supprimer', 'no')}</div></div>`).join('')}`;
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return json({ erreur: 'introuvable' }, 404, origin);
  },
};
