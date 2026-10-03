import { describe, expect, test } from 'claude-code/testing'

import { mask, maskBlock, noteLine } from '../hooks/secrets'

// Fake keys, spelled in pieces so this file never holds a string that looks like a real one.
const fake = (prefix: string, length: number) => prefix + 'Ab3Xy9'.repeat(Math.ceil(length / 6)).slice(0, length)
const ANTHROPIC = fake('sk-' + 'ant-api03-', 40)
const OPENAI = fake('sk-' + 'proj-', 48)
const GITHUB = fake('gh' + 'p_', 36)
const AWS_ID = 'AK' + 'IA' + 'QWERTYUIOPASDFGH'
const STRIPE = fake('sk_' + 'live_', 24)
const JWT = ['ey' + 'JhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'SflKxwRJSMeKKF2QT4fwpMeJf36P'].join('.')

const masked = (text: string) => mask(text).text

describe('keys known by their shape', () => {
  test('keeps the prefix as a hint and masks the rest', () => {
    expect(masked(`ANTHROPIC_API_KEY=${ANTHROPIC}`)).toBe('ANTHROPIC_API_KEY=sk-ant-[MASKED]')
    expect(masked(`key: ${OPENAI}`)).toBe('key: sk-[MASKED]')
    expect(masked(`GH_TOKEN=${GITHUB}`)).toBe('GH_TOKEN=ghp_[MASKED]')
    expect(masked(`aws_access_key_id = ${AWS_ID}`)).toBe('aws_access_key_id = AKIA[MASKED]')
    expect(masked(`export STRIPE_SECRET_KEY="${STRIPE}"`)).toBe('export STRIPE_SECRET_KEY="sk_live_[MASKED]"')
    expect(masked(`token=${JWT}`)).toBe('token=eyJ[MASKED]')
  })

  test('counts each one', () => {
    expect(mask(`A=${ANTHROPIC}\nB=${OPENAI}`).count).toBe(2)
  })
})

describe('settings whose name says secret', () => {
  test('masks a .env line, as cat prints it and as the Read tool numbers it', () => {
    expect(masked('DB_PASSWORD=hunter22')).toBe('DB_PASSWORD=[MASKED]')
    expect(masked('     3\tDB_PASSWORD=hunter22')).toBe('     3\tDB_PASSWORD=[MASKED]')
    expect(masked('  - POSTGRES_PASSWORD=s3cretpass')).toBe('  - POSTGRES_PASSWORD=[MASKED]')
    expect(masked("AWS_SECRET_ACCESS_KEY='wJalrXUtnFEMI/K7MDENG'")).toBe("AWS_SECRET_ACCESS_KEY='[MASKED]'")
  })

  test('masks a quoted value in JSON, YAML or code', () => {
    expect(masked('"password": "correct horse battery"')).toBe('"password": "[MASKED]"')
    expect(masked("  apiKey: 'abcd1234efgh'")).toBe("  apiKey: '[MASKED]'")
    expect(masked('const dbPassword = "hunter22"')).toBe('const dbPassword = "[MASKED]"')
  })

  test('masks a password in a URL and a bearer token', () => {
    expect(masked('DATABASE_URL=postgres://admin:s3cret@db:5432/app')).toBe(
      'DATABASE_URL=postgres://admin:[MASKED]@db:5432/app',
    )
    expect(masked('Authorization: Bearer abcdefghijklmnop1234')).toBe('Authorization: Bearer [MASKED]')
  })

  test('masks the body of a private key', () => {
    const key = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA', '-----END RSA PRIVATE KEY-----'].join('\n')
    expect(masked(`id_rsa:\n${key}\n`)).toBe('id_rsa:\n-----BEGIN RSA PRIVATE KEY-----[MASKED]\n')
  })
})

describe('what it leaves alone', () => {
  test('the working directory, numbers, switches and references', () => {
    const text = [
      'PWD=/home/user/app',
      'OLDPWD=/home/user',
      'max_tokens=4096',
      'PASSWORD_MIN_LENGTH=8',
      'TOKEN_REFRESH=true',
      'API_KEY=${OPENAI_API_KEY}',
      'SECRET_KEY=<your secret here>',
    ].join('\n')
    expect(mask(text)).toEqual({ text, count: 0 })
  })

  test('code that names a secret without holding one', () => {
    const text = [
      'interface Login { password: string; token?: string }',
      'const apiKey = process.env.OPENAI_API_KEY',
      'const token = await getToken()',
      'tokenizer: "cl100k_base"',
    ].join('\n')
    expect(mask(text)).toEqual({ text, count: 0 })
  })
})

describe('maskBlock', () => {
  test('masks a tool result and tells Claude what happened, under it', () => {
    const { block, count } = maskBlock({ type: 'tool_result', tool_use_id: 't1', content: 'DB_PASSWORD=hunter22' })
    expect(count).toBe(1)
    expect(block.content).toBe(`DB_PASSWORD=[MASKED]\n${noteLine(1)}`)
  })

  test('masks each text block of a tool result made of blocks', () => {
    const { block } = maskBlock({
      type: 'tool_result',
      tool_use_id: 't1',
      content: [{ type: 'text', text: `KEY=${ANTHROPIC}` }],
    })
    expect(block.content).toEqual([
      { type: 'text', text: 'KEY=sk-ant-[MASKED]' },
      { type: 'text', text: noteLine(1) },
    ])
  })

  test('passes a result with nothing to mask through unchanged', () => {
    const result = { type: 'tool_result', tool_use_id: 't1', content: 'total 0' }
    expect(maskBlock(result)).toEqual({ block: result, count: 0 })
  })
})
