えいごで あそぼう
でぃの（きょうりゅう）と えいごで あそぶ アプリです（React + Vite）。
きのう
おはなし：でぃのが えいごで はなす（くちパク・ひょうじょう つき）
もんだい：「What do you want?」などと きかれて、こえで こたえる（Web Speech API）
れっすん 1〜3 の たんご・フレーズ（`LESSONS` に データを たすと ふやせます）
こえの せってい：はなす はやさ（とても ゆっくり／ゆっくり／ふつう）と こえの えらびかた
うごかす
```bash
npm install
npm run dev
```
Vercel
GitHub に push して、Vercel で Import（Framework: Vite）。環境変数は いりません。
マイクについて
HTTPS（Vercel）か localhost でのみ うごきます
iPhone / iPad：「せってい > Siri」と「キーボード > 音声入力」を オンに、Safari で マイクを ゆるす
ホーム画面に 追加した アプリでは 音声認識が つかえないことが あります。その ときは「いえたよ！」ボタンで すすめます
