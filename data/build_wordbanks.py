#!/usr/bin/env python3
"""Build per-language word banks for the SenseLex browser edition.

Every language gets a bank of real words sampled across the frequency range, so
the study builder can draw a large, frequency-controlled set for any language and
the coverage is roughly equal across languages. English additionally carries mean
concreteness (Brysbaert et al. 1-5 scale, 1 = abstract, 5 = concrete), which is
available for English but not, in any comparable form, for the other languages.
Collecting it elsewhere is the point of the tool. A non-English bank is curated
down to genuine content-word base forms rather than shipped as a raw frequency
list; see the LANGS comment below and README.md for the curation pipeline and for
why six languages currently keep hand-checked core words instead of a bank.

Sources
-------
Word frequency (all languages): the wordfreq package (Speer, 2022),
https://doi.org/10.5281/zenodo.7199437, which gives Zipf frequencies built from a
blend of corpora. Concreteness (English only): Brysbaert, Warriner & Kuperman
(2014), Behavior Research Methods 46(3), 904-911,
https://doi.org/10.3758/s13428-013-0403-5, read from the cached file under
source/ (README.md in this folder gives the download command if it is absent).

Output: ../web-static/words.js, holding window.SENSELEX_WORDBANK with one bank per
language. Each word is [word, concreteness or null, zipf].

Pinned versions of everything below are in requirements.txt beside this file:
python -m pip install -r requirements.txt

Install: pip install wordfreq. Korean tokenisation additionally needs MeCab, so
install that extra too: pip install "wordfreq[ko]" (which pulls in mecab-python3
and mecab-ko-dic). Add the ja extra as well only if you re-enable Japanese in
LANGS (see README.md). Curating the non-English banks to content words uses
simplemma and stopwordsiso: pip install simplemma stopwordsiso. Without them the
script, English-intrusion and profanity filters still run, but the lemmatiser and
stopword filters are skipped. Profanity filtering reads one word list per
language code from source/badwords/ (the LDNOOBW list); absent files just mean no
profanity filter for that language. Languages without a simplemma lemmatiser or
with rich morphology (Chinese via jieba; Arabic, Hebrew, Tamil, Japanese, Korean,
Turkish, Finnish, Hindi, Vietnamese via Stanza) are further curated by
deep_filter: pip install stanza (jieba ships with wordfreq). Stanza downloads a
model per language on first run; a language whose model is unavailable is left
as-is. Then run:
python build_wordbanks.py
A language that this wordfreq build does not cover (for example Thai in some
builds) is skipped with a message, and the app falls back to core words for it.
"""

import gc
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
BRYS = HERE / "source" / "Concreteness_ratings_Brysbaert_et_al_BRM.txt"
OUT = HERE.parent / "web-static" / "words.js"

# App language code -> wordfreq language code. Swahili, Yoruba and Basque are not
# in wordfreq, so they keep their hand-checked core words in the app instead.
#
# Arabic, Hebrew, Tamil, Vietnamese, Turkish and Japanese are deliberately absent
# too, despite wordfreq covering them, for the same reason: a repeated, multi-round
# adversarial LLM audit (2026-07-03/04) found their derived banks kept a large
# share of non-content tokens even after every filter in this file ran, including
# the per-language Stanza/jieba pass in deep_filter. Full-bank or near-full-bank
# audits measured arb ~57-88%, heb ~42-80%, tam ~37-90%, vie ~22-67%, tur ~21-37%
# and jpn ~14-18% junk (proper nouns, foreign intrusions, bound morphemes,
# fragments, or inflected/clitic forms the lemmatiser and NER could not resolve).
# That is well above the ~2-12% seen for every other curated language. Rather than
# ship a noisy bank, these six are left out of LANGS so build_english()/
# build_frequency_only() never run for them; the app already falls back to its
# hand-checked CORE words for any language missing from words.js, the same
# mechanism used below for Swahili/Yoruba/Basque/Thai. See data/README.md and
# web-static/README.md for the caveat as shown to users. Revisit if a stronger per-language NLP tool becomes available.
LANGS = {
    "eng": "en", "spa": "es", "fra": "fr", "deu": "de", "ita": "it", "por": "pt",
    "rus": "ru", "ell": "el", "hin": "hi", "cmn": "zh",
    "kor": "ko", "fin": "fi", "hun": "hu",
    "ind": "id", "tha": "th",
}
PER_LANG = 800        # bank size for non-English languages
ENG_TARGET = 1200     # English bank size (stratified by concreteness and frequency)

