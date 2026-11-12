# not-aashman.github.io

Source for my personal site: **https://not-aashman.github.io**

Plain HTML, CSS and JavaScript. No framework, no bundler and no build step.

## What's here

| Path | What it is |
|---|---|
| `index.html` | The site |
| `404.html` | Standalone error page. It loads no scripts, so it still works if a CDN is down, and uses root-absolute paths so it stays styled at any missing URL |
| `assets/css/style.css`, `assets/js/script.js` | Styles and behaviour |
| `assets/images/` | Project images, the About portrait and the link-preview card |
| `assets/icons/` | Favicons |
| `cv/` | Web copy of my CV (PDF) |
| `robots.txt` | Keeps the CV PDF out of search results |
| `.github/workflows/deploy.yml` | Publishes the site to GitHub Pages on every push to `main` |

Local notes (`*.md` other than this README, `notes/`) are git-ignored, so they stay on my machine and are never published.

## Run it locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Third-party code and fonts

- [GSAP](https://gsap.com/) 3.12.5 and ScrollTrigger, from cdnjs
- [Lenis](https://github.com/darkroomengineering/lenis) 1.3.23, from unpkg
- [Three.js](https://threejs.org/) r128, from cdnjs, loaded only when WebGL is available and reduced motion is off
- Google Fonts: Doto, Alata, JetBrains Mono and Reggae One

The scripts load with Subresource Integrity hashes. Without JavaScript the page is still fully readable.
