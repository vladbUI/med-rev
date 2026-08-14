# MedTech MLS Review

A comprehensive, notebook-style study companion for Medical Technology / Medical Laboratory Science students preparing for clinical rotations and board exams (ASCP / AMT / MLS).

---

## ✨ Features

- **Ground Truth RAG Chat**: Ask complex clinical pathology questions grounded strictly in uploaded medical textbooks with clickable page citations.
- **Smart Chapter Splitter**: Automatically detects chapters in 200 MB+ PDF/DOCX/PPTX textbooks via Table of Contents outlines and heading hierarchy, enabling high-speed parallel vectorization.
- **Board-Style MCQ Generator**: Generates 4-choice multiple-choice questions with clinical rationales and topic tags.
- **High-Yield Flashcard Generator**: Creates basic and cloze flashcards with direct reference to your course materials.
- **FSRS Spaced Repetition**: State-of-the-art Free Spaced Repetition Scheduler (FSRS) with daily review queues and performance rating (Again, Hard, Good, Easy).
- **High-Yield Highlights & Lab Values Table**: Automatically extracts key takeaways, reference laboratory ranges with clinical significance, medical terminology, and highlighted text passages.

---

## 🚀 Quickstart (Local Development)

### 1. Backend (FastAPI + Python 3.11)
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate   # On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```
Copy `backend/.env.example` to `backend/.env` and provide your Supabase URL, Service Role Key, and Google Gemini API Key:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
MAX_UPLOAD_MB=200
```
Run the API server:
```bash
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (React + Vite + TypeScript)
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

---

## 🗄️ Database Setup (Supabase)

Run the SQL migration scripts in `supabase/migrations/` in order in the [Supabase SQL Editor](https://supabase.com/dashboard):
1. `20250814_001_core_tables.sql` (Notebooks, Sources, Vector Chunks)
2. `20250814_002_chat_citations.sql` (Chat Sessions, Messages, match_chunks)
3. `20250814_003_flashcards_and_quizzes.sql` (Flashcards, Quizzes)
4. `20250814_004_srs_review_logs.sql` (FSRS logs)
5. `20250814_005_generation_logs.sql` (Audit logs)
6. `20250814_006_source_highlights.sql` (High-yield tables)

---

## 🌐 Production Deployment

- **Render**: Connect repo and select [`render.yaml`](render.yaml) for one-click full-stack deployment.
- **Docker**: Build and run with [`backend/Dockerfile`](backend/Dockerfile).
- **Vercel**: Deploy the `frontend/` folder with [`frontend/vercel.json`](frontend/vercel.json).
