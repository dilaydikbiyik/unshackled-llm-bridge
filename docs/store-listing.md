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
- **Your uploads travel too**, re-attached on the other side.
- **Add any AI site**, including a local model running on your own machine. No selectors to write:
  the extension reads a chat page it has never seen by its shape.
- **Compare answers** from several assistants and see where they part — which is where one of them
  is wrong.
- **A portable profile**, counted from your own archive across every platform, yours to edit and
  attach to any transfer.
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
- **Yüklediğin dosyalar da gider**, karşı tarafta yeniden eklenir.
- **Her yapay zekâ sitesini ekleyebilirsin**, kendi makinende çalışan bir model dâhil. Seçici
  yazmaya gerek yok: eklenti hiç görmediği bir sohbet sayfasını şeklinden okur.
- **Cevapları karşılaştır** ve nerede ayrıştıklarını gör — birinin yanıldığı yer orasıdır.
- **Taşınabilir profil:** tüm platformlardaki kendi arşivinden sayılır, senindir, düzenlersin ve
  istediğin aktarıma eklersin.
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

## Remote code

**No.** The extension fetches `config/selectors.json` from its public repository: a JSON file of CSS
selector strings, validated on arrival and never executed. It cannot introduce behaviour; it only
tells existing code which page elements to read. All executable code ships in the package.

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
