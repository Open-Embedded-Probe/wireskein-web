# Release procedure

English | [日本語](release.ja.md)

This document is for maintainers. As with the sibling tools, the normal npm publication path runs from a maintainer
workstation.

## Pre-release review

1. Confirm that `main` is current and contains no unintended changes.
2. Review the [README](../README.md) and the changelog.
3. Run `npm run serve`, open the viewer in a Chromium browser and Firefox, and drop `test/fixtures/mixed.wireskein`. Check the
   logic and analog lanes, zoom and pan, sample dots, the band on the decimated channel `SLOW`, and the metadata,
   acquisition, attachment and note rows.
4. After pushing `main`, open <https://open-embedded-probe.github.io/wireskein-web/> directly and repeat step 3.

Automated checks:

```sh
npm run check
npm run build
npm run types
npm run smoke:dist
npm run build:site
npm pack --dry-run
git diff --check
git status --short
```

The package dry run should contain `dist`, `site`, `src`, `types`, the READMEs, changelog and license, and not the
tests. **`site/` is in the npm package on purpose**: the `wireskein` Python package takes the viewer from the published
tarball for `wireskein gui`.

## Changelog and version

Every change under `## Unreleased` in `CHANGELOG.md` has paired `(EN)` and `(JA)` entries. Confirm that it is
non-empty and describes all release changes.

`npm version` invokes:

- `preversion`: tests, type checking and releasability checks;
- `version`: synchronization of the package version, source `VERSION` and changelog heading; and
- creation of the version commit and Git tag.

```sh
npm version patch              # use minor or major when appropriate
```

For the initial release, whose `package.json` already contains `0.0.1`:

```sh
npm version 0.0.1 --allow-same-version
```

## Publish and push

Log in to npm and confirm the account (once per workstation; the login is kept in `~/.npmrc`):

```sh
npm login                      # opens the browser (or asks for user, password and one-time code)
npm whoami                     # the account that will publish
npm owner ls wireskein-web     # after the first release: the accounts allowed to publish
```

Then publish and push:

```sh
npm publish --access public    # asks for a one-time code when two-factor authentication is on
git push --follow-tags
```

The `prepack` hook regenerates the bundles, declarations and site. Never store npm tokens or credentials in the
repository.

## GitHub Actions

- `ci.yml`: checks, builds, declarations, distribution smoke test, site build and package contents on `main` pushes and
  pull requests;
- `pages.yml`: deploys the viewer to GitHub Pages on a `main` push or manual run; and
- `release.yml`: optional manual publication once npm Trusted Publishing is configured.

## Post-release checks

- The intended version appears on the npm package page.
- In an empty directory, `npm install wireskein-web@<version>` then
  `node -e "import('wireskein-web').then(m => console.log(m.VERSION))"` prints it.
- The Git tag points to the expected commit.
- The [viewer](https://open-embedded-probe.github.io/wireskein-web/) shows the new version in its title.
- Tell the wireskein maintainers the version, so `wireskein gui` can ship it.

Do not overwrite a broken published version. Fix the problem and publish a new patch version.
