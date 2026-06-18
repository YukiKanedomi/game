# アセット仕様 & Gemini 発注ガイド

> STRETCH（[仕様書.md](仕様書.md) 参照）のデザイン向上用アセットを、**すべて Gemini で生成**する前提の発注ガイド。
> MVP実装時はコード描画（Canvas図形）で先行し、**完成後にここで定義したアセットへ差し替える**方針。

---

## 1. Gemini 画像生成の特性（2026年6月時点・発注前に必読）

### モデル選択
| モデル | 通称 | 用途 |
|--------|------|------|
| **Gemini 3 Pro Image** | Nano Banana Pro / Nano Banana 2 Pro | **最高品質**。文字描画が綺麗、複雑な編集、最大14枚の参照画像で**キャラ/スタイル一貫性**。→ ロゴ・キャラ・スプライトシートはこれ |
| **Gemini 3.1 Flash Image** | Nano Banana 2 | 高速・安価・量産向け。背景や量の多い差分はこちら |

### 必ず効いてくる制約
1. **真の透過（アルファチャンネル）は生成できない。**
   - 「透明背景で」と頼んでも、**市松模様・白・黒を"描いた"だけのRGB画像**が返る。PNGのαは付かない。
   - → **緑背景 #00FF00 で生成 → 後処理でクロマキー除去**（後述§4）が唯一確実な方法。
2. **アスペクト比は固定セット**：1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 ほか。
   - モバイル縦背景＝**9:16**。スプライト/アイコン単体＝**1:1**。
3. **既定解像度は1K（1024px級）**。Proは高解像度オプションあり。小さいUIアイコンも1Kで作って縮小する方が綺麗。
4. **全画像に SynthID 透かし（不可視）** が入る。ゲーム素材利用は通常問題ないが、存在は認識しておく。
5. **画像内テキストは原則ベイクしない。** 英字短語ならProは綺麗だが、日本語や小さな数字は崩れやすく、後で変更・多言語化できない。
   - → **スコア・ボタン文言・コンボ表示などのテキストは Canvas/CSS でコード描画**。Geminiにはロゴマーク（絵柄）だけ頼む。
6. 細かいテクスチャ/微細パターンは編集でドリフトしやすく、過度に滑らかに均される傾向。→ **フラットでミニマルな絵柄**が相性◎（本ゲームの方針とも一致）。

### 発注プロンプトの基本テンプレ
画像モデルは**英語**の方が安定しやすい。共通で以下を明示する：
- 画風（例: flat vector, minimal, clean, high contrast）
- 主題と構図（中央／全身／真横 など）
- **背景指定**（透過が要るものは "solid pure green background #00FF00, no shadows on background"）
- 透過用には **"add a 2–3px solid white outline around the subject"**（クロマキー時のフチ保護）
- 不要物の排除（"no text, no watermark text, no UI, no extra elements"）
- アスペクト比（APIなら `aspectRatio`、Studio/アプリならプロンプト末尾に明記）

---

## 2. アートディレクション（共通設定）

> ここを毎回プロンプトに含めて**スタイルの一貫性**を担保する。最初に1枚「スタイルボード／キービジュアル」を作り、以降は**参照画像として添付**（Pro の一貫性機能）すると揺れが減る。

### 主人公キャラクター（確定）
ユーザー提供のLINEスタンプ風マスコット（参照画像4枚あり）。
- **丸い黄色のボディ**（グラデで軽く立体感、ぷにっとした柔らかさ）
- **黒の細い線**の手足（棒人間的に細い腕・脚）と、輪郭の黒ライン
- 表情：点目＋小さな口、ほっぺに**オレンジの照れ**が入ることも。とぼけた可愛さ
- **発注時は提供4枚を参照画像として必ず添付**し、"keep this exact character design/colors/line style" と明記してキャラ一貫性を担保する。

### スタイル（毎回プロンプト先頭に付ける `{STYLE}`）
```
STYLE: Flat cartoon sticker style, minimal and modern, a round yellow blob mascot
character with thin black line arms and legs, bold clean black outlines,
simple dot eyes and a small mouth, soft warm shading on the yellow body,
playful and friendly, mobile game art, crisp edges, pop and vivid colors.
Keep the exact character design, colors and line style from the reference images.
```

### パレット（確定：ポップ&ビビッド）
| 用途 | 色 | HEX |
|------|-----|-----|
| 背景・空 | sky blue | `#7FB4E6` |
| 主人公ボディ | golden yellow | `#FFCE1F` |
| 輪郭・手足 | near black | `#1E1E1E` |
| 足場（柱） | coral | `#FF7A4D` |
| アクセント1 | mint | `#4FD0B0` |
| アクセント2 | hot pink/red | `#FF5A6E` |
| UIカード・余白 | cream | `#FFF7E8` |

プロンプトに含める色指定の例：
```
PALETTE: sky blue background #7FB4E6, golden yellow character #FFCE1F,
near-black outlines #1E1E1E, coral platforms #FF7A4D, mint #4FD0B0 and pink #FF5A6E accents.
```

