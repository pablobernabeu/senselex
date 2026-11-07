# Word-bank build pipeline

`build_wordbanks.py` generates the per-language word banks that the browser-edition
app loads (`../web-static/words.js`). The words and their features come from
published lexical resources. These let the study builder draw large,
frequency-controlled samples for each language. The committed banks hold from
618 words (German and Italian) to 1,001 (English). A non-English bank starts
from a frequency list and is curated towards content-word base forms, so that
the sample a study draws holds ratable nouns, verbs and adjectives, without
prepositions, inflected verb forms or names.

## Sources

Word frequency, for every language, comes from the wordfreq package (Speer, 2022),
https://doi.org/10.5281/zenodo.7199437, which provides Zipf frequencies built from
a blend of corpora across about forty languages. Mean concreteness, for English
only, comes from Brysbaert, Warriner & Kuperman (2014), Behavior Research Methods
46(3), 904 to 911, https://doi.org/10.3758/s13428-013-0403-5, read from the cached
file under `source/`. Concreteness ratings of this kind are not available in a
comparable form for the other languages. One of the tool's aims is to help fill
that gap.

Profanity filtering reads one plain-text list per language (UTF-8, one word per
line) from `source/badwords/<code>.txt`, where `<code>` is the wordfreq language
code (`en`, `es`, `zh`, `ko`, ...). The lists come from the LDNOOBW list (List
of Dirty, Naughty, Obscene and Otherwise Bad Words,
https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words).
Its files are named by language code without an extension, so save each one as
`<code>.txt`. A language without a file is built without the profanity filter,
and the script does not report it.

## What it does

For each language, the script draws words from wordfreq, filters them down to
content words and samples the result stratified across the frequency range. For
English, it instead reads the concreteness file, runs the same content-word
filter, attaches a wordfreq Zipf value and stratifies across the
concreteness-by-frequency grid. It writes one bank per language, each word as
`[word, concreteness or null, zipf]`, with an attribution header.

The content-word filter applies several checks. The token must be made of
letters, with at most one internal hyphen or apostrophe, which rejects
abbreviations and mixed junk. It must be written in the language's own script,
which drops a foreign token carried in a different alphabet. It must not be an
English word that is far more frequent in English than in the target language,
which removes English words that have entered another language's frequency list.
It must not appear in the profanity list. Where `stopwordsiso` has a stopword
list for the language, the token must not appear in it, which excludes function
words. Finally, where `simplemma` has a lemmatiser for the language, as it does
for English and 11 other languages in `LANGS`, the token must be a known base
form, which excludes inflected forms.

For languages that the content-word filter still leaves noisy, a further
per-language NLP pass (`deep_filter`) runs. It uses `jieba` part-of-speech tags
for Chinese, and `stanza` (universal part-of-speech, lemma and named-entity
recognition) for Arabic, Hebrew, Tamil, Japanese, Korean, Turkish, Finnish,
Hindi and Vietnamese. In the Stanza pass, a word survives only if it is a single
token, is neither a named entity nor tagged as a function word or proper noun,
and has a lemma that, with diacritics stripped, equals the word itself. The
Chinese pass keeps a word only if `jieba` leaves it as a single token tagged as
a noun, verb or adjective and not as a proper noun. This is the strongest filter
available, and it still could not bring every language down to an acceptable
junk rate (see 'Languages left on core words' below).

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
needs to look up Korean words, and `jieba`, which wordfreq needs to look up
Chinese words. The Chinese pass of `deep_filter` uses `jieba` as well. The extra
also brings `ipadic`, the Japanese dictionary, which is needed only if you
re-enable Japanese in `LANGS` and which `requirements.txt` does not pin.

`stanza` downloads nothing during the build, because the script loads each model
from the local cache (`download_method=None`). Fetch the models once beforehand
for Korean, Finnish and Hindi, the languages in `LANGS` for which the
per-language pass uses Stanza:
`python -c "import stanza; [stanza.download(lang) for lang in ('ko', 'fi', 'hi')]"`.
A language whose model cannot be loaded is left with the lighter filters, and the
script prints a note. `simplemma` and `stopwordsiso` are optional. Without them,
the cross-lingual, profanity and script filters still run, but the lemmatiser
and stopword filters are skipped for the languages that would have used them.

The English concreteness file is expected at
`source/Concreteness_ratings_Brysbaert_et_al_BRM.txt`. If it is absent, fetch it
by running `curl -sS -L --create-dirs "https://raw.githubusercontent.com/ArtsEngine/concreteness/master/Concreteness_ratings_Brysbaert_et_al_BRM.txt" -o source/Concreteness_ratings_Brysbaert_et_al_BRM.txt` from `data/`.
Without it, the script still builds an English bank, with frequency only.
A language that the installed wordfreq build does not cover is skipped with a
message, and the app falls back to its core words for that language.

## Languages left on core words

`LANGS` in `build_wordbanks.py` omits Arabic, Hebrew, Tamil, Vietnamese, Turkish
and Japanese, as well as Swahili, Yoruba and Basque, which wordfreq does not
cover. Thai is in `LANGS`, but some wordfreq builds do not cover it, and the
build then skips it, as it did for the committed banks. The six were left out on
2026-07-04 after a repeated, multi-round adversarial audit. Independent
fluent-reader LLM judges read every word, or nearly every word, in each bank and
flagged anything that was not a ratable content word (a proper noun, a foreign
intrusion, a bound morpheme or fragment, an unresolved inflected or clitic form,
a function word, or a vulgar term). After every filter above had run, including
the per-language NLP pass, the measured junk rates were approximately Arabic 57
to 88%, Hebrew 42 to 80%, Tamil 37 to 90%, Vietnamese 22 to 67%, Turkish 21 to
37% and Japanese 14 to 18%. The other curated languages had junk rates of
roughly 2 to 12%.

The high rates for Arabic, Hebrew, Tamil, Vietnamese and Japanese have three
causes. Arabic, Hebrew and Tamil have templatic or agglutinative morphology that
Stanza's lemmatiser only partly normalises, so clitics and inflected forms
survive. Vietnamese is analytic, so foreign names, brands and acronyms are
tagged as ordinary nouns, with no named-entity signal to identify them. Japanese
has many single-kanji tokens that are bound compound elements and do not stand
as words on their own, and part-of-speech tagging alone does not reliably
separate them from single-kanji nouns.

Leaving the six out of `LANGS` keeps banks with that much non-content material
out of the app. Like any language missing from `words.js`, they use the app's
fallback, a small hand-checked core word list defined in
`../web-static/index.html`. They remain available as languages in the app but do
not currently carry a large frequency-sampled bank. Revisit this decision if a
stronger language-specific morphological analyser or named-entity tool becomes
available for any of the six.

## Licensing and attribution

The wordfreq data are shared under a Creative Commons Attribution-ShareAlike 4.0
licence (https://creativecommons.org/licenses/by-sa/4.0/), so the frequencies
derived from them in `../web-static/words.js` are shared under the same licence. The MIT licence of the code does not cover them. The English concreteness norms are offered
freely for research and carry no formal open licence, so they keep their authors'
terms. Cite both sources above if you use the
words. The raw source files under `source/` are not committed.
