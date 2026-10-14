import { useEffect, useRef, useState, useCallback } from 'react'

/* ========================================================================
 * えいご（キャラクターが はなす／こたえる れんしゅう）
 * きょうざい：Lesson 1〜3 の たんごと フレーズ
 * ==================================================================== */

// れっすん ごとの たんご・しつもん・こたえの ぶん（きょうざいの ページに あわせて ふやせます）
const LESSONS = [
  {
    id: 'l1',
    title: 'れっすん 1',
    intro: { en: "Let's meet my friends!", ja: 'ともだちを しょうかいするよ！' },
    q: "What's he?",
    qJa: 'このこは なにかな？',
    a: (w) => `He's a ${w.en}.`,
    aJa: (w) => `「${w.ja}」だよ！`,
    blank: "He's a ＿＿＿.",
    words: [
      { id: 'dinosaur', en: 'dinosaur', ja: 'きょうりゅう', emoji: '🦖', mood: 'happy' },
      { id: 'rabbit', en: 'rabbit', ja: 'うさぎ', emoji: '🐰', mood: 'happy' },
      { id: 'superhero', en: 'superhero', ja: 'すーぱーひーろー', emoji: '🦸', mood: 'happy' },
      { id: 'unicorn', en: 'unicorn', ja: 'ゆにこーん', emoji: '🦄', mood: 'happy' },
    ],
  },
  {
    id: 'l2',
    title: 'れっすん 2',
    intro: { en: "Let's get some snacks!", ja: 'おやつを もらおう！' },
    q: 'What do you want?',
    qJa: 'なにが ほしい？',
    a: (w) => `I want some ${w.en}.`,
    aJa: (w) => `「${w.ja}」が ほしいな！`,
    blank: 'I want some ＿＿＿.',
    words: [
      { id: 'fries', en: 'French fries', ja: 'ふらいどぽてと', emoji: '🍟', mood: 'happy' },
      { id: 'gummy', en: 'gummy bears', ja: 'ぐみ', emoji: '🍬', mood: 'happy' },
      { id: 'kale', en: 'kale chips', ja: 'けーるの ちっぷす', emoji: '🥬', mood: 'happy' },
      { id: 'pickles', en: 'pickles', ja: 'ぴくるす', emoji: '🥒', mood: 'happy' },
    ],
  },
  {
    id: 'l3',
    title: 'れっすん 3',
    intro: { en: "Let's try snacks!", ja: 'おやつを たべて みよう！' },
    q: 'How are they?',
    qJa: 'どうかな？',
    a: (w) => `They're ${w.en}.`,
    aJa: (w) => `「${w.ja}」！`,
    blank: "They're ＿＿＿.",
    words: [
      { id: 'bitter', en: 'bitter', ja: 'にがい', emoji: '🍫', mood: 'bitter' },
      { id: 'salty', en: 'salty', ja: 'しょっぱい', emoji: '🥨', mood: 'salty' },
      { id: 'sour', en: 'sour', ja: 'すっぱい', emoji: '🍋', mood: 'sour' },
      { id: 'sweet', en: 'sweet', ja: 'あまい', emoji: '🍪', mood: 'sweet' },
    ],
  },
]
const ALL_WORD_IDS = LESSONS.flatMap((l) => l.words.map((w) => w.id))

