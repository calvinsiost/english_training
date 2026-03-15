/**
 * Normalizes Supabase and network errors into structured pt-BR messages.
 * Maps error codes/messages to user-friendly Portuguese strings.
 */

const ERROR_MAP = {
  // Supabase Auth errors
  'Invalid login credentials': { code: 'AUTH_INVALID', message: 'Credenciais inválidas' },
  'Email not confirmed': { code: 'AUTH_UNCONFIRMED', message: 'Email não confirmado. Verifique sua caixa de entrada' },
  'User already registered': { code: 'AUTH_DUPLICATE_EMAIL', message: 'Email já cadastrado' },
  'Password should be at least 6 characters': { code: 'AUTH_WEAK_PASSWORD', message: 'Senha deve ter no mínimo 6 caracteres' },
  'Signup requires a valid password': { code: 'AUTH_WEAK_PASSWORD', message: 'Senha deve ter no mínimo 6 caracteres' },
  'Unable to validate email address: invalid format': { code: 'AUTH_INVALID_EMAIL', message: 'Email inválido' },

  // Supabase PostgREST errors
  'duplicate key value violates unique constraint': { code: 'DUPLICATE', message: 'Valor já existe' },
  'JWT expired': { code: 'TOKEN_EXPIRED', message: 'Sessão expirada. Faça login novamente' },
  'new row violates row-level security policy': { code: 'RLS_VIOLATION', message: 'Permissão negada' },
  'Friend limit reached (max 50)': { code: 'FRIEND_LIMIT', message: 'Limite de 50 amigos atingido' },
};

const HTTP_STATUS_MAP = {
  400: { code: 'BAD_REQUEST', message: 'Requisição inválida' },
  401: { code: 'AUTH_REQUIRED', message: 'Autenticação necessária' },
  403: { code: 'FORBIDDEN', message: 'Permissão negada' },
  404: { code: 'NOT_FOUND', message: 'Recurso não encontrado' },
  409: { code: 'CONFLICT', message: 'Conflito de dados' },
  422: { code: 'VALIDATION', message: 'Dados inválidos' },
  429: { code: 'RATE_LIMIT', message: 'Muitas requisições. Tente novamente em instantes' },
  500: { code: 'SERVER_ERROR', message: 'Erro interno do servidor' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço indisponível. Tente novamente' },
};

window.normalizeSupabaseError = function normalizeSupabaseError(error) {
  if (!error) {
    return { code: 'UNKNOWN', message: 'Erro desconhecido' };
  }

  const errorMessage = error.message || error.error_description || String(error);

  // Check exact match first
  if (ERROR_MAP[errorMessage]) {
    return ERROR_MAP[errorMessage];
  }

  // Check partial match (e.g., 'duplicate key value violates...' contains extra detail)
  for (const [pattern, mapped] of Object.entries(ERROR_MAP)) {
    if (errorMessage.includes(pattern)) {
      return mapped;
    }
  }

  // Check HTTP status code
  const status = error.status || error.statusCode;
  if (status && HTTP_STATUS_MAP[status]) {
    return HTTP_STATUS_MAP[status];
  }

  // Network errors
  if (error instanceof TypeError && errorMessage.includes('fetch')) {
    return { code: 'NETWORK', message: 'Erro de conexão. Verifique sua internet' };
  }

  if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
    return { code: 'NETWORK', message: 'Erro de conexão. Verifique sua internet' };
  }

  // Fallback
  return { code: 'UNKNOWN', message: errorMessage || 'Erro desconhecido' };
};
