/**
 * Interface strings in English and Turkish, with small lookup helpers.
 * Pure data and functions: main.js applies them to the page (data-i18n attributes)
 * and the UI modules call translate() for everything they write.
 */

/** Supported languages; the first one is the default. */
export const LANGUAGES = Object.freeze(['en', 'tr']);

const LOCALES = Object.freeze({ en: 'en-US', tr: 'tr-TR' });

const EN = {
  'app.title': 'Space Shooter',
  'app.tagline': 'Ten scripted waves, a three-phase boss and a combo multiplier that rewards nerve.',
  'action.newGame': 'New game',
  'lang.button': 'TR',
  'lang.label': 'TR – switch to Turkish',
  'stage.label': 'Game field',
  'controls.label': 'Game controls',
  'control.pause': 'Pause',
  'control.resume': 'Resume',
  'control.pauseHint': 'Pause or resume (P)',
  'control.autoFire': 'Auto-fire',
  'control.autoFireHint': 'Keep firing without holding Space (F)',
  'control.sound': 'Sound',
  'control.soundHint': 'Turn sound effects on or off (M)',
  'label.score': 'Score',
  'label.best': 'Best',
  'hud.best': 'Best {score}',
  'hud.multiplier': '×{value}',
  'hud.multiplierLabel': 'Combo multiplier',
  'hud.wave': 'Wave {wave}/{total}',
  'hud.boss': 'Boss',
  'hud.phase': 'Phase {phase}/{total}',
  'hud.lives': 'Ships left: {count}',
  'hud.shield': 'Shield charges: {count}',
  'hud.weapon': '{weapon}, level {level}',
  'weapon.blaster': 'Blaster',
  'weapon.spread': 'Spread',
  'weapon.rapid': 'Rapid',
  'weapon.beam': 'Beam',
  'item.shield': 'Shield',
  'pickup.weapon': '{weapon} up',
  'pickup.shield': 'Shield +1',
  'float.points': '+{points}',
  'banner.wave': 'Wave {wave}',
  'banner.waveClear': 'Wave clear',
  'banner.boss': 'Boss incoming',
  'banner.phase': 'Phase {phase}',
  'banner.bossDown': 'Boss destroyed',
  'banner.lastShip': 'Last ship',
  'keys.move': 'Arrows / WASD',
  'keys.fire': 'Space',
  'keys.autoFire': 'F',
  'keys.pause': 'P / Esc',
  'keys.sound': 'M',
  'keys.start': 'Enter',
  'help.move': 'Move',
  'help.fire': 'Fire',
  'help.autoFire': 'Auto-fire on/off',
  'help.pause': 'Pause',
  'help.sound': 'Sound on/off',
  'help.start': 'Start / play again',
  'help.touch': 'Touch: drag anywhere to fly. The ship copies your finger from a distance and fires on its own.',
  'title.start': 'Start',
  'title.best': 'Best score {score}',
  'pause.title': 'Paused',
  'pause.hint': 'Press P or Esc to resume.',
  'end.gameover': 'Game over',
  'end.victory': 'Victory!',
  'end.gameoverText': 'Your last ship is down. Every run starts again at wave 1.',
  'end.victoryText': 'The boss is down and the sector is clear.',
  'end.newBest': 'New best!',
  'end.stats': 'Wave {wave} · Kills: {kills}',
  'end.bossStats': 'Boss stage · Kills: {kills}',
  'end.again': 'Play again',
  'panel.controls': 'Controls',
  'panel.powerUps': 'Power-ups',
  'panel.spread': 'A fan of shots that widens with every level.',
  'panel.rapid': 'Fast single, twin and triple streams.',
  'panel.beam': 'A continuous ray that burns the nearest target.',
  'panel.shield': 'Absorbs one hit; stacks up to three.',
  'panel.scoring': 'Scoring',
  'panel.combo': 'Kills less than two seconds apart build the multiplier, up to ×8. Getting hit resets it.',
  'panel.lives': 'Losing a ship costs one weapon level.',
  'footer.license': 'MIT',
  'footer.source': 'Source on GitHub',
};

