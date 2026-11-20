# Hangi dil daha az token harcar ve daha doğru cevap alır?

*Araştırma notu, 20 Kasım 2026. Soru şuydu: Türkçe bir sohbeti başka bir yapay zekâya aktarmadan
önce Çinceye (ya da başka bir dile) çevirmek token kullanımını düşürür ve cevabın doğruluğunu
artırır mı? Cevap, sonda istediğimiz dilde gelir.*

## Kısa cevap

- **Çince evrensel bir kazanç değil.** Çince metni az token'la yazan tokenizer'lar, Çince verilerle
  eğitilmiş modellerin tokenizer'ları (Qwen, DeepSeek). GPT'de İngilizce daha az token harcıyor.
- **Türkçeden İngilizceye geçmek, GPT'de yaklaşık %30 tasarruf sağlıyor.** Çinceye geçmek GPT'de
  yalnızca %13, Llama'da %9 tasarruf sağlıyor. Bu, 1.012 cümlelik standart FLORES-200 derlemiyle
  ölçüldü. İngilizce, DeepSeek dışındaki her tokenizer'da en ucuz dil.
- **Doğruluk açısından İngilizce hâlâ en güvenli dil.** En güçlü modellerde Çince, İngilizcenin
  1–5 puan gerisinde. Çeviri ayrıca anlam kaybı riski ekliyor.
- **Sonuç:** Eklentiye "Çinceye çevir" eklemek mantıklı değil. İsteğe bağlı bir
  "İngilizce kompakt bağlam" mantıklı olabilir ama kazancı sınırlı (~%20–30) ve yalnızca
  *aktarılan geçmişe* uygulanmalı. Belgeleri ilgili bölümlerle taşımak (yapıldı) ya da özet modu
  çok daha büyük tasarruf sağlıyor.

## Ana ölçüm: FLORES-200 (1.012 cümle, 10 dil, 6 tokenizer)

FLORES-200, dil adaletini ölçen çalışmaların standart paralel derlemi (Petrov ve ark. de bunu
kullandı). Profesyonel çevirmenlerin çevirdiği aynı 1.012 cümle her dilde mevcut; konu olarak haber
ve Vikipedi metinleri. Aşağıdaki tablo devtest bölümünü kullanıyor.

**İngilizceye göre katsayı** (1,00 = İngilizce kadar; büyük sayı daha pahalı):

| Tokenizer | EN | ZH | ES | FR | DE | **TR** | JA | KO | RU | AR |
|---|---|---|---|---|---|---|---|---|---|---|
| GPT-4o/5 (o200k) | 1,00 | 1,25 | 1,31 | 1,37 | 1,31 | **1,43** | 1,65 | 1,47 | 1,42 | 1,39 |
| GPT-4 (cl100k) | 1,00 | 1,87 | 1,54 | 1,61 | 1,59 | **1,92** | 2,27 | 2,37 | 2,46 | 3,03 |
| Qwen 2.5 | 1,00 | 1,00 | 1,52 | 1,58 | 1,56 | **1,62** | 1,40 | 1,63 | 1,75 | 1,63 |
| Llama 3 | 1,00 | 1,28 | 1,54 | 1,60 | 1,58 | **1,40** | 1,51 | 1,49 | 1,62 | 1,65 |
| Gemma 3 (≈ Gemini) | 1,00 | 1,08 | 1,30 | 1,41 | 1,33 | **1,37** | 1,21 | 1,37 | 1,37 | 1,47 |
| DeepSeek V3 | 1,00 | 0,94 | 1,50 | 1,55 | 1,51 | **2,04** | 1,42 | 1,64 | 1,58 | 1,62 |

**Türkçeden geçince kazanç** (eksi = tasarruf):

| Tokenizer | → İngilizce | → Çince | → İspanyolca | → Japonca |
|---|---|---|---|---|
| GPT-4o/5 | **−%30** | −%13 | −%8 | +%16 |
| Llama 3 | **−%29** | −%9 | +%10 | +%8 |
| Gemma 3 (≈ Gemini) | **−%27** | −%21 | −%5 | −%11 |
| Qwen 2.5 | −%38 | −%38 | −%6 | −%14 |
| DeepSeek V3 | −%51 | **−%54** | −%27 | −%30 |

**Nasıl okunmalı:**
- İngilizce her tokenizer'da en ucuz ya da en ucuza çok yakın. Çince yalnızca Çin modellerinde
  İngilizceyle başa baş.
- Türkçe GPT'de İngilizcenin 1,43 katı, DeepSeek'te 2,04 katı. Türkçenin en pahalı olduğu yer
  DeepSeek'in tokenizer'ı.
- Japonca ve Korece, Türkçeden ucuz değil.
- Haber metniyle yapılan bu ölçüm, sohbet metniyle yaptığım küçük ölçümle aynı yönde (aşağıda).

## Ek ölçüm: sohbet metni

