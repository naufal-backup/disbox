# Disbox ⬡

Disbox adalah aplikasi desktop penyimpanan awan (cloud storage) modern yang memanfaatkan Discord sebagai media penyimpanan tak terbatas. Dibangun dengan **Electron** dan **React**, Disbox menawarkan pengalaman pengelolaan file yang ringan, aman, dan tersedia untuk **Linux** maupun **Windows**.

![Main UI](preview/file_explorer.png)

## 🚀 Fitur Utama

*   **Penyimpanan Tak Terbatas:** Manfaatkan Discord Webhook untuk menyimpan file tanpa batasan kuota.
*   **Virtual File System:** Kelola file Anda dengan struktur folder, layaknya Google Drive atau Dropbox.
*   **SQLite Engine (Optimized):** Metadata dikelola menggunakan SQLite dengan **WAL (Write-Ahead Logging) Mode** untuk sinkronisasi kilat dan integritas data yang sangat stabil.
*   **Dukungan Multi-Bahasa:** [BARU] Tersedia dalam bahasa **Indonesia**, **English**, dan **Mandarin (China)** untuk kenyamanan pengguna global.
*   **Validasi Integritas Data:** [BARU] Sistem pengecekan otomatis untuk mencegah duplikasi nama file/folder di lokasi yang sama saat pembuatan, pemindahan, atau pengubahan nama.
*   **Enkripsi AES-GCM:** Keamanan tingkat tinggi untuk setiap file dan folder dengan enkripsi *end-to-end* menggunakan kunci yang diturunkan dari URL Webhook Anda.
*   **Sistem Kunci (Locking) v3.0:** Lindungi file sensitif dengan Master PIN. Fitur buka kunci kini mendukung penempatan ke folder tujuan manapun.
*   **UI/UX Modern & Responsif:** 
    *   Toolbar terstandarisasi (32px) untuk estetika yang simetris.
    *   Sistem Sorting kustom (Nama, Terbaru, Ukuran).
    *   Smart Breadcrumb yang tetap fungsional di folder sangat dalam.
    *   Context Menu cerdas yang tidak terpotong di pinggir layar.
*   **Multi-Snapshot Rolling:** Sistem cadangan otomatis yang menyimpan 3 snapshot metadata terakhir di Discord.
*   **Sistem Chunking Pintar:** File besar otomatis dipecah menjadi bagian-bagian kecil (10MB - 500MB) sesuai limit akun Discord Anda.
*   **Sinkronisasi Antar Perangkat:** Sinkronisasi metadata otomatis antara versi Desktop dan Mobile dengan polling latar belakang setiap 30 detik.
*   **Pratinjau File Langsung:** Dukungan Gambar, Video, Audio, PDF, dan Kode (*Syntax Highlighting*).
*   **Versi Dinamis:** Info versi di Settings yang selalu terhubung dengan rilis terbaru di GitHub API.

## 🌍 Lokalisasi

Disbox mendukung pengaturan bahasa secara dinamis:
- 🇮🇩 **Indonesia** (Default)
- 🇺🇸 **English**
- 🇨🇳 **Mandarin (China)**

Pengaturan dapat diubah kapan saja melalui menu **Settings > Language**.

## 📸 Cuplikan Layar

| Login Page | File Explorer |
|:---:|:---:|
| ![Login](preview/login_page.png) | ![Drive](preview/file_explorer.png) |

| Document Viewer | Context Menu |
|:---:|:---:|
| ![Preview](preview/preview_documents.png) | ![Context](preview/right_click.png) |

## 🛠 Prasyarat

Pastikan sistem Anda memiliki komponen berikut:
*   **Node.js** (v18 atau lebih baru)
*   **npm** atau **yarn**

## ⚙️ Instalasi
   **Automatic Install**
    [Releases](https://github.com/naufal-backup/disbox/releases)
1.  **Kloning repositori ini:**
    ```bash
    git clone https://github.com/naufal-backup/disbox.git
    cd disbox
    ```

2.  **Instal dependensi:**
    *   **Linux:**
        ```bash
        chmod +x setup.sh
        ./setup.sh
        ```
    *   **Windows / Umum:**
        ```bash
        npm install
        ```

## 🖥 Penggunaan

### Mode Pengembangan
Jalankan aplikasi dalam mode pengembangan dengan fitur *hot-reload*:
```bash
npm run dev
```

### Build Aplikasi (Produksi)
Untuk membuat paket aplikasi siap pakai:
```bash
npm run build
```
Hasil build akan tersedia di folder `release/`:
*   **Linux:** `.AppImage` dan `.deb`
*   **Windows:** `.exe` (Setup), Portable, dan `.zip`

## 🔒 Keamanan & Privasi

Disbox menggunakan **Discord Webhook** sebagai endpoint penyimpanan. Data Anda aman karena tidak ada server perantara (serverless). 

**Penyimpanan Lokal (Optimized):**
Aplikasi menggunakan **SQLite Database** (`disbox.db`) dengan optimasi performa tinggi (**WAL Mode & Synchronous Normal**). Hal ini menjamin proses tulis-baca metadata ribuan file terjadi secara instan tanpa risiko kerusakan database saat aplikasi ditutup tiba-tiba.

Metadata file Anda dienkripsi secara aman menggunakan **AES-GCM 256-bit** dan hanya Anda yang memiliki akses melalui URL Webhook pribadi Anda.

## 🤝 Kontribusi

Laporan bug dan Pull Request sangat kami hargai!
1. Fork repositori.
2. Buat branch fitur (`git checkout -b fitur-keren`).
3. Commit perubahan (`git commit -m 'Menambah fitur keren'`).
4. Push ke branch (`git push origin fitur-keren`).
5. Buat Pull Request.

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.

---

**Developed by Naufal Gastiadirrijal Fawwaz Alamsyah**
*   GitHub: [naufal-backup](https://github.com/naufal-backup)
*   LinkedIn: [Naufal Alamsyah](https://www.linkedin.com/in/naufal-gastiadirrijal-fawwaz-alamsyah-a34b43363)
*   Email: naufalalamsyah453@gmail.com
