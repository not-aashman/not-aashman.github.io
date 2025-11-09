# 🌐 Personal Portfolio Website — Aashman Singh Verma
![Deploy Portfolio Website](https://github.com/not-aashman/not-aashman.github.io/actions/workflows/deploy.yml/badge.svg)

### Live Site  
🔗 **[https://not-aashman.github.io](https://not-aashman.github.io)**  

---

## 📘 Project Overview
A responsive personal portfolio website built using **HTML5** and **CSS3**, showcasing projects, skills, and contact information.  
The website is hosted on **GitHub Pages** with automated **CI/CD** configured via **GitHub Actions**.

Each new commit to the main branch triggers an automatic build and redeployment, ensuring continuous integration and deployment.

---

## 🧠 Features
- Responsive layout for desktop and mobile  
- Sections for Projects, Skills, About, and Contact  
- Functional contact form via **Formspree**  
- Automated deployment using **GitHub Actions**  
- Cloud hosting via **GitHub Pages**  
- Versioned backups through **Git**

---

## ⚙️ Tech Stack
- **Frontend:** HTML5, CSS3  
- **Automation:** GitHub Actions (CI/CD)  
- **Hosting:** GitHub Pages  
- **Form Handling:** Formspree  

---

## 🚀 Deployment (CI/CD Pipeline)
This repository includes a GitHub Actions workflow for automated deployment.  
Below is a simplified version of the pipeline configuration:

```yaml
name: Deploy Portfolio Website

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
   
```

---

## 🧩 Project Structure
```
.
├── index.html
├── styles.css
├── README.md
├── report/
│   └── Portfolio_Website_Report_Aashman.docx
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## 🧾 Author
**Aashman Singh Verma**  
Enrollment No: `LNCCBCT11101`  
Class Roll No: `02`

---

## 📬 Contact
For any queries, feel free to reach out via the contact form on the website or through GitHub.

---

> _“Where Hardware Meets Intelligence”_
