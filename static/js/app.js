/**
 * Official IDP Computer-Delivered IELTS (CD-IELTS) Reading Engine
 * 2024 / 2025 / 2026 Test Specification & Standards
 * Netlify-Ready & Google Sheets Integration
 */

class IELTSPlatform {
  constructor() {
    this.testsData = [];
    this.tests = [];
    this.currentTest = null;
    
    // Auth state (from localStorage)
    const savedUser = localStorage.getItem("ielts_auth_user");
    this.currentUser = savedUser ? JSON.parse(savedUser) : null;
    this.candidateName = this.currentUser ? this.currentUser.displayName : (localStorage.getItem("ielts_candidate_name") || "Defitta");
    
    // View state
    this.currentView = this.currentUser ? "dashboard" : "login";
    this.examMode = "timed"; // "timed" or "practice"
    
    // Exam state
    this.activePassageId = 1;
    this.activeQuestionId = 1;
    this.userAnswers = {}; // { [qId]: answerValue }
    this.reviewFlags = new Set(); // Set of qIds
    this.timerSeconds = 3600;
    this.timerInterval = null;
    this.timerHidden = false;
    this.startTime = null;
    this.alert10Shown = false;
    this.alert5Shown = false;
    
    // Display preferences (Official IDP Accessibility Modes)
    this.themeContrast = localStorage.getItem("ielts_theme") || "standard";
    this.fontSize = localStorage.getItem("ielts_font_size") || "standard";
    
    // Results & History state
    this.evaluatedResult = null;
    this.reviewFilter = "all";
    this.userHistory = [];

    this.init();
  }

  async init() {
    this.applyPreferences();
    this.bindGlobalEvents();
    await this.loadTestsList();
    this.render();
  }

  applyPreferences() {
    document.body.className = `contrast-${this.themeContrast} font-${this.fontSize}`;
  }

  setTheme(theme) {
    this.themeContrast = theme;
    localStorage.setItem("ielts_theme", theme);
    this.applyPreferences();
  }

  setFontSize(size) {
    this.fontSize = size;
    localStorage.setItem("ielts_font_size", size);
    this.applyPreferences();
  }

  // ==========================================================================
  // DATA LOADING (100% Static & Netlify-Ready)
  // ==========================================================================
  async loadTestsList() {
    try {
      let res;
      try {
        res = await fetch("./data/tests.json?t=" + Date.now());
      } catch (err) {
        res = await fetch("/data/tests.json?t=" + Date.now());
      }
      if (!res.ok) {
        res = await fetch("/api/tests?t=" + Date.now());
      }
      this.testsData = await res.json();

      // Transform tests for dashboard
      this.tests = this.testsData.map(t => {
        const passagesInfo = (t.passages || []).map(p => {
          const qCount = (p.question_groups || []).reduce((acc, g) => acc + (g.questions || []).length, 0);
          return {
            passage_id: p.passage_id,
            title: p.title,
            subtitle: p.subtitle,
            questions_count: qCount
          };
        });
        const totalQ = passagesInfo.reduce((acc, p) => acc + p.questions_count, 0);
        return {
          id: t.id,
          title: t.title,
          category: t.category || "Academic Reading",
          duration_minutes: t.duration_minutes || 60,
          total_questions: totalQ,
          passages: passagesInfo
        };
      });
    } catch (e) {
      console.error("Failed to load tests list:", e);
    }
  }

  async startTest(testId) {
    try {
      if (!this.testsData || this.testsData.length === 0) {
        await this.loadTestsList();
      }

      const found = this.testsData.find(t => t.id === testId);
      if (!found) throw new Error("Test not found");
      this.currentTest = JSON.parse(JSON.stringify(found));

      // Check saved progress
      const savedKey = `ielts_session_${this.currentUser ? this.currentUser.username : 'guest'}_${testId}`;
      const saved = localStorage.getItem(savedKey);
      let resume = false;
      if (saved) {
        try {
          const session = JSON.parse(saved);
          if (session && Object.keys(session.userAnswers || {}).length > 0) {
            resume = confirm(`Ditemukan sesi latihan yang belum selesai untuk ${this.currentTest.title}.\nApakah Anda ingin melanjutkan sesi sebelumnya?`);
            if (resume) {
              this.userAnswers = session.userAnswers || {};
              this.reviewFlags = new Set(session.reviewFlags || []);
              this.activePassageId = session.activePassageId || 1;
              this.activeQuestionId = session.activeQuestionId || 1;
              this.timerSeconds = session.timerSeconds || 3600;
              this.startTime = session.startTime || Date.now();
            }
          }
        } catch (err) {
          console.warn("Could not parse saved session", err);
        }
      }

      if (!resume) {
        this.userAnswers = {};
        this.reviewFlags = new Set();
        this.activePassageId = 1;
        this.activeQuestionId = 1;
        this.timerSeconds = (this.currentTest.duration_minutes || 60) * 60;
        this.startTime = Date.now();
      }

      this.timerHidden = false;
      this.alert10Shown = false;
      this.alert5Shown = false;

      this.currentView = "exam";
      this.render();

      if (this.examMode === "timed") {
        this.startTimer();
      }

      this.initSplitter();
      this.initHighlighter();
    } catch (e) {
      alert("Error starting test: " + e.message);
    }
  }

  saveSession() {
    if (!this.currentTest || this.currentView !== "exam") return;
    const sessionData = {
      testId: this.currentTest.id,
      userAnswers: this.userAnswers,
      reviewFlags: Array.from(this.reviewFlags),
      activePassageId: this.activePassageId,
      activeQuestionId: this.activeQuestionId,
      timerSeconds: this.timerSeconds,
      startTime: this.startTime
    };
    const key = `ielts_session_${this.currentUser ? this.currentUser.username : 'guest'}_${this.currentTest.id}`;
    localStorage.setItem(key, JSON.stringify(sessionData));
  }

  clearSession() {
    if (this.currentTest) {
      const key = `ielts_session_${this.currentUser ? this.currentUser.username : 'guest'}_${this.currentTest.id}`;
      localStorage.removeItem(key);
    }
  }

  // ==========================================================================
  // AUTHENTICATION & LOGIN LOGIC
  // ==========================================================================
  async handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const userInput = document.getElementById("login-username");
    const passInput = document.getElementById("login-password");
    const errorBox = document.getElementById("login-error-msg");
    const loginBtn = document.getElementById("login-submit-btn");

    if (!userInput || !passInput) return;

    const username = userInput.value.trim().toLowerCase();
    const password = passInput.value.trim();

    if (!username || !password) {
      if (errorBox) {
        errorBox.textContent = "Silakan masukkan username dan password!";
        errorBox.style.display = "block";
      }
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = "Memverifikasi...";
    }
    if (errorBox) errorBox.style.display = "none";

