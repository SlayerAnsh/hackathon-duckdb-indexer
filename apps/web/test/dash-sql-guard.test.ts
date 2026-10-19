import { expect, test } from 'bun:test'
import { checkWidgetSql } from '../lib/dash/sql-guard'
import { emptyWidget, parseWidgetPayload } from '../lib/dash/schema'

test('allows read only queries over the public views', () => {
  for (const sql of ['SELECT count(*) FROM entities', 'with t as (select 1 as x) select * from t;',
    "SELECT name, count(*) FROM attributes WHERE value = 'COPY; DROP' GROUP BY 1", '-- note: delete\nSELECT 1',
    'SELECT * FROM entities e JOIN attributes a USING (key) WHERE a.name = \'read_parquet\'',
    "SELECT 'it''s' AS s", 'SELECT updated_at AS "set" FROM entities']) expect(checkWidgetSql(sql)).toBeNull()
})
test('rejects statements other than one SELECT or WITH', () => {
  for (const sql of ['', 'DELETE FROM merged_entities', 'SELECT 1; SELECT 2', 'INSERT INTO live_head VALUES (1)',
    'PRAGMA version', 'SET threads = 1', 'ATTACH \'x.db\'', 'INSTALL httpfs', 'LOAD httpfs', 'CALL pragma_version()',
    'SELECT 1; DROP TABLE base_entities', 'COPY entities TO \'out.csv\'', 'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x'])
    expect(checkWidgetSql(sql)).not.toBeNull()
})
test('rejects file and network access', () => {
  for (const sql of ["SELECT * FROM read_parquet('https://evil/x.parquet')", "SELECT * FROM 'https://evil/x.parquet'",
    "SELECT * FROM read_csv_auto('/etc/passwd')", "SELECT * FROM 'data.csv'", "SELECT * FROM glob('*')",
    "SELECT * FROM parquet_metadata('x')", "SELECT getenv('HOME')", "SELECT * FROM sqlite_scan('a', 'b')"])
    expect(checkWidgetSql(sql)).not.toBeNull()
})

test('widget validation uses the guard by default and permits an injected check', () => {
  const widget = { ...emptyWidget(), name: 'Rows', sql: 'DELETE FROM entities' }
  expect(parseWidgetPayload(widget)).toEqual({ ok: false, error: 'Only one SELECT or WITH query is allowed' })
  expect(parseWidgetPayload(widget, () => null)).toMatchObject({ ok: true })
})

test('tokenizes comments and escaped quotes without hiding SQL tokens', () => {
  for (const sql of ["SELECT '-- DROP; /*'", '/* DELETE; */ SELECT 1; -- DROP',
    'SELECT 1 /* outer /* DELETE */ comment */', 'SELECT "a""set" FROM entities']) {
    expect(checkWidgetSql(sql)).toBeNull()
  }
  for (const sql of ['SELECT 1; /* comment */ SELECT 2', 'SELECT 1;;', 'SELECT 1 /* unfinished',
    "SELECT 'unfinished", 'SELECT "unfinished', 'SELECT 1 /* hidden */ DELETE FROM entities']) {
    expect(checkWidgetSql(sql)).not.toBeNull()
  }
})

test('rejects every specified file access identifier and literal pattern', () => {
  for (const name of ['read_anything', 'parquet_scan', 'iceberg_scan', 'delta_scan', 'sqlite_scan',
    'postgres_scan', 'mysql_scan', 'glob', 'getenv', 'query_table', 'query']) {
    expect(checkWidgetSql(`SELECT ${name.toUpperCase()}('x')`)).not.toBeNull()
  }
  for (const value of ['https://example.com', '/etc/passwd', '~/file', ...['parquet', 'csv', 'tsv',
    'json', 'jsonl', 'ndjson', 'txt', 'db', 'duckdb'].map(ext => `file.${ext.toUpperCase()}`)]) {
    expect(checkWidgetSql(`SELECT '${value}'`)).not.toBeNull()
  }
})
