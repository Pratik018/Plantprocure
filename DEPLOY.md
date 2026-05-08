# Deploying to GitHub Pages

Since you are using Vite and React, the best way to deploy to GitHub Pages is using GitHub Actions.

## Step 1: Authorized Domains in Firebase
Before the app can log in or save data, you **must** add your GitHub Pages domain to Firebase:
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Settings > Authentication > Settings > Authorized Domains.
3. Add `yourusername.github.io`.

## Step 2: Set up GitHub Pages in Repository Settings
1. Go to your repository on GitHub.
2. Click on **Settings** (top tab).
3. Click on **Pages** (left sidebar).
4. Under **Build and deployment** > **Source**, select **GitHub Actions**.

## Step 3: Deployment
Every time you push to the `main` branch, the GitHub Action I created (`.github/workflows/deploy.yml`) will:
1. Install dependencies.
2. Build the project.
3. Upload the files to GitHub Pages.

## Step 4: Routing (IMPORTANT)
GitHub Pages does not natively support Single Page Application (SPA) routing (like `/add-request`). If you refresh the page on a sub-path, you might get a 404.
- **Solution:** I have configured the app to work with standard paths, but for GitHub Pages, it is often easier to use a **Hash Router** if you encounter 404 errors on refresh.
