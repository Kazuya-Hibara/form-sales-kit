# engine — フォーム営業キットの送信エンジン

AI エージェント (Claude Code / Codex) が利用者の PC のシェルから動かす CLI です。判断 (どの会社に送るか・文面・欄の割り当ての修正) はエージェントが担当し、engine はブラウザ操作と送信ガードを決まった手順どおりに実行します。

- 必要なもの: Node 18 以上と Playwright (依存はこれだけ)
- セットアップ: `engine/` で `npm install` → `npx playwright install chromium` → `node bin/kit.mjs doctor`
- 出力: どのコマンドも stdout に JSON を 1 つだけ出します。進み具合のログは stderr に出ます。終了コードは `ok:false` のとき 1、それ以外は 0 です。
- 作業データ: `~/form-sales-kit/work/` (環境変数 `FSK_WORK` で変更可)
  - `config.json` `{ "daily_cap": 10, "min_gap_sec": 30, "headless": true, "send_days": [1,2,3,4,5], "send_hours": [9,17] }` (send_days は 0=日〜6=土、send_hours は JST の [開始, 終了) 時)
  - `ledger.jsonl` 送信台帳 (1 行 1 件。ts は JST の ISO 形式)
  - `suppress.txt` 停止リスト (1 行に 1 件、ドメインかメールアドレス)
  - `shots/` スクリーンショット

## コマンド

| コマンド | すること |
|---|---|
| `doctor` | Node の版、Playwright と chromium の有無、chromium が実際に起動するか、作業フォルダを確認します。作業フォルダと config.json がなければ作ります。`ok:false` のときは `fix` に直し方が入ります。 |
| `find <ホームページURL>` | 同じサイト内の お問い合わせ / 問合せ / contact / inquiry へのリンクをたどり (最大 2 段)、textarea のあるフォームページを探します。入力したページ自体にフォームがあれば、それも候補に入れます。返す値は `form_url` `candidates` `has_captcha` `captcha_kind` `sales_refusal:{found,text}` `embedded` (iframe 埋め込みのフォームなら true) です。 |
| `inspect <フォームURL>` | 欄ごとに `selector` (後から使える CSS セレクタ)・tag/type/name/id・ラベル・placeholder・必須かどうか・選択肢・推定した役割 (`role`) と確からしさ (`confidence`) を返します。分割された電話・郵便番号の欄には `part`/`parts` が付きます。送信ボタン、captcha、営業お断りの有無も返します。 |
| `fill <フォームURL> --values v.json [--map m.json] [--site <HP>] [--company <社名>] [--submit] [--no-wait] [--show]` | 下記を参照してください。 |
| `ledger add --company 社名 --domain d (または --url u) --status s [--note t] [--message-file f]` | 手で送った分 (`sent_manual`) や見送り (`skipped`) を台帳に記録します。 |
| `ledger list [--today] [--domain d] [--limit n]` / `ledger stats [--date YYYY-MM-DD]` | 台帳の行を返します。stats は当日の status 別件数、`sent_today`、`remaining_today` を返します。 |
| `suppress add <ドメイン or メール>` / `suppress list` | 停止リストに追加する / 一覧を返します (配信停止の依頼が来たらすぐ追加してください)。 |

役割 (role): company, company_kana, department, position, name, name_sei, name_mei, kana, kana_sei, kana_mei, email, email_confirm, tel, zip, pref, address, url, subject, inquiry_type, contact_method, message, privacy_agree, other

## fill

- `values.json` は役割→値の対応です (プロフィールの値と、その会社向けの本文)。例:
  `{"company":"…","name":"山田 太郎","kana":"やまだ たろう","email":"…","tel":"03-1234-5678","zip":"164-0001","pref":"東京都","address":"東京都中野区…","url":"…","subject":"…","message":"本文","inquiry_type":"(任意) 選びたい種別"}`
  姓と名、セイとメイ、電話の 3 分割、郵便番号の 2 分割、カタカナ・ひらがな・半角カナの書き分けは engine が行います。
- `map.json` は `{ "<selector>": "値" }` の形で、推定より優先されます。チェックボックスは `true` / `false`、select は値または表示名、ラジオは選択肢の selector に `true` を指定します。
- プライバシーの同意欄にはチェックを入れます。メルマガの申込欄にはチェックを入れません。問い合わせ種別は「その他 / お問い合わせ / ご相談」に近いものを選びます。
- `--submit` を付けないと送信しません。入力してスクリーンショットを撮り、`status:"dry_run"` `ready` `filled` `unfilled_required` `invalid` `submit_button` を返します。
- `--submit` を付けると、送信ボタンを押し、確認画面が出たら「送信する」を押し、完了したかを判定して、送信後のスクリーンショットを撮ります。結果は台帳に自動で記録されます。
  `status` は次のいずれかです (`evidence` に判定の根拠となる文言が入ります)。
  - `submitted` 完了を確認できた (thanks の URL、送信完了やありがとうございましたの文言、CF7 の sent、フォームが消えた)
  - `confirm_unclear` 押したが完了を確認できない (1 社 1 回の判定では「送信済み」として扱います。スクリーンショットを見て人が確認してください)
  - `validation_error` 入力エラー、または必須欄が埋まっていない (この場合はボタンを押していません。`clicked:false`)
  - `captcha` / `sales_refusal` 送信しません
  - `blocked_by_guard` ガードで止めた (`guard` に理由が入ります)
  - `error` サイト側が拒否した、またはその他の失敗
- フォームが外部サービス上にある場合 (form.run、Google フォームなど) は `--site <会社のホームページ>` が必須です。台帳のドメインはこの `--site` で決まります。

## ガード (engine が必ずかけるもの)

- 1 社 1 回: 同じドメイン (サブドメインを含む) が台帳で `submitted` / `confirm_unclear` / `sent_manual` になっていれば送りません (`already_sent`)。
- 停止リスト: suppress.txt にあるドメイン、またはメールアドレスのドメインに一致したら送りません (`suppressed`)。
- 送信の時間帯: JST で `send_days` の曜日・`send_hours` の時間帯の外なら送りません (`outside_send_window`)。
- 日次上限: 今日 (JST) の送信済み件数が `daily_cap` 以上なら送りません (`daily_cap`)。
- 送信の間隔: 前回ボタンを押してから `min_gap_sec` 秒たつまで待ってから押します。`--no-wait` を付けた場合は待たずに `blocked_by_guard` / `min_gap` と `wait_sec` を返します。
- captcha がある、または営業お断りの記載がある場合は送りません。
- 同時に 2 件は送れません。別の送信が実行中なら `another_submit_running` を返します。

## テスト

`npm test` (node:test)。127.0.0.1 のローカル fixture だけを使います。外部への通信は `FSK_BLOCK_EXTERNAL=1` ですべて遮断しています。