    try {
      const user = await this.performLogin(username, password);
      this.currentUser = user;
      this.candidateName = user.displayName;
      localStorage.setItem("ielts_auth_user", JSON.stringify(user));
      localStorage.setItem("ielts_candidate_name", user.displayName);
      
      this.currentView = "dashboard";
      this.render();
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message || "Gagal masuk. Periksa username dan password.";
        errorBox.style.display = "block";
      }
    } finally {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = "Masuk ke Portal Ujian &rarr;";
      }
    }
  }

  async performLogin(username, password) {
    // 1. Coba verifikasi ke Google Apps Script jika URL sudah diisi
    if (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL && !window.CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID")) {
      try {
        const res = await fetch(window.CONFIG.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "login", username, password })
        });
        const data = await res.json();
        if (data && data.success && data.user) {
          return data.user;
        } else if (data && !data.success) {
          throw new Error(data.message || "Username atau password salah!");
        }
      } catch (e) {
        console.warn("Apps Script auth failed or unreachable, checking offline fallback...", e);
      }
    }

    // 2. Offline Fallback jika Apps Script belum disetup / offline
    const fallbackList = (window.CONFIG && window.CONFIG.OFFLINE_USERS) || [
      { username: "defitta", password: "12345", displayName: "Defitta", role: "Candidate" },
      { username: "marshal", password: "12345", displayName: "Marshal", role: "Candidate" }
    ];

    const match = fallbackList.find(u => u.username.toLowerCase() === username && u.password === password);
    if (match) {
      return {
        username: match.username,
        displayName: match.displayName,
        role: match.role || "Candidate"
      };
    }

    throw new Error("Username atau password salah! (Gunakan akun 'defitta' atau 'marshal', password '12345')");
  }

  logout() {
    if (confirm("Apakah Anda yakin ingin keluar dari akun?")) {
      this.currentUser = null;
      localStorage.removeItem("ielts_auth_user");
      this.currentView = "login";
      this.render();
    }
  }

  quickFillLogin(user, pass) {
    const userInput = document.getElementById("login-username");
    const passInput = document.getElementById("login-password");
    if (userInput && passInput) {
      userInput.value = user;
      passInput.value = pass;
    }
  }

  // ==========================================================================
  // GOOGLE SHEETS & HISTORY INTEGRATION
  // ==========================================================================
  async saveScoreRecord(result) {
    const username = this.currentUser ? this.currentUser.username : "guest";
    const historyKey = `ielts_history_${username}`;

    const nowWib = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    const mins = Math.floor(result.time_taken_seconds / 60);
    const secs = result.time_taken_seconds % 60;
    const formattedTime = `${mins} menit ${secs} detik`;

    const recordItem = {
      timestamp: nowWib,
      username: username,
      candidateName: result.candidate_name,
      testId: result.test_id,
      testTitle: result.test_title,
      category: result.category,
      rawScore: result.raw_score,
      incorrect: result.incorrect,
      unanswered: result.unanswered,
      totalQuestions: result.total_questions,
      scaledScore: result.scaled_score_40,
      percentage: result.percentage + "%",
      bandScore: result.band_score,
      cefrLevel: result.cefr_level,
      performanceDescriptor: result.performance_descriptor,
      timeTakenSeconds: result.time_taken_seconds,
      timeFormatted: formattedTime
    };

    // 1. Simpan di LocalStorage (Cache langsung agar offline pun ada)
    let localHistory = [];
    try {
      localHistory = JSON.parse(localStorage.getItem(historyKey) || "[]");
    } catch (e) {}
    localHistory.unshift(recordItem);
    localStorage.setItem(historyKey, JSON.stringify(localHistory.slice(0, 50)));

    // 2. Kirim ke Google Apps Script (Google Sheets) di background
    if (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL && !window.CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID")) {
      try {
        const payload = {
          action: "record_score",
          ...result
        };
        await fetch(window.CONFIG.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });
        console.log("Skor berhasil dicatat ke Google Sheets!");
      } catch (err) {
        console.warn("Gagal menyinkronkan ke Google Sheets:", err);
      }
    }
  }

  async fetchHistory() {
    const username = this.currentUser ? this.currentUser.username : "guest";
    const historyKey = `ielts_history_${username}`;
    
    let localCached = [];
    try {
      localCached = JSON.parse(localStorage.getItem(historyKey) || "[]");
    } catch (e) {}

    // Coba ambil dari Google Apps Script
    if (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL && !window.CONFIG.APPS_SCRIPT_URL.includes("YOUR_DEPLOYMENT_ID")) {
      try {
        const res = await fetch(`${window.CONFIG.APPS_SCRIPT_URL}?action=get_history&username=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.history)) {
          localStorage.setItem(historyKey, JSON.stringify(data.history));
          return data.history;
        }
      } catch (err) {
        console.warn("Gagal mengambil history dari Google Apps Script, memakai cache:", err);
      }
    }

    return localCached;
  }

  async showHistoryModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box history-modal-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3>📜 Riwayat Latihan & Skor: ${this.candidateName}</h3>
          <button class="modal-btn" id="history-close-btn" style="padding:4px 10px;">✖ Tutup</button>
        </div>
        <div id="history-content-loading" style="text-align:center; padding:30px; color:#64748b;">
          Memuat riwayat latihan dari Google Sheets...
        </div>
        <div id="history-content-body" style="display:none;"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#history-close-btn").onclick = () => overlay.remove();

    const loadingElem = overlay.querySelector("#history-content-loading");
    const bodyElem = overlay.querySelector("#history-content-body");

    const history = await this.fetchHistory();
    loadingElem.style.display = "none";
    bodyElem.style.display = "block";

    if (!history || history.length === 0) {
      bodyElem.innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
          <div style="font-size:3rem; margin-bottom:10px;">📋</div>
          <h4 style="font-size:1.2rem; font-weight:700; margin-bottom:6px;">Belum Ada Riwayat Latihan</h4>
          <p style="color:#64748b;">Anda belum pernah mengerjakan tes. Silakan mulai tes pertama Anda di dashboard!</p>
        </div>
      `;
      return;
    }

    // Hitung ringkasan statistik
    const totalAttempts = history.length;
    const bandScores = history.map(h => parseFloat(h.bandScore) || 0).filter(b => b > 0);
    const bestBand = bandScores.length ? Math.max(...bandScores).toFixed(1) : "0.0";
    const avgBand = bandScores.length ? (bandScores.reduce((a, b) => a + b, 0) / bandScores.length).toFixed(1) : "0.0";

    const rowsHtml = history.map((item, idx) => `
      <tr>
        <td style="font-weight:700; color:#64748b;">#${totalAttempts - idx}</td>
        <td>
          <div style="font-weight:700; color:var(--idp-dark-text);">${item.testTitle || item.testId}</div>
          <div style="font-size:0.78rem; color:#64748b;">${item.timestamp}</div>
        </td>
        <td style="text-align:center;">
          <span style="color:#15803d; font-weight:800;">${item.rawScore}</span> / ${item.totalQuestions || 40}
        </td>
        <td style="text-align:center;">
          <span style="color:#b91c1c; font-weight:700;">${item.incorrect || 0}</span> / 
          <span style="color:#64748b;">${item.unanswered || 0}</span>
        </td>
        <td style="text-align:center;">
          <span class="history-band-pill">Band ${parseFloat(item.bandScore).toFixed(1)}</span>
        </td>
        <td style="font-size:0.85rem; color:#475569;">
          ${item.timeFormatted || item.timeTakenSeconds + 's'}
        </td>
      </tr>
    `).join("");

    bodyElem.innerHTML = `
      <div class="history-stats-overview">
        <div class="history-stat-box">
          <span class="stat-lbl">Total Latihan</span>
          <span class="stat-val">${totalAttempts}x</span>
        </div>
        <div class="history-stat-box">
          <span class="stat-lbl">Band Tertinggi</span>
          <span class="stat-val" style="color:var(--idp-red);">${bestBand}</span>
        </div>
        <div class="history-stat-box">
          <span class="stat-lbl">Rata-Rata Band</span>
          <span class="stat-val" style="color:var(--idp-blue);">${avgBand}</span>
        </div>
      </div>

      <div class="history-table-wrapper">
        <table class="history-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Tes & Waktu</th>
              <th style="text-align:center;">Benar</th>
              <th style="text-align:center;">Salah / Kosong</th>
              <th style="text-align:center;">IELTS Band</th>
              <th>Durasi</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================================================
  // CLIENT-SIDE OFFICIAL BAND EVALUATION ENGINE
  // ==========================================================================
  calculateAcademicReadingBand(rawScore, totalQuestions = 40) {
    if (totalQuestions <= 0) return { band: 0.0, descriptor: "Did not attempt", cefr: "N/A" };
    const scaled = Math.max(0, Math.min(40, Math.round((rawScore / totalQuestions) * 40)));
    
    if (scaled >= 39) return { band: 9.0, descriptor: "Expert User", cefr: "C2" };
    if (scaled >= 37) return { band: 8.5, descriptor: "Very Good User", cefr: "C2" };
    if (scaled >= 35) return { band: 8.0, descriptor: "Very Good User", cefr: "C1" };
    if (scaled >= 33) return { band: 7.5, descriptor: "Good User", cefr: "C1" };
    if (scaled >= 30) return { band: 7.0, descriptor: "Good User", cefr: "C1" };
    if (scaled >= 27) return { band: 6.5, descriptor: "Competent User", cefr: "B2" };
    if (scaled >= 23) return { band: 6.0, descriptor: "Competent User", cefr: "B2" };
    if (scaled >= 19) return { band: 5.5, descriptor: "Modest User", cefr: "B1" };
    if (scaled >= 15) return { band: 5.0, descriptor: "Modest User", cefr: "B1" };
    if (scaled >= 13) return { band: 4.5, descriptor: "Limited User", cefr: "A2" };
    if (scaled >= 10) return { band: 4.0, descriptor: "Limited User", cefr: "A2" };
    if (scaled >= 8)  return { band: 3.5, descriptor: "Extremely Limited User", cefr: "A1" };
    if (scaled >= 6)  return { band: 3.0, descriptor: "Extremely Limited User", cefr: "A1" };
    if (scaled >= 4)  return { band: 2.5, descriptor: "Intermittent User", cefr: "A1" };
    if (scaled >= 3)  return { band: 2.0, descriptor: "Intermittent User", cefr: "A1" };
    if (scaled >= 1)  return { band: 1.0, descriptor: "Non User", cefr: "A1" };
    return { band: 0.0, descriptor: "Did not attempt", cefr: "N/A" };
  }

  calculateGtReadingBand(rawScore, totalQuestions = 40) {
    if (totalQuestions <= 0) return { band: 0.0, descriptor: "Did not attempt", cefr: "N/A" };
    const scaled = Math.max(0, Math.min(40, Math.round((rawScore / totalQuestions) * 40)));
    
    if (scaled === 40) return { band: 9.0, descriptor: "Expert User", cefr: "C2" };
    if (scaled === 39) return { band: 8.5, descriptor: "Very Good User", cefr: "C2" };
    if (scaled >= 37)  return { band: 8.0, descriptor: "Very Good User", cefr: "C1" };
    if (scaled === 36) return { band: 7.5, descriptor: "Good User", cefr: "C1" };
    if (scaled >= 34)  return { band: 7.0, descriptor: "Good User", cefr: "C1" };
    if (scaled >= 32)  return { band: 6.5, descriptor: "Competent User", cefr: "B2" };
    if (scaled >= 30)  return { band: 6.0, descriptor: "Competent User", cefr: "B2" };
    if (scaled >= 27)  return { band: 5.5, descriptor: "Modest User", cefr: "B1" };
    if (scaled >= 23)  return { band: 5.0, descriptor: "Modest User", cefr: "B1" };
    if (scaled >= 19)  return { band: 4.5, descriptor: "Limited User", cefr: "A2" };
    if (scaled >= 15)  return { band: 4.0, descriptor: "Limited User", cefr: "A2" };
    if (scaled >= 12)  return { band: 3.5, descriptor: "Extremely Limited User", cefr: "A1" };
    if (scaled >= 9)   return { band: 3.0, descriptor: "Extremely Limited User", cefr: "A1" };
    if (scaled >= 6)   return { band: 2.5, descriptor: "Intermittent User", cefr: "A1" };
    if (scaled >= 4)   return { band: 2.0, descriptor: "Intermittent User", cefr: "A1" };
    if (scaled >= 1)   return { band: 1.0, descriptor: "Non User", cefr: "A1" };
    return { band: 0.0, descriptor: "Did not attempt", cefr: "N/A" };
  }

  normaliseAnswer(val) {
    if (val === null || val === undefined) return "";
    let s = val.toString().trim().toLowerCase();
    s = s.replace(/\s+/g, " ");
    s = s.replace(/^["'(\[{]+|["')\]}]+$/g, "").trim();
    return s;
  }

  checkAnswerCorrectness(userAns, correctAns, alternatives = []) {
    const normUser = this.normaliseAnswer(userAns);
    if (!normUser) return false;
    
    const normCorrect = this.normaliseAnswer(correctAns);
    if (normUser === normCorrect) return true;

    if (alternatives && alternatives.length > 0) {
      for (const alt of alternatives) {
        const normAlt = this.normaliseAnswer(alt);
        if (normUser === normAlt) return true;

        if (normAlt.includes(" and ")) {
          const parts = normAlt.split(" and ").sort().join(" and ");
          const userParts = normUser.split(" and ").sort().join(" and ");
          if (parts === userParts) return true;
        }

        if (alt.includes("/") || alt.includes("//")) {
          const slashParts = alt.split(/\/\/|\//).map(p => this.normaliseAnswer(p)).filter(Boolean);
          if (slashParts.includes(normUser)) return true;
        }
      }
    }

    if (normUser.length === 1 && normCorrect.length >= 1) {
      if (normUser === normCorrect[0]) return true;
    }

    const tfMap = {
      true: ["true", "t"],
      false: ["false", "f"],
      "not given": ["not given", "ng", "notgiven"],
      yes: ["yes", "y"],
      no: ["no", "n"]
    };
    for (const canonical in tfMap) {
      const variants = tfMap[canonical];
      if (variants.includes(normCorrect) && variants.includes(normUser)) {
        return true;
      }
    }

    return false;
  }

  evaluateSubmission() {
    const evaluatedQuestions = [];
    let rawScore = 0;
    let totalQuestions = 0;
    const passageScores = {};

    for (const p of this.currentTest.passages) {
      const pid = p.passage_id;
      passageScores[pid] = { correct: 0, total: 0, title: p.title };

      for (const g of p.question_groups) {
        const gType = g.type;
        const qList = g.questions;

        const isPooledMulti = (gType === "multiple_choice_multi");
        if (isPooledMulti) {
          const poolAnswers = new Set();
          for (const q of qList) {
            poolAnswers.add(this.normaliseAnswer(q.correct_answer));
            for (const alt of (q.alternatives || [])) {
              poolAnswers.add(this.normaliseAnswer(alt));
            }
          }

          const usedPoolAnswers = new Set();
          for (const q of qList) {
            totalQuestions++;
            passageScores[pid].total++;
            const qid = q.id;
            const userVal = this.normaliseAnswer(this.userAnswers[qid]);

            let isCorrect = false;
            if (userVal && poolAnswers.has(userVal) && !usedPoolAnswers.has(userVal)) {
              isCorrect = true;
              usedPoolAnswers.add(userVal);
            }

            if (isCorrect) {
              rawScore++;
              passageScores[pid].correct++;
            }

            evaluatedQuestions.push({
              id: q.id,
              passage_id: pid,
              prompt: q.prompt,
              user_answer: this.userAnswers[qid] || "",
              correct_answer: q.correct_answer,
              alternatives: q.alternatives || [],
              is_correct: isCorrect,
              location: q.location || "",
              explanation: q.explanation || "",
              type: gType
            });
          }
        } else {
          for (const q of qList) {
            totalQuestions++;
            passageScores[pid].total++;
            const qid = q.id;
            const userVal = this.userAnswers[qid] || "";
            const correctVal = q.correct_answer || "";
            const alts = q.alternatives || [];

            const isCorrect = this.checkAnswerCorrectness(userVal, correctVal, alts);
            if (isCorrect) {
              rawScore++;
              passageScores[pid].correct++;
            }

            evaluatedQuestions.push({
              id: q.id,
              passage_id: pid,
              prompt: q.prompt,
              user_answer: userVal,
              correct_answer: correctVal,
              alternatives: alts,
              is_correct: isCorrect,
              location: q.location || "",
              explanation: q.explanation || "",
              type: gType
            });
          }
        }
      }
    }

    evaluatedQuestions.sort((a, b) => a.id - b.id);

    const isGt = (this.currentTest.category || "").includes("General Training");
    const bandData = isGt 
      ? this.calculateGtReadingBand(rawScore, totalQuestions)
      : this.calculateAcademicReadingBand(rawScore, totalQuestions);

    const timeTaken = Math.round((Date.now() - this.startTime) / 1000);
    const scaled40 = totalQuestions ? Math.round((rawScore / totalQuestions) * 40) : 0;
    const answeredCount = Object.keys(this.userAnswers).length;
    const unansweredCount = totalQuestions - answeredCount;
    const incorrectCount = totalQuestions - rawScore - unansweredCount;

    return {
      test_id: this.currentTest.id,
      test_title: this.currentTest.title,
      category: this.currentTest.category || "Academic Reading",
      candidate_name: this.candidateName,
      username: this.currentUser ? this.currentUser.username : "guest",
      time_taken_seconds: timeTaken,
      raw_score: rawScore,
      incorrect: Math.max(0, incorrectCount),
      unanswered: Math.max(0, unansweredCount),
      total_questions: totalQuestions,
      scaled_score_40: scaled40,
      percentage: totalQuestions ? Math.round((rawScore / totalQuestions) * 100) : 0,
      band_score: bandData.band,
      performance_descriptor: bandData.descriptor,
      cefr_level: bandData.cefr,
      passage_breakdown: passageScores,
      questions: evaluatedQuestions
    };
  }

  async submitTest(force = false) {
    if (!force) {
      const totalQ = 40;
      const answeredCount = Object.keys(this.userAnswers).length;
      const unanswered = totalQ - answeredCount;

      let msg = `Anda telah menjawab ${answeredCount} dari ${totalQ} soal.`;
      if (unanswered > 0) {
        msg += `\n\nMasih ada ${unanswered} soal yang belum dijawab. Apakah Anda yakin ingin menyelesaikan tes dan melihat skor IELTS Band Anda?`;
      } else {
        msg += `\n\nApakah Anda yakin ingin menyelesaikan tes dan melihat hasil Band Score Anda?`;
      }

      if (!confirm(msg)) return;
    }

    if (this.timerInterval) clearInterval(this.timerInterval);

    // Hitung skor langsung di browser (100% Client-Side Engine)
    const result = this.evaluateSubmission();
    this.evaluatedResult = result;

    // Simpan ke Google Sheets & LocalStorage
    await this.saveScoreRecord(result);

    this.clearSession();
    this.currentView = "results";
    this.render();
  }

  // ==========================================================================
  // TIMER & CONTROLS
  // ==========================================================================
  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timerSeconds--;
      
      if (this.timerSeconds % 10 === 0) {
        this.saveSession();
      }

      if (this.timerSeconds === 600 && !this.alert10Shown) {
        this.alert10Shown = true;
        this.showModal("10 Menit Tersisa", "Waktu Anda tersisa 10 menit untuk mengerjakan tes Reading.");
      }

      if (this.timerSeconds === 300 && !this.alert5Shown) {
        this.alert5Shown = true;
        this.timerHidden = false; // Sesuai IDP: tidak bisa disembunyikan di 5 menit terakhir
        this.showModal("5 Menit Tersisa", "Waktu tersisa 5 menit. Segera periksa dan lengkapi jawaban Anda.");
      }

      if (this.timerSeconds <= 0) {
        clearInterval(this.timerInterval);
        this.timerSeconds = 0;
        this.updateTimerDisplay();
        this.showModal("Waktu Habis", "Waktu 60 menit telah habis. Jawaban Anda akan otomatis dikirim.", () => {
          this.submitTest(true);
        });
        return;
      }

      this.updateTimerDisplay();
    }, 1000);
  }

  updateTimerDisplay() {
    const display = document.getElementById("timer-display");
    const timerBox = document.getElementById("timer-box");
    const toggleBtn = document.getElementById("toggle-timer-btn");
    if (!display) return;
    
    if (this.timerHidden && this.timerSeconds > 300) {
      display.textContent = "-- : --";
      return;
    }

    const mins = Math.floor(this.timerSeconds / 60);
    const secs = this.timerSeconds % 60;
    display.textContent = `${mins.toString().padStart(2, "0")} : ${secs.toString().padStart(2, "0")}`;

    if (timerBox) {
      timerBox.classList.remove("warning-amber", "warning-red");
      if (this.timerSeconds <= 300) {
        timerBox.classList.add("warning-red");
        if (toggleBtn) toggleBtn.style.display = "none";
      } else if (this.timerSeconds <= 600) {
        timerBox.classList.add("warning-amber");
        if (toggleBtn) toggleBtn.style.display = "inline-block";
      } else {
        if (toggleBtn) toggleBtn.style.display = "inline-block";
      }
    }
  }

  toggleTimerVisibility() {
    if (this.timerSeconds <= 300) return;
    this.timerHidden = !this.timerHidden;
    const btn = document.getElementById("toggle-timer-btn");
    if (btn) btn.textContent = this.timerHidden ? "Show" : "Hide";
    this.updateTimerDisplay();
  }

  setAnswer(qId, val) {
    if (val === "" || val === undefined) {
      delete this.userAnswers[qId];
    } else {
      this.userAnswers[qId] = val;
    }
    this.saveSession();
    this.updateDockStatus();
  }

  handleMultiSelectToggle(minQ, maxQ, letter, maxSelect) {
    const qIds = [];
    for (let id = minQ; id <= maxQ; id++) {
      qIds.push(id);
    }

    let currentSelected = [];
    qIds.forEach(id => {
      const val = this.userAnswers[id];
      if (val && !currentSelected.includes(val)) {
        currentSelected.push(val);
      }
    });

    if (currentSelected.includes(letter)) {
      currentSelected = currentSelected.filter(l => l !== letter);
    } else {
      if (currentSelected.length < maxSelect) {
        currentSelected.push(letter);
      } else {
        currentSelected.shift();
        currentSelected.push(letter);
      }
    }

    qIds.forEach((id, idx) => {
      if (idx < currentSelected.length) {
        this.userAnswers[id] = currentSelected[idx];
      } else {
        delete this.userAnswers[id];
      }
    });

    this.saveSession();
    this.updateDockStatus();

    const counter = document.getElementById(`multi-counter-${minQ}`);
    if (counter) {
      const isComplete = currentSelected.length === maxSelect;
      counter.className = `selection-counter ${isComplete ? 'complete' : ''}`;
      counter.innerHTML = `Choose ${maxSelect} letters • <strong>${currentSelected.length}/${maxSelect} selected</strong>`;
    }

    const card = document.getElementById(`q-item-${minQ}`);
    if (card) {
      const rows = card.querySelectorAll(".multi-option-row");
      rows.forEach(r => {
        const input = r.querySelector("input");
        if (input) {
          const checked = currentSelected.includes(input.value);
          input.checked = checked;
          if (checked) {
            r.classList.add("selected");
          } else {
            r.classList.remove("selected");
          }
        }
      });
    }
  }

  toggleReviewFlag(qId) {
    if (this.reviewFlags.has(qId)) {
      this.reviewFlags.delete(qId);
    } else {
      this.reviewFlags.add(qId);
    }
    this.saveSession();
    this.updateDockStatus();
  }

  switchPassage(passageId) {
    this.activePassageId = passageId;
    this.saveSession();
    this.renderWorkspace();
    this.updateDockStatus();
  }

  goToQuestion(qId) {
    this.activeQuestionId = qId;
    
    let targetPassageId = 1;
    for (const p of this.currentTest.passages) {
      for (const g of p.question_groups) {
        if (g.questions.some(q => q.id === qId)) {
          targetPassageId = p.passage_id;
          break;
        }
      }
    }

    if (targetPassageId !== this.activePassageId) {
      this.activePassageId = targetPassageId;
      this.renderWorkspace();
    }

    this.saveSession();
    this.updateDockStatus();

    setTimeout(() => {
      const gapInput = document.getElementById(`gap-input-${qId}`);
      if (gapInput) {
        gapInput.scrollIntoView({ behavior: "smooth", block: "center" });
        gapInput.focus();
        return;
      }

      let scrollTarget = document.getElementById(`q-item-${qId}`);
      if (!scrollTarget) {
        for (const p of this.currentTest.passages) {
          for (const g of p.question_groups) {
            if (g.type === "multiple_choice_multi") {
              const qIds = g.questions.map(q => q.id);
              if (qIds.includes(qId)) {
                scrollTarget = document.getElementById(`q-item-${Math.min(...qIds)}`);
                break;
              }
            }
          }
        }
      }

      if (scrollTarget) {
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        scrollTarget.classList.add("active-focus");
        setTimeout(() => scrollTarget.classList.remove("active-focus"), 1200);
      }
    }, 50);
  }

  focusQuestion(qId) {
    this.activeQuestionId = qId;
    this.saveSession();
    this.updateDockStatus();
  }

  goToNextQuestion() {
    if (this.activeQuestionId < 40) {
      this.goToQuestion(this.activeQuestionId + 1);
    }
  }

  goToPrevQuestion() {
    if (this.activeQuestionId > 1) {
      this.goToQuestion(this.activeQuestionId - 1);
    }
  }

  // ==========================================================================
  // SPLITTER & HIGHLIGHTER TOOLS
  // ==========================================================================
  initSplitter() {
    const divider = document.getElementById("splitter-divider");
    const passagePane = document.getElementById("passage-pane");
    const questionsPane = document.getElementById("questions-pane");
    if (!divider || !passagePane || !questionsPane) return;

    let isDragging = false;

    divider.addEventListener("mousedown", () => {
      isDragging = true;
      divider.classList.add("dragging");
      document.body.style.cursor = "col-resize";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const totalWidth = window.innerWidth;
      const leftWidth = e.clientX;
      const percentage = (leftWidth / totalWidth) * 100;

      if (percentage >= 25 && percentage <= 75) {
        passagePane.style.flex = `0 0 ${percentage}%`;
        questionsPane.style.flex = `0 0 ${100 - percentage}%`;
      }
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        divider.classList.remove("dragging");
        document.body.style.cursor = "default";
      }
    });
  }

  initHighlighter() {
    const passagePane = document.getElementById("passage-pane");
    if (!passagePane) return;

    let tooltip = null;

    const removeTooltip = () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    };

    const handleTextSelection = (e) => {
      removeTooltip();
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText.length > 1) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        tooltip = document.createElement("div");
        tooltip.className = "highlight-tooltip";
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top + window.scrollY}px`;

        const hlBtn = document.createElement("button");
        hlBtn.innerHTML = "🖍️ Highlight";
        hlBtn.onclick = () => {
          try {
            const mark = document.createElement("mark");
            mark.className = "ielts-highlight";
            range.surroundContents(mark);
          } catch (err) {
            console.warn("Complex selection highlight", err);
          }
          selection.removeAllRanges();
          removeTooltip();
        };

        const noteBtn = document.createElement("button");
        noteBtn.innerHTML = "📝 Note";
        noteBtn.onclick = () => {
          const noteText = prompt("Add a note for this section:");
          if (noteText) {
            const noteSpan = document.createElement("span");
            noteSpan.className = "note-badge";
            noteSpan.title = noteText;
            noteSpan.textContent = "📝";
            noteSpan.onclick = () => alert("Note: " + noteText);
            range.insertNode(noteSpan);
          }
          selection.removeAllRanges();
          removeTooltip();
        };

        const clearBtn = document.createElement("button");
        clearBtn.innerHTML = "✖ Clear";
        clearBtn.onclick = () => {
          selection.removeAllRanges();
          removeTooltip();
        };

        tooltip.appendChild(hlBtn);
        tooltip.appendChild(noteBtn);
        tooltip.appendChild(clearBtn);
        document.body.appendChild(tooltip);
      }
    };

    passagePane.addEventListener("mouseup", handleTextSelection);
    passagePane.addEventListener("contextmenu", (e) => {
      const selection = window.getSelection();
      if (selection.toString().trim().length > 1) {
        e.preventDefault();
        handleTextSelection(e);
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (tooltip && !tooltip.contains(e.target)) {
        removeTooltip();
      }
    });

    passagePane.addEventListener("click", (e) => {
      if (e.target.classList.contains("ielts-highlight")) {
        const parent = e.target.parentNode;
        while (e.target.firstChild) {
          parent.insertBefore(e.target.firstChild, e.target);
        }
        parent.removeChild(e.target);
      }
    });
  }

  showModal(title, message, onConfirm = null) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${title}</h3>
        <p>${message.replace(/\n/g, "<br>")}</p>
        <div class="modal-actions">
          <button class="modal-btn primary" id="modal-confirm-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#modal-confirm-btn").onclick = () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    };
  }

  showSettingsModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>Display Settings</h3>
        <p style="margin-bottom:16px;">Customize screen contrast and font size to your preference, matching the official IDP exam options.</p>
        
        <div class="settings-group">
          <label class="group-heading">Colour Scheme / Contrast:</label>
          <div class="settings-radio-row">
            <label class="settings-radio-label ${this.themeContrast === 'standard' ? 'selected' : ''}">
              <input type="radio" name="set_theme" value="standard" ${this.themeContrast === 'standard' ? 'checked' : ''} />
              <span>Standard (Black on white)</span>
            </label>
            <label class="settings-radio-label ${this.themeContrast === 'yellow-black' ? 'selected' : ''}">
              <input type="radio" name="set_theme" value="yellow-black" ${this.themeContrast === 'yellow-black' ? 'checked' : ''} />
              <span>Yellow on black (High Contrast)</span>
            </label>
            <label class="settings-radio-label ${this.themeContrast === 'black-yellow' ? 'selected' : ''}">
              <input type="radio" name="set_theme" value="black-yellow" ${this.themeContrast === 'black-yellow' ? 'checked' : ''} />
              <span>Black on light yellow (Warm)</span>
            </label>
            <label class="settings-radio-label ${this.themeContrast === 'black-blue' ? 'selected' : ''}">
              <input type="radio" name="set_theme" value="black-blue" ${this.themeContrast === 'black-blue' ? 'checked' : ''} />
              <span>Black on light blue (Soft)</span>
            </label>
          </div>
        </div>

        <div class="settings-group">
          <label class="group-heading">Font Size:</label>
          <div class="settings-radio-row">
            <label class="settings-radio-label ${this.fontSize === 'standard' ? 'selected' : ''}">
              <input type="radio" name="set_font" value="standard" ${this.fontSize === 'standard' ? 'checked' : ''} />
              <span>Standard (15.5px)</span>
            </label>
            <label class="settings-radio-label ${this.fontSize === 'large' ? 'selected' : ''}">
              <input type="radio" name="set_font" value="large" ${this.fontSize === 'large' ? 'checked' : ''} />
              <span>Large (18px)</span>
            </label>
            <label class="settings-radio-label ${this.fontSize === 'xlarge' ? 'selected' : ''}">
              <input type="radio" name="set_font" value="xlarge" ${this.fontSize === 'xlarge' ? 'checked' : ''} />
              <span>Extra Large (21px)</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button class="modal-btn" id="modal-cancel-btn">Cancel</button>
          <button class="modal-btn primary" id="modal-apply-btn">Apply & Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll("input[name='set_theme']").forEach(r => {
      r.onchange = () => {
        overlay.querySelectorAll("input[name='set_theme']").forEach(i => i.closest("label").classList.remove("selected"));
        r.closest("label").classList.add("selected");
      };
    });

    overlay.querySelectorAll("input[name='set_font']").forEach(r => {
      r.onchange = () => {
        overlay.querySelectorAll("input[name='set_font']").forEach(i => i.closest("label").classList.remove("selected"));
        r.closest("label").classList.add("selected");
      };
    });

    overlay.querySelector("#modal-cancel-btn").onclick = () => overlay.remove();
    overlay.querySelector("#modal-apply-btn").onclick = () => {
      const selectedTheme = overlay.querySelector("input[name='set_theme']:checked")?.value || "standard";
      const selectedFont = overlay.querySelector("input[name='set_font']:checked")?.value || "standard";
      this.setTheme(selectedTheme);
      this.setFontSize(selectedFont);
      overlay.remove();
    };
  }

  showHelpModal() {
    this.showModal("IELTS Computer-Delivered Reading Instructions", 
`• The Reading test takes 60 minutes and contains 3 reading passages with exactly 40 questions.
• Left Pane: Displays the authentic Reading Passage. Use the scrollbar to read through the text.
• Right Pane: Displays questions corresponding to the active passage.
• Drag the vertical divider in the center to adjust panel proportions (25% to 75%).
• Highlighter & Notes: Select any text with your mouse and click "Highlight" (or right-click). Click highlighted text to remove it.
• Summary Gap Fills: Type your answers directly into the inline text gaps [1], [2], etc. Press Enter to jump to the next question.
• Multi-Select: Questions such as 26–28 are presented as a single question card. Check up to the requested number of options.
• Bottom Navigator Dock: Shows questions 1 to 40 grouped by Part. Click any question number to jump directly to it.
• Answered Questions: Displayed with a solid blue fill.
• Review Flag: Check "Review" at bottom left to flag a question. The button turns into a CIRCLE in the bottom dock.`);
  }

  // ==========================================================================
  // RENDER CONTROLLERS
  // ==========================================================================
  render() {
    const container = document.getElementById("app");
    if (!container) return;

    if (this.currentView === "login") {
      container.innerHTML = this.renderLoginHTML();
      this.bindLoginEvents();
    } else if (this.currentView === "dashboard") {
      container.innerHTML = this.renderDashboardHTML();
      this.bindDashboardEvents();
    } else if (this.currentView === "exam") {
      container.innerHTML = this.renderExamHTML();
      this.bindExamEvents();
      this.renderWorkspace();
      this.updateDockStatus();
    } else if (this.currentView === "results") {
      container.innerHTML = this.renderResultsHTML();
      this.bindResultsEvents();
    }
  }

  // ==========================================================================
  // VIEW: LOGIN PORTAL
  // ==========================================================================
  renderLoginHTML() {
    return `
      <div class="login-view-wrapper">
        <div class="login-card">
          <div class="login-header">
            <span class="idp-logo-badge" style="font-size:1.3rem; padding:4px 14px;">IELTS</span>
            <h2>Candidate Portal</h2>
            <p>Computer-Delivered IELTS Reading Practice Platform</p>
          </div>

          <div id="login-error-msg" class="login-alert-error" style="display:none;"></div>

          <form id="login-form" onsubmit="app.handleLoginSubmit(event)">
            <div class="form-group">
              <label for="login-username">Username Kandidat</label>
              <input type="text" id="login-username" class="form-control" placeholder="Masukkan username (contoh: defitta)" autocomplete="username" required />
            </div>

            <div class="form-group">
              <label for="login-password">Password</label>
              <input type="password" id="login-password" class="form-control" placeholder="Masukkan password" autocomplete="current-password" required />
            </div>

            <div class="quick-credentials-box">
              <span class="quick-lbl">Pilih Akun Cepat:</span>
              <div class="quick-chips">
                <button type="button" class="quick-chip" onclick="app.quickFillLogin('defitta', '12345')">defitta</button>
                <button type="button" class="quick-chip" onclick="app.quickFillLogin('marshal', '12345')">marshal</button>
              </div>
            </div>

            <button type="submit" id="login-submit-btn" class="login-btn-primary">
              Masuk ke Portal Ujian &rarr;
            </button>
          </form>

          <div class="login-footer-info">
            <span>Official Cambridge Practice Suite &bull; Standard 40 Soal</span>
          </div>
        </div>
      </div>
    `;
  }

  bindLoginEvents() {
    const form = document.getElementById("login-form");
    if (form) {
      form.onsubmit = (e) => this.handleLoginSubmit(e);
    }
  }

  // ==========================================================================
  // VIEW: DASHBOARD
  // ==========================================================================
  renderDashboardHTML() {
    const testCards = this.tests.map(t => `
      <div class="test-card">
        <div class="test-card-header">
          <span class="test-category-tag">${t.category}</span>
          <span style="font-size: 0.85rem; font-weight:800; color: #5e6d82;">${t.duration_minutes} Mins</span>
        </div>
        <h3>${t.title}</h3>
        <div class="test-meta">
          <span>📝 40 Questions</span>
          <span>📖 3 Passages</span>
        </div>
        <ul class="test-passages-list">
          ${t.passages.map(p => `
            <li>
              <span class="passage-num">Part ${p.passage_id}:</span>
              <span>${p.title}</span>
            </li>
          `).join("")}
        </ul>
        <button class="start-btn" onclick="app.startTest('${t.id}')">
          Start Practice Test &rarr;
        </button>
      </div>
    `).join("");

    return `
      <div class="dashboard-view">
        <!-- User Top Bar -->
        <div class="user-session-bar">
          <div class="user-info-pill">
            <span class="user-status-dot"></span>
            <span>Candidate: <strong>${this.candidateName}</strong> (${this.currentUser ? this.currentUser.username : 'guest'})</span>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="session-tool-btn" onclick="app.showHistoryModal()" title="Lihat Catatan Riwayat Latihan">
              📜 Riwayat Latihan (History)
            </button>
            <button class="session-tool-btn danger" onclick="app.logout()" title="Keluar dari Akun">
              🚪 Keluar
            </button>
          </div>
        </div>

        <div class="dashboard-hero">
          <div>
            <div class="brand-badge">IDP / CAMBRIDGE IELTS SIMULATION</div>
            <h1>Computer-Delivered IELTS Reading</h1>
            <p>Real-exam interface simulation matching the official IDP IELTS computer-delivered test environment, featuring complete authentic tests from Cambridge IELTS with official Band Score calculation (Band 1.0 - 9.0).</p>
          </div>
          <div class="profile-card">
            <label>Mode Ujian</label>
            <div class="mode-selector">
              <button class="mode-btn ${this.examMode === 'timed' ? 'active' : ''}" id="mode-timed-btn">60 Min Timed</button>
              <button class="mode-btn ${this.examMode === 'practice' ? 'active' : ''}" id="mode-practice-btn">Untimed</button>
            </div>
            <div style="margin-top:16px; font-size:0.82rem; color:#cbd5e1; line-height:1.5;">
              Riwayat attempt dan skor Anda otomatis tersimpan ke Google Sheets.
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
          <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--idp-dark-text);">Available Reading Tests (Standard 40 Questions)</h2>
        </div>

        <div class="tests-grid">
          ${testCards}
        </div>
      </div>
    `;
  }

  bindDashboardEvents() {
    const timedBtn = document.getElementById("mode-timed-btn");
    const practiceBtn = document.getElementById("mode-practice-btn");

    if (timedBtn && practiceBtn) {
      timedBtn.onclick = () => {
        this.examMode = "timed";
        timedBtn.classList.add("active");
        practiceBtn.classList.remove("active");
      };
      practiceBtn.onclick = () => {
        this.examMode = "practice";
        practiceBtn.classList.add("active");
        timedBtn.classList.remove("active");
      };
    }
  }

  // ==========================================================================
  // VIEW: EXAM VIEW
  // ==========================================================================
  renderExamHTML() {
    return `
      <div class="exam-view">
        <!-- Official IDP Header -->
        <header class="exam-header">
          <div class="header-left">
            <span class="idp-logo-badge">IELTS</span>
            <span class="test-info-badge">${this.currentTest.title}</span>
            <span class="candidate-badge">Candidate: <strong>${this.candidateName}</strong> (${this.currentUser ? this.currentUser.username : '004821'})</span>
          </div>

          <div class="header-center">
            <div class="timer-box" id="timer-box">
              <span class="timer-label">Time left</span>
              <span class="timer-display" id="timer-display">60 : 00</span>
              <button class="timer-btn" id="toggle-timer-btn" onclick="app.toggleTimerVisibility()">Hide</button>
            </div>
          </div>

          <div class="header-right">
            <button class="header-tool-btn" onclick="app.showSettingsModal()" title="Display Settings">
              <span>⚙️</span> Settings
            </button>
            <button class="header-tool-btn" onclick="app.showHelpModal()" title="Instructions">
              <span>❓</span> Help
            </button>
            <button class="finish-exam-btn" onclick="app.submitTest(false)">Finish Test</button>
          </div>
        </header>

        <!-- Main Dual Split Workspace -->
        <main class="exam-workspace">
          <div class="passage-pane" id="passage-pane"></div>
          <div class="splitter-divider" id="splitter-divider">
            <div class="splitter-handle"></div>
          </div>
          <div class="questions-pane" id="questions-pane"></div>
        </main>

        <!-- Authentic IDP Bottom Dock -->
        <footer class="exam-footer">
          <div class="footer-left">
            <button class="nav-arrow-btn" onclick="app.goToPrevQuestion()" id="prev-q-btn" title="Previous Question">&lt;</button>
            <button class="nav-arrow-btn" onclick="app.goToNextQuestion()" id="next-q-btn" title="Next Question">&gt;</button>
            <label class="review-checkbox-label">
              <input type="checkbox" id="review-current-q-cb" onchange="app.toggleReviewFlag(app.activeQuestionId)" />
              <span>Review</span>
            </label>
          </div>

          <div class="footer-center">
            <div class="passage-tabs-row" id="passage-tabs-row"></div>
            <div class="q-numbers-dock" id="q-numbers-dock"></div>
          </div>

          <div class="footer-right">
            <span id="current-q-indicator">Question 1 of 40</span>
          </div>
        </footer>
      </div>
    `;
  }

  bindExamEvents() {
    window.addEventListener("keydown", (e) => {
      if (this.currentView !== "exam") return;
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
        return;
      }
      if (e.key === "ArrowRight") {
        this.goToNextQuestion();
      } else if (e.key === "ArrowLeft") {
        this.goToPrevQuestion();
      }
    });
  }

  bindGlobalEvents() {
    // global shortcuts
  }

  renderWorkspace() {
    this.renderPassagePane();
    this.renderQuestionsPane();
    this.renderFooterTabs();
  }

  renderPassagePane() {
    const pane = document.getElementById("passage-pane");
    if (!pane || !this.currentTest) return;

    const passage = this.currentTest.passages.find(p => p.passage_id === this.activePassageId);
    if (!passage) return;

    pane.innerHTML = `
      <div class="passage-header">
        <span class="passage-part-tag">Reading Passage ${passage.passage_id}</span>
        <h1 class="passage-title">${passage.title}</h1>
        ${passage.subtitle ? `<div class="passage-subtitle">${passage.subtitle}</div>` : ""}
      </div>
      <div class="passage-content">
        ${passage.text}
      </div>
    `;
  }

  renderQuestionsPane() {
    const pane = document.getElementById("questions-pane");
    if (!pane || !this.currentTest) return;

    const passage = this.currentTest.passages.find(p => p.passage_id === this.activePassageId);
    if (!passage) return;

    let html = "";
    for (const group of passage.question_groups) {
      html += `
        <div class="question-group-box">
          <div class="group-title-badge">${group.title}</div>
          <div class="group-instruction">${group.instruction}</div>
      `;

      // CASE 1: SUMMARY GAP FILL (Strictly NO duplicate cards below)
      if (group.summary_template) {
        if (group.word_list && group.word_list.length > 0) {
          html += `
            <div class="word-bank-box">
              <div class="word-bank-label">List of Words:</div>
              <div class="word-chips-container">
                ${group.word_list.map(w => `<span class="word-chip">${w}</span>`).join("")}
              </div>
            </div>
          `;
        }

        let templateHtml = group.summary_template;
        for (const q of group.questions) {
          const val = this.userAnswers[q.id] || "";
          const inputHtml = `<span class="inline-gap-wrapper"><input type="text" class="ielts-gap-input" data-qid="${q.id}" id="gap-input-${q.id}" value="${val}" placeholder="[${q.id}]" oninput="app.setAnswer(${q.id}, this.value)" onfocus="app.focusQuestion(${q.id})" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.goToNextQuestion();}" /></span>`;
          templateHtml = templateHtml.replace(`[${q.id}]`, inputHtml);
        }
        html += `<div class="summary-template-box">${templateHtml}</div>`;
        html += `</div>`;
        continue;
      }

      // CASE 2: MULTI-SELECT (ONE unified card for Questions 26-28 / 35-38)
      if (group.type === "multiple_choice_multi") {
        const qIds = group.questions.map(q => q.id);
        const minQ = Math.min(...qIds);
        const maxQ = Math.max(...qIds);
        const maxSel = group.multi_select_count || qIds.length;

        const selectedOpts = [];
        qIds.forEach(id => {
          const val = this.userAnswers[id];
          if (val && !selectedOpts.includes(val)) {
            selectedOpts.push(val);
          }
        });

        const isComplete = selectedOpts.length === maxSel;

        html += `
          <div class="multi-select-card" id="q-item-${minQ}">
            <div class="multi-card-header">
              <span class="q-num-badge">Questions ${minQ}–${maxQ}</span>
              <span class="selection-counter ${isComplete ? 'complete' : ''}" id="multi-counter-${minQ}">Choose ${maxSel} letters • <strong>${selectedOpts.length}/${maxSel} selected</strong></span>
            </div>
            ${group.question_prompt ? `<div class="multi-question-prompt">${group.question_prompt}</div>` : ""}
            <div class="multi-options-list">
              ${(group.options || []).map(opt => {
                const letter = opt.split(" - ")[0].trim();
                const isChecked = selectedOpts.includes(letter);
                return `
                  <label class="multi-option-row ${isChecked ? 'selected' : ''}">
                    <input type="checkbox" value="${letter}" ${isChecked ? 'checked' : ''} onchange="app.handleMultiSelectToggle(${minQ}, ${maxQ}, '${letter}', ${maxSel})" />
                    <span class="multi-option-text">${opt}</span>
                  </label>
                `;
              }).join("")}
            </div>
          </div>
        </div>`;
        continue;
      }

      // CASE 3: ALL OTHER QUESTION GROUPS
      for (const q of group.questions) {
        const userVal = this.userAnswers[q.id] || "";

        html += `
          <div class="question-item ${this.activeQuestionId === q.id ? 'active-focus' : ''}" id="q-item-${q.id}" onclick="app.activeQuestionId = ${q.id}; app.updateDockStatus();">
            <div class="q-label">
              <span class="q-num-pill">${q.id}</span>
              <div class="q-prompt-text">${q.prompt}</div>
            </div>
        `;

        if (group.type === "multiple_choice" || group.type === "true_false_not_given" || group.type === "yes_no_not_given") {
          html += `<div class="options-list">`;
          const opts = q.options || (group.type === "true_false_not_given" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"]);
          for (const opt of opts) {
            const optVal = opt.split(" - ")[0].trim();
            const checked = userVal === optVal;
            html += `
              <label class="option-label ${checked ? 'selected' : ''}">
                <input type="radio" name="q_${q.id}" value="${optVal}" ${checked ? 'checked' : ''} onchange="app.setAnswer(${q.id}, '${optVal}')" />
                <span>${opt}</span>
              </label>
            `;
          }
          html += `</div>`;
        } else if (group.type === "matching_headings") {
          html += `
            <div class="inline-input-wrapper">
              <select class="ielts-select" onchange="app.setAnswer(${q.id}, this.value)">
                <option value="">-- Select Heading --</option>
                ${(group.headings_list || []).map(h => `
                  <option value="${h.id}" ${userVal === h.id ? 'selected' : ''}>${h.label}</option>
                `).join("")}
              </select>
            </div>
          `;
        } else if (group.type === "matching_features") {
          html += `
            <div class="inline-input-wrapper">
              <select class="ielts-select" onchange="app.setAnswer(${q.id}, this.value)">
                <option value="">-- Choose Option --</option>
                ${(group.features_list || []).map(f => `
                  <option value="${f.id}" ${userVal === f.id ? 'selected' : ''}>${f.label}</option>
                `).join("")}
              </select>
            </div>
          `;
        } else {
          html += `
            <div class="inline-input-wrapper">
              <input type="text" class="ielts-text-input" placeholder="Type answer here..." value="${userVal}" oninput="app.setAnswer(${q.id}, this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.goToNextQuestion();}" />
            </div>
          `;
        }

        html += `</div>`;
      }

      html += `</div>`;
    }

    pane.innerHTML = html;
  }

  renderFooterTabs() {
    const tabsContainer = document.getElementById("passage-tabs-row");
    if (!tabsContainer || !this.currentTest) return;

    tabsContainer.innerHTML = this.currentTest.passages.map(p => {
      let qNums = [];
      p.question_groups.forEach(g => g.questions.forEach(q => qNums.push(q.id)));
      const minQ = Math.min(...qNums);
      const maxQ = Math.max(...qNums);

      return `
        <button class="part-tab-btn ${p.passage_id === this.activePassageId ? 'active' : ''}" onclick="app.switchPassage(${p.passage_id})">
          Part ${p.passage_id} (${minQ}-${maxQ})
        </button>
      `;
    }).join("");
  }

  updateDockStatus() {
    const dock = document.getElementById("q-numbers-dock");
    const indicator = document.getElementById("current-q-indicator");
    const reviewCb = document.getElementById("review-current-q-cb");
    const prevBtn = document.getElementById("prev-q-btn");
    const nextBtn = document.getElementById("next-q-btn");

    if (!dock || !this.currentTest) return;

    const answeredCount = Object.keys(this.userAnswers).length;

    if (indicator) {
      indicator.innerHTML = `Question <strong>${this.activeQuestionId}</strong> of 40 &bull; Answered: <strong>${answeredCount}/40</strong>`;
    }

    if (reviewCb) {
      reviewCb.checked = this.reviewFlags.has(this.activeQuestionId);
    }

    if (prevBtn) prevBtn.disabled = (this.activeQuestionId <= 1);
    if (nextBtn) nextBtn.disabled = (this.activeQuestionId >= 40);

    const buttonsHtml = [];
    for (let id = 1; id <= 40; id++) {
      const isAnswered = this.userAnswers[id] !== undefined && this.userAnswers[id] !== "" && !(Array.isArray(this.userAnswers[id]) && this.userAnswers[id].length === 0);
      const isActive = this.activeQuestionId === id;
      const isReview = this.reviewFlags.has(id);

      let classes = ["q-dock-btn"];
      if (isAnswered) classes.push("answered");
      if (isActive) classes.push("active");
      if (isReview) classes.push("flagged-review");

      buttonsHtml.push(`
        <button class="${classes.join(" ")}" onclick="app.goToQuestion(${id})" title="Question ${id}${isReview ? ' (Flagged for Review)' : ''}">
          ${id}
        </button>
      `);
    }

    dock.innerHTML = buttonsHtml.join("");
  }

  // ==========================================================================
  // VIEW: RESULTS CONTROLLER
  // ==========================================================================
  renderResultsHTML() {
    if (!this.evaluatedResult) return "<div>No results available.</div>";
    const res = this.evaluatedResult;

    const filteredQuestions = res.questions.filter(q => {
      if (this.reviewFilter === "correct") return q.is_correct;
      if (this.reviewFilter === "incorrect") return !q.is_correct && q.user_answer;
      if (this.reviewFilter === "unanswered") return !q.user_answer;
      return true;
    });

    const breakdownHtml = Object.entries(res.passage_breakdown || {}).map(([pid, pdata]) => {
      const pct = pdata.total ? Math.round((pdata.correct / pdata.total) * 100) : 0;
      return `
        <div class="breakdown-row">
          <div class="breakdown-name">Part ${pid}: ${pdata.title}</div>
          <div class="breakdown-bar-bg">
            <div class="breakdown-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="breakdown-score">${pdata.correct} / ${pdata.total} (${pct}%)</div>
        </div>
      `;
    }).join("");

    const questionsListHtml = filteredQuestions.map(q => {
      const statusClass = q.is_correct ? "correct" : (q.user_answer ? "incorrect" : "unanswered");
      const statusLabel = q.is_correct ? "CORRECT" : (q.user_answer ? "INCORRECT" : "NOT ATTEMPTED");

      return `
        <div class="question-review-card">
          <div class="review-card-top">
            <div>
              <span class="q-num-pill">${q.id}</span>
              <strong style="margin-left: 8px;">${q.prompt}</strong>
            </div>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>

          <div class="review-answers-grid">
            <div>
              <span style="font-size: 0.8rem; text-transform:uppercase; color: var(--idp-muted); display:block; font-weight:700;">Your Answer:</span>
              <strong style="color: ${q.is_correct ? '#15803d' : '#b91c1c'}; font-size:1.05rem;">
                ${q.user_answer ? q.user_answer : '<span style="color:#94a3b8; font-style:italic;">No answer submitted</span>'}
              </strong>
            </div>
            <div>
              <span style="font-size: 0.8rem; text-transform:uppercase; color: var(--idp-muted); display:block; font-weight:700;">Official Cambridge Answer:</span>
              <strong style="color: #0265d2; font-size:1.05rem;">${q.correct_answer}</strong>
              ${q.alternatives && q.alternatives.length > 0 ? `<div style="font-size: 0.82rem; color: var(--idp-muted); margin-top:2px;">(Also accepted: ${q.alternatives.join(", ")})</div>` : ""}
            </div>
          </div>

          ${q.explanation || q.location ? `
            <div class="review-explanation">
              ${q.location ? `<div class="location-quote"><strong>Passage Evidence:</strong> &ldquo;${q.location}&rdquo;</div>` : ""}
              ${q.explanation ? `<div style="margin-top: 4px;"><strong>Cambridge Rationale:</strong> ${q.explanation}</div>` : ""}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    return `
      <div class="results-view">
        <div class="score-banner">
          <div class="band-score-display">
            <div class="band-score-circle">
              <span class="band-score-number">${res.band_score}</span>
              <span class="band-label">Band Score</span>
            </div>
            <div class="band-meta">
              <h2>${res.test_title} Results</h2>
              <div class="band-descriptor">${res.performance_descriptor} &bull; CEFR Level: ${res.cefr_level}</div>
              <div style="font-size:0.88rem; color:#cbd5e1; margin-top:4px;">Candidate: <strong>${res.candidate_name}</strong> &bull; Completed in ${Math.floor(res.time_taken_seconds / 60)}m ${res.time_taken_seconds % 60}s</div>
            </div>
          </div>
          <div style="display:flex; gap:12px;">
            <button class="start-btn" onclick="window.print()" style="padding:10px 18px; font-size:0.88rem;">
              🖨️ Print / Save Report
            </button>
            <button class="start-btn" onclick="app.startTest('${res.test_id}')" style="background:#0265d2; padding:10px 18px; font-size:0.88rem;">
              🔄 Retake Test
            </button>
            <button class="start-btn" onclick="app.currentView='dashboard'; app.render();" style="background:#334155; padding:10px 18px; font-size:0.88rem;">
              Dashboard
            </button>
          </div>
        </div>

        <div class="score-stats-grid">
          <div class="stat-card">
            <div class="stat-title">Raw Score</div>
            <div class="stat-value">${res.raw_score} <span style="font-size:1rem; color:var(--idp-muted); font-weight:600;">/ ${res.total_questions}</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Salah & Kosong</div>
            <div class="stat-value"><span style="color:#b91c1c;">${res.incorrect}</span> <span style="font-size:0.9rem; color:var(--idp-muted); font-weight:600;">salah</span> &bull; <span style="color:#64748b;">${res.unanswered}</span> <span style="font-size:0.9rem; color:var(--idp-muted); font-weight:600;">kosong</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Akurasi</div>
            <div class="stat-value">${res.percentage}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Band Level</div>
            <div class="stat-value" style="color:var(--idp-red);">${res.band_score}</div>
          </div>
        </div>

        <div class="passage-breakdown-card">
          <h3 style="font-size:1.15rem; font-weight:800; margin-bottom:16px;">Performance by Passage</h3>
          ${breakdownHtml}
        </div>

        <div class="review-header">
          <h3 style="font-size:1.25rem; font-weight:800;">Detailed Question Analysis</h3>
          <div class="filter-pills">
            <button class="filter-pill ${this.reviewFilter === 'all' ? 'active' : ''}" onclick="app.setReviewFilter('all')">All (40)</button>
            <button class="filter-pill ${this.reviewFilter === 'correct' ? 'active' : ''}" onclick="app.setReviewFilter('correct')">Correct (${res.raw_score})</button>
            <button class="filter-pill ${this.reviewFilter === 'incorrect' ? 'active' : ''}" onclick="app.setReviewFilter('incorrect')">Incorrect (${res.incorrect})</button>
            <button class="filter-pill ${this.reviewFilter === 'unanswered' ? 'active' : ''}" onclick="app.setReviewFilter('unanswered')">Unanswered (${res.unanswered})</button>
          </div>
        </div>

        <div class="questions-review-list">
          ${questionsListHtml}
        </div>
      </div>
    `;
  }

  setReviewFilter(filter) {
    this.reviewFilter = filter;
    this.render();
  }

  bindResultsEvents() {
    // results view events
  }
}

// Global Application Instance
const app = new IELTSPlatform();
window.app = app;
