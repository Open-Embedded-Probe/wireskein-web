# リリースの手順

[English](release.md) | 日本語

保守する人向けの文書です。兄弟のツールと同じく、npm への公開は、ふつうは保守する人の手元のマシンから行います。

## リリースの前に見ること

1. `main` が最新で、意図しない変更がないことを確かめます。
2. [README](../README.ja.md) と変更履歴を読み直します。
3. `npm run serve` でビューアを開き、Chromium 系のブラウザと Firefox で、`test/fixtures/mixed.wsc` を落とします。次のものを確かめます。
   - ロジックとアナログの行、拡大と移動、サンプルの点
   - 間引いたチャンネル `SLOW` の帯
   - メタ情報、取得の設定、添付、メモの行
4. `main` を push したあと、<https://open-embedded-probe.github.io/wireskein-web/> を直接開き、3 を繰り返します。

自動の確認:

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

配布物の確認（dry run）には、`dist`、`site`、`src`、`types`、README、変更履歴、ライセンスが入り、テストは入らないはずです。**`site/` は、わざと npm の配布物に入れています。** Python の `wireskein` が、公開した tarball からビューアを取り出して、`wireskein gui` に同梱するためです。

## 変更履歴と版

`CHANGELOG.md` の `## Unreleased` の変更には、`(EN)` と `(JA)` を対で書きます。空でなく、リリースの変更をすべて書いてあることを確かめます。

`npm version` は、次のものを実行します。

- `preversion`: テスト、型のチェック、リリースできるかの確認
- `version`: package の版、ソースの `VERSION`、変更履歴の見出しをそろえる
- 版のコミットと Git のタグを作る

```sh
npm version patch              # 必要なら minor か major
```

最初のリリースは、`package.json` がすでに `0.0.1` なので、次のようにします。

```sh
npm version 0.0.1 --allow-same-version
```

## 公開と push

npm にログインし、アカウントを確かめます（マシンごとに 1 回。ログインは `~/.npmrc` に残ります）。

```sh
npm login                      # ブラウザが開く（または、ユーザー名、パスワード、ワンタイムコードを聞かれる）
npm whoami                     # 公開に使うアカウント
npm owner ls wireskein-web     # 最初のリリースの後: 公開できるアカウントの一覧
```

そのあと、公開して push します。

```sh
npm publish --access public    # 二要素認証が有効なら、ワンタイムコードを聞かれる
git push --follow-tags
```

`prepack` が、バンドル、型定義、サイトを作り直します。npm のトークンや認証情報を、リポジトリに置いてはいけません。

## GitHub Actions

- `ci.yml`: `main` への push と pull request で、確認、ビルド、型定義、配布物の smoke test、サイトのビルド、配布物の中身を確かめます。
- `pages.yml`: `main` への push か手動の実行で、ビューアを GitHub Pages に出します。
- `release.yml`: npm の Trusted Publishing を設定したあとの、任意の手動の公開です。

## リリースの後に見ること

- npm の package のページに、意図した版が出ていること。
- 空のディレクトリで `npm install wireskein-web@<版>` をし、`node -e "import('wireskein-web').then(m => console.log(m.VERSION))"` がその版を出すこと。
- Git のタグが、意図したコミットを指していること。
- [ビューア](https://open-embedded-probe.github.io/wireskein-web/) のタイトルに、新しい版が出ていること。
- wireskein の保守する人に版を知らせ、`wireskein gui` が同梱できるようにすること。

壊れた版を上書きしてはいけません。直して、新しい patch の版を出します。