try:
    from wordfreq import top_n_list, zipf_frequency, available_languages
except ImportError:
    sys.exit('wordfreq is not installed. Run: pip install "wordfreq[ja,ko]"')

AVAILABLE = available_languages()

# Curation tooling: a lemmatiser (drops inflected forms) and stopword lists (drop
# function words), so the non-English banks hold genuine content-word concepts
# rather than raw frequency tokens. Both are optional. Without them the banks are
# frequency-only, as before.
try:
    import simplemma
    import stopwordsiso as _stops
    _CURATE = True
except ImportError:
    _CURATE = False
    print("  note: simplemma / stopwordsiso not installed; banks will not be curated to content-word lemmas.")

_CJK = {"zh", "ja", "ko"}  # single-character words are ordinary here, so keep them

# Objective profanity lists (one file per wordfreq language code under
# source/badwords, from the LDNOOBW list), so vulgar tokens are dropped from what
# is meant to be a neutral research stimulus set. Absent files simply mean no
# profanity filter for that language.
BADWORDS = {}
_badd = HERE / "source" / "badwords"
if _badd.exists():
    for _f in _badd.glob("*.txt"):
        BADWORDS[_f.stem] = {ln.strip().lower() for ln in _f.read_text(encoding="utf-8").splitlines() if ln.strip()}


def is_word(token: str) -> bool:
    """A candidate word: every character is a letter, apart from at most one
    internal hyphen or apostrophe (as in French "aujourd'hui"). This rejects
    blanks, over-long tokens, and anything carrying a digit, a full stop, or other
    punctuation, which is what flags abbreviations ("a.m"), initialisms, and mixed
    junk. Proper nouns are handled separately by the content-word filter."""
    if not token or not (1 <= len(token) <= 30):
        return False
    if sum(ch in "-'’" for ch in token) > 1:
        return False
    seen_letter = False
    last = len(token) - 1
    for i, ch in enumerate(token):
        cat = unicodedata.category(ch)
        if cat[0] == "L":
            seen_letter = True
        elif cat[0] == "M":
            continue  # combining marks: Devanagari and Tamil vowel signs, Arabic diacritics
        elif ch in "-'’" and 0 < i < last:
            continue
        else:
            return False
    return seen_letter


# Each language is written in a known set of Unicode scripts. Requiring a word's
# letters to sit in that set is an objective way to drop the flood of Latin/English
# tokens that leak into non-Latin frequency lists (e.g. "access", "military",
# "comic" in the Arabic, Hebrew, Tamil or CJK corpora). Latin-script languages
# default to LATIN. The script name is the first word of the Unicode character
# name, e.g. "LATIN SMALL LETTER E WITH ACUTE" -> LATIN, so accents do not matter.
# This map, like DEEP_STANZA below, still lists Arabic ("ar"), Tamil ("ta"),
# Japanese ("ja"), Turkish ("tr") and Vietnamese ("vi") even though LANGS
# currently excludes them: the filters stay ready to run the moment any of them
# is reinstated.
SCRIPT_OF_LANG = {
    "ru": {"CYRILLIC"}, "el": {"GREEK"}, "hi": {"DEVANAGARI"}, "ta": {"TAMIL"},
    "ar": {"ARABIC"}, "he": {"HEBREW"}, "zh": {"CJK"},
    "ja": {"CJK", "HIRAGANA", "KATAKANA"}, "ko": {"HANGUL", "CJK"},
}


def _char_script(ch):
    try:
        head = unicodedata.name(ch).split(" ", 1)[0]
    except ValueError:
        return "UNK"
    return "CJK" if head in ("CJK", "IDEOGRAPHIC") else head


def script_ok(token, wf_lang):
    """True if at least 80% of the word's letters and marks are in the language's
    expected script. Drops cross-script intruders (foreign words carried in a
    different alphabet) while tolerating the odd stray character."""
    allowed = SCRIPT_OF_LANG.get(wf_lang, {"LATIN"})
    letters = good = 0
    for ch in token:
        if unicodedata.category(ch)[0] in ("L", "M"):
            letters += 1
            if _char_script(ch) in allowed:
                good += 1
    return letters > 0 and good / letters >= 0.8


