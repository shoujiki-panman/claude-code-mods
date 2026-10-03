# claude-code-mods

Claude Codeのmodを2つ置いています。どちらも、入れるだけで動きます。

| mod | できること |
|---|---|
| [limit-meter](./limit-meter) | 利用上限（5時間枠と週の枠）の使った割合とリセットの時刻を、入力欄の上に出します。上限が近づくと右上に知らせが出て、Claudeにも作業を区切るよう伝えます |
| [secret-mask](./secret-mask) | コマンドの結果や読んだファイルに混じったAPIキーやパスワードを、Claudeが読む前に`[MASKED]`に置き換えます |

secret-maskは安全網です。`.env`は、先にClaude Codeの設定でClaudeに読ませないようにしてください。設定の書き方は[secret-maskの説明](./secret-mask/README.md)にあります。

## 入れ方

Claude Code 2.1.287以降で打つのは、次の3行です。

```
/plugin marketplace add shoujiki-panman/claude-code-mods
/plugin install limit-meter@shoujiki-panman-mods
/plugin install secret-mask@shoujiki-panman-mods
```

入れたあと、Claude Codeを起動し直すと読み込まれます。止めるときや外すときの入り口も`/plugin`です。

1回だけ試したいときは、リポジトリを手元に置いて`--plugin-dir`で起動します。

```
git clone https://github.com/shoujiki-panman/claude-code-mods.git
claude --plugin-dir ./claude-code-mods/limit-meter --plugin-dir ./claude-code-mods/secret-mask
```

## 入れる前に

modは隔離されずに、Claude Codeと同じ権限で動きます。中身は`claude plugin validate <フォルダ>`で確かめられます。各modが何に割り込み、何を呼ぶかが一覧で出ます。

| mod | 使うもの |
|---|---|
| limit-meter | 利用上限の数字、環境変数`TZ`と`LIMIT_METER_DEMO`、`/etc/localtime`、`date +%z`の実行（時刻を手元のタイムゾーンで出すため） |
| secret-mask | Claudeに渡る前のコマンドの結果、読んだファイル、添付 |

どちらも、ネットには接続しません。

## テスト

```
claude plugin test ./limit-meter
claude plugin test ./secret-mask
```

## ライセンス

MIT
