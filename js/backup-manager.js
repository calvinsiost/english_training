/**
 * Backup Manager - Export/Import all user data
 */

class BackupManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Export all data
   */
  async exportAllData() {
    if (!this.db) throw new Error('Database not initialized');

    const data = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      stores: {}
    };

    // Export all stores
    const storeNames = Array.from(this.db.objectStoreNames);
    
    for (const storeName of storeNames) {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      data.stores[storeName] = await idbGetAll(store);
    }

    return data;
  }

  /**
   * Download export as JSON file
   */
  async downloadExport() {
    const data = await this.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `english_training_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import data from file
   */
  async importData(jsonData) {
    if (!this.db) throw new Error('Database not initialized');

    // Validate structure
    if (!jsonData.stores || typeof jsonData.stores !== 'object') {
      throw new Error('Invalid backup format');
    }

    const importedStores = [];
    const skippedStores = [];

    for (const [storeName, records] of Object.entries(jsonData.stores)) {
      if (!this.db.objectStoreNames.contains(storeName)) {
        skippedStores.push(storeName);
        continue;
      }

      if (!Array.isArray(records)) {
        skippedStores.push(storeName);
        continue;
      }

      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      for (const record of records) {
        try {
          await idbPut(store, record);
        } catch (e) {
          console.warn(`Failed to import record in ${storeName}:`, e);
        }
      }

      importedStores.push(storeName);
    }

    return { importedStores, skippedStores };
  }

  /**
   * Auto-backup to localStorage (for small data)
   */
  async autoBackup() {
    try {
      const data = await this.exportAllData();
      // Only backup essential data to localStorage (limited size)
      const essentialData = {
        version: data.version,
        exportedAt: data.exportedAt,
        stores: {
          profile: data.stores.profile || [],
          meta: data.stores.meta || []
        }
      };
      localStorage.setItem('english_training_autobackup', JSON.stringify(essentialData));
    } catch (e) {
      console.error('Auto-backup failed:', e);
    }
  }

  /**
   * Restore from auto-backup
   */
  async restoreFromAutoBackup() {
    const backup = localStorage.getItem('english_training_autobackup');
    if (!backup) return false;

    try {
      const data = JSON.parse(backup);
      await this.importData(data);
      return true;
    } catch (e) {
      console.error('Restore from auto-backup failed:', e);
      return false;
    }
  }

  /**
   * Get export statistics
   */
  async getExportStats() {
    if (!this.db) return null;

    const stats = {};
    const storeNames = Array.from(this.db.objectStoreNames);

    for (const storeName of storeNames) {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const count = await idbCount(store);
      stats[storeName] = count;
    }

    return stats;
  }
}

window.BackupManager = BackupManager;
