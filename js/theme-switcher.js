/**
 * Theme Switcher - Dark/Light mode toggle
 */

class ThemeSwitcher {
  constructor() {
    this.theme = localStorage.getItem('theme') || 'auto';
    this.init();
  }

  init() {
    this.applyTheme();
    
    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.theme === 'auto') this.applyTheme();
      });
    }
  }

  applyTheme() {
    let effectiveTheme = this.theme;
    
    if (effectiveTheme === 'auto') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }
    
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.body.classList.toggle('dark-mode', effectiveTheme === 'dark');
  }

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme();
  }

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }
}

// Auto-initialize
window.themeSwitcher = new ThemeSwitcher();
