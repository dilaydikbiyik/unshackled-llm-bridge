# Chrome Web Store listing

Copy for the store submission, written to match what the extension actually does — reviewers
compare the listing against the code and the permissions.

**Before submitting** you need: a developer account ($5 one-time), screenshots (`npm run screenshots`
writes 1280×800 PNGs to `store-assets/`), a package (`npm run package` writes a zip to `release/`),
and a public URL for `PRIVACY.md` (the file on GitHub works).

## Where this sits

There are already several extensions that move a chat between assistants — ThreadPort, Chat
Transfer, AI Chat Exporter, MoveChat, Context Bridge and others. Nearly all of them do one thing:
take the transcript out of A and paste it into B, once, in one direction. Several are good at it.

The listing should not claim to be the first; it should say what the others structurally do not do.

| | Typical transfer extension | This one |
|---|---|---|
| Direction | One way, once | Round trip: carry the answer back to the chat that asked |
| Repeat trips | Re-sends the whole history | Relay: only what the other side has not seen |
| Where the context lands | Pasted into the message box | Attached as a file, so the box stays yours |
| Which sites | A fixed list the developer maintains | Any chat site you add, including a local model on your own machine |
| Comparison | Answers side by side, if at all | States the common ground and marks what each answer alone claims |
| Memory | The provider's, or none | Counted from your own archive, across every platform, yours to edit |

## Name

**Unshackled LLM Bridge**

## Short description (≤ 132 characters)

- **EN:** Move an AI chat — files and context included — between ChatGPT, Claude, Gemini or any site you add. Local-only.
- **TR:** Bir yapay zekâ sohbetini dosyaları ve bağlamıyla taşı: ChatGPT, Claude, Gemini ya da eklediğin her site. Tamamen yerel.

## Detailed description

### English

You are deep in a conversation with one assistant and want a second opinion, or you have hit a
usage limit, or the other model is simply better at this part. Unshackled LLM Bridge moves the
conversation across — the history, the files you uploaded, and the model that produced it.

- **Fork a conversation** to ChatGPT, Claude, Gemini, or any chat site you add yourself. Edit the
  package before it lands.
- **Bring the answer back.** A conversation that began as a fork remembers where it came from, and
  can carry what it learned into the chat that asked.
- **Relay.** After the first hand-off, each trip carries only what the other side has not seen, so
  two assistants stay usable as a pair.
- **The context arrives as a file**, and the message box stays empty for what you actually want to
  say. Or send it as text, if you prefer.
- **Drag a conversation out of the page** and drop it on another tab, another window, another
  browser, or an app — it arrives as an ordinary file.
- **Your uploads travel too**, re-attached on the other side — or, for PDF, Word, PowerPoint,
  Excel, EPUB and text, carried as text: an outline with landmarks (§3 · p.4, slide 2) and only
  the sections the conversation was about. Fewer tokens, and it reaches assistants that cannot
  open the file. Pick or drop any document in the fork dialog; it never leaves your computer.
- **Fork sits in each message's own action bar** on ChatGPT, Claude and Gemini, beside copy and ⋯.
- **Compact context:** carry a Turkish (or other non-English) chat's history in English and get the
  reply in your language — about 30% fewer tokens, translated on your device by Chrome.
- **Long conversations are read whole**, even where the site keeps only the part on screen.
- **Add any AI site**, including a local model running on your own machine. No selectors to write:
  the extension reads a chat page it has never seen by its shape.
- **Compare answers** from several assistants and see where they part — which is where one of them
  is wrong.
- **A portable profile**, counted from your own archive across every platform, yours to edit and
  attach to any transfer.
- **It learns how you like answers.** Tell assistants "shorter" or "in Turkish" often enough, on
  any platform, and the extension proposes it — with the evidence — so the next assistant hears it
  too. Nothing is added until you keep it.
- **Summarize long chats** with your own Anthropic API key (optional).
- **Search your history** across platforms (opt-in, off by default).

**Private by design.** There is no server and no account. Your conversations, files and settings
stay in your browser. Each site you add asks for that one site, and removing it gives the
permission back. The extension never sends a message for you — it fills the box, and you press
send.

Open source: every line of what it does is in the repository.

### Türkçe

Bir asistanla derin bir sohbetin ortasındasın ve ikinci bir görüş istiyorsun; ya da kullanım
sınırına çarptın; ya da bu kısımda diğer model daha iyi. Unshackled LLM Bridge sohbeti karşıya
taşır: geçmişi, yüklediğin dosyaları ve cevabı üreten modeli.

- **Sohbeti çatalla:** ChatGPT, Claude, Gemini veya kendi eklediğin herhangi bir siteye. Paketi
  inmeden önce düzenle.
- **Cevabı geri getir.** Çatallanarak doğan bir sohbet nereden geldiğini hatırlar ve öğrendiğini
  soruyu soran konuşmanın içine taşıyabilir.
- **Röle.** İlk aktarımdan sonra her sefer yalnızca karşı tarafın görmediğini taşır; böylece iki
  asistan birlikte kullanılabilir kalır.
- **Bağlam dosya olarak iner**, mesaj kutusu asıl yazacağın şey için boş kalır. İstersen metin
  olarak da gönderebilirsin.
- **Sohbeti sayfadan sürükleyip** başka bir sekmeye, pencereye, tarayıcıya ya da uygulamaya
  bırakabilirsin — karşıya sıradan bir dosya olarak gider.
