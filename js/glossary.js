/**
 * Glossary - Personal vocabulary dictionary
 */

class Glossary {
  constructor(db) {
    this.db = db;
    this.storeName = 'glossary';
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  async addEntry(word, translation, source = 'manual') {
    if (!this.db) return null;
    
    const entry = {
      id: `gl_${word.toLowerCase().replace(/\s+/g, '_')}`,
      word,
      translation,
      source,
      frequency: 1,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    };

    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    
    // Check if exists
    const existing = await idbGet(store, entry.id);
    if (existing) {
      existing.frequency++;
      existing.lastAccessed = new Date().toISOString();
      await idbPut(store, existing);
      return existing;
    }
    
    await idbAdd(store, entry);
    return entry;
  }

  async getAllEntries(sortBy = 'alphabetical') {
    if (!this.db) return [];
    
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const entries = await idbGetAll(store);
    
    switch(sortBy) {
      case 'frequency':
        return entries.sort((a, b) => b.frequency - a.frequency);
      case 'recent':
        return entries.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));
      default:
        return entries.sort((a, b) => a.word.localeCompare(b.word));
    }
  }

  async search(query) {
    const entries = await this.getAllEntries();
    const lowerQuery = query.toLowerCase();
    return entries.filter(e => 
      e.word.toLowerCase().includes(lowerQuery) ||
      e.translation.toLowerCase().includes(lowerQuery)
    );
  }

  async exportToCSV() {
    const entries = await this.getAllEntries();
    const headers = ['Palavra', 'Tradução', 'Frequência', 'Fonte'];
    const rows = entries.map(e => [e.word, e.translation, e.frequency, e.source].join(','));
    return [headers.join(','), ...rows].join('\n');
  }
}

window.Glossary = Glossary;
