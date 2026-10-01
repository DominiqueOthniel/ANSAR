# 🚀 Déploiement Automatique

Ce projet est configuré pour un déploiement automatique sur Netlify à chaque push sur la branche `main`.

## Configuration

### Netlify (Recommandé)

Le déploiement automatique via Netlify est la méthode principale :

1. **Connexion GitHub ↔ Netlify**
   - Connectez votre repository GitHub à Netlify
   - Netlify déploiera automatiquement à chaque push sur `main`

2. **Configuration requise sur Netlify**
   - Branch to deploy: `main`
   - Build command: `npm run build:netlify`
   - Publish directory: `dist`
   - Node version: `20`

3. **Secrets GitHub (pour GitHub Actions)**
   Si vous voulez aussi utiliser GitHub Actions pour déclencher les déploiements :
   - `NETLIFY_AUTH_TOKEN` : Token d'authentification Netlify
   - `NETLIFY_SITE_ID` : ID du site Netlify

### GitHub Actions

Deux workflows sont configurés :

#### 1. CI (Intégration Continue)
- **Fichier** : `.github/workflows/ci.yml`
- **Déclenchement** : Push et PR sur `main`
- **Actions** :
  - Lint et tests du frontend
  - Build du frontend
  - Build du backend

#### 2. Déploiement
- **Fichier** : `.github/workflows/deploy.yml`
- **Déclenchement** : Push sur `main`
- **Actions** :
  - Build complet (frontend + backend)
  - Déploiement sur Netlify

## Workflow de déploiement

```
Push sur main → GitHub Actions (CI) → Build → Netlify → Live ! ✨
```

## Variables d'environnement

Configurez les variables d'environnement sur Netlify :

- `VITE_API_URL` : URL de l'API (si différente)
- `VITE_SUPABASE_URL` : URL Supabase
- `VITE_SUPABASE_ANON_KEY` : Clé anonyme Supabase
- Autres variables selon vos besoins

## Comment ajouter les secrets GitHub

1. Allez dans **Settings** > **Secrets and variables** > **Actions**
2. Cliquez sur **New repository secret**
3. Ajoutez :
   - `NETLIFY_AUTH_TOKEN` : Trouvé dans Netlify > User settings > Applications
   - `NETLIFY_SITE_ID` : Trouvé dans Netlify > Site settings > General

## Déploiement manuel

Si besoin de déployer manuellement :

```bash
# Via Netlify CLI
netlify deploy --prod

# Ou déclencher le workflow GitHub
git push origin main
```

## Vérification

Après chaque déploiement :
- ✅ Vérifiez que le build passe dans GitHub Actions
- ✅ Vérifiez que le site est accessible
- ✅ Testez les nouvelles fonctionnalités
- ✅ Vérifiez les logs Netlify en cas d'erreur

## Support

En cas de problème :
1. Consultez les logs GitHub Actions
2. Consultez les logs de déploiement Netlify
3. Vérifiez que toutes les variables d'environnement sont configurées
4. Vérifiez que les secrets GitHub sont correctement définis