- **Yüklediğin dosyalar da gider**, karşı tarafta yeniden eklenir — PDF, Word, PowerPoint, Excel,
  EPUB ve metin dosyaları ise metin olarak gidebilir: yer işaretli ana hatlar (§3 · s.4, slayt 2) ve
  yalnızca sohbetin ilgilendiği bölümler. Daha az token harcar, dosya açamayan asistanlara da ulaşır.
  Fork penceresine istediğin belgeyi seç ya da sürükle; bilgisayarından çıkmaz.
- **Fork, her mesajın kendi araç çubuğunda**: ChatGPT, Claude ve Gemini'de kopyala ve ⋯ yanında.
- **Kompakt bağlam:** sohbet geçmişini İngilizce taşı, cevabı Türkçe al — yaklaşık %30 daha az
  token; çeviriyi Chrome cihazında yapar.
- **Uzun sohbetler eksiksiz okunur**, site ekranda yalnızca bir kısmını tutsa bile.
- **Her yapay zekâ sitesini ekleyebilirsin**, kendi makinende çalışan bir model dâhil. Seçici
  yazmaya gerek yok: eklenti hiç görmediği bir sohbet sayfasını şeklinden okur.
- **Cevapları karşılaştır** ve nerede ayrıştıklarını gör — birinin yanıldığı yer orasıdır.
- **Taşınabilir profil:** tüm platformlardaki kendi arşivinden sayılır, senindir, düzenlersin ve
  istediğin aktarıma eklersin.
- **Nasıl cevap istediğini öğrenir.** Asistanlara sık sık "daha kısa" ya da "Türkçe cevap ver"
  diyorsan, hangi platformda olursa olsun eklenti bunu kanıtıyla önerir; böylece sıradaki asistan da
  duyar. Sen onaylamadan hiçbir şey eklenmez.
- **Uzun sohbetleri özetle:** kendi Anthropic API anahtarınla (isteğe bağlı).
- **Geçmişinde ara:** tüm platformlarda (isteğe bağlı, varsayılan kapalı).

**Tasarımı gereği gizli.** Sunucu yok, hesap yok. Sohbetlerin, dosyaların ve ayarların tarayıcında
kalır. Eklediğin her site yalnızca o site için izin ister, listeden kaldırınca izin geri gider.
Eklenti senin adına asla mesaj göndermez — kutuyu doldurur, göndere sen basarsın.

Açık kaynak: ne yaptığının her satırı depoda.

## Category

Productivity

## Single purpose (asked by the review form)

Move an AI conversation, with its files and context, between AI chat sites the user chooses.

## Permission justifications (one per permission, as the form asks)

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings, profile, captured files and optional archive locally on the device. Nothing is synced or uploaded. |
| `sidePanel` | The extension's user interface: site list, status, comparison, profile, archive and settings. |
| `tabs` | Opens the target site in a new tab when the user transfers a conversation, and finds the active tab for the keyboard shortcut. |
| `scripting` | Registers the content script on a site the user has added and granted. Removing the site unregisters it. |
| Host: `chatgpt.com`, `claude.ai`, `gemini.google.com` | Reads the conversation the user chooses to move and fills the target's message box. |
| Optional hosts: `https://*/*`, `http://localhost/*`, `http://127.0.0.1/*` | **Requested one site at a time, never in advance.** Granted only when the user adds that site, through Chrome's own prompt, and revoked when they remove it. The localhost entries are what let a model running on the user's own machine be used. |

## Web-accessible resources (a reviewer will see these)

The content script is built as a loader that imports its module at runtime, and Chrome only allows
that import on origins the module is web-accessible to. `scripts/patch-manifest.mjs` makes the
content script's own chunks accessible on the optional host patterns — the same patterns a user can
grant — because without it the extension cannot run on any site the user adds. Nothing broader is
exposed; the trade-off (detectability on those patterns) is disclosed in `PRIVACY.md`.

## Remote code

**No.** The extension fetches `config/selectors.json` from its public repository: a JSON file of CSS
selector strings, validated on arrival and never executed. It cannot introduce behaviour; it only
tells existing code which page elements to read. All executable code ships in the package.

PDF reading uses pdf.js (its legacy build, so older Chromium versions work), bundled and loaded
only when a document is read. It runs on the page's thread (no worker from a remote origin) and
requests nothing; the URLs in it are XML namespaces. A grep finds two `Function(` calls: both are
core-js fallbacks — one for an engine without `globalThis`, one for Node's `require`, inside a
`try` — and neither is reached in Chrome, where the extension's CSP would refuse them anyway.

A reviewer grepping the bundle will find a few other hosts — `docs.expo.dev`, `tinyurl.com`,
`platform.claude.com`, `docs.anthropic.com`. They are links inside error messages of bundled
dependencies (the Anthropic SDK and Dexie), never requested. The only hosts the extension contacts
are the sites the user works on, `raw.githubusercontent.com` for the selector config, and
`api.anthropic.com` if the user opts into summarization with their own key.

## Data usage disclosures

Answer the form from the table in [PRIVACY.md](../PRIVACY.md) → *What the Chrome Web Store asks*.
The one that needs care is **personal communications**: conversation text does leave the browser —
to the AI site the user is transferring it to, and, if they opt in with their own key, to
`api.anthropic.com`. It never reaches a server operated by this project. Declare it rather than
answering a flat "no"; a reviewer who reads the code will see those requests.

## Screenshots

`npm run screenshots` drives the built extension and writes three 1280×800 PNGs to `store-assets/`:
the fork dialog, the package landing in a target with nothing sent, and the side panel at the width
a side panel actually has. They render against a neutral chat page rather than a real product's
interface, which keeps another company's UI out of the listing.
