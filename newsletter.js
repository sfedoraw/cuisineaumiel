// Envoi de la lettre de la semaine par Brevo (lancé par .github/workflows/newsletter.yml, après node build.js).
// Il faut : le secret GitHub BREVO_API_KEY, et dans data/newsletter.json le numéro de « liste » et l'e-mail de l'« expediteur ».
// Par défaut la campagne est créée en BROUILLON dans Brevo : vous la relisez et l'envoyez vous-même.
// Mettre "envoi_auto": true pour qu'elle parte toute seule.
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'newsletter.json'), 'utf8'));
const key = process.env.BREVO_API_KEY;
if (!key || !cfg.liste || !cfg.expediteur || !cfg.expediteur.email) {
  console.log('Lettre non configurée (clé BREVO_API_KEY, liste ou expéditeur manquant) : rien à faire.');
  process.exit(0);
}
const html = fs.readFileSync(path.join(__dirname, '_site', 'newsletter', 'apercu', 'index.html'), 'utf8');
const { sujet } = JSON.parse(fs.readFileSync(path.join(__dirname, '_site', 'newsletter', 'semaine.json'), 'utf8'));
const api = (route, body) => fetch(`https://api.brevo.com/v3${route}`, { method: 'POST', headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });

(async () => {
  const date = new Date().toISOString().slice(0, 10);
  const r = await api('/emailCampaigns', {
    name: `Lettre du ${date}`,
    subject: sujet,
    sender: { name: cfg.expediteur.nom || 'Cuisine au miel', email: cfg.expediteur.email },
    recipients: { listIds: [Number(cfg.liste)] },
    htmlContent: html.replace('<meta name="robots" content="noindex">', ''),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('Brevo a refusé la campagne :', r.status, JSON.stringify(d)); process.exit(1); }
  console.log(`Campagne ${d.id} créée : « ${sujet} ».`);
  if (cfg.envoi_auto) {
    const s = await api(`/emailCampaigns/${d.id}/sendNow`, {});
    if (!s.ok) { console.error('Envoi refusé :', s.status, await s.text()); process.exit(1); }
    console.log('Envoyée.');
  } else console.log('Brouillon prêt dans Brevo (Campagnes) : à relire puis envoyer.');
})();
