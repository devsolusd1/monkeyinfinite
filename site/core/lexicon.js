// The monkey's vocabulary, by word type: the large hand-typed list, in the flavour of the plays of
// Shakespeare. Same shape as the rehearsal list it replaces. Order matters: a word is picked by its position.
//
// What each list has to obey so that the grammar stays grammatical:
//   NOUN_SG   singular countable nouns only (they follow "a", "an", "every", "this")
//   NOUN_PL   plural nouns only
//   ADJ       plain adjectives that sit before a noun; no comparatives
//   V_PAST_T  simple past, takes a person or a thing as its object; V_BASE_T holds the same verbs, same order
//   V_PAST_I  simple past, needs no object; V_BASE_I holds the same verbs, same order. A verb is in one pair only
//   ADV       adverbs that can end a clause
//   PREP      take a noun phrase or "me/thee/him"; CONJ join two full clauses; INTERJ open a sentence
// A word whose first letter misleads about "a" or "an" must be in one of the two lists at the bottom.
// Words are kept short on purpose: a page of 150 of them has to fit in one memo.

export const LEX = {
  DET_ANY: ["the", "my", "thy", "our", "his", "her", "your", "no"],
  DET_SG: ["this", "that", "every", "a", "an"],
  DET_PL: ["these", "those"],
  ADJ: [
    "sweet", "mad", "noble", "poor", "fair", "old", "false", "true", "bloody", "gentle", "proud", "dead", "merry", "foul", "honest", "royal", "wild", "pale",
    "golden", "bitter", "holy", "cruel", "weary", "silent", "drunken", "idle", "angry", "empty", "ancient", "unkind", "ugly", "humble", "brave", "tender", "wicked",
    "good", "bad", "great", "small", "little", "big", "tall", "short", "long", "high", "low", "deep", "wide", "thin", "lean", "young", "new", "late",
    "dark", "bright", "dim", "green", "blue", "grey", "purple", "scarlet", "silver", "iron", "wooden", "cold", "warm", "cool", "dry", "icy", "dank",
    "soft", "rough", "smooth", "sharp", "dull", "keen", "heavy", "light", "hollow", "full", "plain", "rich", "dear", "rare", "strange", "odd", "open",
    "broken", "stolen", "forgotten", "fallen", "rotten", "frozen", "hidden", "kind", "wise", "foolish", "clever", "cunning", "sly", "bold", "shy", "coy", "pert", "wry",
    "meek", "mild", "calm", "grave", "grim", "stern", "fierce", "vile", "base", "mean", "vain", "greedy", "lazy", "jealous", "loyal", "fickle", "valiant", "craven",
    "timid", "rash", "rude", "saucy", "haughty", "lowly", "pure", "guilty", "sacred", "wretched", "woeful", "sad", "sullen", "gloomy", "glum", "jolly", "happy", "glad",
    "nimble", "spry", "hale", "quick", "swift", "slow", "drowsy", "sleepy", "lovely", "pretty", "ghastly", "ghostly", "deadly", "mortal", "eternal", "sick", "ill", "weak",
    "frail", "feeble", "giddy", "hungry", "tipsy", "numb", "wan", "gaunt", "puny", "huge", "vast", "tiny", "wee", "stout", "plump", "round", "crooked", "steep",
    "fine", "grand", "famous", "mighty", "strong", "stormy", "misty", "dusty", "muddy", "thorny", "fiery", "starry", "moonlit", "murky", "sour", "stale", "fresh", "ripe",
    "raw", "rank", "hairy", "shaggy", "cheeky", "impish", "noisy", "quiet", "lonely", "lone", "last", "first", "regal", "magic", "fatal", "tragic", "comic", "solemn",
    "bleak", "drab", "dire", "dour", "dread", "shabby", "ragged", "velvet", "rosy", "unjust", "simple", "mere", "sham", "fond", "sudden", "brief", "witless", "lucky",
    "tame", "free", "safe", "smug", "daft", "eager", "easy", "able", "apt", "airy", "ashen", "oaken", "awful", "absurd", "antic", "eerie", "elfin", "evil",
    "inky", "ivory", "unholy", "untrue", "unwise", "utter", "unruly", "useful", "usual", "unique", "star-crossed", "green-eyed", "lily-livered",
  ],
  NOUN_SG: [
    "king", "crown", "night", "heart", "sword", "fool", "ghost", "dagger", "moon", "lord", "lady", "grave", "storm", "tongue", "monkey", "letter", "devil", "kingdom",
    "horse", "dream", "witch", "prince", "queen", "hand", "heaven", "world", "name", "word", "purse", "hour", "eye", "enemy", "army", "island", "oath", "uncle",
    "ear", "orchard", "castle", "banana", "page", "candle", "river", "song", "tower",
    // the court, the town and the players
    "duke", "earl", "knight", "squire", "herald", "jester", "clown", "tyrant", "traitor", "villain", "rogue", "knave", "thief", "pirate", "rebel", "spy", "soldier", "guard",
    "servant", "maid", "nurse", "cook", "baker", "smith", "merchant", "sailor", "doctor", "judge", "hermit", "saint", "angel", "wizard", "giant", "hero", "coward",
    "liar", "miser", "beggar", "poet", "bard", "player", "actor", "piper", "clerk", "scribe", "critic", "sage", "seer", "father", "mother", "brother", "sister", "son",
    "daughter", "husband", "wife", "aunt", "twin", "widow", "bride", "friend", "foe", "rival", "lover", "suitor", "master", "man", "heir", "heiress", "usurper", "exile",
    "outlaw", "oaf", "ogre", "elf", "imp", "goblin", "dragon", "beast", "mob", "varlet", "wretch", "typist", "gravedigger", "apothecary", "playwright",
    // beasts, birds and crawling things
    "ape", "baboon", "chimp", "steed", "mule", "dog", "hound", "cat", "mouse", "rat", "bat", "owl", "crow", "raven", "dove", "lark", "swan", "eagle",
    "hawk", "goose", "duck", "hen", "pig", "boar", "sheep", "lamb", "ewe", "ram", "goat", "cow", "bull", "ox", "deer", "stag", "hare", "fox",
    "wolf", "bear", "lion", "tiger", "snake", "asp", "toad", "frog", "newt", "snail", "worm", "spider", "fly", "flea", "moth", "bee", "wasp", "ant",
    "fish", "whale", "eel", "crab", "oyster", "unicorn", "nightingale", "shrew",
    // the body
    "head", "face", "nose", "mouth", "tooth", "fang", "tusk", "jaw", "lip", "tail", "paw", "claw", "wing", "horn", "bone", "skull", "finger", "thumb",
    "fist", "arm", "leg", "foot", "knee", "elbow", "throat", "belly", "beard", "brow", "toe", "corpse", "wound", "scar", "wart", "tear", "sigh", "voice",
    "shadow", "soul", "mind",
    // things
    "knife", "blade", "axe", "spear", "arrow", "shield", "drum", "lute", "harp", "flute", "pipe", "bell", "mask", "wig", "cloak", "cape", "hood", "gown",
    "robe", "veil", "glove", "boot", "shoe", "hat", "ring", "jewel", "pearl", "chain", "casket", "coffin", "tomb", "urn", "ducat", "ransom", "debt", "gift",
    "scroll", "book", "tome", "quill", "pen", "seal", "riddle", "secret", "vow", "curse", "spell", "potion", "poison", "vial", "cup", "goblet", "jug",
    "keg", "barrel", "cauldron", "hearth", "fire", "flame", "ember", "torch", "mirror", "door", "gate", "key", "wall", "path", "chair", "table", "broom", "rope",
    "wand", "staff", "anvil", "cart", "spade", "raft", "mast", "handkerchief", "typewriter", "ribbon", "inkwell", "hourglass", "puppet",
    // sky, land and sea
    "sun", "star", "sky", "cloud", "wind", "gale", "tempest", "flood", "tide", "wave", "sea", "ocean", "lake", "pond", "brook", "shore", "cliff", "cave",
    "cove", "isle", "rock", "stone", "hill", "heath", "glen", "vale", "jungle", "forest", "wood", "tree", "oak", "willow", "yew", "branch", "twig", "leaf",
    "vine", "thorn", "rose", "lily", "flower", "acorn", "apple", "plum", "fig", "coconut", "cake", "pie", "feast", "egg", "peel", "nest", "den", "lair",
    // places
    "garden", "barn", "mill", "hut", "house", "inn", "tavern", "crypt", "pyre", "city", "town", "ship", "boat", "sail", "anchor", "oar", "palace", "court",
    "throne", "hall", "arch", "cell", "jail", "dungeon", "cage", "moat", "tent", "balcony", "realm", "empire", "stage", "playhouse", "globe", "scene", "act", "play",
    "zoo",
    // times, troubles and the writing itself
    "day", "winter", "dawn", "frost", "mist", "omen", "fate", "fortune", "doom", "plot", "ruse", "trick", "jest", "joke", "pun", "quip", "lie", "truth",
    "tale", "story", "myth", "fable", "poem", "sin", "murder", "duel", "feud", "brawl", "fray", "riot", "truce", "war", "death", "life", "love", "idea",
    "wish", "whim", "mood", "hope", "fear", "grief", "woe", "rage", "joy", "fever", "plague", "folly", "error", "quest", "prayer", "plea", "trial", "tragedy",
    "comedy", "soliloquy", "sonnet", "verse", "rhyme", "ode", "dirge", "knell", "jig", "comma", "typo", "blot", "folio", "exit", "cue", "troop", "thing", "end",
  ],
  NOUN_PL: [
    "kings", "swords", "fools", "ghosts", "daggers", "lords", "ladies", "graves", "tears", "eyes", "dreams", "witches", "knaves", "bones", "stars", "enemies", "apes", "letters",
    "candles", "pages",
    "queens", "princes", "dukes", "earls", "knights", "jesters", "clowns", "traitors", "villains", "rogues", "thieves", "pirates", "spies", "soldiers", "guards", "maids", "cooks", "bards",
    "saints", "angels", "devils", "giants", "heroes", "liars", "poets", "actors", "fathers", "mothers", "sisters", "sons", "wives", "twins", "friends", "foes", "lovers", "men",
    "heirs", "elves", "imps", "ogres", "oafs", "monkeys", "baboons", "chimps", "horses", "dogs", "cats", "mice", "rats", "bats", "owls", "crows", "ravens", "doves",
    "larks", "swans", "geese", "hens", "pigs", "wolves", "bears", "lions", "tigers", "snakes", "toads", "frogs", "worms", "flies", "moths", "bees", "ants", "eels",
    "whales", "dragons", "beasts", "hands", "hearts", "teeth", "fangs", "feet", "wings", "claws", "tails", "paws", "lips", "ears", "skulls", "wounds", "sighs", "kisses",
    "crowns", "knives", "arrows", "drums", "bells", "masks", "wigs", "boots", "shoes", "rings", "jewels", "chains", "ducats", "debts", "gifts", "books", "quills", "riddles",
    "secrets", "oaths", "vows", "curses", "spells", "potions", "cups", "urns", "tombs", "doors", "gates", "keys", "walls", "ships", "castles", "towers", "inns",
    "forests", "caves", "seas", "isles", "moons", "trees", "oaks", "branches", "leaves", "vines", "thorns", "roses", "lilies", "flowers", "apples", "plums", "figs", "bananas",
    "cakes", "pies", "eggs", "nests", "storms", "gales", "winds", "waves", "nights", "days", "years", "hours", "songs", "sonnets", "rhymes", "odes", "plays", "tales",
    "myths", "lies", "jests", "puns", "tricks", "plots", "wars", "sins", "fears", "hopes", "joys", "woes", "whims", "wishes", "words", "names", "omens", "cues",
    "tidings", "revels", "ashes", "riches", "spoils", "typewriters", "typos", "cattle",
  ],
  PRON_S: ["I", "he", "she", "we", "they", "you", "it"],
  PRON_O: ["me", "thee", "him", "her", "us", "them", "it"],
  V_PAST_T: [
    "slew", "loved", "kissed", "betrayed", "forgot", "stole", "cursed", "crowned", "poisoned", "mocked", "feared", "sold", "bought", "buried", "forgave", "saw", "found", "lost",
    "married", "followed", "praised", "burned", "wrote", "hid", "tamed",
    "killed", "struck", "stabbed", "hated", "robbed", "chased", "caught", "kept", "held", "heard", "knew", "met", "left", "took", "sent", "brought", "shook", "broke",
    "tore", "cut", "bit", "ate", "drank", "watched", "eyed", "blamed", "shamed", "scorned", "wooed", "wed", "served", "obeyed", "ruled", "saved", "healed", "cured",
    "fed", "washed", "drew", "carved", "built", "bound", "freed", "caged", "drowned", "hunted", "haunted", "fought", "beat", "kicked", "hurt", "harmed", "vexed",
    "hexed", "fooled", "bribed", "paid", "hired", "wanted", "missed", "mourned", "pitied", "envied", "trusted", "doubted", "tempted", "charmed", "hailed", "blessed", "banished", "ousted",
    "seized", "spared", "avenged", "defied", "denied", "judged", "tried", "doomed", "mended", "smote", "roasted", "peeled", "plucked", "tickled", "hugged", "taught", "read", "played",
    "cast", "typed", "signed", "sealed", "copied", "bore", "wore", "raised", "threw", "tossed", "hurled", "baked", "hit", "stung", "woke", "led", "shunned", "sought",
    "chose", "won", "crushed", "asked", "warned", "aided", "helped", "adored", "amused", "scared", "stunned", "cheered", "booed", "stopped", "ended", "armed", "chewed", "swept",
    "chided", "beheld", "heeded", "erased", "juggled", "aped", "echoed", "quoted", "patted", "marked",
  ],
  V_PAST_I: [
    "wept", "slept", "died", "laughed", "fled", "fell", "rose", "vanished", "sang", "dreamed", "lied", "kneeled", "waited", "danced", "trembled", "whispered",
    "smiled", "sighed", "howled", "roared", "cried", "sobbed", "yawned", "snored", "dozed", "blushed", "fainted", "swooned", "crept", "walked", "ran", "swam", "sailed", "flew",
    "leaped", "hopped", "climbed", "swung", "spun", "roamed", "strayed", "stayed", "stood", "sat", "bowed", "nodded", "winked", "stared", "gazed", "spoke", "raved", "mused",
    "chattered", "gibbered", "hooted", "hissed", "crowed", "bayed", "hummed", "prayed", "begged", "swore", "jested", "giggled", "grinned", "sulked", "moped", "hoped", "bled", "feasted",
    "dined", "rested", "awoke", "lived", "faded", "sank", "glowed", "shone", "raged", "rotted", "bloomed", "grew", "gasped", "scribbled", "reigned", "failed", "erred", "exited",
    "dangled", "looked", "froze", "escaped",
  ],
  MODAL: ["shall", "will", "must", "may", "would", "could", "cannot", "shall not", "will not"],
  QMODAL: ["shall", "will", "must", "would", "could", "may"],
  V_BASE_T: [
    "slay", "love", "kiss", "betray", "forget", "steal", "curse", "crown", "poison", "mock", "fear", "sell", "buy", "bury", "forgive", "see", "find", "lose",
    "marry", "follow", "praise", "burn", "write", "hide", "tame",
    "kill", "strike", "stab", "hate", "rob", "chase", "catch", "keep", "hold", "hear", "know", "meet", "leave", "take", "send", "bring", "shake", "break",
    "tear", "cut", "bite", "eat", "drink", "watch", "eye", "blame", "shame", "scorn", "woo", "wed", "serve", "obey", "rule", "save", "heal", "cure",
    "feed", "wash", "draw", "carve", "build", "bind", "free", "cage", "drown", "hunt", "haunt", "fight", "beat", "kick", "hurt", "harm", "vex",
    "hex", "fool", "bribe", "pay", "hire", "want", "miss", "mourn", "pity", "envy", "trust", "doubt", "tempt", "charm", "hail", "bless", "banish", "oust",
    "seize", "spare", "avenge", "defy", "deny", "judge", "try", "doom", "mend", "smite", "roast", "peel", "pluck", "tickle", "hug", "teach", "read", "play",
    "cast", "type", "sign", "seal", "copy", "bear", "wear", "raise", "throw", "toss", "hurl", "bake", "hit", "sting", "wake", "lead", "shun", "seek",
    "choose", "win", "crush", "ask", "warn", "aid", "help", "adore", "amuse", "scare", "stun", "cheer", "boo", "stop", "end", "arm", "chew", "sweep",
    "chide", "behold", "heed", "erase", "juggle", "ape", "echo", "quote", "pat", "mark",
  ],
  V_BASE_I: [
    "weep", "sleep", "die", "laugh", "flee", "fall", "rise", "vanish", "sing", "dream", "lie", "kneel", "wait", "dance", "tremble", "whisper",
    "smile", "sigh", "howl", "roar", "cry", "sob", "yawn", "snore", "doze", "blush", "faint", "swoon", "creep", "walk", "run", "swim", "sail", "fly",
    "leap", "hop", "climb", "swing", "spin", "roam", "stray", "stay", "stand", "sit", "bow", "nod", "wink", "stare", "gaze", "speak", "rave", "muse",
    "chatter", "gibber", "hoot", "hiss", "crow", "bay", "hum", "pray", "beg", "swear", "jest", "giggle", "grin", "sulk", "mope", "hope", "bleed", "feast",
    "dine", "rest", "awake", "live", "fade", "sink", "glow", "shine", "rage", "rot", "bloom", "grow", "gasp", "scribble", "reign", "fail", "err", "exit",
    "dangle", "look", "freeze", "escape",
  ],
  INTERJ: ["O", "alas", "nay", "come", "hark", "peace", "fie", "lo", "oh", "ah", "aye", "hush", "behold", "soft", "zounds", "prithee", "forsooth", "pray", "tut", "ho", "alack", "adieu", "ook"],
  PREP: [
    "of", "in", "for", "with", "upon", "against", "without", "before", "beneath", "like", "after", "behind", "beside", "under", "over", "by", "from",
    "at", "on", "to", "unto", "above", "beyond", "within", "through", "past", "about",
  ],
  ADV: [
    "now", "again", "tonight", "forever", "alone", "gladly", "still", "twice", "softly", "madly", "slowly", "sadly", "loudly", "boldly", "sweetly", "well", "badly", "soon",
    "here", "there", "away", "once", "thrice", "first", "last", "next", "too", "anon", "yonder", "today", "always", "often", "daily", "fast",
    "hard", "more", "less", "aloud", "abroad", "below", "within", "indeed", "thus", "then", "anew", "in vain", "at once", "at last", "at dawn", "gently", "dearly", "deeply",
    "truly", "wildly", "wisely", "idly", "nobly", "grimly", "meekly", "shyly", "merrily", "slyly",
  ],
  CONJ: ["and", "but", "for", "yet", "because", "till", "while", "though", "when", "as", "ere", "if", "or", "since"],
};

// Words that start with a vowel letter but not a vowel sound, and the reverse.
export const SOUNDS_LIKE_CONSONANT = ["one", "once", "union", "unicorn", "universe", "unit", "uniform", "unique", "use", "useful", "useless", "usual", "usurper", "usurer", "utensil", "ewe", "ewer", "eulogy", "one-eyed"];
export const SOUNDS_LIKE_VOWEL = ["honest", "hour", "hourly", "hourglass", "heir", "heiress", "heirloom", "honour", "honor", "honourable", "honorable"];
