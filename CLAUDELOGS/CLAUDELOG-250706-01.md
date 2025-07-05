# CLAUDELOG-250706-01

## `2025/07/06 01:32:08 (UTC+9)` - mugisus

**mugisus:** あの、ログをいいかげん古いログファイルに書き込み続けるのをやめてください。

**Claude:** 申し訳ありません。新しい時間のログファイル`CLAUDELOG-250706-01.md`を作成しました。今後は適切な時間帯のファイルにログを記録します。

## `2025/07/06 01:34:19 (UTC+9)` - mugisus

**mugisus:** ファミリー名だけでなくpostscript名も別の配列で返すようにしてほしい。

**Claude:** Rustの`get_system_fonts`関数を更新し、ファミリー名とPostScript名の両方を含む`FontInfo`構造体を返すように変更しました。フロントエンドも対応し、PostScript名をフォールバックとして表示・使用するようになりました。

## `2025/07/06 01:38:48 (UTC+9)` - mugisus

**mugisus:** PostScript名をフォールバックにしても解決しなかった。解決策はあるか。fftもしくはoftと言ったフォントファイルをリンクできれば解決できたりしないか。一案として

**Claude:** はい、フォントファイルを直接リンクすることで解決できる可能性があります。以下の解決策があります：

**1. @font-face with file:// URL**
```css
@font-face {
  font-family: "CustomFontName";
  src: url("file:///System/Library/Fonts/Helvetica.ttc");
}
```

**2. フォントファイルパスを取得するRustコマンド追加**
```rust
#[tauri::command]
fn get_font_file_path(family_name: String) -> Option<String> {
    let source = SystemSource::new();
    if let Ok(family) = source.select_family_by_name(&family_name) {
        if let Some(font_handle) = family.fonts().first() {
            // フォントファイルのパスを取得
            return font_handle.path().map(|p| p.to_string_lossy().to_string());
        }
    }
    None
}
```

**3. 動的@font-face生成**
```typescript
const loadFontWithFile = async (familyName: string) => {
  const filePath = await invoke<string>('get_font_file_path', { familyName });
  if (filePath) {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: "dynamic-${familyName}";
        src: url("file://${filePath}");
      }
    `;
    document.head.appendChild(style);
    return `"dynamic-${familyName}"`;
  }
  return null;
};
```

**4. Tauri Asset Protocol使用**
Tauriのassetプロトコルでローカルフォントファイルにアクセス：
```rust
// tauri.conf.jsonでassetプロトコルを有効化
// フォントファイルをasset://経由でアクセス
```

この方法なら、WebViewの制限を回避してローカルフォントファイルを直接読み込めます。

## `2025/07/06 01:42:28 (UTC+9)` - mugisus

**mugisus:** メモリを大量に消費する危険性は

**Claude:** はい、メモリを大量に消費する危険性があります：

**1. フォントファイル読み込みによるメモリ消費**
- 各フォントファイル：数MB〜数十MB
- 500個のフォント → 数GB消費の可能性
- TrueTypeコレクション（.ttc）は特に大きい

**2. DOM操作によるメモリリーク**
- 動的@font-face作成でstyle要素が蓄積
- ガベージコレクションされない可能性

**3. 対策案**

**遅延読み込み：**
```typescript
const [visibleFonts, setVisibleFonts] = createSignal<string[]>([]);

// スクロール位置に応じて必要なフォントのみ読み込み
createEffect(() => {
  const visible = getVisibleFontIndexes(); // viewport内のインデックス
  loadOnlyVisibleFonts(visible);
});
```

**フォントキャッシュ管理：**
```typescript
const fontCache = new Map<string, boolean>();
const MAX_LOADED_FONTS = 50; // 最大読み込み数制限

const loadFontSafely = (fontName: string) => {
  if (fontCache.size >= MAX_LOADED_FONTS) {
    clearOldestFonts(); // 古いフォントをアンロード
  }
  loadFont(fontName);
};
```

**軽量プレビュー：**
- フォント一覧では名前のみ表示
- クリック時のみフォントファイル読み込み
- プレビューモーダルで詳細表示

**推奨アプローチ：**
システムフォント名での表示を続け、確実に表示されないフォントのみファイル読み込みを使用する選択的なアプローチが安全です。