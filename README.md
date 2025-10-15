# 🎬 CineForge  

CineForge is a modern, SEO-friendly entertainment and utility platform that blends AI-powered recommendations with a clean, responsive UI. Built with **vanilla HTML/CSS/JS**, the project delivers a fast, lightweight experience across six interactive tools and four core content pages — all unified under a consistent CineForge theme.  

---

## 🚀 Features  

### Core Pages  
- **Home** – AI movie & TV discovery with instant results  
- **Reels** – Short-form clips and highlights  
- **Blog** – Long-form content, reviews, and guides  
- **Explore Tools** – Hub to access all CineForge utilities  

### Tools (6 Integrated Modules)  
1. **Game Finder** – AI-driven game discovery & store links  
2. **Movie & TV Finder** – TMDB + Gemini powered recommendations  
3. **Code Generator** – Generate code snippets across multiple languages  
4. **PC Build Calculator** – Estimate cost & compatibility of custom builds  
5. **PSU Calculator** – Power supply requirements for hardware setups  
6. **FPS Calculator** – Predict frame rates for popular titles  

### Shared Modules  
- **Theme Toggle** – Universal light/dark mode  
- **Bookmarks** – Save & manage favorite results  
- **Gemini Integration** – AI response layer for tools  

---

## 🛠️ Tech Stack  

- **Frontend:** HTML5, CSS3, JavaScript (modular structure)  
- **AI/Backend API:** Google Gemini (proxied via custom helper)  
- **Styling:** Responsive, mobile-first design, dark-first UI  
- **SEO:** Optimized meta tags, semantic HTML, fast load speed  

---

## 📂 Project Structure  

```
cineforge/
│
├── index.html           # Home page
├── reels.html           # Reels page
├── blog.html            # Blog page
├── tools.html           # Explore Tools hub
│
├── tools/               # Individual tool pages
│   ├── game-finder.html
│   ├── movie-finder.html
│   ├── code-generator.html
│   ├── pc-build-calculator.html
│   ├── psu-calculator.html
│   └── fps-calculator.html
│
├── assets/
│   ├── css/style.css
│   ├── js/app.js
│   ├── js/ui.js
│   ├── js/sections.js
│   └── js/tools/        # Tool-specific scripts
│       ├── gemini.js
│       ├── game-finder.js
│       ├── code-generator.js
│       └── ...
│
└── README.md
```

---

## ⚡ Setup & Usage  

1. Clone the repository  
   ```bash
   git clone https://github.com/Coderz43/cineforge.git
   cd cineforge
   ```

2. Open any `.html` file directly in your browser  
   - `index.html` → Homepage  
   - `tools/game-finder.html` → Game Finder tool  

3. Configure your **Gemini API key**:  
   - Add it via `<meta name="gemini-key" content="YOUR_API_KEY">` in HTML  
   - Or save it in `localStorage` with key `cf-gemini-key`  

---

## 📌 Roadmap  

- [ ] Add user authentication & profiles  
- [ ] Deploy backend proxy for secure Gemini API calls  
- [ ] Expand blog & reels with CMS integration  
- [ ] Add more calculators & interactive entertainment tools  

---

## 📜 License  

This project is licensed under the **MIT License** – free to use, modify, and distribute with attribution.  