// こどもの はつおんが すこし ずれても よみとれるように、ききまちがいやすい ことばも ゆるす
const HOMOPHONES = {
  dinosaur: ['dinosaur', 'dinosaurs', 'dino', 'dinosour', 'dinosaw'],
  rabbit: ['rabbit', 'rabbits', 'rabbet', 'rabbi it'],
  superhero: ['superhero', 'super hero', 'superheroes', 'super heroes', 'superheros'],
  unicorn: ['unicorn', 'unicorns', 'uni corn', 'you need corn'],
  fries: ['french fries', 'french fry', 'french fried', 'fries', 'french freeze'],
  gummy: ['gummy bears', 'gummy bear', 'gummy', 'gummies', 'gummi bears', 'gummy bares'],
  kale: ['kale chips', 'kale chip', 'kale', 'kail', 'kayle', 'cale chips', 'kale ships'],
  pickles: ['pickles', 'pickle', 'pickled', 'pickels'],
  bitter: ['bitter', 'better', 'bidder', 'biter'],
  salty: ['salty', 'salt', 'saltie', 'salti', 'sultry', 'solty'],
  sour: ['sour', 'sower', 'sauer', 'saw', 'sawyer', 'power'],
  sweet: ['sweet', 'suite', 'sweat', 'sweetie'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// こえの せってい（EigoApp から かきかえる）
const PREFS = { voiceURI: '', rate: 0.65 }
const MALE_RE = /\b(aaron|alex|fred|daniel|evan|tom|arthur|oliver|gordon|rishi|reed|ralph|junior|male)\b/i

function pickVoice(voices) {
  if (PREFS.voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === PREFS.voiceURI)
    if (chosen) return chosen
  }
  const en = voices.filter((v) => /^en/i.test(v.lang))
  const males = en.filter((v) => MALE_RE.test(v.name))
  return (
    males.find((v) => /^en[-_]US/i.test(v.lang)) ||
    males[0] ||
    en.find((v) => /^en[-_]US/i.test(v.lang)) ||
    en[0] ||
    null
  )
}

function speakEn(text, opts = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      setTimeout(resolve, Math.max(1200, text.length * 90))
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = opts.rate ?? PREFS.rate
    const v = pickVoice(synth.getVoices())
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
    // おとこの ひとの こえは すこし たかく して、おとこの こらしく する
    u.pitch = v && MALE_RE.test(v.name) ? 1.45 : 1.2
    let done = false
    let timer = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(finish, text.length * 200 + 2500)
    u.onstart = () => opts.onStart && opts.onStart()
    u.onend = finish
    u.onerror = finish
    synth.speak(u)
  })
}

function matchesWord(alts, w) {
  const targets = HOMOPHONES[w.id] || [w.en.toLowerCase()]
  return alts.some((alt) => {
    const text = ` ${alt.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim()} `
    return targets.some((t) => text.includes(` ${t} `))
  })
}

function buildStory(lesson, words) {
  return [
    { en: "Hello! I'm Dino!", ja: 'こんにちは！ ぼく でぃのだよ', mood: 'happy' },
    { ...lesson.intro, mood: 'normal' },
    ...words.flatMap((w) => [
      { en: lesson.q, ja: lesson.qJa, mood: 'ask', emoji: w.emoji },
      { en: lesson.a(w), ja: lesson.aJa(w), mood: w.mood, emoji: w.emoji },
      { en: w.en, ja: `「${w.ja}」の ことだよ`, mood: w.mood, emoji: w.emoji },
    ]),
    { en: "Great! Now it's your turn!", ja: 'じょうずだね！ こんどは きみの ばんだよ', mood: 'cheer' },
  ]
}

