---
title: TAGIH, Agentic Collections on PayPal untuk Freelancer dan Usaha Kecil
summary: Tagih mengubah setiap invoice PayPal yang lewat jatuh tempo menjadi satu kasus penagihan. Agen AI
  membaca riwayat bayar klien lewat tool PayPal, menebak alasan telat dengan bukti, dan mengusulkan strategi
  penagihan yang peluang berhasilnya tercatat. Policy kode memutuskan apa yang boleh berjalan sendiri. Aksi ke
  PayPal hanya lewat satu jalur kode. Kasus baru ditutup ketika PayPal menyatakan invoice PAID.
tags: paypal, invoicing, agentic-commerce, collections, claude, human-in-the-loop, freelancer, smb
version: 1.0
updated: 2026-11-12
event: PayPal AI Hackathon (Devpost), deadline 13 Nov 2026 03:00 WIB
---

Dokumen ini adalah spesifikasi produk untuk Tagih. Pembacanya tim, juri yang ingin memahami keputusan desain, dan siapa pun
yang merevisi pitch. Formatnya mengikuti PRD Praxis (tim yang sama): setiap klaim diberi label, dan apa yang belum dibangun
ditandai Rencana.

**Cara membaca label:**

- **Tanpa label:** sudah ada di kode repository ini.
- **Rencana:** belum ada di kode. Jangan disajikan sebagai fitur yang sudah jadi.
- **[S]:** sumber sekunder. Sebutkan sumbernya jika dipakai di slide atau video.
- **[A]:** asumsi tim atau data sintetis. Jangan disajikan sebagai fakta.

---

## Idea

Freelancer dan usaha kecil sudah bisa membuat invoice dengan mudah, termasuk lewat PayPal. Masalahnya ada **setelah** invoice
terkirim. Klien telat bayar, lalu pemilik usaha harus mengingat siapa yang belum bayar, menebak kenapa, memilih nada pesan yang
tidak merusak hubungan, dan mengecek berulang kali apakah uangnya sudah masuk. Pekerjaan ini canggung, berulang, dan sering
ditunda, sehingga piutang menumpuk.

**Tagih** membawa satu invoice yang telat menjadi satu **Collection Case**, dari sinyal telat sampai uang terbukti masuk:

1. Mendeteksi invoice PayPal yang lewat jatuh tempo dan membuka kasus.
2. Agen AI menyelidiki: riwayat bayar klien, umur piutang, reminder yang sudah dikirim, dan hasil strategi serupa di masa lalu.
   Setiap klaim harus menunjuk ke tool call yang menghasilkannya.
3. Agen menyusun 2–3 opsi penagihan dari **action library** yang tetap, lengkap dengan pesan siap kirim, lalu memilih satu.
4. Kode memvalidasi rencana: sitasi, angka, dan apakah tindakan ada di library. Rencana yang tidak lolos dikembalikan ke agen.
5. **Policy deterministik** memutuskan: jalan sendiri, perlu persetujuan pemilik usaha, atau diblokir.
6. **Executor (kode, bukan LLM)** menjalankan aksi di PayPal: reminder, reissue dengan diskon, atau memecah tagihan.
7. **Verifier** membaca status invoice di PayPal. Kasus **PAID hanya jika PayPal menyatakan dibayar**. Jika jendela tunggu habis,
   kasus dibuka ulang dan agen menyusun langkah eskalasi dengan mengetahui apa yang sudah gagal.
8. Hasilnya masuk ke **playbook**: tingkat keberhasilan per strategi per segmen klien, dipakai rencana berikutnya.

> **"The agent proposes, policy decides, PayPal executes, and the money confirms."**

**Kalimat inti untuk pitch:** "Sending an invoice takes a minute. Getting paid takes weeks of awkward follow-ups. Tagih turns
every overdue PayPal invoice into a case an AI agent works on, inside limits you set, and only closes it when PayPal says
the money arrived."

**Tagline:** *"Get paid without the awkward follow-ups."*

Tiga masalah yang dijawab:

1. **Follow-up tertunda:** pemilik usaha tidak tahu invoice mana yang perlu ditagih hari ini, dan menundanya karena canggung.
2. **Strategi asal:** semua klien dikirimi pesan yang sama, padahal klien yang kesulitan cash flow butuh cicilan, bukan pesan yang lebih keras.
3. **Tidak ada umpan balik:** tidak ada catatan strategi mana yang benar-benar membuat klien membayar.

