// Notes et commentaires des lecteurs de cuisineaumiel.fr — Cloudflare Worker + KV (offre gratuite).
// Liaisons à créer dans Cloudflare : un espace KV nommé AVIS, et un secret ADMIN_KEY (mot de passe de modération).
// Secrets aussi : BREVO_API_KEY (envoi de l'e-mail de confirmation) ; variable EXPEDITEUR (adresse validée dans Brevo).
// Chaque avis demande une adresse e-mail : rien ne compte tant que le lecteur n'a pas cliqué sur le lien reçu.
// Ensuite la note compte, et le commentaire ou la photo « Je l'ai fait ! » attendent votre validation sur /admin.

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
const EMAIL = /^[^\s@<>"]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
// Adresses jetables : refusées, puisqu'elles servent surtout aux faux avis.
const JETABLES = /@(yopmail|mailinator|guerrillamail|sharklasers|10minutemail|temp-?mail|tempmail|trashmail|getnada|maildrop|dispostable|throwawaymail|mailnesia|mohmal|emailondeck|fakeinbox|spamgourmet|jetable|tmpmail|minuteinbox)\./i;
const SITE = 'https://cuisineaumiel.fr';
async function envoyerConfirmation(env, to, prenom, titre, lien) {
  const html = `<div style="font:16px/1.6 Arial,sans-serif;color:#1C1917;max-width:520px">
<p>Bonjour ${esc(prenom)},</p>
<p>Merci pour votre avis sur <b>${esc(titre)}</b>. Pour qu'il soit pris en compte, confirmez votre adresse e-mail :</p>
<p><a href="${lien}" style="display:inline-block;background:#B45309;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Confirmer mon avis</a></p>
<p style="color:#78716C;font-size:14px">Ce lien est valable 48 heures. Si vous n'avez pas laissé d'avis sur cuisineaumiel.fr, ignorez simplement ce message : rien ne sera publié.</p>
<p style="color:#78716C;font-size:14px">Cuisine au miel · cuisineaumiel.fr</p></div>`;
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: 'Cuisine au miel', email: env.EXPEDITEUR }, to: [{ email: to, name: prenom }], subject: 'Confirmez votre avis sur Cuisine au miel', htmlContent: html }),
  });
  return r.ok;
}
const page = (titre, corps) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title>
<style>body{font:17px/1.6 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 16px;color:#1C1917;text-align:center}h1{font-size:1.5rem}button,a.b{font:600 1rem system-ui;padding:12px 24px;border-radius:999px;border:0;background:#B45309;color:#fff;cursor:pointer;text-decoration:none;display:inline-block}</style>
<h1>${titre}</h1>${corps}`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

// Photo envoyée par le site : JPEG déjà réduit par le navigateur (1080 px max), 600 Ko au plus.
function photoBytes(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[1].length > 800000) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out[0] === 0xff && out[1] === 0xd8 ? out : null; // signature JPEG
}
// Appel direct à l'API Claude (pas de SDK : le Worker est collé tel quel dans Cloudflare, sans étape de build).
const RECETTE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['lisible', 'titre', 'portions', 'preparation', 'cuisson', 'miel', 'ingredients', 'etapes'],
  properties: {
    lisible: { type: 'boolean', description: "false si la photo ne montre pas une recette lisible" },
    titre: { type: 'string' }, portions: { type: 'string' }, preparation: { type: 'string' }, cuisson: { type: 'string' },
    miel: { type: 'string', description: 'Le miel cité, ou une chaîne vide' },
    ingredients: { type: 'array', items: { type: 'string' } },
    etapes: { type: 'array', items: { type: 'string' } },
  },
};
async function lireRecette(env, b64) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RECETTE_SCHEMA } },
      system: "Tu recopies fidèlement une fiche recette photographiée (manuscrite ou imprimée) pour remplir un formulaire, en français. Une ligne par ingrédient avec sa quantité, une étape par élément, dans l'ordre. N'invente rien : laisse vide ce qui n'est pas écrit. Corrige seulement l'orthographe évidente. Si l'image ne montre pas une recette, mets lisible à false.",
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Recopie cette recette.' }] }],
    }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (d.stop_reason !== 'end_turn') return null;
  const t = (d.content || []).find((c) => c.type === 'text');
  try {
    const o = JSON.parse(t.text);
    const s = (v, n) => clean(v, n);
    return { lisible: !!o.lisible, titre: s(o.titre, 140), portions: s(o.portions, 40), preparation: s(o.preparation, 40), cuisson: s(o.cuisson, 40), miel: s(o.miel, 80), ingredients: (o.ingredients || []).slice(0, 40).map((x) => s(x, 160)), etapes: (o.etapes || []).slice(0, 30).map((x) => s(x, 800)) };
  } catch (e) { return null; }
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

    // « Proposer une recette » : lecture d'une photo de fiche recette par Claude (5 par personne et par jour).
    // Nécessite le secret ANTHROPIC_API_KEY. Le résultat remplit le formulaire ; rien n'est publié ici.
    if (parts[0] === 'lire' && req.method === 'POST') {
      if (!ORIGINS.includes(origin)) return json({ erreur: 'origine' }, 403, origin);
      if (!env.ANTHROPIC_API_KEY) return json({ erreur: 'indisponible' }, 503, origin);
      let b; try { b = await req.json(); } catch (e) { return json({ erreur: 'format' }, 400, origin); }
      const photo = photoBytes(b.photo);
      if (!photo) return json({ erreur: 'photo' }, 400, origin);
      const day = new Date().toISOString().slice(0, 10);
      const who = await sha(`${req.headers.get('cf-connecting-ip') || ''}|lire|${day}|${env.ADMIN_KEY}`);
      const used = +(await env.AVIS.get(`l:${who}`)) || 0;
      if (used >= 5) return json({ erreur: 'quota' }, 429, origin);
      await env.AVIS.put(`l:${who}`, String(used + 1), { expirationTtl: 60 * 60 * 26 });
      const out = await lireRecette(env, b.photo.split(',')[1]);
      if (!out) return json({ erreur: 'lecture' }, 502, origin);
      return json({ ...out, reste: 4 - used }, 200, origin);
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
        if (!env.BREVO_API_KEY || !env.EXPEDITEUR) return json({ erreur: 'indisponible' }, 503, origin);
        let b; try { b = await req.json(); } catch (e) { return json({ erreur: 'format' }, 400, origin); }
        if (b.site) return json({ ok: true }, 200, origin); // champ piège anti-robots
        const note = Math.round(+b.note);
        if (!(note >= 1 && note <= 5)) return json({ erreur: 'note' }, 400, origin);
        const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
        if (!EMAIL.test(email)) return json({ erreur: 'email' }, 400, origin);
        if (JETABLES.test(email)) return json({ erreur: 'jetable' }, 400, origin);
        // Une note par adresse e-mail et par recette ; et une par connexion et par recette pendant 30 jours.
        if (await env.AVIS.get(`e:${await sha(`${email}|${slug}`)}`)) return json({ erreur: 'deja' }, 429, origin);
        const ip = req.headers.get('cf-connecting-ip') || '';
        const who = await sha(`${ip}|${slug}|${env.ADMIN_KEY}`);
        if (await env.AVIS.get(`v:${who}`)) return json({ erreur: 'deja' }, 429, origin);
        // Au plus 10 e-mails de confirmation par connexion et par jour.
        const day = new Date().toISOString().slice(0, 10);
        const ipj = await sha(`${ip}|mail|${day}|${env.ADMIN_KEY}`);
        const sent = +(await env.AVIS.get(`s:${ipj}`)) || 0;
        if (sent >= 10) return json({ erreur: 'quota' }, 429, origin);
        const texte = clean(b.texte, 1200), prenom = clean(b.prenom, 40) || 'Un lecteur';
        const titre = clean(b.titre, 140) || slug;
        const photo = b.photo ? photoBytes(b.photo) : null;
        if (b.photo && !photo) return json({ erreur: 'photo' }, 400, origin);
        const token = [...crypto.getRandomValues(new Uint8Array(18))].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 32);
        const ttl = { expirationTtl: 60 * 60 * 48 };
        if (photo) await env.AVIS.put(`cq:${token}`, photo, ttl);
        await env.AVIS.put(`c:${token}`, JSON.stringify({ slug, titre, prenom, note, texte, email, nouvelles: !!b.nouvelles, photo: !!photo, who }), ttl);
        const ok = await envoyerConfirmation(env, email, prenom, titre, `${url.origin}/confirmer/${token}`);
        if (!ok) { await env.AVIS.delete(`c:${token}`); await env.AVIS.delete(`cq:${token}`); return json({ erreur: 'envoi' }, 502, origin); }
        await env.AVIS.put(`s:${ipj}`, String(sent + 1), { expirationTtl: 60 * 60 * 26 });
        await env.AVIS.put(`v:${who}`, '1', { expirationTtl: 60 * 60 * 24 * 30 });
        return json({ ok: true, confirmation: true }, 200, origin);
      }
    }

    // Lien reçu par e-mail. La page demande un clic (les logiciels qui ouvrent les liens des e-mails ne confirment donc rien).
    if (parts[0] === 'confirmer' && /^[a-z0-9]{20,40}$/.test(parts[1] || '')) {
      const token = parts[1];
      const c = await env.AVIS.get(`c:${token}`, 'json');
      if (!c) return page('Lien expiré', `<p>Ce lien a déjà servi ou n'est plus valable (48 heures). Vous pouvez laisser à nouveau votre avis sur le site.</p><p><a class="b" href="${SITE}">Retour à Cuisine au miel</a></p>`);
      if (req.method !== 'POST') return page('Confirmer votre avis', `<p>${esc(c.prenom)}, un dernier clic pour publier votre note de ${'★'.repeat(c.note)} sur <b>${esc(c.titre)}</b>.</p><form method="post"><button>Confirmer mon avis</button></form>`);
      const ekey = `e:${await sha(`${c.email}|${c.slug}`)}`;
      if (!(await env.AVIS.get(ekey))) {
        await env.AVIS.put(ekey, '1');
        const r = await getRec(env, c.slug);
        r.sum += c.note; r.n += 1;
        await env.AVIS.put(`r:${c.slug}`, JSON.stringify(r));
        const date = new Date().toISOString().slice(0, 10);
        if (c.texte.length >= 3 || c.photo) {
          const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          if (c.photo) { const img = await env.AVIS.get(`cq:${token}`, 'arrayBuffer'); if (img) await env.AVIS.put(`q:${id}`, img, { expirationTtl: 60 * 60 * 24 * 60 }); }
          await env.AVIS.put(`p:${id}`, JSON.stringify({ slug: c.slug, prenom: c.prenom, note: c.note, texte: c.texte, email: c.email, photo: !!c.photo, date }));
        }
        // Carnet d'adresses des lecteurs qui ont confirmé (pour les recontacter au sujet de leur avis).
        const mkey = `m:${await sha(c.email)}`;
        const m = (await env.AVIS.get(mkey, 'json')) || { email: c.email, prenom: c.prenom, premier: date, avis: 0, nouvelles: false };
        m.avis += 1; m.dernier = date; m.prenom = c.prenom; m.nouvelles = m.nouvelles || c.nouvelles;
        await env.AVIS.put(mkey, JSON.stringify(m));
      }
      await env.AVIS.delete(`c:${token}`); await env.AVIS.delete(`cq:${token}`);
      return Response.redirect(`${SITE}/recettes/${c.slug}/?avis=confirme#avis`, 303);
    }

    // Modération : https://<worker>/admin?cle=ADMIN_KEY
    if (parts[0] === 'admin') {
      const key = url.searchParams.get('cle') || '';
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return new Response('Accès refusé', { status: 403 });
      if (parts[1] === 'photo' && /^[a-z0-9]{6,30}$/.test(parts[2] || '')) {
        const img = await env.AVIS.get(`q:${parts[2]}`, 'arrayBuffer');
        return img ? jpeg(img, 'no-store') : new Response('Photo introuvable', { status: 404 });
      }
      if (parts[1] === 'contacts.csv') {
        const rows = [['email', 'prenom', 'avis', 'premier_avis', 'dernier_avis', 'accepte_nouvelles']];
        let cursor;
        do {
          const l = await env.AVIS.list({ prefix: 'm:', cursor });
          for (const k of l.keys) { const m = await env.AVIS.get(k.name, 'json'); if (m) rows.push([m.email, m.prenom, m.avis, m.premier, m.dernier || '', m.nouvelles ? 'oui' : 'non']); }
          cursor = l.list_complete ? null : l.cursor;
        } while (cursor);
        const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        return new Response('\ufeff' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="lecteurs-cuisineaumiel.csv"', 'cache-control': 'no-store' } });
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
<h1>Avis à valider (${items.length})</h1><p><a href="/admin/contacts.csv?cle=${encodeURIComponent(key)}">Télécharger les adresses des lecteurs (CSV)</a></p>${items.length ? '' : '<p>Rien à valider pour le moment.</p>'}
${items.map((x) => `<div class="a"><p><b>${esc(x.prenom)}</b> · <span class="s">${'★'.repeat(x.note)}${'☆'.repeat(5 - x.note)}</span> · ${esc(x.date)} · <a href="https://cuisineaumiel.fr/recettes/${esc(x.slug)}/" target="_blank">${esc(x.slug)}</a>${x.email ? ` · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}</p>${x.texte ? `<p>${esc(x.texte)}</p>` : ''}${x.photo ? `<img src="/admin/photo/${esc(x.id)}?cle=${encodeURIComponent(key)}" alt="Photo envoyée">` : ''}<div class="b">${form(x.id, 'publier', x.photo ? 'Publier avec la photo' : 'Publier', 'ok')}${x.photo && x.texte ? form(x.id, 'texte', 'Publier sans la photo', 'no') : ''}${form(x.id, 'supprimer', 'Supprimer', 'no')}</div></div>`).join('')}`;
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return json({ erreur: 'introuvable' }, 404, origin);
  },
};
