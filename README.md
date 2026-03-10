# Disbox Linux ⬡

Disbox-Linux adalah aplikasi desktop penyimpanan awan (cloud storage) modern untuk Linux yang memanfaatkan Discord sebagai media penyimpanan. Aplikasi ini dibangun menggunakan **Electron** dan **React** untuk memberikan pengalaman pengguna yang mulus, ringan, dan canggih.

![Main UI](preview/file_explorer.png)

## 🚀 Fitur Utama

*   **Penyimpanan Tak Terbatas:** Manfaatkan Discord Webhook untuk menyimpan file tanpa batasan kuota.
*   **Virtual File System:** Kelola file Anda dengan struktur folder, layaknya Google Drive atau Dropbox.
*   **Sistem Chunking Pintar:** File besar otomatis dipecah menjadi bagian-bagian kecil (8MB) untuk stabilitas upload.
*   **Pratinjau File Langsung:**
    *   **Gambar:** PNG, JPG, WebP, SVG.
    *   **Media:** Pemutar Video dan Audio bawaan.
    *   **Dokumen:** Viewer PDF terintegrasi.
    *   **Kode:** *Syntax Highlighting* untuk berbagai bahasa pemrograman (JS, Python, Rust, dll).
*   **Sinkronisasi Metadata:** Metadata disimpan secara lokal dan disinkronkan ke Discord untuk akses antar perangkat.
*   **Manajemen File:** Mendukung multi-select untuk hapus massal, pindah folder, dan salin file.
*   **Mode Gelap/Terang:** Antarmuka modern yang dapat disesuaikan dengan preferensi Anda.

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

1.  Kloning repositori ini:
    ```bash
    git clone https://github.com/naufal-backup/disbox-linux.git
    cd disbox-linux
    ```

2.  Jalankan script setup atau install dependensi secara manual:
    ```bash
    chmod +x setup.sh
    ./setup.sh
    # ATAU
    npm install
    ```

## 🖥 Penggunaan

### Mode Pengembangan
Jalankan aplikasi dalam mode pengembangan dengan fitur *hot-reload*:
```bash
npm run dev
```

### Build Aplikasi
Untuk membuat paket aplikasi (`.AppImage` atau `.deb`):
```bash
npm run build
```
Hasil build akan tersedia di folder `release/`.

## 🔒 Keamanan & Privasi

Disbox menggunakan **Discord Webhook** sebagai endpoint penyimpanan. Data Anda aman karena tidak ada server perantara (serverless). Metadata file Anda dienkripsi secara ringan dan hanya Anda yang memiliki akses melalui URL Webhook pribadi Anda.

## 🤝 Kontribusi

Laporan bug dan Pull Request sangat kami hargai!
1. Fork repositori.
2. Buat branch fitur (`git checkout -b fitur-keren`).
3. Commit perubahan (`git commit -m 'Menambah fitur keren'`).
4. Push ke branch (`git push origin fitur-keren`).
5. Buat Pull Request.

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**.