### 舞台（背景世界）
- **MVP＝空・浮き柱**：青空を背景に、宙に浮かぶ柱を渡る。高さ＝落下のリスク感を演出。
- **将来拡張＝カラフルタウン／お菓子の世界**（ユーザー希望）。ステージ進行で世界が変わる収集性も視野。背景・足場アセットを**テーマ差し替え可能な構造**で作る（コード側で画像セットを切替）。

---

## 3. アセット一覧と発注プロンプト

各プロンプトは**そのまま貼って使える英語**。`{STYLE}` は §2 を先頭に付ける想定。

### A. 主人公（黄色ボディの丸マスコット）— 透過必要 ★Pro推奨
**提供4枚を参照画像として添付**し、同一キャラのまま全身・正面〜やや横向きで生成。アニメ用に複数ポーズ。
```
{STYLE}
{PALETTE}
The round yellow blob mascot from the reference images, full body, standing pose,
facing slightly to the right, thin black line arms and legs visible, dot eyes and small mouth,
keep the exact same character design and colors as the references.
Centered. Solid pure green background #00FF00. Add a 2px solid white outline around the character.
No shadow on the background, no text, no extra elements. Square 1:1.
```
追加ポーズ（毎回**同じ参照4枚を添付**）：
- 待機（プレイ前）："...idle standing, blinking, relaxed"
- 渡る歩行："...walking pose, mid-stride, one leg forward"（2〜3コマ作るとアニメ化可）
- パーフェクト喜び："...cheering, arms up, sparkle eyes, happy"
- 落下（失敗）："...falling down, arms flailing up, surprised face"
- 棒の上でバランス："...standing carefully on a thin line, slightly nervous"

### B. 足場/柱（プラットフォーム）— 透過必要
**確定したスタイルボードに準拠**：コーラル色の縦長の柱、上面は**ミントグリーンの草地**、縁に小さな**ピンク/ミントのひし形・芽**の装飾、柔らかい黒輪郭、軽い縦のシェーディング。下端は丸く欠けたような形。
```
{STYLE}
{PALETTE}
A single floating vertical pillar platform for a mobile game, coral colored body #FF7A4D
with soft vertical shading, a flat mint-green grassy top #4FD0B0, a few tiny decorative
pink and mint diamond shapes and small sprouts along the top edge, soft black outline,
rounded chipped bottom. Same art style as the reference key visual.
Centered. Solid pure green background #00FF00. 2px white outline. No text, no shadow on background. 1:1.
```
> 幅違いは後処理スケールで対応可なので基本1種でOK。遠景の薄い柱（半透明・彩度低）は別途 "faded distant pillar, lower saturation" で作る。
中央パーフェクト用マーカー（柱の上に置く小印）も別途：
```
{STYLE}
A tiny glowing target marker, a small bright diamond or dot, for a game platform center.
Solid pure green background #00FF00. 2px white outline. No text. 1:1.
```

### C. 背景（パララックス）— 透過不要・9:16
奥/中/手前の3層を別々に。手前・中景は**緑背景で透過**化、最奥（空）だけ塗りでOK。
```
# 最奥（空・グラデ／透過不要）
{STYLE}
A serene vertical gradient sky background for a mobile game, smooth gradient,
a few simple flat clouds, no characters, no text, no ground. Portrait 9:16.

# 中景（遠くの丘や建物シルエット／緑背景で透過）
{STYLE}
A horizontal band of distant simple hill silhouettes (or city silhouettes), flat shapes,
arranged along the bottom, the rest solid pure green #00FF00 background. No text. 9:16.
```

### D. UIアイコン（音ON/OFF、リトライ、設定など）— 透過必要・1:1
```
{STYLE}
A set of minimal flat UI icons for a mobile game: a sound-on (speaker) icon.
Single icon, centered, simple bold shape. Solid pure green background #00FF00.
2px white outline. No text. 1:1.
```
（speaker / speaker-muted / restart arrow / gear / pause を**1個ずつ**発注。複数同時生成はキャラ揺れ・サイズ不揃いの原因になるため避ける。）

### E. ロゴ/タイトルマーク — ★Pro推奨（文字を入れるなら）
英字短語のみProでベイク可。日本語タイトルや確実性重視なら**絵柄マークだけ**頼みCSSで文字を載せる。
```
{STYLE}
A logo emblem for a casual mobile game about stretching a stick to cross gaps,
a simple iconic mark (a stick bridging two pillars), bold and memorable, no text.
Solid pure green background #00FF00. 2px white outline. 1:1.
```

### F. エフェクト素材（パーフェクトのキラッ、紙吹雪、落下煙）— 透過必要
スプライトシート（4〜6コマ横並び）でProに依頼。
```
{STYLE}
A horizontal sprite sheet, 5 frames in a single row, of a sparkle/star burst effect
growing then fading, evenly spaced, identical size per frame.
Solid pure green background #00FF00. 2px white outline per frame. No text. Wide 16:9.
```
（紙吹雪・落下煙も同形式で。コマ抽出は§4の自動スライス参照。）

