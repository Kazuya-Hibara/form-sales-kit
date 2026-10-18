# フォーム営業キット

いつもの AI (Claude・ChatGPT・Claude Code・Codex) に 1 行貼るだけで使える、フォーム営業の道具です。ヒアリングであなた用に整え、送り先を公開情報から理由付きで選び、一社ずつ文面を書き、(Claude Code・Codex では) ブラウザでの送信と記録まで進めます。

## 使い方
AI のチャット欄に次の 1 行を貼ってください。

```
フォーム営業キットを使います。https://www.automateaugment.com/kits/form-sales-kit/START.md を全文読み (コマンドが使える環境なら curl で取得)、書かれている手順どおりに準備して、終わったら私へのヒアリングから始めてください。
```

- 送信まで任せる: Claude Code / Codex
- 文面まで: Claude / ChatGPT (送信はご自身で)

## 入れ方 (git を使う方)
```
git clone https://github.com/Kazuya-Hibara/form-sales-kit.git ~/form-sales-kit
```
その後、AI に `~/form-sales-kit/START.md` を読ませてください。

## 中身
- `START.md` — AI が最初に読む準備の手順
- `SKILL.md` — 使い方の本体 (Claude Code・Codex・Claude の Skills 形式)
- `engine/` — フォームへの入力・送信・記録を行う小さなプログラム (Node.js + Playwright)
- `examples/` — ヒアリングの雛形と記入例

送り先の一覧・文面・送信の記録は、すべて利用者のパソコンの `~/form-sales-kit/work/` に保存され、作者に送られることはありません。送るかどうか・何を書くかの最終判断と責任は利用者にあります。所属団体の規程 (広告・勧誘のルールなど) がある方は、それに沿ってお使いください。

License: MIT

作成: 株式会社Automate&Augment — https://www.automateaugment.com/ja/form-sales-kit