### Batas demo

- **PayPal:** Invoicing API v2 di **sandbox**. Tanpa kredensial, aplikasi memakai **simulator PayPal** dengan antarmuka yang sama,
  berlabel SIMULATED di UI. Dengan kredensial sandbox, semua invoice, reminder, pembatalan, dan reissue adalah panggilan PayPal sungguhan.
- **AI:** Claude (`claude-opus-5-5`) lewat Anthropic SDK. Tanpa `ANTHROPIC_API_KEY`, rule engine deterministik mengambil alih, dan
  setiap langkah mencatat engine mana yang menjawab.
- **Waktu:** jatuh tempo memakai **demo clock** yang bisa dimajukan, karena siklus penagihan berjalan dalam hitungan hari.
- **Riwayat bayar dan playbook awal:** sintetis [A], berlabel "seed history".
- **Pembayaran:** di mode sandbox, juri membayar sebagai akun buyer sandbox lewat link invoice PayPal. Di mode simulator,
  tombol "Client pays" menyimulasikan pembayaran.

---

## Urgensi Masalah

| Angka | Nilai | Sumber dan cakupan | Label |
|---|---|---|---|
| Freelancer AS yang pernah kesulitan menagih pembayaran | Sekitar 71% | Freelancers Union, *Freelancing Isn't Free* (2015). Survei AS, bukan Indonesia | [S], perlu dicek ulang sebelum dipakai di video |
| Rata-rata nilai pembayaran yang tidak tertagih per freelancer per tahun | Sekitar US$6.000 | Sumber sama | [S], perlu dicek ulang |
| Waktu pemilik usaha kecil untuk menagih | Beberapa jam per minggu | Asumsi tim dari wawancara informal, belum diukur | [A] |

