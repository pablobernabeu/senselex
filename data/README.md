# Word-bank build pipeline

`build_wordbanks.py` generates the per-language word banks that the browser-edition
app loads (`../web-static/words.js`). The words and their features come from published lexical resources, which is what lets the
study builder draw large, frequency-controlled samples for each language and keeps
the coverage roughly equal across languages. A non-English bank is not a raw
frequency list: it is curated down to genuine content-word base forms, so the
sample a study draws holds ratable nouns, verbs and adjectives, without prepositions, inflected verb forms or names.

## Sources

Word frequency, for every language, comes from the wordfreq package (Speer, 2022),
https://doi.org/10.5281/zenodo.7199437, which provides Zipf frequencies built from
a blend of corpora across about forty languages. Mean concreteness, for English
only, comes from Brysbaert, Warriner & Kuperman (2014), Behavior Research Methods
46(3), 904 to 911, https://doi.org/10.3758/s13428-013-0403-5, read from the cached
file under `source/`. Concreteness ratings of this kind are not available in a
comparable form for the other languages, which is one of the gaps the tool exists
to help fill. Profanity filtering reads one plain-text list per language (UTF-8,
one word per line) from `source/badwords/<code>.txt`, where `<code>` is the
wordfreq language code (`en`, `es`, `zh`, `ko`, ...). The lists come from the
LDNOOBW list (List of Dirty, Naughty, Obscene and Otherwise Bad Words,
https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words),
whose files are named by language code without an extension, so save each one as
`<code>.txt`. A language without a file is built without the profanity filter,
and the script does not report it.

## What it does

For each language it draws words from wordfreq, filters them down to content
words, and samples the result stratified across the frequency range, so the bank spans rare words as well as common ones. For English it
instead reads the concreteness file, runs the same content-word filter, attaches
a wordfreq Zipf value, and stratifies across the concreteness-by-frequency grid so
both vary. It writes one bank per language, each word as `[word, concreteness or
null, zipf]`, with an attribution header.

The content-word filter stacks several checks, applied in order. The token must
be made of letters, with at most one internal hyphen or apostrophe, which
rejects abbreviations and mixed junk. It must be written in the language's own
script, which drops a foreign token carried in a different alphabet. It must not
be an English word that is far more frequent in English than in the target
language, which catches English words that leaked into another language's
frequency list. It must not appear in the profanity list. Finally, where a
lemmatiser and stopword list exist for the language (via `simplemma` and
`stopwordsiso`, covering about a dozen languages plus English), it must be a known base form, which excludes function words and inflected forms.

For languages that filter still leaves noisy, a further per-language NLP pass
(`deep_filter`) runs: Chinese via `jieba` part-of-speech tags, and Arabic, Hebrew,
Tamil, Japanese, Korean, Turkish, Finnish, Hindi and Vietnamese via `stanza`
(universal part-of-speech, lemma and named-entity recognition). A word survives only if it is a single token that is neither a named entity nor, by part of speech, a function word or proper noun, and its lemma, with diacritics stripped, equals the word
itself. This is the strongest filter available, and it still could not bring
every language down to an acceptable junk rate; see "Languages left on core
words" below.

## Running it

```
cd data                                      # from the repository root
python -m pip install -r requirements.txt    # pinned versions, for Python 3.13
python build_wordbanks.py
```

The pins are the versions installed on 23 September 2026, and the committed banks
were built in July 2026, so a rebuild may not reproduce `../web-static/words.js`
exactly (see `../ISSUES.md`). Without the pins,
`pip install "wordfreq[cjk]" simplemma stopwordsiso stanza` installs the latest
versions. The `cjk` extra brings MeCab with its Korean dictionary, which wordfreq
needs to look up Korean words, and `jieba`, which it needs to look up Chinese
words and which the Chinese pass of `deep_filter` also uses. It also brings
`ipadic`, the Japanese dictionary, which is needed only if you re-enable Japanese
in `LANGS`.

`stanza` downloads nothing during the build: the script loads each model from the
local cache (`download_method=None`), so fetch the models once beforehand for
Korean, Finnish and Hindi, the languages in `LANGS` for which the per-language
pass uses Stanza: `python -c "import stanza; [stanza.download(lang) for lang in ('ko', 'fi', 'hi')]"`.
A language whose model cannot be loaded is left with the lighter filters, and the
script prints a note. `simplemma` and `stopwordsiso` are optional: without them the
script, cross-lingual and profanity filters still run, but the lemmatiser and
stopword filters are skipped for the languages that would have used them.

The English concreteness file is expected at
`source/Concreteness_ratings_Brysbaert_et_al_BRM.txt`. If it is absent, fetch it
by running `curl -sS -L --create-dirs "https://raw.githubusercontent.com/ArtsEngine/concreteness/master/Concreteness_ratings_Brysbaert_et_al_BRM.txt" -o source/Concreteness_ratings_Brysbaert_et_al_BRM.txt` from `data/`.
Without it, the script still builds an English bank, with frequency only.
A language that the installed wordfreq build does not cover is skipped with a
message, and the app falls back to its core words for that language.

## Languages left on core words

`LANGS` in `build_wordbanks.py` intentionally omits Arabic, Hebrew, Tamil,
Vietnamese, Turkish and Japanese, alongside the languages wordfreq does not cover
at all (Swahili, Yoruba, Basque; Thai in some wordfreq builds). This was decided
on 2026-07-04 after a repeated, multi-round adversarial audit: independent
fluent-reader LLM judges read every word in each bank and flagged anything that
was not a genuine ratable content word (a proper noun, a foreign intrusion, a
bound morpheme or fragment, an unresolved inflected or clitic form, a function
word, or a vulgar term). Measured junk rates, after every filter above ran
including the per-language NLP pass, were approximately Arabic 60%, Hebrew 42%,
Tamil 37 to 47%, Vietnamese 41%, Turkish 21 to 37%, and Japanese 14%. Every other
curated language landed at roughly 1 to 12%. The shortfall traces to three
distinct causes. Arabic, Hebrew and Tamil have templatic or agglutinative
morphology that Stanza's lemmatiser only partly normalises, so clitics and
inflected forms survive. Vietnamese is analytic, so foreign names, brands and
acronyms get tagged as ordinary nouns with no named-entity signal to catch them.
Japanese carries many single-kanji tokens that are bound compound elements and do not stand as words on their own, and part-of-speech tagging alone does not
reliably separate them from genuine single-kanji nouns. To avoid shipping a bank with that much non-content material, these six languages are left out of `LANGS`, and the app's
existing fallback for any language missing from `words.js`, a small hand-checked core word list defined in `../web-static/index.html`, applies to them too. They remain available as languages in the app; they just do not currently
carry a large frequency-sampled bank. Revisit this list if a stronger
language-specific morphological analyser or named-entity tool becomes available
for any of the six.

## Licensing and attribution

The wordfreq data are shared under a Creative Commons Attribution-ShareAlike 4.0
licence (https://creativecommons.org/licenses/by-sa/4.0/), so the frequencies
derived from them in `../web-static/words.js` are shared under the same licence. The MIT licence of the code does not cover them. The English concreteness norms are offered
freely for research and carry no formal open licence, so they keep their authors'
terms. Cite both sources above if you use the
words. The raw source files under `source/` are not committed.
