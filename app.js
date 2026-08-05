(() => {
  "use strict";

  const BUILTIN_BANKS = [
    { id: "maogai", title: "毛泽东思想和中国特色社会主义理论体系概论", url: "./data/maogai.json" },
    { id: "mayuan", title: "马克思主义基本原理", url: "./data/mayuan.json" }
  ];

  const STORAGE = {
    progress: "quiz_web_progress_v1",
    customBanks: "quiz_web_custom_banks_v1",
    theme: "quiz_web_theme_v1"
  };

  const state = {
    banks: new Map(),
    currentBankId: "maogai",
    mode: "all",
    searchTerm: "",
    visibleQuestions: [],
    index: 0,
    timerId: null,
    secondsLeft: null,
    submitted: false
  };

  const el = {};
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    restoreTheme();

    try {
      await loadBuiltInBanks();
      restoreCustomBanks();
      refreshBankSelect();
      state.currentBankId = el.bankSelect.value || "maogai";
      rebuildVisibleQuestions();
      render();
      setStatus("题库加载完成。");
    } catch (error) {
      console.error(error);
      el.questionText.textContent = "题库加载失败";
      setStatus(`${error.message}。请通过本地服务器或 GitHub Pages 打开，不要直接双击 index.html。`, true);
    }
  }

  function cacheElements() {
    [
      "themeButton", "bankSelect", "practiceModeButton", "wrongModeButton",
      "searchInput", "searchButton", "clearSearchButton", "randomButton",
      "exam35Button", "exam60Button", "stopExamButton", "bankFileInput",
      "exportProgressButton", "progressFileInput", "resetProgressButton",
      "totalStat", "answeredStat", "correctStat", "accuracyStat", "wrongStat",
      "timerStat", "modeBadge", "typeBadge", "progressText", "questionText",
      "sourceText", "optionsForm", "resultPanel", "previousButton",
      "submitButton", "nextButton", "toggleWrongButton", "statusMessage"
    ].forEach(id => { el[id] = document.getElementById(id); });
  }

  function bindEvents() {
    el.themeButton.addEventListener("click", toggleTheme);
    el.bankSelect.addEventListener("change", switchBank);
    el.practiceModeButton.addEventListener("click", () => setMode("all"));
    el.wrongModeButton.addEventListener("click", () => setMode("wrong"));
    el.searchButton.addEventListener("click", applySearch);
    el.searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") applySearch();
    });
    el.clearSearchButton.addEventListener("click", clearSearch);
    el.randomButton.addEventListener("click", randomQuestion);
    el.exam35Button.addEventListener("click", () => startTimer(35));
    el.exam60Button.addEventListener("click", () => startTimer(60));
    el.stopExamButton.addEventListener("click", stopTimer);
    el.previousButton.addEventListener("click", () => move(-1));
    el.nextButton.addEventListener("click", () => move(1));
    el.submitButton.addEventListener("click", submitAnswer);
    el.toggleWrongButton.addEventListener("click", toggleWrong);
    el.bankFileInput.addEventListener("change", importCustomBank);
    el.exportProgressButton.addEventListener("click", exportProgress);
    el.progressFileInput.addEventListener("change", importProgress);
    el.resetProgressButton.addEventListener("click", resetCurrentProgress);
  }

  async function loadBuiltInBanks() {
    const results = await Promise.all(BUILTIN_BANKS.map(async bank => {
      const response = await fetch(bank.url);
      if (!response.ok) throw new Error(`无法读取 ${bank.url}（HTTP ${response.status}）`);
      const raw = await response.json();
      return normalizeBank(raw, bank.id, bank.title, false);
    }));
    results.forEach(bank => state.banks.set(bank.id, bank));
  }

  function normalizeBank(raw, fallbackId, fallbackTitle, custom = true) {
    const list = Array.isArray(raw) ? raw : raw.questions;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("题库必须包含非空 questions 数组");
    }

    const questions = list.map((question, index) => normalizeQuestion(question, index));
    return {
      id: String(raw.id || fallbackId || `custom-${Date.now()}`),
      title: String(raw.meta?.title || raw.title || fallbackTitle || "自定义题库"),
      questions,
      custom
    };
  }

  function normalizeQuestion(question, index) {
    if (!question || typeof question !== "object") {
      throw new Error(`第 ${index + 1} 道题格式不正确`);
    }

    const options = question.options && typeof question.options === "object"
      ? question.options
      : {};

    const answer = Array.isArray(question.answer)
      ? question.answer.map(String)
      : String(question.answer || "").split(/[,\s、，]+/).filter(Boolean);

    if (!question.question || Object.keys(options).length < 2 || answer.length === 0) {
      throw new Error(`第 ${index + 1} 道题缺少题干、选项或答案`);
    }

    return {
      id: String(question.id || `Q${String(index + 1).padStart(4, "0")}`),
      type: question.type === "multiple" || answer.length > 1 ? "multiple" : "single",
      question: String(question.question),
      options: Object.fromEntries(Object.entries(options).map(([key, value]) => [String(key), String(value)])),
      answer: answer.map(String).sort(),
      explanation: String(question.explanation || "暂无解析"),
      source: String(question.source || ""),
      source_number: question.source_number ?? null
    };
  }

  function getProgressStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.progress)) || {};
    } catch {
      return {};
    }
  }

  function saveProgressStore(store) {
    localStorage.setItem(STORAGE.progress, JSON.stringify(store));
  }

  function getBankProgress(bankId = state.currentBankId) {
    const store = getProgressStore();
    if (!store[bankId]) {
      store[bankId] = { answered: {}, wrongIds: [] };
      saveProgressStore(store);
    }
    return store[bankId];
  }

  function updateBankProgress(mutator) {
    const store = getProgressStore();
    const progress = store[state.currentBankId] || { answered: {}, wrongIds: [] };
    mutator(progress);
    store[state.currentBankId] = progress;
    saveProgressStore(store);
  }

  function currentBank() {
    return state.banks.get(state.currentBankId);
  }

  function currentQuestion() {
    return state.visibleQuestions[state.index] || null;
  }

  function rebuildVisibleQuestions(preferredId = null) {
    const bank = currentBank();
    if (!bank) {
      state.visibleQuestions = [];
      state.index = 0;
      return;
    }

    let questions = [...bank.questions];

    if (state.mode === "wrong") {
      const wrongSet = new Set(getBankProgress().wrongIds);
      questions = questions.filter(question => wrongSet.has(question.id));
    }

    const term = state.searchTerm.trim().toLowerCase();
    if (term) {
      questions = questions.filter(question => {
        const haystack = [
          question.question,
          question.explanation,
          question.source,
          ...Object.values(question.options)
        ].join("\n").toLowerCase();
        return haystack.includes(term);
      });
    }

    state.visibleQuestions = questions;
    const wantedIndex = preferredId ? questions.findIndex(question => question.id === preferredId) : -1;
    state.index = wantedIndex >= 0 ? wantedIndex : Math.min(state.index, Math.max(questions.length - 1, 0));
    state.submitted = false;
  }

  function switchBank() {
    stopTimer();
    state.currentBankId = el.bankSelect.value;
    state.mode = "all";
    state.searchTerm = "";
    el.searchInput.value = "";
    state.index = 0;
    rebuildVisibleQuestions();
    render();
    setStatus(`已切换到：${currentBank().title}`);
  }

  function setMode(mode) {
    stopTimer();
    state.mode = mode;
    state.index = 0;
    rebuildVisibleQuestions();
    render();
    setStatus(mode === "wrong" ? "正在查看错题本。" : "正在查看全部题目。");
  }

  function applySearch() {
    state.searchTerm = el.searchInput.value;
    state.index = 0;
    rebuildVisibleQuestions();
    render();
    setStatus(state.searchTerm ? `找到 ${state.visibleQuestions.length} 道匹配题目。` : "请输入搜索关键词。");
  }

  function clearSearch() {
    state.searchTerm = "";
    el.searchInput.value = "";
    state.index = 0;
    rebuildVisibleQuestions();
    render();
    setStatus("搜索条件已清除。");
  }

  function randomQuestion() {
    if (state.visibleQuestions.length === 0) return;
    state.index = Math.floor(Math.random() * state.visibleQuestions.length);
    state.submitted = false;
    renderQuestion();
    setStatus("已随机跳转。");
  }

  function move(delta) {
    if (state.visibleQuestions.length === 0) return;
    state.index = (state.index + delta + state.visibleQuestions.length) % state.visibleQuestions.length;
    state.submitted = false;
    renderQuestion();
  }

  function render() {
    renderModeButtons();
    renderQuestion();
    renderStats();
  }

  function renderModeButtons() {
    el.practiceModeButton.classList.toggle("active", state.mode === "all");
    el.wrongModeButton.classList.toggle("active", state.mode === "wrong");
    el.modeBadge.textContent = state.mode === "wrong" ? "错题本" : "全部题目";
  }

  function renderQuestion() {
    const question = currentQuestion();
    state.submitted = false;
    el.resultPanel.className = "result hidden";
    el.resultPanel.textContent = "";

    if (!question) {
      el.progressText.textContent = "第 0 / 0 题";
      el.typeBadge.textContent = "无题目";
      el.questionText.textContent = state.mode === "wrong"
        ? "当前筛选条件下没有错题"
        : "当前筛选条件下没有题目";
      el.sourceText.textContent = "";
      el.optionsForm.innerHTML = "";
      el.submitButton.disabled = true;
      el.previousButton.disabled = true;
      el.nextButton.disabled = true;
      el.toggleWrongButton.disabled = true;
      renderStats();
      return;
    }

    el.submitButton.disabled = false;
    el.previousButton.disabled = state.visibleQuestions.length < 2;
    el.nextButton.disabled = state.visibleQuestions.length < 2;
    el.toggleWrongButton.disabled = false;

    el.progressText.textContent = `第 ${state.index + 1} / ${state.visibleQuestions.length} 题`;
    el.typeBadge.textContent = question.type === "multiple" ? "多选题" : "单选题";
    el.questionText.textContent = question.question;
    el.sourceText.textContent = question.source
      ? `来源：${question.source}${question.source_number ? ` · 原题序号 ${question.source_number}` : ""}`
      : "";

    const inputType = question.type === "multiple" ? "checkbox" : "radio";
    el.optionsForm.innerHTML = "";

    for (const [key, value] of Object.entries(question.options)) {
      const label = document.createElement("label");
      label.className = "option";

      const input = document.createElement("input");
      input.type = inputType;
      input.name = "answer";
      input.value = key;

      const keySpan = document.createElement("span");
      keySpan.className = "option-key";
      keySpan.textContent = `${key}.`;

      const valueSpan = document.createElement("span");
      valueSpan.textContent = value;

      label.append(input, keySpan, valueSpan);
      el.optionsForm.appendChild(label);
    }

    const isWrong = getBankProgress().wrongIds.includes(question.id);
    el.toggleWrongButton.textContent = isWrong ? "移出错题本" : "加入错题本";
    renderStats();
  }

  function selectedAnswers() {
    return [...el.optionsForm.querySelectorAll('input[name="answer"]:checked')]
      .map(input => input.value)
      .sort();
  }

  function submitAnswer(auto = false) {
    const question = currentQuestion();
    if (!question || state.submitted) return;

    let selected = selectedAnswers();
    if (selected.length === 0 && !auto) {
      setStatus("请先选择答案。", true);
      return;
    }

    const correct = question.answer;
    const isCorrect = arraysEqual(selected, correct);
    state.submitted = true;

    updateBankProgress(progress => {
      const old = progress.answered[question.id];
      progress.answered[question.id] = {
        selected,
        correct: isCorrect,
        answeredAt: new Date().toISOString()
      };

      if (!isCorrect && !progress.wrongIds.includes(question.id)) {
        progress.wrongIds.push(question.id);
      }
      if (isCorrect && old?.correct === false) {
        // 回答正确后仍保留在错题本中，需用户主动移除。
      }
    });

    const title = auto && selected.length === 0
      ? "时间到，本题未作答"
      : isCorrect ? "回答正确" : "回答错误";

    el.resultPanel.className = `result ${isCorrect ? "correct" : "incorrect"}`;
    el.resultPanel.textContent =
      `${title}\n你的答案：${selected.length ? selected.join("、") : "未作答"}\n` +
      `正确答案：${correct.join("、")}\n\n${question.explanation}`;

    el.toggleWrongButton.textContent = getBankProgress().wrongIds.includes(question.id)
      ? "移出错题本"
      : "加入错题本";

    renderStats();
    setStatus(isCorrect ? "很好，继续保持！" : "本题已自动加入错题本。");
  }

  function toggleWrong() {
    const question = currentQuestion();
    if (!question) return;

    let added = false;
    updateBankProgress(progress => {
      const index = progress.wrongIds.indexOf(question.id);
      if (index >= 0) {
        progress.wrongIds.splice(index, 1);
      } else {
        progress.wrongIds.push(question.id);
        added = true;
      }
    });

    if (state.mode === "wrong" && !added) {
      rebuildVisibleQuestions();
      render();
    } else {
      el.toggleWrongButton.textContent = added ? "移出错题本" : "加入错题本";
      renderStats();
    }

    setStatus(added ? "已加入错题本。" : "已移出错题本。");
  }

  function renderStats() {
    const bank = currentBank();
    if (!bank) return;

    const progress = getBankProgress();
    const records = Object.values(progress.answered || {});
    const answered = records.length;
    const correct = records.filter(record => record.correct).length;
    const accuracy = answered ? Math.round(correct / answered * 100) : 0;

    el.totalStat.textContent = bank.questions.length;
    el.answeredStat.textContent = answered;
    el.correctStat.textContent = correct;
    el.accuracyStat.textContent = `${accuracy}%`;
    el.wrongStat.textContent = progress.wrongIds.length;
    el.timerStat.textContent = state.secondsLeft === null ? "--" : `${state.secondsLeft}s`;
  }

  function startTimer(seconds) {
    stopTimer();
    if (!currentQuestion()) return;

    state.secondsLeft = seconds;
    renderStats();
    setStatus(`已开始 ${seconds} 秒限时练习。`);

    state.timerId = window.setInterval(() => {
      state.secondsLeft -= 1;
      renderStats();

      if (state.secondsLeft <= 0) {
        window.clearInterval(state.timerId);
        state.timerId = null;
        state.secondsLeft = 0;
        renderStats();
        submitAnswer(true);
        setStatus("时间到，已自动提交。", true);
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    state.secondsLeft = null;
    if (el.timerStat) renderStats();
  }

  async function importCustomBank(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      const id = `custom-${Date.now()}`;
      const bank = normalizeBank(raw, id, file.name.replace(/\.json$/i, ""), true);
      state.banks.set(bank.id, bank);
      persistCustomBanks();
      refreshBankSelect(bank.id);
      state.currentBankId = bank.id;
      state.mode = "all";
      state.searchTerm = "";
      state.index = 0;
      rebuildVisibleQuestions();
      render();
      setStatus(`已导入自定义题库：${bank.title}（${bank.questions.length} 题）`);
    } catch (error) {
      setStatus(`导入失败：${error.message}`, true);
    }
  }

  function persistCustomBanks() {
    const customBanks = [...state.banks.values()]
      .filter(bank => bank.custom)
      .map(bank => ({
        id: bank.id,
        title: bank.title,
        questions: bank.questions
      }));
    localStorage.setItem(STORAGE.customBanks, JSON.stringify(customBanks));
  }

  function restoreCustomBanks() {
    try {
      const customBanks = JSON.parse(localStorage.getItem(STORAGE.customBanks)) || [];
      customBanks.forEach(raw => {
        const bank = normalizeBank(raw, raw.id, raw.title, true);
        state.banks.set(bank.id, bank);
      });
    } catch (error) {
      console.warn("自定义题库恢复失败：", error);
    }
  }

  function refreshBankSelect(selectedId = state.currentBankId) {
    el.bankSelect.innerHTML = "";
    for (const bank of state.banks.values()) {
      const option = document.createElement("option");
      option.value = bank.id;
      option.textContent = `${bank.title}（${bank.questions.length}题）`;
      option.selected = bank.id === selectedId;
      el.bankSelect.appendChild(option);
    }
  }

  function exportProgress() {
    const payload = {
      format: "quiz-web-progress",
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: getProgressStore(),
      customBanks: [...state.banks.values()]
        .filter(bank => bank.custom)
        .map(bank => ({ id: bank.id, title: bank.title, questions: bank.questions }))
    };
    downloadJson(payload, `刷题学习记录-${new Date().toISOString().slice(0, 10)}.json`);
    setStatus("学习记录已导出。");
  }

  async function importProgress(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      if (payload.format !== "quiz-web-progress" || !payload.progress) {
        throw new Error("不是有效的学习记录文件");
      }

      localStorage.setItem(STORAGE.progress, JSON.stringify(payload.progress));
      if (Array.isArray(payload.customBanks)) {
        localStorage.setItem(STORAGE.customBanks, JSON.stringify(payload.customBanks));
        payload.customBanks.forEach(raw => {
          const bank = normalizeBank(raw, raw.id, raw.title, true);
          state.banks.set(bank.id, bank);
        });
        refreshBankSelect(state.currentBankId);
      }

      rebuildVisibleQuestions(currentQuestion()?.id);
      render();
      setStatus("学习记录导入成功。");
    } catch (error) {
      setStatus(`导入失败：${error.message}`, true);
    }
  }

  function resetCurrentProgress() {
    const bank = currentBank();
    if (!bank) return;
    if (!window.confirm(`确定清空“${bank.title}”的答题记录和错题本吗？此操作不可撤销。`)) return;

    const store = getProgressStore();
    delete store[state.currentBankId];
    saveProgressStore(store);
    state.mode = "all";
    state.index = 0;
    rebuildVisibleQuestions();
    render();
    setStatus("当前题库的学习记录已清空。");
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function toggleTheme() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE.theme, dark ? "dark" : "light");
    el.themeButton.textContent = dark ? "切换浅色模式" : "切换深色模式";
  }

  function restoreTheme() {
    const saved = localStorage.getItem(STORAGE.theme);
    const dark = saved === "dark" ||
      (!saved && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    el.themeButton.textContent = dark ? "切换浅色模式" : "切换深色模式";
  }

  function arraysEqual(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function setStatus(message, isError = false) {
    el.statusMessage.textContent = message;
    el.statusMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
  }
})();
