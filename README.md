# 📑 PDF Tools – Browser-based PDF Merger

Frontend-only PDF merger built with **React + Vite + TypeScript**.  
Drag & drop PDFs, reorder them visually, and merge into a single file — **all locally in your browser**.  
No server. No uploads. 100% client-side.

👉 **Live demo:** [kraspel.com/pdf-tools](https://www2.kraspel.com/pdf-tools)

---

## ✨ Features

- 📂 **Drag & Drop PDFs** into the page
- 🔀 **Reorder PDFs** via drag-and-drop (powered by [@dnd-kit](https://dndkit.com/))
- 📄 **Thumbnail previews** of the first page
- 📝 **Rename output file** before downloading
- ⚡ **Fast & secure** — all work is done in your browser using:
  - [`pdf-lib`](https://github.com/Hopding/pdf-lib) (merging pages)
  - [`pdfjs-dist`](https://github.com/mozilla/pdf.js/) (rendering thumbnails)
- 🛡️ **Privacy-friendly** — your PDFs never leave your device

---

## 🚀 Getting Started

Clone the repo and install dependencies:

```bash
git clone https://github.com/yourusername/pdf-tools.git
cd pdf-tools
npm install
```

Run in development mode:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the build:

```bash
npm run preview
```

---

## 📂 Project Structure

```
pdf-tools/
├── public/         # static assets (favicon, logo, etc.)
├── src/
│   ├── components/ # UI components (e.g. SortableCard)
│   ├── lib/        # PDF helpers (fileToBytes, makeThumb, types)
│   └── App.tsx     # main app logic
├── vite.config.ts
├── index.html
└── package.json
```

---

## 🛠️ Tech Stack

- [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) (utility-first styling)
- [@dnd-kit](https://github.com/clauderic/dnd-kit) (sortable drag & drop)
- [pdf-lib](https://pdf-lib.js.org/) (PDF manipulation)
- [pdfjs-dist](https://github.com/mozilla/pdf.js) (PDF parsing + thumbnails)

---

## 📖 Usage

1. Open the app in your browser ([demo link](https://www2.kraspel.com/pdf-tools)).
2. Drop one or more PDFs into the upload box.
3. Reorder them as needed.
4. Set an output filename (optional).
5. Click **Merge PDFs** and download the merged file.

---

## 📜 License

MIT License © 2025 \Tal Kramer