**Yöntem.** Dört metin hazırladım: bir hakem modeli açıklaması, bir React hata sorusu, bir gezi
planı isteği ve bir yöntem özeti. Toplam yaklaşık 2.000 Türkçe karakter. Bunları 9 dile çevirdim ve
her dili 6 tokenizer'la saydım. Tokenizer'lar yayımlanmış dosyalarından yüklendi: GPT-4o/GPT-5
ailesi için o200k, eski GPT-4 için cl100k, Llama 3, Qwen 2.5, Gemma 3 (Gemini'nin açık kardeşi) ve
DeepSeek V3. Claude'un tokenizer'ı açık değil; onu yalnızca Anthropic'in `count_tokens` API'si
sayabiliyor.

**Toplam token sayısı** (küçük sayı daha iyi):

| Tokenizer | EN | ZH | ES | FR | DE | **TR** | JA | KO | RU | AR |
|---|---|---|---|---|---|---|---|---|---|---|
| GPT-4o/5 (o200k) | 200 | 210 | 219 | 252 | 241 | **250** | 290 | 271 | 258 | 248 |
| GPT-4 (cl100k) | 201 | 299 | 260 | 282 | 287 | **333** | 408 | 445 | 428 | 532 |
| Qwen 2.5 | 201 | 178 | 259 | 281 | 287 | **282** | 256 | 300 | 313 | 290 |
| Llama 3 | 201 | 216 | 259 | 281 | 287 | **251** | 284 | 271 | 284 | 300 |
| Gemma 3 | 202 | 185 | 217 | 258 | 244 | **237** | 223 | 243 | 242 | 263 |
| DeepSeek V3 | 200 | 169 | 263 | 280 | 282 | **361** | 266 | 309 | 291 | 293 |

**Türkçeye göre fark** (güncel 5 tokenizer: o200k, Qwen, Llama 3, Gemma 3, DeepSeek V3):

| Dil | Ortalama | GPT | Qwen | Llama | Gemma | DeepSeek |
|---|---|---|---|---|---|---|
| Çince | −%28 | −16 | −37 | −14 | −22 | −53 |
| İngilizce | −%26 | **−20** | −29 | **−20** | −15 | −45 |
| İspanyolca | −%11 | −12 | −8 | +3 | −8 | −27 |
| Japonca | −%2 | +16 | −9 | +13 | −6 | −26 |
| Almanca | −%1 | −4 | +2 | +14 | +3 | −22 |
| Fransızca | %0 | +1 | 0 | +12 | +9 | −22 |
| Rusça | +%2 | +3 | +11 | +13 | +2 | −19 |
| Korece | +%2 | +8 | +6 | +8 | +3 | −14 |
| Arapça | +%3 | −1 | +3 | +20 | +11 | −19 |

**Nasıl okunmalı:**
- Çincenin ortalamadaki üstünlüğü büyük ölçüde iki Çin modelinden geliyor (Qwen −37, DeepSeek −53).
  Sen ChatGPT, Claude ve Gemini kullanıyorsun; bunlarda fark ya küçük ya İngilizce lehine.
- DeepSeek'in tokenizer'ı Türkçede belirgin şekilde kötü: Türkçe, İngilizceden %80 fazla token
  harcıyor. Yerel bir DeepSeek modeline aktarırken İngilizceye çevirmenin kazancı en büyük burada.
- Japonca ve Korece Türkçeden ucuz değil. Diller arasındaki asıl ayrım "İngilizce/Çince" ile
  "geri kalanı" arasında.
- Eski GPT-4 tokenizer'ında (cl100k) farklar çok daha büyüktü (Türkçe +%66, Arapça +%165).
  o200k bu farkı büyük ölçüde kapattı.

**Sınırlar:** Örnek küçük (4 metin, 10 dil) ve çeviriler benim. Bu yüzden yüzdeleri ±5 puan
belirsizlikle oku. Sonuçlar, çok daha büyük bir paralel derlem olan FLORES-200 ile yapılmış
literatür bulgularıyla aynı yönde (aşağıda).

## Doğruluk: hangi dilde daha iyi cevap?

- **MMLU-ProX** (29 dil, 5-shot CoT, EMNLP 2025; Tablo 3): en güçlü modellerde İngilizce
  %79,5–80,7. Aynı modellerde Çince %73,9–78,0, Japonca %72,9–77,1, Almanca %75,1–80,4. Yani Çince
  sorulduğunda İngilizceden 1–5 puan daha kötü sonuç çıkıyor. Türkçe bu benchmark'ta yok.
- **"Is Translation All You Need?"** (NAACL 2025): İngilizce merkezli modeller İngilizceye çevrilmiş
  sorularda daha iyi; çok dilli güçlü modellerde fark azalıyor ya da kayboluyor.
- **Kültüre bağlı içerik ters yönde:** CulturALL (2026) testinde İngilizce sorular, yerel dildeki
  sorulardan %8 daha düşük puan aldı. Türkiye'ye özgü bir konuyu (hukuk, eğitim sistemi, yerel
  kültür) İngilizceye çevirmek nüansı kaybettirebilir.
