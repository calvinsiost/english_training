/**
 * Exam Mode - Simulated exam with timer
 * Real FUVEST exam conditions
 */

class ExamMode {
  constructor(db) {
    this.db = db;
    this.config = {
      duration: 4 * 60 * 60, // 4 hours in seconds (FUVEST standard)
      maxPauses: 2,
      questionsCount: 30, // FUVEST standard
      passagesCount: 6     // FUVEST standard (5 questions each)
    };
    this.state = {
      isActive: false,
      startTime: null,
      endTime: null,
      remainingTime: this.config.duration,
      pausesUsed: 0,
      isPaused: false,
      currentQuestionIndex: 0,
      questions: [],
      answers: new Map(), // questionId -> {answer, timeSpent, confidence}
      passageTimes: new Map() // passageId -> timeSpent
    };
    this.timerInterval = null;
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  /**
   * Start a new exam
   */
  async startExam() {
    // Select passages for exam
    const passages = await this._selectExamPassages();
    if (passages.length === 0) {
      throw new Error('Not enough passages available for exam');
    }

    // Flatten questions from passages
    const questions = [];
    passages.forEach(passage => {
      passage.questions.forEach(q => {
        questions.push({
          ...q,
          passageId: passage.id,
          passageTitle: passage.exam_name,
          passageText: passage.text
        });
      });
    });

    // Initialize exam state
    this.state = {
      isActive: true,
      startTime: new Date(),
      endTime: null,
      remainingTime: this.config.duration,
      pausesUsed: 0,
      isPaused: false,
      currentQuestionIndex: 0,
      questions: questions,
      answers: new Map(),
      passageTimes: new Map(),
      passages: passages
    };

    // Start timer
    this._startTimer();

    return {
      questionsCount: questions.length,
      duration: this.config.duration,
      passagesCount: passages.length
    };
  }

  /**
   * Select passages for exam (respecting filters)
   */
  async _selectExamPassages() {
    if (!this.db) return [];

    const tx = this.db.transaction('question_bank', 'readonly');
    const store = tx.objectStore('question_bank');
    let passages = await idbGetAll(store);

    // Apply source filters if available
    if (window.FilterSettings) {
      const filters = window.FilterSettings.load();
      passages = window.FilterSettings.filter(passages, filters);
    }

    // Shuffle passages
    passages = passages.sort(() => Math.random() - 0.5);

    // Select up to 6 passages with 5 questions each
    const selected = [];
    let totalQuestions = 0;

    for (const passage of passages) {
      if (selected.length >= this.config.passagesCount) break;
      if (passage.questions && passage.questions.length > 0) {
        selected.push(passage);
        totalQuestions += passage.questions.length;
      }
    }

    return selected;
  }

  /**
   * Start the countdown timer
   */
  _startTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      if (!this.state.isPaused && this.state.isActive) {
        this.state.remainingTime--;

        // Check for time warnings
        this._checkTimeWarnings();

        // Auto-submit if time runs out
        if (this.state.remainingTime <= 0) {
          this.submitExam(true);
        }
      }
    }, 1000);
  }

  /**
   * Check and trigger time warnings
   */
  _checkTimeWarnings() {
    const warnings = [30 * 60, 10 * 60, 5 * 60]; // 30min, 10min, 5min remaining
    const justReached = warnings.find(w => this.state.remainingTime === w);

    if (justReached && this.onTimeWarning) {
      const minutes = Math.floor(justReached / 60);
      this.onTimeWarning(`Faltam ${minutes} minutos!`);
    }
  }

  /**
   * Pause the exam
   */
  pauseExam() {
    if (!this.state.isActive || this.state.isPaused) return false;
    if (this.state.pausesUsed >= this.config.maxPauses) return false;

    this.state.isPaused = true;
    this.state.pausesUsed++;
    return true;
  }

  /**
   * Resume the exam
   */
  resumeExam() {
    if (!this.state.isActive || !this.state.isPaused) return false;

    this.state.isPaused = false;
    return true;
  }

  /**
   * Record an answer
   */
  answerQuestion(questionIndex, answer, confidence = 2) {
    if (!this.state.isActive) return false;

    const question = this.state.questions[questionIndex];
    if (!question) return false;

    this.state.answers.set(questionIndex, {
      questionId: question.id,
      answer,
      confidence,
      timestamp: new Date()
    });

    return true;
  }

  /**
   * Navigate to question
   */
  goToQuestion(index) {
    if (index < 0 || index >= this.state.questions.length) return false;
    this.state.currentQuestionIndex = index;
    return true;
  }

  /**
   * Get current question
   */
  getCurrentQuestion() {
    return this.state.questions[this.state.currentQuestionIndex];
  }

  /**
   * Get exam progress
   */
  getProgress() {
    const answered = this.state.answers.size;
    const total = this.state.questions.length;

    return {
      current: this.state.currentQuestionIndex + 1,
      total,
      answered,
      remaining: total - answered,
      percentage: Math.round((answered / total) * 100)
    };
  }

  /**
   * Get time display
   */
  getTimeDisplay() {
    const hours = Math.floor(this.state.remainingTime / 3600);
    const minutes = Math.floor((this.state.remainingTime % 3600) / 60);
    const seconds = this.state.remainingTime % 60;

    return {
      hours,
      minutes,
      seconds,
      formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      totalSeconds: this.state.remainingTime,
      isLow: this.state.remainingTime < 300 // Less than 5 minutes
    };
  }

  /**
   * Submit exam
   */
  async submitExam(autoSubmit = false) {
    if (!this.state.isActive) return null;

    this.state.isActive = false;
    this.state.endTime = new Date();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Calculate results
    const results = this._calculateResults();

    // Save to database
    if (this.db) {
      const tx = this.db.transaction('exam_attempts', 'readwrite');
      const store = tx.objectStore('exam_attempts');
      await idbAdd(store, {
        id: `exam_${Date.now()}`,
        startTime: this.state.startTime.toISOString(),
        endTime: this.state.endTime.toISOString(),
        duration: this.config.duration - this.state.remainingTime,
        autoSubmit,
        ...results
      });
    }

    return results;
  }

  /**
   * Calculate exam results
   */
  _calculateResults() {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    this.state.questions.forEach((q, idx) => {
      const answer = this.state.answers.get(idx);
      if (!answer) {
        unanswered++;
      } else if (answer.answer === q.correct_answer) {
        correct++;
      } else {
        incorrect++;
      }
    });

    const total = this.state.questions.length;
    const score = correct; // Raw score (0-30 for FUVEST)
    const percentage = Math.round((correct / total) * 100);

    // Estimate FUVEST score (0-30)
    const fuvestScore = Math.round((correct / total) * 30 * 10) / 10;

    return {
      total,
      correct,
      incorrect,
      unanswered,
      score,
      percentage,
      fuvestScore,
      pausesUsed: this.state.pausesUsed,
      timeSpent: this.config.duration - this.state.remainingTime
    };
  }

  /**
   * Cancel exam
   */
  cancelExam() {
    this.state.isActive = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Check if exam is active
   */
  isActive() {
    return this.state.isActive;
  }
}

// Export
window.ExamMode = ExamMode;
