// frontend/src/pages/HomePage.js
import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
  useEffect(() => {
    document.title = "Summify AI – Smart Meeting Summaries";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Navbar */}
      <header className="w-full border-b border-slate-200 bg-white/70 backdrop-blur">
        <nav className="max-w-6xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          {/* Left: Logo + name */}
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center text-white font-semibold shadow-md">
              AI
            </div>
            <span className="font-semibold text-slate-900 text-lg">
              Summify AI
            </span>
          </div>

          {/* Right: Nav links */}
          <div className="flex items-center gap-4 text-sm">
            <a href="#features" className="text-slate-600 hover:text-slate-900">
              Features
            </a>
            <a href="#how-it-works" className="text-slate-600 hover:text-slate-900">
              How it works
            </a>
            <a href="#contact" className="text-slate-600 hover:text-slate-900">
              Contact
            </a>

            <Link
              to="/login"
              className="px-3 py-1.5 rounded-full text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="px-4 py-1.5 rounded-full text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-fuchsia-500 shadow-md hover:shadow-lg"
            >
              Sign up
            </Link>
          </div>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {/* Hero section */}
        <section className="max-w-6xl mx-auto px-4 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 mb-4">
              AI-powered meeting assistant
            </p>
            <h1 className="text-3xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4">
              Stop re-watching meetings.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-fuchsia-500">
                Start reading smart summaries.
              </span>
            </h1>
            <p className="text-slate-600 text-sm lg:text-base mb-6">
              Summify AI connects with Zoom, Google Meet and your calendar to
              automatically turn long meetings into structured summaries,
              decisions, and follow-up actions.
            </p>

            <div className="flex flex-wrap gap-3 mb-6">
              <Link
                to="/signup"
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-fuchsia-500 shadow-md hover:shadow-lg"
              >
                Get started free
              </Link>
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-full text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50"
              >
                Already have an account?
              </Link>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500">
              <div className="flex -space-x-2">
                <div className="h-7 w-7 rounded-full bg-purple-200 border border-white" />
                <div className="h-7 w-7 rounded-full bg-fuchsia-200 border border-white" />
                <div className="h-7 w-7 rounded-full bg-sky-200 border border-white" />
              </div>
              <span>Designed for teams, students, and busy professionals.</span>
            </div>
          </div>

          {/* Right: simple “mock” card to match your dashboard vibe */}
          <div className="relative">
            <div className="absolute -top-6 -right-4 h-24 w-24 rounded-full bg-purple-200/60 blur-3xl" />
            <div className="absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-fuchsia-200/60 blur-3xl" />

            <div className="relative rounded-3xl border border-slate-200 bg-white shadow-xl p-5 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500">Today&apos;s summary</p>
                  <p className="text-sm font-semibold text-slate-900">
                    Sprint Planning – Product Team
                  </p>
                </div>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                  Auto-generated
                </span>
              </div>

              <div className="space-y-3 text-xs text-slate-700">
                <div>
                  <p className="font-semibold text-slate-900 mb-1">Key points</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Finalized features for Sprint 12.</li>
                    <li>Deadline aligned with release on Jan 20.</li>
                    <li>AI meeting assistant pilot approved.</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 mb-1">Next steps</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Assign owners for follow-up meetings.</li>
                    <li>Push action items to Google Calendar.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features section */}
        <section
          id="features"
          className="bg-white border-y border-slate-100 py-12 lg:py-16"
        >
          <div className="max-w-6xl mx-auto px-4 lg:px-8">
            <h2 className="text-xl lg:text-2xl font-semibold text-slate-900 mb-6">
              What Summify AI does for you
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  AI summaries that actually make sense
                </h3>
                <p className="text-xs text-slate-600">
                  Get concise summaries, key decisions, and action items for each
                  meeting—without reading a raw transcript.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Calendar and Drive aware
                </h3>
                <p className="text-xs text-slate-600">
                  Connect Google Calendar and Drive so Summify AI knows which
                  transcript belongs to which meeting.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Follow-up in one click
                </h3>
                <p className="text-xs text-slate-600">
                  Turn next steps into events directly from your dashboard and
                  keep your team aligned.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="max-w-6xl mx-auto px-4 lg:px-8 py-12 lg:py-16"
        >
          <h2 className="text-xl lg:text-2xl font-semibold text-slate-900 mb-4">
            How it works
          </h2>
          <ol className="space-y-3 text-sm text-slate-700">
            <li>1. Sign up and connect your Google account.</li>
            <li>2. Upload transcripts or pull them from Google Drive.</li>
            <li>3. Summify AI generates structured summaries & action items.</li>
            <li>4. Create follow-up events right from your dashboard.</li>
          </ol>
        </section>

        {/* Contact */}
        <section
          id="contact"
          className="border-t border-slate-200 bg-slate-50/60 py-10"
        >
          <div className="max-w-6xl mx-auto px-4 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1">
                Have questions?
              </h3>
              <p className="text-xs text-slate-600">
                Reach out for feedback, collaboration, or demo requests.
              </p>
            </div>
            <a
              href="mailto:contact@summifyai.in"
              className="px-4 py-2 rounded-full text-xs font-medium text-white bg-gradient-to-r from-purple-500 to-fuchsia-500 shadow-md hover:shadow-lg"
            >
              Contact us
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} Summify AI. Built for smarter meetings.
      </footer>
    </div>
  );
}
