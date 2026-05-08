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

## Step 4: Base Path and Configuration
I have configured `vite.config.ts` with `base: './'`. This ensures that your assets (images, JS, CSS) load correctly regardless of your repository name.

## Step 5: Troubleshooting 404 Errors
If you see a 404 error:
1. **Wait for the Action:** Check the **Actions** tab in your GitHub repository. The deployment takes 1-2 minutes to finish after you push code.
2. **Correct URL:** Ensure you are visiting `https://yourusername.github.io/your-repository-name/` (don't forget the trailing slash).
3. **Authorized Domains:** Double check Step 1. Firebase will block the app if the domain is not authorized.
4. **.nojekyll:** I have added a `.nojekyll` file in the `public` folder to prevent GitHub from hiding important files.
