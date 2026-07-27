---
name: calendar
description: "エージェントがカレンダーファイル（.ical / .mycal）を読み書き・編集するためのルールと知識。"
---

# カレンダーファイルの操作ルール

## ファイル形式

Legion のカレンダーは YAML 形式の `.ical` ファイルとしてナレッジに保存される。
内部構造は `Docs/calendar-architecture.md` を参照。

### .ical（単一カレンダー）

```yaml
name: チームカレンダー
timezone: Asia/Tokyo
events:
  - uid: "abc@legion"
    summary: "イベントタイトル"
    start: "2026-07-16T14:00:00"
    end: "2026-07-16T15:00:00"
    allDay: false
    location: "会議室A"
    description: "詳細"
    categories: ["blue"]
    recurrence:
      freq: WEEKLY
      byDay: [MO, WE, FR]
```

### .mycal（複数カレンダー束）

```yaml
name: マイカレンダー一覧
calendars:
  - knowledge/calendars/team.ical
  - knowledge/calendars/personal.ical
```

## 重要なルール

### パスは絶対パス

`.mycal` の `calendars:` に記述するパスは、ナレッジルートからの絶対パスで指定する（例: `knowledge/calendars/team.ical`）。

### 拡張子

`.ical` = 単一カレンダー（YAML）、`.mycal` = カレンダー束（YAML）。
`.ics` = 標準 iCalendar 形式（import/export のみ）。

### 時刻はローカルタイム

時刻は JST（日本標準時）で保存する。UTC ではない。
エクスポート時は `TZID=Asia/Tokyo` が自動付与される。

### UID

各イベントには UUID ベースの `uid` が必要。なければ作成時に自動生成される。

### 繰り返しイベント

- `recurrence` オブジェクトで RRULE を表現する。RRULE 文字列ではない。
- 単一インスタンスの編集/削除は `exceptionDates` に日付を追加し、スタンドアロンイベントを作成する。
- スタンドアロンイベントには `_parentUid` と `_exceptionDate` が付与される（内部用、編集しないこと）。

### カテゴリと色

カテゴリ名から色が自動マッピングされる。
定義済みカテゴリ: `blue`, `red`, `green`, `orange`, `purple`, `cyan`, `gray`

## ファイル操作

### 新規作成

```yaml
# .ical テンプレート
name: カレンダー名
timezone: Asia/Tokyo
prodid: -//Legion//Calendar//EN
events: []
```

```yaml
# .mycal テンプレート
name: カレンダー一覧
calendars: []
```

### 読み取り

GET `/api/knowledge/raw/{path}` → YAML 文字列 → `yaml.parse()` でパース

### 書き込み

PUT `/api/knowledge/raw/{path}` → `yaml.stringify(data)` でシリアライズ

### 削除

DELETE `/api/knowledge/delete/{path}`

## 参考ファイル

- `Docs/calendar-architecture.md` - 完全なリファレンス
- `src/libs/calendar-utils.js` - YAML↔ICS変換、FullCalendarマッピング
- `web-ui/client/src/components/knowledge/FullCalendarViewer.svelte` - カレンダーUI