### G. コンセプトアート／キービジュアル — ★Pro推奨・透過不要・9:16
**✅ 完成・確定（スタイルボードとして採用）。** これがアセット全体の見た目の基準。
A〜Fのスプライト発注時は**毎回この絵も参照として添付**し「same art style as the reference key visual」と明記する。
（このキービジュアルが確定させた具体仕様：コーラルの柱＋ミントの草地頂部＋ピンク/ミントのひし形装飾、照れほっぺのキャラ、細い黒の棒。→ §3B に反映済み）

**実装には使わず「見た目の目標＝スタイルボード」にする1枚絵。** 提供4枚を参照添付。
これを最初に作り、A〜Fの発注時に毎回この絵も参照として添えると全体の統一感が出る。
```
{STYLE}
{PALETTE}
Key visual for a casual mobile game: the round yellow blob mascot (from references)
standing on top of a floating coral pillar, high up in a bright blue sky with a few flat clouds,
other floating pillars in the distance, a thin stick bridging toward the next pillar.
Cheerful, sense of height and adventure. Game art, no UI, no text. Portrait 9:16.
```

### H. UIモックアップ — ★カンプ専用（実装はCSS/Canvasで再現）★
**そのままアプリに使わない。** レイアウト/雰囲気を決めるための完成イメージ図。
文字は崩れる前提で「位置と雰囲気の確認用」と割り切る（最終文字はコード描画）。
```
{STYLE}
{PALETTE}
A mockup screenshot of a mobile game screen (portrait 9:16) for design reference:
the yellow blob mascot on a coral pillar against a blue sky, a large score number at the top,
a small "BEST" label top-right, a "COMBO x3" badge in the upper-middle area,
clean minimal HUD, rounded cream UI panels. Cute and pop. Portrait 9:16.
```
> 出てきた画像を見て「文字サイズ・余白・HUD配置」を決め、**実物はコードで作り直す**。タイトル画面・結果画面も同様にカンプを作ると判断が速い。

Geminiは緑背景で返ってくるので、**ローカルで緑を抜いてα付きPNGにする**。

### 定石（調査済みベストプラクティス）
1. プロンプトで **背景 `#00FF00`（純緑）** を強く指定（緑はキャラ配色と被りにくく、HSVで精密に抜ける）。
2. **被写体に2–3pxの白フチ**を付けさせる（縁の緑スピル＝色移りのバッファになる）。
3. ローカル処理：
   - **HSVベースで緑を判定**して除去（明度ベースより誤爆が少ない）。
   - 縁の**緑スピル除去（despill）**を併用。
   - スプライトシートは**透明列を検出して自動スライス**（連結した非透明領域＝1コマ）。

### 実装手段（いずれか）
- **FFmpeg**：`colorkey`／`chromakey` + despill フィルタ（CLIで一括処理しやすい）。
- **ImageMagick**：`-fuzz` で緑を透明化（手軽）。
- **Python（Pillow/numpy or OpenCV）**：HSVマスク＋despill＋自動スライスまで自前で組める（最も柔軟）。
- 既存のNano Banana用CLI/プラグインに「グリーンスクリーン→キーイング」自動化機能あり（`-t`相当）。

> MVP実装が固まったら、この後処理を `tools/` にスクリプト化して「Geminiの緑PNGを入れると透過スプライトが出る」パイプラインを用意する想定。

---

## 5. 発注時のチェックリスト

- [ ] §2のSTYLEを先頭に付けたか（一貫性）
- [ ] 透過が要る素材は **緑背景 #00FF00 + 白フチ** を指定したか
- [ ] 透過が**不要**な素材（最奥の空）は塗り背景でよいと割り切ったか
- [ ] アスペクト比は用途に合っているか（縦背景=9:16 / 単体=1:1）
- [ ] 画像内に**テキストをベイクしていない**か（文字はコード描画）
- [ ] キャラの追加ポーズは**同一参照を添付**して頼んだか
- [ ] UIアイコンは**1個ずつ**発注したか
- [ ] 生成後、緑抜き→despill→（シートは）自動スライスを通したか
- [ ] 最終PNGのサイズ・余白・基準点（足元/中心）を統一したか

---

## 6. 当面の進め方（提案）

1. **MVPはコード描画**（図形）で完成させ、面白さを先に確定（指針8：触って調整）。
2. 並行して**パレット確定 → スタイルボード1枚をGeminiで生成**（以降の参照基準）。
3. キャラ → 足場 → エフェクト → 背景 → UI の順で発注・透過処理。
4. アセット差し替えはコード側の描画関数を画像描画に置換するだけで済むよう、MVP実装時に**描画箇所を関数化**しておく。

---

*このガイドはGemini仕様（2026年6月時点）に基づく。モデル更新で透過が直接出力可能になった場合は§1・§4を見直すこと。*