- **"Chinese is not more efficient than English in vibe coding"** (2026): Çince istemler bazı
  modellerde 1,28 kat daha fazla token harcadı ve başarı oranları İngilizceden düşük kaldı.
  İnternette dolaşan "Çince %40 ucuz" iddiası tokenizer'a bağlı.

## Eklenti için öneri

> **Uygulandı (20 Kasım 2026):** "Kompakt bağlam" seçeneği ve dile duyarlı token tahmini eklendi.
> Ayrıntılar aşağıda ve CHANGELOG'da.

1. **"Çinceye çevir" yapılmasın.** Kullandığın platformlarda kazanç ya yok ya İngilizceden küçük;
   doğruluk da düşüyor.
2. **İsteğe bağlı "Kompakt bağlam (İngilizce)" yapılabilir:**
   - Yalnızca aktarılan *geçmiş* çevrilir. Son mesajın, kod blokları, alıntılar, isimler ve
     sayılar olduğu gibi kalır.
   - Çeviri Chrome'un cihaz içi çeviri API'siyle yapılır, internete hiçbir şey gitmez.
   - Pakete "Bana Türkçe cevap ver" talimatı eklenir.
   - Kazanç GPT'de %20–30, yerel DeepSeek'te %45–50.
   - Varsayılan kapalı olmalı ve yanında "çeviri anlam kaybına yol açabilir" uyarısı bulunmalı.
3. **Daha büyük kazanç başka yerde:** belgeleri ana hatlar + ilgili bölümlerle taşımak (eklendi),
   kırpma ve özet modları. Bunlar %50–90 tasarruf sağlayabiliyor; dil değiştirmek en iyi durumda
   ~%30.
4. **Cevap token'ları:** Cevabı Türkçe istediğin sürece modelin ürettiği metin Türkçe kalır. Çeviri
   yalnızca girdiyi küçültür; uzun cevaplarda toplam tasarruf daha da azdır.

## Token tahmini

Paket boyutunu gösteren tahmin eskiden "karakter ÷ 4" idi. FLORES-200'de o200k ile karşılaştırınca
İngilizceyi %23 fazla, Türkçeyi %11 eksik, Çince/Japonca/Korece'yi %58–67 eksik saydığı görüldü;
yani diyalog Türkçe bir sohbeti İngilizce çevirisinden *küçük* gösteriyordu. Yeni tahmin kelime
sayısı, ASCII harf, ASCII dışı Latin harf (ğ, ş, é), Kiril, Arap, CJK karakterleri, noktalama ve
noktalama dizileri üzerinden en küçük kareler ile kuruldu (FLORES-200 devtest, 10 dil, bu projenin
kodu). Görülmemiş veride sapma: FLORES dev'de her dilde ±%5 (İngilizce +%3,6, Türkçe −%3,0),
sohbet metninde Türkçe −%1,6, İngilizce +%1,8, kodda +%2–15.

## Kaynaklar

- FLORES-200 paralel derlemi (NLLB Team, Meta) — https://github.com/facebookresearch/flores/tree/main/flores200
- Petrov ve ark., *Language Model Tokenizers Introduce Unfairness Between Languages*, NeurIPS 2023 —
  https://proceedings.neurips.cc/paper_files/paper/2023/hash/74bb24dca8334adce292883b4b651eda-Abstract.html
  (ölçüm aracı: https://github.com/AleksandarPetrov/tokenization-fairness)
- *MMLU-ProX: A Multilingual Benchmark for Advanced LLM Evaluation*, EMNLP 2025 —
  https://arxiv.org/html/2503.10497 · https://aclanthology.org/2025.emnlp-main.79.pdf
- *Is Translation All You Need? A Study on Solving Multilingual Tasks with LLMs*, NAACL 2025 —
  https://aclanthology.org/2025.naacl-long.485.pdf
- *CulturALL: Benchmarking Multilingual and Multicultural Competence of LLMs*, 2026 —
  https://arxiv.org/pdf/2604.19262
- *Chinese Language Is Not More Efficient Than English in Vibe Coding*, 2026 —
  https://arxiv.org/abs/2604.14210
- Scale AI, *MultiNRC* (çeviri paradoksu) — https://scale.com/blog/multinrc
- Topluluk ölçümleri (küçük örneklem, gösterge niteliğinde): Claude tokenizer'ında Korece İngilizcenin
  1,88 katı — https://jangwook.net/en/blog/en/multilingual-llm-token-tax-experiment/ ;
  GPT-5, Claude ve GPT-4'te kelime başına token karşılaştırması —
  https://dev.to/savi444/tokens-per-word-gpt-5-vs-claude-vs-gpt-4-measured-across-7-languages-4419
