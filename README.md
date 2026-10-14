# ぬりえめーかー

すきな しゃしんを、その場で ぬりえに できる アプリです（React + Vite）。

## いまの きのう（今回の範囲）
- がぞうの よみこみ（png / jpg / HEIC / HEIF）
- カメラでの さつえい
- えらんだ がぞうを もとの サイズの まま かくにん
- がぞうの きょうかいせんを くろい せんに し、それ いがいを 白に する「ぬりえ か」
- はば1mm前後の こまかい／ふくざつな せんを 1本の せんに まとめる かんい化（しきい値と ふとさは スライダーで ちょうせい可）
- ぬりえの なかを タップして いろを ぬる（バケツ塗り）／ もどす／ ぜんぶ けす
- できた がぞうを 端末に 保存（ダウンロード）

## えいごで あそぼう（追加機能）
教材のれっすん1〜3で遊べます。
- れっすん1：What's he? / He's a superhero!（dinosaur, rabbit, superhero, unicorn）
- れっすん2：What do you want? / I want some pickles.（French fries, gummy bears, kale chips, pickles）
- れっすん3：How are they? / They're salty.（bitter, salty, sour, sweet）
新しい れっすんは `LESSONS` 配列にデータを足すだけで増やせます。
- おはなし：恐竜キャラ「でぃの」が英語で話しかける（口パク・表情アニメ付き）
- もんだい：「How are they?」と質問 → 声で答える（Web Speech APIで判定。単語/文を選べる）
- たんごを えらぶ：練習する単語を選択
- 外部ライブラリ追加なし。音声はブラウザ標準の読み上げ・音声認識（iPhoneはSafariの音声入力が有効な場合に判定可。使えない場合は「いえたよ！」ボタン）

Vercel Blobを つかった「アプリ内保存・再生」は、この後の フェーズで 追加します。

## ろーかるで うごかす

```bash
npm install
npm run dev
```

`npm install` は初回だけ必要です。ネットワークにつながる環境で実行してください。

## GitHub / Vercel への 登録

1. このフォルダを 新しい GitHub リポジトリに push
2. Vercel で "Import Project" → その リポジトリを 選択
3. Framework Preset は自動で "Vite" が検出されます（Build Command: `npm run build` / Output: `dist`）
4. そのまま Deploy で OK（環境変数は今のところ不要です）

## つかっている ライブラリ
- [heic2any](https://github.com/alexcorvi/heic2any)（MIT）: iPhoneの HEIC/HEIF がぞうを ブラウザで JPEG に 変換
- React / Vite 本体のみ。UIコンポーネントは自作（外部UIライブラリなし）

## 技術メモ（画像処理のしくみ）
1. Canvas に画像を描画し、最大 1100px 程度に縮小（速度優先。元画像は別途そのままのサイズで確認可能）
2. グレースケール化 → 3x3ボックスブラー → Sobelフィルタでエッジ強度を計算
3. スライダーの「しきい値」で二値化（線 / 線でない）
4. 「ふとさ」スライダーの mm値を画面96dpi換算のpx半径に変換し、モルフォロジーのclosing（膨張→収縮）で近接する細かい輪郭をひとまとまりにする
5. Zhang–Suen細線化アルゴリズムで、まとまった輪郭を1pxの1本線に変換
6. 白背景レイヤー・ぬり色レイヤー・線画レイヤー(透過)の3層をCanvas合成して表示。バケツ塗りは線を1px膨張させた「壁」を境界にフラッドフィルすることで、線からの色漏れを防止

「1mm」はプリント時の実寸ではなく、画面解像度を96dpiと仮定した目安の変換です。将来的に画像のDPI情報や出力サイズに応じた調整も可能です。