Angka-angka ini hanya membingkai masalah. Klaim dampak Tagih di bagian [Dampak](#dampak) adalah asumsi sampai diuji di pilot.

### Kenapa alat yang ada belum cukup

| Alat | Yang dilakukan | Yang tidak dilakukan |
|---|---|---|
| Reminder otomatis bawaan aplikasi invoice (termasuk PayPal) | Mengirim pengingat terjadwal dengan teks yang sama | Tidak membedakan klien, tidak memilih strategi, tidak belajar dari hasil |
| Chatbot umum | Menulis draf pesan penagihan | Tidak membaca data invoice, tidak bertindak di PayPal, tidak tahu apakah uang masuk |
| Agen "LLM + semua tool PayPal" | Bisa mengirim dan membatalkan invoice dari prompt | Model memegang tool tulis. Satu prompt injection di catatan klien bisa memberi diskon 90% |

Tagih mengisi celah di antaranya: agen yang benar-benar menyelidiki dan merencanakan, tetapi kekuasaannya dibatasi kode, dan
keberhasilannya diukur dengan uang yang masuk.

---

## Persona

| Persona | Kebutuhan | Yang dilakukan di Tagih |
|---|---|---|
| **Freelancer / pemilik usaha kecil** (pengguna utama) | Dibayar tepat waktu tanpa merusak hubungan dengan klien | Membuat invoice dari chat, melihat kasus, menyetujui atau menolak rencana, mengatur batas otonomi |
| **Klien** (penerima invoice) | Tagihan yang jelas dan mudah dibayar | Menerima email PayPal (invoice, reminder, reissue) dan membayar lewat PayPal |
| **Juri / reviewer** | Melihat agen bekerja dan mencobanya sendiri | Menjalankan demo end to end di hosted URL atau lokal |

---

## Scope

### Yang dibangun

| Fitur | Isi |
|---|---|
| Invoice dari chat | Tempel percakapan atau tulis bebas. Claude mengekstrak klien, item, nominal, dan jatuh tempo ke draf terstruktur. Pemilik usaha mengedit, lalu invoice dibuat dan dikirim lewat PayPal |
| Receivables board | Semua invoice dengan status PayPal, umur piutang, dan kasus terkait |
| Collection case | Satu kasus per invoice telat, dengan live agent run, rencana, policy, keputusan, dan verifikasi |
| Live agent run | Stepper fase, trace langsung (tool call beserta alasannya, keputusan, validasi, policy, panggilan PayPal), waktu relatif, chip engine |
| Policy dan otonomi | Aturan P1–P7, mode `always_ask` / `policy_based`, ambang yang bisa diatur |
| Executor PayPal | `remind`, `cancel` + `create` + `send` untuk diskon atau cicilan, idempoten per attempt |
| Verifier dan playbook | Sinkron status PayPal, PAID atau reopen dan eskalasi, pembaruan statistik strategi |
| Demo controls | Buat invoice demo, majukan demo clock, simulasi pembayaran (hanya di mode simulator), reset |

### Di luar scope

- Penagihan lewat WhatsApp atau SMS. Semua komunikasi ke klien lewat email PayPal. **Rencana.**
- Webhook PayPal. Verifier memakai polling saat sinkron. **Rencana:** `INVOICING.INVOICE.PAID`.
- Multi-user dan login. Demo memakai satu pemilik usaha.
- Penagihan hukum atau penjualan piutang.

---

## Arsitektur Agent

Prinsip: **penalaran oleh model, angka dan batas oleh kode, eksekusi oleh kode, keputusan berisiko oleh orang, kebenaran oleh PayPal.**

| Stage | Pelaku | Jenis | Pertanyaan yang dijawab | Keluaran | Tidak boleh |
|---|---|---|---|---|---|
| Signal | Overdue scanner | Kode | Invoice mana yang lewat jatuh tempo dan belum dibayar? | Kasus baru, `OPEN` | Membuka kasus ganda untuk invoice yang sama |
| Investigate + Plan | **Collections agent (Claude)** | AI | Kenapa klien ini telat, dan apa langkah terbaik? | `CollectionPlan`: alasan, confidence, bukti bersitasi, 2–3 opsi, rekomendasi | Memegang tool tulis PayPal, mengarang angka, memakai tindakan di luar library |
| Validate | Plan validator | Kode | Apakah setiap fakta menunjuk ke tool call nyata? Apakah angka cocok? | pass, atau kembali ke agen (maks. 2 kali) | Mengubah isi rencana |
| Policy | Policy engine | Kode | Boleh jalan sendiri, perlu orang, atau diblokir? | Daftar aturan yang terpicu dan vonis | Dibujuk lewat prompt |
| Approve | Pemilik usaha | Manusia | Setuju dengan opsi ini? | Approve opsi mana pun, edit pesan, atau tolak | – |
| Execute | Executor | Kode | Panggilan PayPal apa yang harus dibuat? | Reminder, reissue, invoice cicilan | Bertindak tanpa vonis policy atau approval |
| Verify | Verifier | Kode + PayPal | Apakah uangnya masuk? | `PAID`, atau reopen dengan eskalasi | Menutup kasus tanpa status PayPal |
| Learn | Playbook | Kode | Strategi mana yang berhasil untuk segmen ini? | Statistik tries, paid, dan hari sampai bayar | Mencatat hasil yang belum diverifikasi |

### Alur

```
PayPal invoice lewat jatuh tempo (demo clock)
        │
        v
 (1) Signal (kode) ──> kasus OPEN, satu per invoice
        │
        v
 (2) Collections agent (Claude, tool baca saja)
     get_invoice · get_client_history · get_reminder_log · get_playbook · get_action_library
     setiap tool call membawa `why` → tampil live di trace
        │ submit_plan
        v
 (3) Validator (kode) ── gagal ──> feedback ke agen (maks. 2x) ──> rule engine jika tetap gagal
        │ lolos
        v
 (4) Policy P1–P7 (kode)
        │ diblokir → BLOCKED      │ perlu orang → AWAITING_APPROVAL ──> pemilik usaha
        │ auto (mode policy_based)                                         │ approve
        v <────────────────────────────────────────────────────────────────┘
 (5) Executor (kode) ──> PayPal Invoicing API v2  (remind / cancel + create + send)
        │
        v
 (6) WAITING_PAYMENT ── Verifier membaca PayPal ──> PAID → playbook +1 berhasil
                                              └── jendela habis → playbook +1 gagal → attempt 2 → (2) dengan konteks eskalasi
                                                   (attempt 3 gagal → ESCALATED ke pemilik usaha)
```

### Keputusan desain kunci

- **Agen tidak memegang tool tulis.** PayPal Agent Toolkit membuat tool tulis mudah diberikan ke LLM. Tagih sengaja tidak
  melakukannya: agen hanya membaca dan mengembalikan rencana terstruktur lewat `submit_plan`. Semua penulisan ke PayPal lewat
  `executor.ts` setelah policy. Ini sejalan dengan OWASP LLM06 *Excessive Agency*.
- **Data klien adalah data, bukan instruksi.** Deskripsi invoice dan catatan klien yang mirip perintah ke AI ditandai
  `suspicious_instruction` oleh kode, dan policy P7 memblokir rencana yang mengutipnya.
- **Angka dari kode.** Tingkat keberhasilan di rencana disalin dari tool `get_playbook`, dan validator menolak angka yang tidak cocok.
- **Satu jalur tulis, idempoten.** Setiap aksi PayPal punya kunci `case#attempt#action`, jadi klik ganda tidak mengirim dua reminder.
- **Trace terlihat.** Setiap langkah disimpan sebagai event dengan aktor (Agent, Code, PayPal, You, Client), engine, waktu, dan data mentah.
- **Fallback jujur.** Jika model tidak tersedia atau rencananya tetap gagal validasi, rule engine menjawab dan trace mengatakannya.

---

## Kemampuan Agent

### 1. Collections agent (AI)

**Model:** `claude-opus-5-5`, adaptive thinking, effort `medium`, fallback server-side `default` untuk refusal.

**Tools (semua baca):**

| Tool | Isi |
|---|---|
| `get_invoice` | Invoice dari PayPal: nominal, jatuh tempo, status, hari telat, reminder terkirim |
| `get_client_history` | Semua invoice klien: berapa yang dibayar, rata-rata hari telat, berapa reminder yang biasanya dibutuhkan, segmen klien |
| `get_reminder_log` | Attempt sebelumnya di kasus ini: strategi, kapan, hasilnya |
| `get_playbook` | Statistik per strategi untuk segmen klien: tries, paid, rate (prior Laplace), rata-rata hari sampai bayar |
| `get_action_library` | Tindakan yang boleh diusulkan, beserta batas (diskon maksimum, cicilan maksimum) |
| `submit_plan` | Mengembalikan `CollectionPlan`. Bukan tool tulis: hasilnya divalidasi kode |

**Aturan di prompt:**

- Setiap tool call wajib menyertakan `why`: satu kalimat tentang apa yang ingin dipastikan. Ini yang tampil di trace.
- Setiap `fact` wajib punya `source` berupa `call_id` dari tool call di kasus ini. Klaim tanpa sumber berlabel `assumption` atau `unknown`.
- Alasan telat dipilih dari daftar tetap: `forgot`, `cash_flow`, `unhappy_with_work`, `wrong_contact`, `habitual_late_payer`, `unknown`.
- Sebut penjelasan pesaing terdekat dan bukti yang melemahkannya (`considered`).
- Pada attempt kedua dan seterusnya, jangan ulangi strategi yang sudah gagal kecuali ada alasan baru.
- Pesan ke klien ditulis sopan, spesifik (nomor invoice, nominal, link bayar disisipkan oleh kode), tanpa ancaman.

### 2. Plan validator (kode)

Memeriksa: setiap `fact` mengutip `call_id` yang benar-benar ada; `expectedPayRate` cocok dengan output `get_playbook` (toleransi 0,01);
tindakan ada di library; diskon dan cicilan dalam batas library; `recommended` menunjuk ke opsi yang ada; pesan tidak kosong.
Hasilnya `pass`, atau daftar masalah yang dikirim balik ke agen sebagai `tool_result` dengan `is_error`. Batasnya 2 kali.

### 3. Policy engine (kode)

| ID | Aturan | Akibat |
|---|---|---|
| P1 | Nominal invoice di atas ambang (default US$500) | Butuh orang |
| P2 | Tindakan mengubah uang: diskon atau cicilan | Butuh orang |
| P3 | Confidence agen di bawah 0,6 | Butuh orang |
| P4 | Attempt ketiga atau lebih (eskalasi) | Butuh orang |
| P5 | Reminder terakhir kurang dari N hari lalu (default 3, anti-spam) | **Blokir** sampai jeda habis |
| P6 | Invoice tidak lagi bisa ditagih (PAID, CANCELLED, REFUNDED) | **Blokir**, kasus ditutup |
| P7 | Rencana mengutip data bertanda `suspicious_instruction`, atau diskon di atas batas | **Blokir** |

**Mode otonomi** (diatur pemilik usaha):

| Mode | Perilaku |
|---|---|
| `always_ask` (default) | Semua aksi PayPal menunggu orang |
| `policy_based` | Berjalan tanpa orang hanya jika tidak ada aturan yang terpicu |

Blokir berlaku di semua mode. Tab Decision menampilkan setiap aturan sebagai syarat (terpenuhi atau menahan) dan vonisnya.

### 4. Executor (kode)

| Tindakan | Panggilan PayPal |
|---|---|
| `friendly_nudge` | `POST /v2/invoicing/invoices/{id}/remind` dengan subject dan note dari rencana |
| `firm_reminder` | `remind` dengan nada tegas dan tanggal bayar yang diminta |
| `early_pay_discount` | `cancel` invoice lama → `create` invoice baru dengan nominal terdiskon dan jatuh tempo pendek → `send` |
| `split_payment` | `cancel` invoice lama → `create` + `send` N invoice cicilan dengan jatuh tempo bertahap |
| `personal_call` | Tidak ada panggilan PayPal. Tugas untuk pemilik usaha, dengan skrip telepon dari agen |

### 5. Verifier dan playbook (kode)

| Hasil | Status kasus | Playbook |
|---|---|---|
| PayPal: `PAID` / `MARKED_AS_PAID` (semua invoice pengganti, jika di-split) | `PAID` | `paid +1`, hari sampai bayar dicatat |
| Jendela tunggu habis (default 5 hari demo clock) | attempt baru, agen jalan lagi | `tries +1` tanpa paid |
| Attempt ke-3 gagal | `ESCALATED` | `tries +1` |

Tingkat keberhasilan memakai prior Laplace `(paid + 1) / (tries + 2)`, dan UI selalu menampilkan jumlah percobaan di sampingnya.

### 6. Invoice dari chat (AI)

Claude mengekstrak `InvoiceDraft` (klien, email, item, nominal, mata uang, jatuh tempo, catatan) dengan structured output.
Field yang tidak ada di teks dibiarkan kosong, tidak ditebak. Draf selalu diedit dan dikonfirmasi orang sebelum dikirim ke PayPal.

---

## Collection Case

| Status | Arti |
|---|---|
| `OPEN` | Invoice telat terdeteksi, agen belum jalan |
| `RUNNING` | Agen sedang bekerja (trace live) |
| `AWAITING_APPROVAL` | Policy menahan, menunggu pemilik usaha |
| `BLOCKED` | Policy memblokir (misal jeda reminder belum habis) |
| `EXECUTING` | Executor sedang memanggil PayPal |
| `WAITING_PAYMENT` | Aksi terkirim, verifier menunggu status PayPal |
| `PAID` | PayPal menyatakan dibayar. Kasus selesai |
| `ESCALATED` | Tiga attempt gagal. Pemilik usaha mengambil alih |
| `DISMISSED` | Pemilik usaha menolak rencana dan menutup kasus |
| `ERROR` | Kegagalan teknis, tercatat di trace |

---

## Flow Demo (≤ 3 menit)

1. **Masalah (15 detik).** Invoice terkirim itu mudah. Menagihnya yang canggung.
2. **Invoice dari chat.** Tempel chat klien → draf → kirim lewat PayPal → invoice muncul di board dengan status SENT dari PayPal.
3. **Majukan 7 hari.** Empat invoice lewat jatuh tempo → empat kasus terbuka.
4. **Live run, Kopi Lereng.** Stepper berjalan. Trace menampilkan tool call dan alasannya: riwayat telat 18 dan 25 hari,
   pernah minta bayar dua kali. Agen menebak masalah cash flow dan mengusulkan cicilan (3/3 berhasil di playbook).
5. **Policy.** P1 (US$1.250) dan P2 (cicilan) menahan → pemilik usaha approve → Executor membatalkan dan menerbitkan dua invoice cicilan di PayPal.
6. **Bayar.** Akun buyer sandbox membayar → Sync → Verifier membaca PAID → kasus PAID, playbook naik.
7. **Otonomi.** Ganti ke `policy_based` → kasus Studio Rimba (US$420, nudge sopan) berjalan sendiri tanpa orang. Tunjukkan Decision.
8. **Penutup.** Untuk siapa, kenapa penting, link repo dan demo.

---

## Dampak

Semua angka di bawah adalah **target pilot [A]**, bukan hasil.

| KPI | Cara mengukur | Target pilot [A] |
|---|---|---|
| Rata-rata hari telat | Selisih `paidAt` dan `dueDate` sebelum dan sesudah Tagih | Turun 30% |
| Invoice telat yang dibayar dalam 14 hari | Status PayPal | Naik dari baseline |
| Waktu pemilik usaha untuk menagih | Klik approve vs menulis pesan sendiri | Turun dari jam ke menit per minggu |
| Keputusan tanpa orang | Kasus `policy_based` yang lolos semua aturan | Naik seiring kepercayaan, tanpa insiden |

**Dampak non-bisnis:** freelancer dan usaha kecil lebih jarang menanggung biaya modal kerja klien yang lebih besar.

### Risiko

| Risiko | Mitigasi |
|---|---|
| Agen salah menilai klien dan mengirim nada yang salah | `always_ask` default, pesan bisa diedit sebelum dikirim, P3 untuk confidence rendah |
| Spam ke klien | P5 jeda reminder, satu kasus per invoice, idempotency key |
| Prompt injection lewat deskripsi invoice | Agen tidak punya tool tulis, penanda `suspicious_instruction`, P7 |
| Statistik playbook menyesatkan karena sampel kecil | Prior Laplace dan jumlah percobaan selalu ditampilkan |

---

## Diferensiasi

| | Reminder otomatis | Chatbot + draf | Agen dengan semua tool | **Tagih** |
|---|---|---|---|---|
| Membaca data PayPal nyata | Ya | Tidak | Ya | Ya |
| Strategi per klien | Tidak | Sebagian | Ya | Ya, dengan bukti bersitasi |
| Bertindak di PayPal | Ya | Tidak | Ya, oleh model | Ya, oleh kode setelah policy |
| Batas otonomi yang bisa diatur | Tidak | – | Tidak | Ya |
| Ditutup hanya jika uang masuk | Tidak | Tidak | Tidak | Ya |
| Belajar dari hasil | Tidak | Tidak | Tidak | Ya (playbook) |

---

## Strategi Penilaian

| Kriteria juri | Yang harus terlihat |
|---|---|
| Technological Implementation | Invoicing API v2 (create, send, remind, cancel, get, list), agen tool-use multi-langkah dengan Claude, validator, policy, verifier |
| Design | Alur utuh dari chat ke uang masuk, trace live yang bisa dibaca orang non-teknis, design system monokrom yang konsisten |
| Potential Impact | Masalah spesifik dan sering terjadi untuk audiens jelas (freelancer, usaha kecil). Ukurannya hari telat dan uang masuk |
| Innovation | Kasus ditutup oleh status pembayaran, bukan oleh "pesan terkirim". Otonomi berbatas yang diatur pemilik usaha |
| Presentation | Demo 3 menit sesuai Flow Demo di atas |

Kategori yang dikejar: Best Use of PayPal + AI, Best Use of Agentic Commerce, Most Impactful, Best Use of Render.

---

## FAQ

**Kenapa agennya tidak langsung memakai PayPal Agent Toolkit dengan semua tool tulis?**
Karena uang. Model yang memegang `cancel_invoice` dan `create_invoice` bisa dibujuk oleh teks di data klien. Agen Tagih
membaca dan mengusulkan, kode menulis. Itu tetap agentic: agen memilih tool, urutan, dan strategi sendiri.

**Apa bedanya dengan reminder otomatis PayPal?**
Reminder otomatis mengirim teks yang sama ke semua klien. Tagih memilih strategi per klien berdasarkan riwayat, bisa mengubah bentuk
tagihan (diskon, cicilan) dengan izin, dan mengukur apakah strategi itu berhasil.

**Apakah agennya benar-benar berpikir, atau mengikuti skrip?**
Pada engine Claude, agen memutuskan tool mana yang dipanggil dan kapan berhenti. Alasannya (`why`) tercatat per panggilan. Validator
bisa menolak rencana dan agen harus memperbaikinya. Penolakan itu terlihat di trace. Rule engine hanya jaring pengaman dan selalu diberi label.

**Kenapa ada demo clock?**
Penagihan berjalan dalam hitungan hari. Demo clock memajukan waktu aplikasi tanpa memalsukan data PayPal: invoice, reminder, dan pembayaran tetap nyata di sandbox.

**Data apa yang sintetis?**
Riwayat bayar empat klien demo dan statistik awal playbook [A]. Semuanya berlabel "seed history".
