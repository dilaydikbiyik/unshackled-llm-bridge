# Chrome Web Store listing

Copy for the store submission, written to match what the extension actually does — reviewers
compare the listing against the code and the permissions.

**Before submitting** you need: a developer account ($5 one-time), 1280×800 screenshots (fork
dialog, side panel, a transfer landing in a composer), and a public URL for `PRIVACY.md` (the file
on GitHub works).

## Name

**Unshackled LLM Bridge**

## Short description (≤ 132 characters)

- **EN:** Fork your AI chats between ChatGPT, Claude and Gemini — with files and context. Local-only: nothing leaves your browser.
- **TR:** Yapay zekâ sohbetlerini ChatGPT, Claude ve Gemini arasında dosyalarıyla taşı. Tamamen yerel: hiçbir veri tarayıcını terk etmez.

## Detailed description

### English

Start a conversation in ChatGPT, then decide Claude should take it from message 15. Unshackled
LLM Bridge forks the conversation at that point and carries it across — the history, the files you
uploaded, and the model that produced it — packaged in the structure the target understands best.

- **Fork any message** to ChatGPT, Claude or Gemini. Edit the package before it lands.
- **Your files travel too.** Uploads are mirrored locally and re-attached on the target.
- **Structured for the target.** Claude gets XML-style sections; ChatGPT and Gemini get markdown.
- **Summarize long chats** with your own Anthropic API key (optional).
- **Compare answers** from several platforms side by side.
- **Portable persona:** attach your "how I want answers" profile to any transfer.
- **Search your history** across platforms (opt-in, off by default).

**Private by design.** There is no server. Your conversations, files and settings never leave your
browser. The extension never sends a message on your behalf — it fills the composer, and you press
send.

### Türkçe

Bir sohbete ChatGPT'de başladın, ama 15. mesajdan sonrasını Claude'un devralmasını istiyorsun.
Unshackled LLM Bridge sohbeti tam o noktadan çatallar ve karşıya taşır: geçmişi, yüklediğin
dosyaları ve cevabı üreten modeli — hedefin en iyi anladığı yapıda paketleyerek.

- **Herhangi bir mesajdan çatalla:** ChatGPT, Claude veya Gemini'ye. Paketi göndermeden düzenle.
- **Dosyaların da taşınır:** Yüklemeler yerelde saklanır ve hedefe yeniden eklenir.
- **Hedefe göre yapılandırılır:** Claude'a XML bölümleri, ChatGPT ve Gemini'ye markdown.
- **Uzun sohbetleri özetle:** kendi Anthropic API anahtarınla (isteğe bağlı).
- **Cevapları karşılaştır:** birden fazla platformu yan yana.
- **Taşınabilir persona:** "nasıl cevap isterim" profilini her aktarıma ekle.
- **Geçmişinde ara:** tüm platformlarda (isteğe bağlı, varsayılan kapalı).

**Tasarımı gereği gizli.** Sunucu yok. Sohbetlerin, dosyaların ve ayarların tarayıcını terk etmez.
Eklenti senin adına asla mesaj göndermez — yazma alanını doldurur, göndere sen basarsın.

## Category

Productivity

## Single purpose (asked by the review form)

Move an AI conversation, with its files and context, from one AI chat platform to another.

## Permission justifications (one per permission, as the form asks)

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings, persona, captured files and optional archive locally on the device. Nothing is synced or uploaded. |
| `sidePanel` | The extension's user interface: platform status, comparison, persona, archive and settings. |
| `tabs` | Opens the target platform in a new tab when the user transfers a conversation. |
| Host: `chatgpt.com`, `claude.ai`, `gemini.google.com` | Reads the conversation the user chooses to fork and fills the target's message composer. Limited to these three sites. |

## Remote code

**No.** The extension fetches `config/selectors.json` from its public repository: a JSON file of CSS
selector strings, validated on arrival and never executed. It cannot introduce behaviour; it only
tells existing code which page elements to read. All executable code ships in the package.

## Data usage disclosures

| Question | Answer |
|---|---|
| Does it collect personally identifiable information, health, financial, authentication, personal communications, location, web history or user activity? | **No.** Conversation text is processed on the device, on the user's instruction, and not transmitted to the developer or any third party. |
| Is data sold or transferred to third parties? | **No.** |
| Is data used for purposes unrelated to the single purpose? | **No.** |
| Is data used for creditworthiness or lending? | **No.** |

Optional summarization sends conversation text from the user's browser directly to
`api.anthropic.com` using the user's own API key, only when they choose "summarized" transfer.
The developer operates no server in that path. State this in the privacy policy (it is, in
`PRIVACY.md` → *Network requests*).
