// The monkey's vocabulary, by word type. A small hand-typed list for the rehearsal; the real one
// replaces this file and keeps the same shape. Order matters: a word is picked by its position.

export const LEX = {
  DET_ANY: ["the", "my", "thy", "our", "his", "her", "your", "no"],
  DET_SG: ["this", "that", "every", "a", "an"],
  DET_PL: ["these", "those"],
  ADJ: ["sweet", "mad", "noble", "poor", "fair", "old", "false", "true", "bloody", "gentle", "proud", "dead", "merry", "foul", "honest", "royal", "wild", "pale", "golden", "bitter", "holy", "cruel", "weary", "silent", "drunken", "idle", "angry", "empty", "ancient", "unkind", "ugly", "humble", "brave", "tender", "wicked"],
  NOUN_SG: ["king", "crown", "night", "heart", "sword", "fool", "ghost", "dagger", "moon", "lord", "lady", "grave", "storm", "tongue", "monkey", "letter", "devil", "kingdom", "horse", "dream", "witch", "prince", "queen", "hand", "heaven", "world", "name", "word", "purse", "hour", "eye", "enemy", "army", "island", "oath", "uncle", "ear", "orchard", "castle", "banana", "page", "candle", "river", "song", "tower"],
  NOUN_PL: ["kings", "swords", "fools", "ghosts", "daggers", "lords", "ladies", "graves", "tears", "eyes", "dreams", "witches", "knaves", "bones", "stars", "enemies", "apes", "letters", "candles", "pages"],
  PRON_S: ["I", "he", "she", "we", "they", "you", "it"],
  PRON_O: ["me", "thee", "him", "her", "us", "them", "it"],
  V_PAST_T: ["slew", "loved", "kissed", "betrayed", "forgot", "stole", "cursed", "crowned", "poisoned", "mocked", "feared", "sold", "bought", "buried", "forgave", "saw", "found", "lost", "married", "followed", "praised", "burned", "wrote", "hid", "tamed"],
  V_PAST_I: ["wept", "slept", "died", "laughed", "fled", "fell", "rose", "vanished", "sang", "dreamed", "lied", "kneeled", "waited", "danced", "trembled", "whispered"],
  MODAL: ["shall", "will", "must", "may", "would", "could", "cannot", "shall not", "will not"],
  QMODAL: ["shall", "will", "must", "would", "could", "may"],
  V_BASE_T: ["slay", "love", "kiss", "betray", "forget", "steal", "curse", "crown", "poison", "mock", "fear", "sell", "buy", "bury", "forgive", "see", "find", "lose", "marry", "follow", "praise", "burn", "write", "hide", "tame"],
  V_BASE_I: ["weep", "sleep", "die", "laugh", "flee", "fall", "rise", "vanish", "sing", "dream", "lie", "kneel", "wait", "dance", "tremble", "whisper"],
  INTERJ: ["O", "alas", "nay", "come", "hark", "peace", "fie"],
  PREP: ["of", "in", "for", "with", "upon", "against", "without", "before", "beneath", "like"],
  ADV: ["now", "again", "tonight", "forever", "alone", "gladly", "still", "twice", "softly", "madly"],
  CONJ: ["and", "but", "for", "yet", "because", "till", "while"],
};

// Words that start with a vowel letter but not a vowel sound, and the reverse.
export const SOUNDS_LIKE_CONSONANT = ["one", "once", "union", "unicorn", "universe", "use", "useful", "usual", "european"];
export const SOUNDS_LIKE_VOWEL = ["honest", "hour", "heir", "honour", "honor", "honourable"];