// かわいい きょうりゅう キャラクター（SVG・オリジナル）
function Dino({ mood = 'normal', talking = false }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!talking) {
      setOpen(false)
      return undefined
    }
    const id = setInterval(() => setOpen((o) => !o), 150)
    return () => clearInterval(id)
  }, [talking])

  const happyEyes = mood === 'happy' || mood === 'sweet' || mood === 'cheer'
  const squeezeEyes = mood === 'sour' || mood === 'salty'
  const sadEyes = mood === 'bitter'

  let mouth
  if (open) {
    mouth = (
      <g>
        <ellipse cx="120" cy="128" rx="16" ry="11" fill="#5A2A2A" />
        <ellipse cx="120" cy="134" rx="9" ry="5" fill="#FF8A8A" />
      </g>
    )
  } else if (mood === 'sour') {
    mouth = <circle cx="120" cy="127" r="6" fill="#5A2A2A" />
  } else if (mood === 'bitter') {
    mouth = <path d="M104 134 Q120 118 136 134" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
  } else if (mood === 'salty') {
    mouth = (
      <g>
        <path d="M114 126 Q114 146 124 146 Q131 146 131 126 Z" fill="#FF8A8A" />
        <path d="M104 124 Q120 132 136 124" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    )
  } else {
    mouth = <path d="M104 120 Q120 138 136 120" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
  }

  const eye = (cx) => (
    <g>
      <circle cx={cx} cy="92" r="11" fill="#fff" />
      <circle cx={cx} cy="93" r="6" fill="#000" />
      <circle cx={cx + 2} cy="90" r="2" fill="#fff" />
    </g>
  )

  return (
    <div className={`dino${talking ? ' dino-talk' : ''}${mood === 'cheer' ? ' dino-cheer' : ''}`}>
      <svg viewBox="0 0 240 240" role="img" aria-label="でぃの">
        <path d="M168 170 Q222 178 228 138 Q200 152 166 146 Z" fill="#6DBE63" />
        <ellipse cx="120" cy="178" rx="60" ry="50" fill="#7BC96F" />
        <ellipse cx="120" cy="188" rx="36" ry="34" fill="#E3F6CF" />
        <ellipse cx="92" cy="224" rx="20" ry="11" fill="#6DBE63" />
        <ellipse cx="148" cy="224" rx="20" ry="11" fill="#6DBE63" />
        <ellipse cx="66" cy="172" rx="11" ry="17" fill="#6DBE63" transform="rotate(20 66 172)" />
        <ellipse cx="174" cy="172" rx="11" ry="17" fill="#6DBE63" transform="rotate(-20 174 172)" />
        <polygon points="80,52 96,22 110,50" fill="#FFC857" />
        <polygon points="106,44 124,12 142,44" fill="#FF8A65" />
        <polygon points="136,50 152,22 166,54" fill="#FFC857" />
        <circle cx="120" cy="100" r="58" fill="#7BC96F" />
        <circle cx="86" cy="70" r="6" fill="#6DBE63" />
        <circle cx="150" cy="66" r="5" fill="#6DBE63" />
        <circle cx="120" cy="62" r="4" fill="#6DBE63" />
        <circle cx="78" cy="118" r="10" fill="#FF9E9E" opacity="0.75" />
        <circle cx="162" cy="118" r="10" fill="#FF9E9E" opacity="0.75" />
        {happyEyes && (
          <g stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M88 96 Q98 82 108 96" />
            <path d="M132 96 Q142 82 152 96" />
          </g>
        )}
        {squeezeEyes && (
          <g stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M88 84 L106 92 L88 100" />
            <path d="M152 84 L134 92 L152 100" />
          </g>
        )}
        {!happyEyes && !squeezeEyes && (
          <g>
            {eye(98)}
            {eye(142)}
          </g>
        )}
        {sadEyes && (
          <g stroke="#000" strokeWidth="4" strokeLinecap="round">
            <path d="M86 78 L108 84" />
            <path d="M154 78 L132 84" />
          </g>
        )}
        {mouth}
        {mood === 'sour' && <path d="M184 62 Q192 78 184 84 Q176 78 184 62 Z" fill="#8FD3F4" />}
        {mood === 'bitter' && (
          <path d="M176 64 q6 -6 12 0 t12 0" stroke="#8D6E52" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {mood === 'sweet' && (
          <text x="172" y="78" fontSize="28">
            💗
          </text>
        )}
        {mood === 'cheer' && (
          <text x="28" y="70" fontSize="28">
            ⭐
          </text>
        )}
      </svg>
    </div>
  )
}

export default function App() {
  const [lessonId, setLessonId] = useState('l1')
  const [selected, setSelected] = useState(ALL_WORD_IDS)
  const [sub, setSub] = useState('story')
  const [mood, setMood] = useState('happy')
  const [talking, setTalking] = useState(false)
  const [bubble, setBubble] = useState({ en: '', ja: '「はじめる」を おしてね' })
  const [emoji, setEmoji] = useState('')
  const [playing, setPlaying] = useState(false)
  const [stepInfo, setStepInfo] = useState({ k: -1, n: 0 })

  const [answerStyle, setAnswerStyle] = useState('word')
  const [qOrder, setQOrder] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [qPhase, setQPhase] = useState('idle') // idle | asking | ready | listening | right | wrong | done
  const [score, setScore] = useState(0)
  const [heard, setHeard] = useState('')
  const [hintOn, setHintOn] = useState(false)
  const [note, setNote] = useState('')
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState(() => {
    try {
      return localStorage.getItem('eigo_voice') || ''
    } catch (e) {
      return ''
    }
  })
  const [rate, setRate] = useState(() => {
    try {
      return Number(localStorage.getItem('eigo_rate')) || 0.65
    } catch (e) {
      return 0.65
    }
  })

  PREFS.voiceURI = voiceURI
  PREFS.rate = rate

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined
    const synth = window.speechSynthesis
    const load = () => setVoices(synth.getVoices().filter((v) => /^en/i.test(v.lang)))
    load()
    synth.onvoiceschanged = load
    return () => {
      synth.onvoiceschanged = null
    }
  }, [])

  const changeVoice = (uri) => {
    setVoiceURI(uri)
    try {
      localStorage.setItem('eigo_voice', uri)
    } catch (e) {
      /* ignore */
    }
  }
  const changeRate = (r) => {
    setRate(r)
    try {
      localStorage.setItem('eigo_rate', String(r))
    } catch (e) {
      /* ignore */
    }
  }

  const runRef = useRef(0)
  const recRef = useRef(null)
  const triesRef = useRef(0)
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

  const lesson = LESSONS.find((l) => l.id === lessonId)
  const selectedWords = lesson.words.filter((w) => selected.includes(w.id))

  const stopAll = useCallback(() => {
    runRef.current += 1
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (recRef.current) {
      try {
        recRef.current.abort()
      } catch (e) {
        /* ignore */
      }
      recRef.current = null
    }
    setTalking(false)
    setPlaying(false)
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  const say = async (text, { ja = '', mood: m, emoji: em, rate } = {}) => {
    setBubble({ en: text, ja })
    if (m) setMood(m)
    if (em !== undefined) setEmoji(em)
    await speakEn(text, { rate, onStart: () => setTalking(true) })
    setTalking(false)
  }

  const toggleWord = (id) => {
    setSelected((cur) => {
      if (cur.includes(id)) {
        const remain = cur.filter((x) => x !== id)
        return lesson.words.some((w) => remain.includes(w.id)) ? remain : cur
      }
      return [...cur, id]
    })
  }

  const switchLesson = (id) => {
    stopAll()
    setLessonId(id)
    setMood('happy')
    setEmoji('')
    setQPhase('idle')
    setStepInfo({ k: -1, n: 0 })
    setNote('')
    setBubble({ en: '', ja: '「はじめる」を おしてね' })
  }

  const switchSub = (s) => {
    stopAll()
    setSub(s)
    setMood('happy')
    setEmoji('')
    setQPhase('idle')
    setNote('')
    setBubble({ en: '', ja: '「はじめる」を おしてね' })
  }

  /* ---------------------------- おはなし ---------------------------- */

  const playStory = async () => {
    stopAll()
    const id = runRef.current
    const steps = buildStory(lesson, selectedWords)
    setPlaying(true)
    for (let k = 0; k < steps.length; k++) {
      if (runRef.current !== id) return
      setStepInfo({ k, n: steps.length })
      const s = steps[k]
      await say(s.en, { ja: s.ja, mood: s.mood, emoji: s.emoji })
      if (runRef.current !== id) return
      await sleep(350)
    }
    if (runRef.current === id) setPlaying(false)
  }

  /* ---------------------------- もんだい ---------------------------- */

  const currentWord = qOrder[qIdx]

  const askAt = async (order, i) => {
    stopAll()
    const id = runRef.current
    triesRef.current = 0
    setQIdx(i)
    setHeard('')
    setHintOn(false)
    setNote('')
    setQPhase('asking')
    const w = order[i]
    await say(lesson.q, { ja: `${lesson.qJa} こたえて みてね`, mood: 'ask', emoji: w.emoji })
    if (runRef.current === id) setQPhase('ready')
  }

  const startQuiz = () => {
    const order = shuffle(selectedWords)
    setQOrder(order)
    setScore(0)
    askAt(order, 0)
  }

  const judge = async (alts, forced = false) => {
    const w = qOrder[qIdx]
    if (!w) return
    const ok = forced || matchesWord(alts, w)
    const id = runRef.current
    if (ok) {
      setQPhase('right')
      setScore((s) => s + 1)
      await say(`That's right! ${lesson.a(w)}`, { ja: 'せいかい！ すごいね！', mood: 'cheer' })
      return
    }
    triesRef.current += 1
    setQPhase('wrong')
    if (triesRef.current >= 2) {
      setHintOn(true)
      await say(`${lesson.a(w)} Say ${w.en}!`, {
        ja: `こたえは「${w.ja}」だよ。いっしょに いってみよう`,
        mood: w.mood,
      })
    } else {
      await say('Try again!', { ja: 'もういちど いってみよう', mood: 'ask' })
    }
    if (runRef.current === id) setQPhase('ready')
  }

  const listen = async () => {
    // きいている さいちゅうに もういちど おすと、そこで おわる
    if (qPhase === 'listening') {
      try {
        recRef.current && recRef.current.stop()
      } catch (e) {
        /* ignore */
      }
      return
    }
    if (!SR) {
      setNote('この たんまつでは こえの はんてい が つかえません。いえたら「いえたよ！」を おしてね')
      return
    }
    stopAll() // でぃのの こえを とめてから マイクを つかう
    setNote('')
    setHeard('')
    setQPhase('listening')
    await sleep(250)
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 5
    recRef.current = rec
    let got = false
    rec.onresult = (e) => {
      got = true
      const alts = []
      for (const r of e.results) for (let a = 0; a < r.length; a++) alts.push(r[a].transcript)
      setHeard(alts[0] || '')
      judge(alts)
    }
    rec.onerror = (e) => {
      const code = e && e.error
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setNote('まいくが つかえません。せっていで まいくと おんせいにゅうりょくを ゆるしてね。いえたら「いえたよ！」でも すすめるよ')
      } else if (code === 'no-speech') {
        setNote('きこえなかったよ。もういちど おはなししてね')
      } else if (code !== 'aborted') {
        setNote('うまく きこえなかったよ。もういちど おはなししてね')
      }
      setQPhase((p) => (p === 'listening' ? 'ready' : p))
    }
    rec.onend = () => {
      if (!got) setQPhase((p) => (p === 'listening' ? 'ready' : p))
    }
    try {
      rec.start()
    } catch (e) {
      setNote('まいくを はじめられませんでした。もういちど おしてね')
      setQPhase('ready')
    }
  }

  const modelVoice = () => {
    const w = currentWord
    if (!w) return
    stopAll()
    if (qPhase === 'wrong') setQPhase('ready')
    const text = answerStyle === 'phrase' ? lesson.a(w) : w.en
    say(text, { ja: `「${w.ja}」だよ`, mood: w.mood, rate: PREFS.rate * 0.85 })
  }

  const nextQuestion = async () => {
    if (qIdx + 1 < qOrder.length) {
      askAt(qOrder, qIdx + 1)
    } else {
      stopAll()
      setQPhase('done')
      setEmoji('')
      await say('Great job!', { ja: 'よく できました！', mood: 'cheer' })
    }
  }

  const isBusy = qPhase === 'asking'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo-dot" />
        <h1>えいごで あそぼう</h1>
      </header>

      <div className="toggle-row">
        {LESSONS.map((l) => (
          <button
            key={l.id}
            className={lessonId === l.id ? 'active' : ''}
            onClick={() => switchLesson(l.id)}
            disabled={playing || isBusy || qPhase === 'listening'}
          >
            {l.title}
          </button>
        ))}
      </div>

      <div className="toggle-row">
        <button className={sub === 'story' ? 'active' : ''} onClick={() => switchSub('story')}>
          おはなし
        </button>
        <button className={sub === 'quiz' ? 'active' : ''} onClick={() => switchSub('quiz')}>
          もんだい
        </button>
      </div>

      {/* ステージ：キャラクターと ふきだし */}
      <section className="stage">
        <div className="bubble">
          {bubble.en && <div className="bubble-en">{bubble.en}</div>}
          {sub === 'quiz' && answerStyle === 'phrase' && qPhase !== 'idle' && qPhase !== 'done' && (
            <div className="bubble-en bubble-blank">{lesson.blank}</div>
          )}
          {bubble.ja && <div className="bubble-ja">{bubble.ja}</div>}
        </div>
        <div className="stage-row">
          <Dino mood={mood} talking={talking} />
          {emoji && (
            <div className="food" key={emoji}>
              {emoji}
            </div>
          )}
        </div>
      </section>

      {sub === 'story' && (
        <section className="card">
          <p className="section-title">でぃのと おはなし</p>
          <p className="hint-text">でぃのが たべものを みて はなします。きいて まねしてみよう。</p>
          {playing && (
            <div className="dots">
              {Array.from({ length: stepInfo.n }).map((_, i) => (
                <span key={i} className={`dot${i <= stepInfo.k ? ' on' : ''}`} />
              ))}
            </div>
          )}
          <div className="button-row">
            <button className="btn-primary" onClick={playStory} disabled={playing}>
              {stepInfo.k >= 0 && !playing ? 'もういちど' : 'はじめる'}
            </button>
            <button className="btn-secondary" onClick={() => { stopAll(); setMood('happy') }} disabled={!playing}>
              とめる
            </button>
          </div>
        </section>
      )}

      {sub === 'quiz' && (
        <section className="card">
          <p className="section-title">でぃのの しつもん</p>
          <div className="toggle-row">
            <button
              className={answerStyle === 'word' ? 'active' : ''}
              onClick={() => setAnswerStyle('word')}
              disabled={isBusy || qPhase === 'listening'}
            >
              たんごで こたえる
            </button>
            <button
              className={answerStyle === 'phrase' ? 'active' : ''}
              onClick={() => setAnswerStyle('phrase')}
              disabled={isBusy || qPhase === 'listening'}
            >
              ぶんで こたえる
            </button>
          </div>

          {(qPhase === 'idle' || qPhase === 'done') && (
            <div className="button-row">
              {qPhase === 'done' && <p className="score-line">⭐ {score} / {qOrder.length}　ぜんぶ できたね！</p>}
              <button className="btn-primary" onClick={startQuiz}>
                {qPhase === 'done' ? 'もういちど' : 'はじめる'}
              </button>
            </div>
          )}

          {qPhase !== 'idle' && qPhase !== 'done' && (
            <>
              <p className="hint-text">
                {qIdx + 1} / {qOrder.length} もんめ　⭐ {score}
                {hintOn && currentWord ? `　ヒント：${currentWord.ja}` : ''}
              </p>

              {qPhase !== 'right' && (
                <div className="mic-area">
                  <button
                    className={`mic-btn${qPhase === 'listening' ? ' listening' : ''}`}
                    onClick={listen}
                    aria-label="おはなしする"
                  >
                    🎤
                  </button>
                  <span className="mic-label">{qPhase === 'listening' ? 'きいているよ…（もういちど おすと おわり）' : 'おして おはなしする'}</span>
                </div>
              )}

              {heard && qPhase !== 'right' && <p className="hint-text">きこえた ことば：{heard}</p>}
              {note && <p className="hint-text">{note}</p>}
              {!SR && (
                <p className="hint-text">
                  この たんまつでは こえの はんてい が つかえません。いえたら「いえたよ！」を おしてね。
                </p>
              )}

              <div className="button-row">
                {qPhase === 'right' ? (
                  <button className="btn-primary" onClick={nextQuestion}>
                    つぎへ
                  </button>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={modelVoice} disabled={isBusy || qPhase === 'listening'}>
                      おてほんを きく
                    </button>
                    <button className="btn-yellow" onClick={() => judge([], true)} disabled={qPhase === 'listening'}>
                      いえたよ！
                    </button>
                  </>
                )}
                {hintOn && qPhase !== 'right' && (
                  <button className="btn-ghost" onClick={nextQuestion}>
                    つぎへ とばす
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* たんご えらび */}
      <section className="card">
        <p className="section-title">たんごを えらぶ</p>
        <p className="hint-text">あそびたい たんごを さわって えらんでね（ひとつは のこります）。</p>
        <div className="word-grid">
          {lesson.words.map((w) => (
            <button
              key={w.id}
              className={`word-card${selected.includes(w.id) ? ' selected' : ''}`}
              onClick={() => toggleWord(w.id)}
              disabled={playing || isBusy || qPhase === 'listening'}
            >
              <span className="word-emoji">{w.emoji}</span>
              <span className="word-en">{w.en}</span>
              <span className="word-ja">{w.ja}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="section-title">こえの せってい</p>
        <div className="toggle-row">
          {[
            ['とても ゆっくり', 0.5],
            ['ゆっくり', 0.65],
            ['ふつう', 0.85],
          ].map(([label, r]) => (
            <button key={r} className={rate === r ? 'active' : ''} onClick={() => changeRate(r)}>
              {label}
            </button>
          ))}
        </div>
        {voices.length > 0 && (
          <select className="voice-select" value={voiceURI} onChange={(e) => changeVoice(e.target.value)}>
            <option value="">おまかせ（おとこの こに ちかい こえ）</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}（{v.lang}）
              </option>
            ))}
          </select>
        )}
        <div className="button-row">
          <button
            className="btn-secondary"
            onClick={() => say("Hello! I'm Dino!", { ja: 'こえを きいてみよう', mood: 'happy' })}
          >
            こえを きいてみる
          </button>
        </div>
        <p className="hint-text">
          えらべる こえは たんまつに よって ちがいます。ほんものの おとこのこの こえは ないので、おとこの ひとの こえを すこし たかく して つかっています。
        </p>
      </section>
    </div>
  )
}
