/**
 * SocialManager — friend system and leaderboard queries via Supabase.
 */

class SocialManager {
  /**
   * @param {object} supabaseClient
   * @param {AuthManager} authManager
   */
  constructor(supabaseClient, authManager) {
    this._supabase = supabaseClient;
    this._auth = authManager;
    this._log = Logger.create('SocialManager');
  }

  /**
   * Search users by username prefix.
   * @param {string} query - Min 2 chars
   * @returns {Promise<Array<{ id: string, username: string, display_name: string, avatar_url: string|null }>>}
   */
  async searchUsers(query) {
    if (!this._auth.isLoggedIn()) throw new Error('Não autenticado');
    if (!query || query.length < 2) return [];

    try {
      const { data, error } = await this._supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `${query}%`)
        .neq('id', this._auth.getUser().id)
        .limit(20);

      if (error) {
        this._log.error('Search failed:', error.message);
        return [];
      }

      return data || [];
    } catch (e) {
      this._log.error('Search exception:', e);
      return [];
    }
  }

  /**
   * Send friend request.
   * @param {string} userId - Target user UUID
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async sendFriendRequest(userId) {
    if (!this._auth.isLoggedIn()) return { success: false, error: 'Não autenticado' };

    const myId = this._auth.getUser().id;
    if (userId === myId) return { success: false, error: 'Não pode adicionar a si mesmo' };

    try {
      // Check if friendship already exists (either direction)
      const { data: existing } = await this._supabase
        .from('friendships')
        .select('id, status, requester_id')
        .or(`and(requester_id.eq.${myId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${myId})`);

      if (existing && existing.length > 0) {
        const fs = existing[0];
        if (fs.status === 'accepted') return { success: false, error: 'Já são amigos' };
        if (fs.status === 'pending' && fs.requester_id === myId) return { success: false, error: 'Solicitação já enviada' };
        if (fs.status === 'pending' && fs.requester_id === userId) {
          // They sent us a request — auto-accept
          return this.respondToRequest(fs.id, true);
        }
      }

      const { error } = await this._supabase
        .from('friendships')
        .insert({
          requester_id: myId,
          addressee_id: userId,
          status: 'pending'
        });

      if (error) {
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      return { success: true };
    } catch (e) {
      this._log.error('SendFriendRequest failed:', e);
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * Accept or decline a friend request.
   * @param {string} friendshipId
   * @param {boolean} accept
   */
  async respondToRequest(friendshipId, accept) {
    if (!this._auth.isLoggedIn()) return { success: false, error: 'Não autenticado' };

    try {
      const { error } = await this._supabase
        .from('friendships')
        .update({
          status: accept ? 'accepted' : 'declined',
          updated_at: new Date().toISOString()
        })
        .eq('id', friendshipId);

      if (error) {
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      return { success: true };
    } catch (e) {
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * Remove a friend (delete the friendship).
   * @param {string} userId - Friend's user UUID
   */
  async removeFriend(userId) {
    if (!this._auth.isLoggedIn()) return { success: false, error: 'Não autenticado' };

    const myId = this._auth.getUser().id;

    try {
      const { error } = await this._supabase
        .from('friendships')
        .delete()
        .or(`and(requester_id.eq.${myId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${myId})`);

      if (error) {
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      return { success: true };
    } catch (e) {
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * Get list of accepted friends with profile + progress.
   */
  async getFriends() {
    if (!this._auth.isLoggedIn()) return [];

    const myId = this._auth.getUser().id;

    try {
      const { data, error } = await this._supabase
        .from('friendships')
        .select(`
          id,
          requester_id,
          addressee_id,
          requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url),
          addressee:profiles!friendships_addressee_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);

      if (error) {
        this._log.error('GetFriends failed:', error.message);
        return [];
      }

      return (data || []).map(f => {
        const friend = f.requester_id === myId ? f.addressee : f.requester;
        return {
          user_id: friend.id,
          username: friend.username,
          display_name: friend.display_name,
          avatar_url: friend.avatar_url,
          friendship_id: f.id
        };
      });
    } catch (e) {
      this._log.error('GetFriends exception:', e);
      return [];
    }
  }

  /**
   * Get incoming pending friend requests.
   */
  async getPendingRequests() {
    if (!this._auth.isLoggedIn()) return [];

    const myId = this._auth.getUser().id;

    try {
      const { data, error } = await this._supabase
        .from('friendships')
        .select(`
          id,
          created_at,
          requester:profiles!friendships_requester_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('addressee_id', myId)
        .eq('status', 'pending');

      if (error) {
        this._log.error('GetPendingRequests failed:', error.message);
        return [];
      }

      return (data || []).map(f => ({
        friendship_id: f.id,
        user_id: f.requester.id,
        username: f.requester.username,
        display_name: f.requester.display_name,
        created_at: f.created_at,
        direction: 'incoming'
      }));
    } catch (e) {
      this._log.error('GetPendingRequests exception:', e);
      return [];
    }
  }

  /**
   * Get leaderboard data.
   * @param {'weekly_xp'|'total_xp'|'streak'|'expedition'} type
   * @param {'global'|'friends'} scope
   */
  async getLeaderboard(type = 'weekly_xp', scope = 'friends') {
    if (!this._auth.isLoggedIn()) throw new Error('Não autenticado');

    try {
      const myId = this._auth.getUser().id;
      const rpcName = scope === 'friends' ? 'get_friend_leaderboard' : 'get_global_leaderboard';
      const params = scope === 'friends'
        ? { requesting_user: myId, metric: type }
        : { metric: type };

      const { data, error } = await this._supabase.rpc(rpcName, params);

      if (error) {
        this._log.error('Leaderboard failed:', error.message);
        return [];
      }

      return (data || []).map(entry => ({
        ...entry,
        is_self: entry.user_id === myId
      }));
    } catch (e) {
      this._log.error('Leaderboard exception:', e);
      return [];
    }
  }

  /**
   * Get count of accepted friends.
   */
  async getFriendCount() {
    if (!this._auth.isLoggedIn()) return 0;

    const myId = this._auth.getUser().id;

    try {
      const { count, error } = await this._supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);

      if (error) return 0;
      return count || 0;
    } catch { return 0; }
  }
}

window.SocialManager = SocialManager;
