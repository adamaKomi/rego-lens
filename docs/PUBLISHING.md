# Publishing Guide

This guide explains how to publish the Rego Syntax Support extension.

## Prerequisites

1. **Azure DevOps Account** - Required for VS Code Marketplace
2. **Personal Access Token (PAT)** - From Azure DevOps
3. **Publisher ID** - Registered on marketplace

## Setup Publisher

### 1. Create Azure DevOps Organization

1. Go to https://dev.azure.com/
2. Create a new organization (if needed)
3. Note your organization name

### 2. Create Personal Access Token

1. Go to Azure DevOps → User Settings → Personal Access Tokens
2. Create new token with:
   - **Name**: `vsce-token` (or any name)
   - **Organization**: All accessible organizations
   - **Scopes**: 
     - Marketplace → Manage (check this)
   - **Expiration**: Set appropriate duration
3. Copy the token immediately (shown only once)

### 3. Create Publisher

Create the publisher at <https://marketplace.visualstudio.com/manage> (`vsce` no longer has a
`create-publisher` command).

### 4. Update package.json

Update the `publisher` field in `package.json`:

```json
{
  "publisher": "YOUR_PUBLISHER_NAME"
}
```

## Publishing

### Local Publishing

> Publishing from a workstation relies on an Azure DevOps PAT. Global PATs are retired on
> December 1, 2026: prefer the GitHub Actions release below.

```bash
# Login to vsce
npx vsce login YOUR_PUBLISHER_NAME

# Publish
npm run publish
```

### CI/CD Publishing (GitHub Actions)

1. VS Code Marketplace: create a **Trusted Publishing** policy (no secret to store). Global Azure DevOps
   PATs are retired on December 1, 2026
   ([official guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing)).
   On <https://marketplace.visualstudio.com/manage>, open the publisher, select **Trusted Publishing** > **Create**:
   - Repository owner: `adamaKomi`
   - Repository: `rego-lens`
   - Workflow: `release.yml`
   - Environment: leave empty
2. Open VSX: register a **Trusted Publisher** (no secret to store). The namespace `AdamaKomi` must exist.
   On <https://open-vsx.org>, open the user settings > **Trusted Publishers** and add GitHub, repository `adamaKomi/rego-lens`,
   workflow `release.yml`, no environment. An extension can have only one trusted publisher, so after a
   repository rename, delete the old registration first, then create the new one. If the Open VSX job fails,
   it does not block the other jobs.

   Both registrations match the repository **name** in the workflow's OIDC token. Renaming the GitHub
   repository requires updating them before the next release. The extension, its installs and its ratings
   are tied to the identifier `AdamaKomi.rego-syntax-support`, not to these registrations.

3. Merge to `main`, then push a tag that matches the `version` of `package.json`:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The Release workflow (`.github/workflows/release.yml`) refuses a tag that does not match `package.json`,
runs the tests, builds the VSIX once and publishes that file to GitHub Releases, the VS Code Marketplace
and Open VSX. A tag with a suffix (`v0.3.0-rc.1`) only creates a GitHub pre-release.

## Version Management

### Bump Version

```bash
# Patch version (0.1.0 → 0.1.1)
npm version patch

# Minor version (0.1.0 → 0.2.0)
npm version minor

# Major version (0.1.0 → 1.0.0)
npm version major
```

### Pre-release

```bash
npx vsce package --pre-release
npx vsce publish --pre-release
```

## Verification

After publishing:

1. Check https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER.rego-syntax-support
2. Install from VS Code: `ext install YOUR_PUBLISHER.rego-syntax-support`
3. Verify all features work correctly

## Open VSX (Alternative Registry)

For open-source alternative to VS Code Marketplace:

1. Create account at https://open-vsx.org/
2. Create access token
3. Publish:

```bash
npx ovsx publish -p YOUR_OVSX_TOKEN
```

## Troubleshooting

### "Publisher not found"
- Ensure publisher is created and verified
- Check publisher name matches exactly

### "Invalid PAT"
- Regenerate PAT with correct scopes
- Ensure token hasn't expired

### "Extension already exists"
- Increment version number
- Check you're using correct publisher

## Checklist Before Publishing

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md`
- [ ] Run all tests: `npm test` and `npm run test:integration`
- [ ] Check what will be packaged: `npx vsce ls`
- [ ] Test locally with F5
- [ ] Verify icon displays correctly
- [ ] Check README renders properly
- [ ] Commit all changes
