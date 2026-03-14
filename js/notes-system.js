/**
 * Notes System - Personal notes per question
 */

class NotesSystem {
  constructor(db) {
    this.db = db;
    this.storeName = 'notes';
  }

  async init() {
    if (!this.db) throw new Error('Database not initialized');
    return this;
  }

  async saveNote(questionId, content, tags = []) {
    if (!this.db) return null;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    
    const note = {
      id: `note_${questionId}`,
      questionId,
      content,
      tags,
      updatedAt: new Date().toISOString()
    };
    
    await idbPut(store, note);
    return note;
  }

  async getNote(questionId) {
    if (!this.db) return null;
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    return idbGet(store, `note_${questionId}`);
  }

  async getAllNotes() {
    if (!this.db) return [];
    const tx = this.db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const notes = await idbGetAll(store);
    return notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async deleteNote(questionId) {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await idbDelete(store, `note_${questionId}`);
  }

  async searchNotes(query) {
    const notes = await this.getAllNotes();
    const lowerQuery = query.toLowerCase();
    return notes.filter(n => 
      n.content.toLowerCase().includes(lowerQuery) ||
      n.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }
}

class NotesUI {
  constructor(notesSystem) {
    this.notes = notesSystem;
    this.currentQuestionId = null;
  }

  showNoteEditor(questionId, questionText, existingNote = null) {
    this.currentQuestionId = questionId;
    
    const modal = document.createElement('div');
    modal.className = 'modal notes-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>📝 Adicionar Anotação</h3>
          <button class="btn-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p class="question-preview">${questionText?.substring(0, 100)}...</p>
          <textarea id="note-content" placeholder="Escreva sua anotação..." rows="5">${existingNote?.content || ''}</textarea>
          <input type="text" id="note-tags" placeholder="Tags (separadas por vírgula)" 
                 value="${existingNote?.tags?.join(', ') || ''}">
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
          <button class="btn-primary" id="btn-save-note">Salvar</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#btn-save-note').addEventListener('click', async () => {
      const content = modal.querySelector('#note-content').value;
      const tagsStr = modal.querySelector('#note-tags').value;
      const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
      
      await this.notes.saveNote(questionId, content, tags);
      modal.remove();
      if (window.showToast) showToast('Anotação salva!', 'success');
    });
  }
}

window.NotesSystem = NotesSystem;
window.NotesUI = NotesUI;
