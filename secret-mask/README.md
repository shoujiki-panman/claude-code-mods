# secret-mask

コマンドの結果や読んだファイルに混じったAPIキーやパスワードを、Claudeが読む前に`[MASKED]`に置き換えるmodです。

```
OPENAI_API_KEY=sk-[MASKED]
DB_PASSWORD=[MASKED]
DATABASE_URL=postgres://app:[MASKED]@localhost:5432/shop
MAX_TOKENS=4096
```

## 伏せるもの

| 種類 | 例 |
|---|---|
| 形で分かるキー | Anthropic、OpenAI、GitHub、AWSのアクセスキーID、Slack、GoogleのAPIキー、Stripe、JWT |
| 名前が秘密を表す設定 | `.env`や`export`の`DB_PASSWORD=...`、JSONやYAMLの`"password": "..."` |
| URLに入ったパスワード | `postgres://user:...@host` |
| 認証のヘッダー | `Authorization: Bearer ...` |
| 秘密鍵 | `-----BEGIN ... PRIVATE KEY-----`から`END`まで |

キーは見分けがつくよう、`sk-`や`ghp_`のような頭の部分だけ残します。伏せたときは、結果の最後に「値を読まずに使う方法を選んで」という一文を添えて、Claudeに伝えます。

## 伏せないもの

`PWD`、`max_tokens=4096`のような数字、`true`のような切り替え、`${OPENAI_API_KEY}`のような参照は伏せません。`password: string`のような型や、`process.env.API_KEY`のようなコードもそのまま渡します。

## 気をつけること

- 伏せるのは、Claude（AI）に届く分です。画面の表示と、手元に保存される会話の記録には、元の出力が残ります
- 自分で打った頼みごとは伏せません。キーを貼り付けて頼んだ場合は、そのまま届きます
- 形の決まっていない秘密は見逃すことがあります。名前に秘密を表す言葉がない設定に入った値などです。安全網として使ってください