const TR = {
  'app.title': 'Uzay Nişancısı',
  'app.tagline': 'On senaryolu dalga, üç evreli bir ana gemi ve cesareti ödüllendiren bir kombo çarpanı.',
  'action.newGame': 'Yeni oyun',
  'lang.button': 'EN',
  'lang.label': 'EN – İngilizceye geç',
  'stage.label': 'Oyun alanı',
  'controls.label': 'Oyun kontrolleri',
  'control.pause': 'Duraklat',
  'control.resume': 'Sürdür',
  'control.pauseHint': 'Duraklat ya da sürdür (P)',
  'control.autoFire': 'Otomatik ateş',
  'control.autoFireHint': 'Boşluk tuşunu basılı tutmadan ateş et (F)',
  'control.sound': 'Ses',
  'control.soundHint': 'Ses efektlerini aç ya da kapat (M)',
  'label.score': 'Skor',
  'label.best': 'En iyi',
  'hud.best': 'En iyi {score}',
  'hud.multiplier': '×{value}',
  'hud.multiplierLabel': 'Kombo çarpanı',
  'hud.wave': 'Dalga {wave}/{total}',
  'hud.boss': 'Ana gemi',
  'hud.phase': 'Evre {phase}/{total}',
  'hud.lives': '{count} gemi kaldı',
  'hud.shield': 'Kalkan yükü: {count}',
  'hud.weapon': '{weapon}, seviye {level}',
  'weapon.blaster': 'Lazer',
  'weapon.spread': 'Yelpaze',
  'weapon.rapid': 'Seri',
  'weapon.beam': 'Işın',
  'item.shield': 'Kalkan',
  'pickup.weapon': '{weapon} güçlendi',
  'pickup.shield': 'Kalkan +1',
  'float.points': '+{points}',
  'banner.wave': 'Dalga {wave}',
  'banner.waveClear': 'Dalga temizlendi',
  'banner.boss': 'Ana gemi geliyor',
  'banner.phase': 'Evre {phase}',
  'banner.bossDown': 'Ana gemi düştü',
  'banner.lastShip': 'Son gemi',
  'keys.move': 'Oklar / WASD',
  'keys.fire': 'Boşluk',
  'keys.autoFire': 'F',
  'keys.pause': 'P / Esc',
  'keys.sound': 'M',
  'keys.start': 'Enter',
  'help.move': 'Hareket',
  'help.fire': 'Ateş',
  'help.autoFire': 'Otomatik ateş aç/kapat',
  'help.pause': 'Duraklat',
  'help.sound': 'Sesi aç/kapat',
  'help.start': 'Başla / tekrar oyna',
  'help.touch': 'Dokunmatik: uçmak için herhangi bir yerde sürükle. Gemi parmağını uzaktan izler ve kendiliğinden ateş eder.',
  'title.start': 'Başla',
  'title.best': 'En iyi skor {score}',
  'pause.title': 'Duraklatıldı',
  'pause.hint': 'Sürdürmek için P ya da Esc tuşuna bas.',
  'end.gameover': 'Oyun bitti',
  'end.victory': 'Zafer!',
  'end.gameoverText': 'Son gemin de düştü. Her oyun 1. dalgadan yeniden başlar.',
  'end.victoryText': 'Ana gemi düştü, bölge temiz.',
  'end.newBest': 'Yeni rekor!',
  'end.stats': 'Dalga {wave} · {kills} imha',
  'end.bossStats': 'Ana gemi aşaması · {kills} imha',
  'end.again': 'Tekrar oyna',
  'panel.controls': 'Kontroller',
  'panel.powerUps': 'Güçlendirmeler',
  'panel.spread': 'Her seviyede genişleyen bir atış yelpazesi.',
  'panel.rapid': 'Hızlı tekli, ikili ve üçlü atış.',
  'panel.beam': 'En yakın hedefi yakan kesintisiz bir ışın.',
  'panel.shield': 'Bir vuruşu emer; üç taneye kadar birikir.',
  'panel.scoring': 'Puanlama',
  'panel.combo': "İki saniyeden kısa arayla yaptığın imhalar çarpanı ×8'e kadar yükseltir. Vurulursan sıfırlanır.",
  'panel.lives': 'Gemi kaybedince silahın bir seviye düşer.',
  'footer.license': 'MIT',
  'footer.source': "GitHub'da kaynak kodu",
};

/** Every interface string, by language and then by message key. */
export const STRINGS = Object.freeze({ en: Object.freeze(EN), tr: Object.freeze(TR) });

const formatters = {};

/**
 * Turns any value into a supported language code (unknown values give the default, English).
 * @param {unknown} value
 * @returns {'en'|'tr'}
 */
export function normalizeLanguage(value) {
  return LANGUAGES.includes(value) ? value : LANGUAGES[0];
}

/**
 * The language the toggle switches to.
 * @param {string} lang
 * @returns {'en'|'tr'}
 */
export function otherLanguage(lang) {
  return normalizeLanguage(lang) === 'en' ? 'tr' : 'en';
}

/**
 * Looks up a message and fills its {placeholders}. Missing keys fall back to English, then to the key.
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params = {}) {
  const template = STRINGS[normalizeLanguage(lang)][key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Formats a whole number with the language's digit grouping (12,650 / 12.650).
 * @param {string} lang
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(lang, value) {
  const code = normalizeLanguage(lang);
  formatters[code] ??= new Intl.NumberFormat(LOCALES[code], { maximumFractionDigits: 0 });
  return formatters[code].format(Math.round(value));
}
