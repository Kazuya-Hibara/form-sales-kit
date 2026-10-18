# フォーム営業キット — はじめに (AI が読む手順書)

この文書は、利用者が「フォーム営業キットを使います」と貼った 1 行から、あなた (AI) が読みに来る手順書です。利用者は AI やプログラムに詳しいとは限りません。**この手順のコマンドは利用者に打たせず、あなたが実行してください。** 利用者への説明は「準備しています (1〜3 分)」程度で十分です。準備の途中で、Node.js のインストールや通信・ファイル書き込みの許可を求める画面が出ることがあります。その時は最初に一度だけ「途中で許可を求められたら、内容を見て『許可』を押してください」と伝えます。管理者パスワードが要る時など、利用者の操作が必要な時だけ短く頼みます。

キットの配布元: `https://www.automateaugment.com/kits/form-sales-kit/` (株式会社Automate&Augment)。中身は `SKILL.md` (使い方の本体)、`engine/` (ブラウザでフォームに入力・送信する小さなプログラム)、`examples/` (記入例) です。

## 1. どちらのモードかを決める

- この人のパソコンでコマンドを実行できる (Claude Code・Codex など) → **L モード (送信まで)**。§2 へ。
- 実行できない (ChatGPT・Claude の Web/アプリ) → **W モード (文面まで)**。§3 へ。

## 2. L モードの準備 (Claude Code・Codex)

すでに `~/form-sales-kit/SKILL.md` と `~/form-sales-kit/engine/node_modules` があれば、手順 1〜4 は飛ばして 5 へ。

1. **キットを取得**: `https://www.automateaugment.com/kits/form-sales-kit/form-sales-kit.zip` をダウンロードし、ホームフォルダに展開します (`~/form-sales-kit/` ができます。既存の `~/form-sales-kit/work/` は上書きしません)。
   - macOS / Linux: `curl -fsSL <zipのURL> -o "${TMPDIR:-/tmp}/fsk.zip" && unzip -oq "${TMPDIR:-/tmp}/fsk.zip" -d ~`
   - Windows (PowerShell): `Invoke-WebRequest <zipのURL> -OutFile $env:TEMP\fsk.zip; Expand-Archive -Force $env:TEMP\fsk.zip $HOME`
   - Codex で通信が sandbox に止められたら、通信を許可するよう利用者の承認を求めてください (この準備と送信には外部への通信が必要です)。
2. **Node.js を確認**: `node -v` が 18 以上なら OK。無ければ、その OS の標準の方法で LTS 版を入れます (macOS: Homebrew があれば `brew install node`、無ければ https://nodejs.org の pkg / Windows: `winget install OpenJS.NodeJS.LTS`)。管理者パスワードの入力が必要なら、利用者にその旨だけ伝えて入力してもらいます。
3. **エンジンを準備**: `cd ~/form-sales-kit/engine && npm install --no-audit --no-fund && npx playwright install chromium` (ブラウザ部品の取得に 1〜2 分かかります)。Windows PowerShell 5.1 では `&&` が使えないので、`;` でつなぐか 1 つずつ実行します。
4. **スキルとして登録** (次回から 1 行貼らなくても「フォーム営業」で呼べるように):
   - Claude Code: `~/.claude/skills/form-sales-kit` を `~/form-sales-kit` へのシンボリックリンクにする (Windows はフォルダごとコピー)。
   - Codex: `~/.agents/skills/form-sales-kit` を同様に作る。
   - 既にあれば何もしない。
5. **動作確認**: `node ~/form-sales-kit/engine/bin/kit.mjs doctor` を実行し、`ok: true` を確かめます。作業フォルダ `~/form-sales-kit/work/` が無ければ作られます。うまくいかない時は、エラー文を読んで 1〜2 回直してみて、だめなら利用者に「文面まで (W モード) で始めて、送信の準備は後で」と提案します。
6. `~/form-sales-kit/SKILL.md` を全文読み、その手順に従ってヒアリングから始めます。最初の一言は短く: 「準備ができました。まず、あなたの事務所・会社のことを 3 つだけ教えてください。」のように。

## 3. W モードの準備 (ChatGPT・Claude の Web/アプリ)

1. `https://www.automateaugment.com/kits/form-sales-kit/SKILL.md` を全文読みます。読めない場合は、利用者に「キットのページの『本文をコピー』で SKILL.md を貼ってください」と頼みます。
2. SKILL.md の W モードの手順に従い、ヒアリングから始めます。
3. Claude・ChatGPT の「プロジェクト」機能を使っている利用者には、ヒアリングの最後に「この要約とキットの本文をプロジェクトの指示欄に貼っておくと、次からはすぐ始められます」と一度だけ伝えます。

## 4. 守ること (準備の段階)

- 利用者のパソコンで行うのは、上に書いた取得・展開・インストールと、`~/form-sales-kit/` の中の作業だけです。それ以外の設定やファイルは変えません。
- 利用者の個人情報やパスワードを聞き出したり、どこかへ送ったりしません。キットの作業データは利用者のパソコンの中だけに置きます。