def foreign_english(token, wf_lang):
    """True if the token is far more frequent in English than in the target
    language, which flags English words that leaked into another language's
    frequency list (e.g. "after", "america", "program"). Native words are much
    commoner in their own language, so this leaves them untouched."""
    if wf_lang == "en":
        return False
    ze = zipf_frequency(token, "en")
    if ze < 3.5:
        return False
    return ze - zipf_frequency(token, wf_lang) >= 1.25


def zipf_band(z):
    return 0 if z < 2.5 else 1 if z < 3.5 else 2 if z < 4.5 else 3 if z < 5.5 else 4


def stratify(entries, n, key_band):
    """Take an evenly spaced slice of each band so the whole range is covered.

    entries: list of tuples whose first element is the word; key_band maps an
    entry to a band index.
    """
    if len(entries) <= n:
        return sorted(entries, key=lambda e: e[0])
    cells = {}
    for e in entries:
        cells.setdefault(key_band(e), []).append(e)
    per = max(1, -(-n // len(cells)))
    out = []
    for lst in cells.values():
        lst.sort(key=lambda e: e[-1])  # by zipf (last element)
        take = min(per, len(lst))
        step = len(lst) / take
        out.extend(lst[int(i * step)] for i in range(take))
    out.sort(key=lambda e: e[0])
    return out[:n]


def build_english():
    """Return (entries, has_concreteness) for the English bank.

    Always a 2-tuple, matching the caller. build_frequency_only returns a
    3-tuple, so the fallback below drops its third element rather than returning
    it directly: passing it through unpacked three values into two and raised a
    ValueError. That branch is taken whenever the concreteness file is absent,
    which is every fresh clone, since data/source/ is not committed.
    """
    if not BRYS.exists():
        print(f"  English concreteness file missing at {BRYS}; English will have frequency only.")
        print("  Fetch it with the curl command in data/README.md to get concreteness-controlled sampling.")
        entries, has_conc, _curated = build_frequency_only("en")
        return entries, has_conc
    # Run the same content-word filter over English: the Brysbaert norms include
    # function words ("against", "may") and inflected forms ("bought", "sparks"),
    # which the stopword list and lemmatiser drop just as for the other languages.
    eng_keep, _ = content_keep("en")
    entries = []
    with BRYS.open(encoding="utf-8") as fh:
        header = fh.readline().rstrip("\n").split("\t")
        idx = {name: header.index(name) for name in header}
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < len(header):
                continue
            word = f[idx["Word"]]
            if f[idx["Bigram"]] != "0":
                continue
            try:
                conc = float(f[idx["Conc.M"]])
                known = float(f[idx["Percent_known"]])
            except ValueError:
                continue
            if known < 0.85 or f[idx["Dom_Pos"]] == "Name":
                continue
            if not re.fullmatch(r"[a-z][a-z'-]+", word, re.IGNORECASE):
                continue
            if not eng_keep(word.lower()):
                continue
            z = zipf_frequency(word.lower(), "en")
            entries.append((word.lower(), round(conc, 2), round(z, 2)))
    # Stratify across the concreteness-by-frequency grid so both vary.
    def band(e):
        c = e[1]
        cband = 0 if c < 2 else 1 if c < 3 else 2 if c < 4 else 3
        return (zipf_band(e[2]), cband)
    return stratify(entries, ENG_TARGET, band), True


def content_keep(wf_lang):
    """Return a predicate that keeps genuine content-word base forms and drops
    function words (via stopword lists) and inflected forms (via the simplemma
    lemmatiser), so the builder samples concepts rather than raw frequency tokens
    such as prepositions, pronouns, or verb conjugations."""
    stops = _stops.stopwords(wf_lang) if (_CURATE and _stops.has_lang(wf_lang)) else set()
    has_lemma = False
    if _CURATE:
        try:
            simplemma.lemmatize("probe", wf_lang)
            has_lemma = True
        except Exception:
            has_lemma = False
    min_len = 1 if wf_lang in _CJK else 2

    bad = BADWORDS.get(wf_lang, frozenset())

    def keep(w):
        if not is_word(w) or len(w) < min_len or w in stops or w in bad:
            return False
        # Objective corpus filters that apply to every language: the word must be
        # written in the language's own script (drops cross-script foreign tokens),
        # and must not be an English word that leaked into the list (drops "after",
        # "america", "program" and the like from non-English frequency data).
        if not script_ok(w, wf_lang) or foreign_english(w, wf_lang):
            return False
        # Keep a word only if it is known to the language (drops names, brands and
        # foreign tokens such as "river" or "money") AND is its own lemma, i.e. a
        # base form (drops inflected forms like Spanish "ponen"/"planas" while
        # keeping "poner"/"plano").
        if has_lemma:
            try:
                if not simplemma.is_known(w, wf_lang) or simplemma.lemmatize(w, wf_lang) != w:
                    return False
            except Exception:
                pass
        return True

    # The script and English-intrusion filters always run, so every non-English
    # bank is curated to some degree even without a lemmatiser or stopword list.
    return keep, True


# Deep, per-language morphological curation for the languages a plain lemmatiser
# and stopword list cannot clean (no simplemma support, or rich morphology).
# Chinese uses jieba part-of-speech tags; the other nine use Stanza (universal
# POS, lemma, and named-entity recognition where a model exists). A word survives
# only if it is a single content-word token, not a named entity, not a function
# word or proper noun, and its lemma with diacritics stripped equals the word
# itself (a base form). Missing tools or models leave a language unchanged.
DEEP_STANZA = {"ar", "he", "ta", "ja", "ko", "tr", "fi", "hi", "vi"}
DEEP_ALL = DEEP_STANZA | {"zh"}
_DROP_UPOS = {"ADP", "AUX", "CCONJ", "DET", "INTJ", "NUM", "PART", "PRON", "SCONJ", "PUNCT", "SYM", "PROPN"}
_ZH_DROP_FLAG = {"nr", "ns", "nt", "nz", "nrfg", "nrt"}  # jieba proper-noun tags
_deep_cache = {}


def _strip_marks(s):
    return "".join(c for c in unicodedata.normalize("NFC", s) if unicodedata.category(c) != "Mn")


def _zh_content(w):
    pg = _deep_cache.get("zh")
    if pg is False:
        return True                     # jieba absent: leave the word unfiltered
    if pg is None:
        try:
            import jieba.posseg as pg
        except ImportError:
            # jieba is documented as optional, so an absent install must degrade
            # to the lighter filters rather than abort the whole build.
            print("  jieba not installed; Chinese left on the lighter filters.")
            _deep_cache["zh"] = False
            return True
        _deep_cache["zh"] = pg
    toks = list(pg.cut(w))
    if len(toks) != 1:
        return False
    flag = toks[0].flag
    return flag[:1] in ("n", "v", "a") and flag not in _ZH_DROP_FLAG


def _load_stanza(wf_lang):
    """Load a Stanza pipeline for one language from the local model cache (no
    network: the models are pre-downloaded, so this is offline-safe). Falls back
    through processor sets so a language without a lemma or NER model still gets
    what it has. Returns (pipeline_or_None, has_ner)."""
    try:
        import stanza
    except ImportError:
        # Stanza is documented as optional. Without it the affected languages keep
        # the script, cross-lingual, profanity and lemmatiser filters and simply
        # miss the per-language pass, which is a weaker bank rather than no build.
        print("  stanza not installed; per-language NLP pass skipped.")
        return None, False
    for procs in ("tokenize,pos,lemma,ner", "tokenize,pos,lemma", "tokenize,pos,ner", "tokenize,pos"):
        try:
            nlp = stanza.Pipeline(wf_lang, processors=procs, verbose=False, download_method=None)
            return nlp, ("ner" in procs)
        except Exception:
            continue
    return None, False


def _judge(word, sent, has_ner):
    if len(sent.words) != 1:            # split into clitics / multiple tokens
        return False
    tok = sent.words[0]
    if tok.upos in _DROP_UPOS:          # function word or proper noun
        return False
    if has_ner and sent.ents:           # named entity (person, place, org)
        return False
    return _strip_marks(tok.lemma or word) == _strip_marks(word)  # base form only


def deep_filter(pool, wf_lang):
    if wf_lang == "zh":
        return [w for w in pool if _zh_content(w)]
    if wf_lang not in DEEP_STANZA:
        return pool
    # Load one pipeline at a time and release it before the next language, so ten
    # Stanza models are never resident together (that exhausted memory and left the
    # last language, Vietnamese, silently unfiltered).
    nlp, has_ner = _load_stanza(wf_lang)
    if nlp is None:
        print(f"    (no Stanza model for {wf_lang}; left unfiltered)")
        return pool
    out = []
    for i in range(0, len(pool), 400):
        batch = pool[i:i + 400]
        doc = nlp("\n\n".join(batch))
        if len(doc.sentences) == len(batch):
            out.extend(w for w, s in zip(batch, doc.sentences) if _judge(w, s, has_ner))
        else:  # sentence alignment slipped: fall back to one document per word
            for w in batch:
                d = nlp(w)
                if d.sentences and _judge(w, d.sentences[0], has_ner):
                    out.append(w)
    del nlp
    gc.collect()
    return out


def build_frequency_only(wf_lang):
    """Build a frequency-spanning bank for a non-English language: draw content
    words (see content_keep) from the wordfreq list, refine morphologically rich
    or unlemmatised languages with deep_filter, and sample evenly across the Zipf
    range. Returns (words, has_concreteness, curated); has_concreteness is always
    False here, and curated reports whether any content-word filter ran."""
    keep, curated = content_keep(wf_lang)
    seen, pool = set(), []
    for w in top_n_list(wf_lang, 60000):
        if w not in seen and keep(w):
            seen.add(w)
            pool.append(w)
    pool = deep_filter(pool, wf_lang)
    entries = [(w, None, round(zipf_frequency(w, wf_lang), 2)) for w in pool]
    return stratify(entries, PER_LANG, lambda e: zipf_band(e[2])), False, (curated or wf_lang in DEEP_ALL)


banks = {}
counts = {}
for code, wf in LANGS.items():
    if wf not in AVAILABLE:
        print(f"  skipping {code}: wordfreq has no '{wf}'")
        continue
    if code == "eng":
        words, has_conc = build_english()
        curated = True
    else:
        words, has_conc, curated = build_frequency_only(wf)
    banks[code] = {"concreteness": has_conc, "words": [[w, c, z] for (w, c, z) in words]}
    counts[code] = len(words)
    print(f"  {code} ({wf}): {len(words)} words{'' if curated else '  (frequency-only, uncurated)'}")

meta = {
    "concretenessSource": "Brysbaert, Warriner & Kuperman (2014), Concreteness ratings for 40 thousand generally known English word lemmas, Behavior Research Methods 46(3), 904-911 (English only)",
    "concretenessDoi": "10.3758/s13428-013-0403-5",
    "frequencySource": "wordfreq (Speer, 2022): Zipf word frequencies across languages, from a blend of corpora",
    "frequencyDoi": "10.5281/zenodo.7199437",
    "note": "Derived feature subset. Every language carries Zipf word frequency from wordfreq; English additionally carries mean concreteness (1 abstract to 5 concrete) from Brysbaert et al. Banks are curated towards content-word base forms by several objective corpus filters: the word must be written in the language's own script (dropping cross-script foreign tokens), must not be an English word that is far commoner in English than in the target language (dropping leaked loanwords), must not appear in a profanity list, and, where a lemmatiser and stopword list exist for the language, must be a known base form rather than a function word or an inflected form. Morphologically rich languages without a lemmatiser (for example Arabic, Hebrew, Tamil) retain more inflected forms. Concreteness is not provided for languages other than English. Words are sampled across the frequency range. Please cite the sources. Regenerate with build_wordbanks.py.",
    "perLanguage": counts,
}

obj = {"meta": meta, "banks": banks}
header = (
    "// Auto-generated by data/build_wordbanks.py. Do not edit by hand.\n"
    "// Frequency (all languages): wordfreq (Speer, 2022). https://doi.org/10.5281/zenodo.7199437\n"
    "// Concreteness (English only): Brysbaert, Warriner & Kuperman (2014), Behavior Research Methods 46(3), 904-911. https://doi.org/10.3758/s13428-013-0403-5\n"
    "// Derived feature subset. Frequencies derive from wordfreq data, shared under CC BY-SA 4.0\n"
    "// (https://creativecommons.org/licenses/by-sa/4.0/); this file keeps that licence, and the\n"
    "// concreteness values keep their authors' terms. Please cite both sources.\n"
)
OUT.write_text(header + "window.SENSELEX_WORDBANK = " + json.dumps(obj, ensure_ascii=False) + ";\n", encoding="utf-8")
total = sum(counts.values())
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {len(banks)} languages, {total} words).")
