# Chrome Website Time Tracker

[リポジトリ](<https://github.com/Kyo-s-s/numa-timer>)
[ツイート](<https://x.com/Kyo_s_s/status/2030284148523610495>)
のパクリです。

ツイート時点でリポジトリがなかったので手前味噌で~~パク~~作らせていただきました。許してください何でもしますから。

ソースコードのライセンスはMITです。

## 以下AIの作ったREADME

その日・そのサイトで使った時間を、ページ右上に小さく表示する Chrome 拡張機能です。

## Features

- 現在開いているサイトの「今日の利用時間」を右上に表示
- 同じサイトを複数タブで開いても重複加算しない
- サブドメインを同一サイトとして統合して計測
- タブの可視状態・ウィンドウフォーカス時のみ時間を加算
- 拡張機能のポップアップでサイト利用時間ランキングを表示
- favicon / theme-color / 背景色を使って UI カラーを推定
- TypeScript + esbuild で軽量バンドル
- Bun で依存管理
- Biome で format / lint

## Setup

```bash
bun install
bun run build
```

`dist/` を Chrome の「パッケージ化されていない拡張機能を読み込む」で読み込んでください。

## Commands

- `bun run build`: TypeScript を esbuild でバンドルして `dist/` 生成
- `bun run check`: Biome lint + format check
- `bun run format`: Biome format

## GitHub Actions

push / pull_request 時に build し、`chrome-website-time-tracker` という artifact 名でダウンロード可能な ZIP を生成します。
